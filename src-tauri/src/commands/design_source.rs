use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tree_sitter::{Language, Node, Parser};
use walkdir::WalkDir;

use crate::core::error::AppError;

const MAX_SOURCE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_RESULTS: usize = 12;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignProjectInfo {
    pub framework: String,
    pub project_root: String,
    pub supported: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignAsset {
    pub path: String,
    pub name: String,
    pub bytes: u64,
    pub kind: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignElementQuery {
    pub tag: String,
    pub id: Option<String>,
    #[serde(default)]
    pub classes: Vec<String>,
    pub text: Option<String>,
    pub route_source: Option<String>,
    pub source_file: Option<String>,
    pub source_line: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignSourceTarget {
    pub file: String,
    pub tag: String,
    pub opening_start: usize,
    pub opening_end: usize,
    pub node_start: usize,
    pub node_end: usize,
    pub line: usize,
    pub confidence: i32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignSourcePatch {
    pub project_path: String,
    pub target: DesignSourceTarget,
    #[serde(default)]
    pub styles: BTreeMap<String, String>,
    pub text: Option<String>,
    pub operation: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignPatchResult {
    pub file: String,
    pub changed: bool,
    pub line: usize,
}

#[derive(Debug, Clone)]
struct HistoryEntry {
    path: PathBuf,
    before: String,
    after: String,
}

#[derive(Default)]
struct DesignHistory {
    undo: Vec<HistoryEntry>,
    redo: Vec<HistoryEntry>,
}

static HISTORY: Mutex<Option<DesignHistory>> = Mutex::new(None);

fn with_history<T>(f: impl FnOnce(&mut DesignHistory) -> T) -> T {
    let mut guard = HISTORY.lock().unwrap_or_else(|e| e.into_inner());
    f(guard.get_or_insert_with(DesignHistory::default))
}

fn canonical_inside(root: &Path, candidate: &Path) -> Result<PathBuf, AppError> {
    let root = root
        .canonicalize()
        .map_err(|e| AppError::Message(format!("Cannot open project: {e}")))?;
    let candidate = candidate
        .canonicalize()
        .map_err(|e| AppError::Message(format!("Cannot open design source: {e}")))?;
    if !candidate.starts_with(&root) {
        return Err(AppError::Message(
            "Design source is outside the open project.".into(),
        ));
    }
    Ok(candidate)
}

fn detect_framework(package_json: &str) -> Option<&'static str> {
    let lower = package_json.to_ascii_lowercase();
    if lower.contains("\"next\"") {
        Some("next")
    } else if lower.contains("\"@remix-run/")
        || lower.contains("\"react-router\"") && lower.contains("\"@react-router/dev\"")
    {
        Some("remix")
    } else if lower.contains("\"astro\"") {
        Some("astro")
    } else if lower.contains("\"vite\"") && lower.contains("\"react\"") {
        Some("react-vite")
    } else {
        None
    }
}

fn find_supported_root(project: &Path) -> Option<(PathBuf, &'static str)> {
    let direct = project.join("package.json");
    if let Ok(package) = std::fs::read_to_string(&direct) {
        if let Some(framework) = detect_framework(&package) {
            return Some((project.to_path_buf(), framework));
        }
    }
    for entry in WalkDir::new(project)
        .min_depth(1)
        .max_depth(3)
        .into_iter()
        .filter_entry(|e| !skip_dir(e.path()))
        .filter_map(Result::ok)
    {
        if entry.file_name() != "package.json" {
            continue;
        }
        let Ok(package) = std::fs::read_to_string(entry.path()) else {
            continue;
        };
        if let Some(framework) = detect_framework(&package) {
            if let Some(parent) = entry.path().parent() {
                return Some((parent.to_path_buf(), framework));
            }
        }
    }
    None
}

#[tauri::command]
pub fn inspect_design_project(project_path: String) -> Result<DesignProjectInfo, AppError> {
    let requested = PathBuf::from(&project_path);
    let canonical = requested
        .canonicalize()
        .map_err(|e| AppError::Message(format!("Cannot open project: {e}")))?;
    if let Some((root, framework)) = find_supported_root(&canonical) {
        return Ok(DesignProjectInfo {
            framework: framework.into(),
            project_root: root.to_string_lossy().into_owned(),
            supported: true,
        });
    }
    Ok(DesignProjectInfo {
        framework: "unsupported".into(),
        project_root: canonical.to_string_lossy().into_owned(),
        supported: false,
    })
}

#[tauri::command]
pub fn list_design_assets(project_path: String) -> Result<Vec<DesignAsset>, AppError> {
    let requested = PathBuf::from(&project_path);
    let Some((root, _)) = find_supported_root(&requested) else {
        return Ok(Vec::new());
    };
    let mut assets = Vec::new();
    for entry in WalkDir::new(&root)
        .max_depth(12)
        .into_iter()
        .filter_entry(|e| !skip_dir(e.path()))
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let extension = entry
            .path()
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let kind = match extension.as_str() {
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "avif" | "svg" => "image",
            "woff" | "woff2" | "ttf" | "otf" => "font",
            "mp4" | "webm" | "mov" => "video",
            _ => continue,
        };
        let path = entry
            .path()
            .strip_prefix(&root)
            .unwrap_or(entry.path())
            .to_string_lossy()
            .replace('\\', "/");
        assets.push(DesignAsset {
            path,
            name: entry.file_name().to_string_lossy().into_owned(),
            bytes: entry.metadata().map(|metadata| metadata.len()).unwrap_or(0),
            kind: kind.into(),
        });
        if assets.len() >= 500 {
            break;
        }
    }
    assets.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(assets)
}

fn skip_dir(path: &Path) -> bool {
    path.components().any(|part| {
        matches!(
            part.as_os_str().to_string_lossy().as_ref(),
            "node_modules"
                | ".git"
                | ".next"
                | "dist"
                | "build"
                | "out"
                | ".turbo"
                | "coverage"
                | "target"
        )
    })
}

fn supported_source(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|v| v.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
        "tsx" | "jsx" | "ts" | "js" | "astro" | "mdx"
    )
}

fn language_for(path: &Path) -> Option<Language> {
    match path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "tsx" | "ts" => Some(tree_sitter_typescript::LANGUAGE_TSX.into()),
        "jsx" | "js" => Some(tree_sitter_javascript::LANGUAGE.into()),
        _ => None,
    }
}

fn tag_from_opening(opening: &str) -> String {
    opening
        .trim_start_matches('<')
        .trim_start()
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | ':' | '.'))
        .collect::<String>()
}

fn quoted_attribute(opening: &str, names: &[&str]) -> Option<String> {
    for name in names {
        let mut from = 0;
        while let Some(found) = opening[from..].find(name) {
            let idx = from + found;
            let before_ok = idx == 0 || !opening.as_bytes()[idx - 1].is_ascii_alphanumeric();
            let mut cursor = idx + name.len();
            if !before_ok {
                from = cursor;
                continue;
            }
            while opening
                .as_bytes()
                .get(cursor)
                .is_some_and(u8::is_ascii_whitespace)
            {
                cursor += 1;
            }
            if opening.as_bytes().get(cursor) != Some(&b'=') {
                from = cursor;
                continue;
            }
            cursor += 1;
            while opening
                .as_bytes()
                .get(cursor)
                .is_some_and(u8::is_ascii_whitespace)
            {
                cursor += 1;
            }
            let quote = *opening.as_bytes().get(cursor)?;
            if quote != b'"' && quote != b'\'' {
                from = cursor;
                continue;
            }
            let start = cursor + 1;
            let end = opening.as_bytes()[start..]
                .iter()
                .position(|b| *b == quote)
                .map(|v| start + v)?;
            return Some(opening[start..end].to_string());
        }
    }
    None
}

fn attribute_index(opening: &str, name: &str) -> Option<usize> {
    let mut from = 0;
    while let Some(found) = opening[from..].find(name) {
        let idx = from + found;
        let before_ok = idx > 0 && opening.as_bytes()[idx - 1].is_ascii_whitespace();
        let mut after = idx + name.len();
        while opening
            .as_bytes()
            .get(after)
            .is_some_and(u8::is_ascii_whitespace)
        {
            after += 1;
        }
        if before_ok && opening.as_bytes().get(after) == Some(&b'=') {
            return Some(idx);
        }
        from = idx + name.len();
    }
    None
}

fn candidate_score(
    query: &DesignElementQuery,
    tag: &str,
    opening: &str,
    node_source: &str,
    relative_file: &str,
    line: usize,
) -> i32 {
    if !tag.eq_ignore_ascii_case(&query.tag) {
        return -1;
    }
    let mut score = 30;
    if let Some(expected_id) = query.id.as_deref().filter(|v| !v.is_empty()) {
        match quoted_attribute(opening, &["id"]).as_deref() {
            Some(actual) if actual == expected_id => score += 90,
            Some(_) => return -1,
            None => score -= 8,
        }
    }
    let actual_classes = quoted_attribute(opening, &["className", "class"])
        .unwrap_or_default()
        .split_whitespace()
        .map(str::to_string)
        .collect::<HashSet<_>>();
    let expected_classes = query
        .classes
        .iter()
        .filter(|v| !v.starts_with("shape-") && !v.starts_with("__"))
        .collect::<Vec<_>>();
    let overlap = expected_classes
        .iter()
        .filter(|v| actual_classes.contains(v.as_str()))
        .count();
    score += (overlap as i32) * 12;
    if !expected_classes.is_empty() && overlap == expected_classes.len() {
        score += 24;
    }
    if let Some(text) = query
        .text
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        let needle = text.chars().take(80).collect::<String>();
        if node_source.contains(&needle) {
            score += 36;
        }
    }
    if let Some(route_source) = query.route_source.as_deref() {
        if relative_file
            .replace('\\', "/")
            .ends_with(&route_source.replace('\\', "/"))
        {
            score += 70;
        }
    }
    if let Some(source_file) = query.source_file.as_deref() {
        let expected = source_file
            .replace("file:///", "")
            .replace("file://", "")
            .replace('\\', "/");
        let actual = relative_file.replace('\\', "/");
        if expected.ends_with(&actual) || actual.ends_with(&expected) {
            score += 180;
            if let Some(source_line) = query.source_line {
                let distance = line.abs_diff(source_line);
                score += 80 - (distance.min(80) as i32);
            }
        } else {
            score -= 40;
        }
    }
    score
}

fn enclosing_edit_node(node: Node<'_>) -> Node<'_> {
    let mut current = node;
    while let Some(parent) = current.parent() {
        if matches!(parent.kind(), "jsx_element" | "element") {
            return parent;
        }
        if matches!(parent.kind(), "program" | "document") {
            break;
        }
        current = parent;
    }
    node
}

fn collect_tree_candidates(
    node: Node<'_>,
    source: &str,
    relative_file: &str,
    query: &DesignElementQuery,
    out: &mut Vec<DesignSourceTarget>,
) {
    if matches!(
        node.kind(),
        "jsx_opening_element" | "jsx_self_closing_element" | "start_tag" | "self_closing_tag"
    ) {
        let opening = &source[node.start_byte()..node.end_byte()];
        let tag = tag_from_opening(opening);
        let edit_node = enclosing_edit_node(node);
        let node_source = &source[edit_node.start_byte()..edit_node.end_byte()];
        let confidence = candidate_score(
            query,
            &tag,
            opening,
            node_source,
            relative_file,
            node.start_position().row + 1,
        );
        if confidence >= 30 {
            out.push(DesignSourceTarget {
                file: relative_file.to_string(),
                tag,
                opening_start: node.start_byte(),
                opening_end: node.end_byte(),
                node_start: edit_node.start_byte(),
                node_end: edit_node.end_byte(),
                line: node.start_position().row + 1,
                confidence,
            });
        }
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_tree_candidates(child, source, relative_file, query, out);
    }
}

fn scan_astro_candidates(
    source: &str,
    relative_file: &str,
    query: &DesignElementQuery,
    out: &mut Vec<DesignSourceTarget>,
) {
    let bytes = source.as_bytes();
    let mut i = source
        .find("---")
        .and_then(|start| {
            source[start + 3..]
                .find("---")
                .map(|end| start + 3 + end + 3)
        })
        .unwrap_or(0);
    while i < bytes.len() {
        let Some(rel) = source[i..].find('<') else {
            break;
        };
        let start = i + rel;
        if bytes
            .get(start + 1)
            .map(|b| matches!(b, b'/' | b'!' | b'?' | b'>'))
            .unwrap_or(true)
        {
            i = start + 1;
            continue;
        }
        let mut end = start + 1;
        let mut quote = 0u8;
        let mut braces = 0i32;
        while end < bytes.len() {
            let b = bytes[end];
            if quote != 0 {
                if b == quote && bytes.get(end.wrapping_sub(1)) != Some(&b'\\') {
                    quote = 0;
                }
            } else if b == b'"' || b == b'\'' {
                quote = b;
            } else if b == b'{' {
                braces += 1;
            } else if b == b'}' {
                braces = (braces - 1).max(0);
            } else if b == b'>' && braces == 0 {
                end += 1;
                break;
            }
            end += 1;
        }
        if end <= start + 1 || end > bytes.len() {
            break;
        }
        let opening = &source[start..end];
        let tag = tag_from_opening(opening);
        let node_end = if opening.trim_end().ends_with("/>") {
            end
        } else {
            let closing = format!("</{tag}>");
            source[end..]
                .find(&closing)
                .map(|offset| end + offset + closing.len())
                .unwrap_or(end)
        };
        let preview_end = (end + 2000).min(source.len());
        let confidence = candidate_score(
            query,
            &tag,
            opening,
            &source[start..preview_end],
            relative_file,
            source[..start].bytes().filter(|b| *b == b'\n').count() + 1,
        );
        if confidence >= 30 {
            out.push(DesignSourceTarget {
                file: relative_file.to_string(),
                tag,
                opening_start: start,
                opening_end: end,
                node_start: start,
                node_end,
                line: source[..start].bytes().filter(|b| *b == b'\n').count() + 1,
                confidence,
            });
        }
        i = end;
    }
}

#[tauri::command]
pub fn resolve_design_element(
    project_path: String,
    query: DesignElementQuery,
) -> Result<Vec<DesignSourceTarget>, AppError> {
    let requested = PathBuf::from(&project_path);
    let Some((root, _)) = find_supported_root(&requested) else {
        return Err(AppError::Message(
            "Design mode supports React + Vite, Next.js, Astro, and Remix projects.".into(),
        ));
    };
    let mut results = Vec::new();
    for entry in WalkDir::new(&root)
        .max_depth(14)
        .into_iter()
        .filter_entry(|e| !skip_dir(e.path()))
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() || !supported_source(entry.path()) {
            continue;
        }
        if entry.metadata().map(|m| m.len()).unwrap_or(u64::MAX) > MAX_SOURCE_BYTES {
            continue;
        }
        let Ok(source) = std::fs::read_to_string(entry.path()) else {
            continue;
        };
        let relative = entry
            .path()
            .strip_prefix(&root)
            .unwrap_or(entry.path())
            .to_string_lossy()
            .replace('\\', "/");
        if matches!(
            entry.path().extension().and_then(|v| v.to_str()),
            Some("astro" | "mdx")
        ) {
            scan_astro_candidates(&source, &relative, &query, &mut results);
        } else if let Some(language) = language_for(entry.path()) {
            let mut parser = Parser::new();
            if parser.set_language(&language).is_ok() {
                if let Some(tree) = parser.parse(&source, None) {
                    collect_tree_candidates(
                        tree.root_node(),
                        &source,
                        &relative,
                        &query,
                        &mut results,
                    );
                }
            }
        }
    }
    results.sort_by(|a, b| b.confidence.cmp(&a.confidence));
    results.truncate(MAX_RESULTS);
    Ok(results)
}

fn css_to_react_key(property: &str) -> String {
    if property.starts_with("--") {
        return format!("\"{}\"", property);
    }
    let mut out = String::new();
    let mut uppercase = false;
    for c in property.chars() {
        if c == '-' {
            uppercase = true;
        } else if uppercase {
            out.extend(c.to_uppercase());
            uppercase = false;
        } else {
            out.push(c);
        }
    }
    out
}

fn js_string(value: &str) -> String {
    format!(
        "\"{}\"",
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
    )
}

fn split_js_properties(input: &str) -> Vec<String> {
    let bytes = input.as_bytes();
    let mut out = Vec::new();
    let mut start = 0;
    let mut quote = 0u8;
    let mut escaped = false;
    let mut depth = 0i32;
    for (index, byte) in bytes.iter().copied().enumerate() {
        if quote != 0 {
            if escaped {
                escaped = false;
            } else if byte == b'\\' {
                escaped = true;
            } else if byte == quote {
                quote = 0;
            }
            continue;
        }
        match byte {
            b'"' | b'\'' | b'`' => quote = byte,
            b'{' | b'[' | b'(' => depth += 1,
            b'}' | b']' | b')' => depth = (depth - 1).max(0),
            b',' if depth == 0 => {
                out.push(input[start..index].trim().to_string());
                start = index + 1;
            }
            _ => {}
        }
    }
    out.push(input[start..].trim().to_string());
    out
}

fn merge_react_style(opening: &str, styles: &BTreeMap<String, String>) -> Result<String, AppError> {
    let declarations = styles
        .iter()
        .map(|(key, value)| format!("{}: {}", css_to_react_key(key), js_string(value)))
        .collect::<Vec<_>>();
    if declarations.is_empty() {
        return Ok(opening.to_string());
    }
    if let Some(style_at) = attribute_index(opening, "style") {
        let after = &opening[style_at + 5..];
        let Some(eq_rel) = after.find('=') else {
            return Err(AppError::Message("Unsupported style attribute.".into()));
        };
        let value_start = style_at + 5 + eq_rel + 1;
        let rest = opening[value_start..].trim_start();
        let whitespace = opening[value_start..].len() - rest.len();
        let literal_start = value_start + whitespace;
        if !opening[literal_start..].starts_with("{{") {
            return Err(AppError::Message(
                "This element uses a dynamic style expression. Shape will not overwrite it.".into(),
            ));
        }
        let Some(close_rel) = opening[literal_start + 2..].find("}}") else {
            return Err(AppError::Message(
                "Could not safely read the style object.".into(),
            ));
        };
        let inner_start = literal_start + 2;
        let inner_end = inner_start + close_rel;
        let existing = opening[inner_start..inner_end].trim();
        let replaced_keys = styles
            .keys()
            .map(|v| css_to_react_key(v).trim_matches('"').to_string())
            .collect::<HashSet<_>>();
        let mut kept = split_js_properties(existing)
            .into_iter()
            .filter(|part| {
                let key = part
                    .split(':')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .trim_matches('"');
                !replaced_keys.contains(key)
            })
            .filter(|v| !v.is_empty())
            .collect::<Vec<_>>();
        kept.extend(declarations);
        let inner = kept.join(", ");
        return Ok(format!(
            "{}{}{}",
            &opening[..inner_start],
            inner,
            &opening[inner_end..]
        ));
    }
    let insert_at = opening
        .rfind("/>")
        .or_else(|| opening.rfind('>'))
        .ok_or_else(|| AppError::Message("Invalid JSX opening element.".into()))?;
    Ok(format!(
        "{} style={{{{ {} }}}}{}",
        &opening[..insert_at],
        declarations.join(", "),
        &opening[insert_at..]
    ))
}

fn merge_html_style(opening: &str, styles: &BTreeMap<String, String>) -> Result<String, AppError> {
    let mut declarations = styles
        .iter()
        .map(|(key, value)| format!("{key}: {value}"))
        .collect::<Vec<_>>();
    if declarations.is_empty() {
        return Ok(opening.to_string());
    }
    if let Some(style_at) = attribute_index(opening, "style") {
        let after_name = style_at + "style".len();
        let eq_at = opening[after_name..]
            .find('=')
            .map(|offset| after_name + offset)
            .ok_or_else(|| AppError::Message("Invalid style attribute.".into()))?;
        let mut quote_at = eq_at + 1;
        while opening
            .as_bytes()
            .get(quote_at)
            .is_some_and(u8::is_ascii_whitespace)
        {
            quote_at += 1;
        }
        let quote = *opening
            .as_bytes()
            .get(quote_at)
            .ok_or_else(|| AppError::Message("Invalid style attribute.".into()))?;
        if quote != b'"' && quote != b'\'' {
            return Err(AppError::Message(
                "This element uses a dynamic style expression. Shape will not overwrite it.".into(),
            ));
        }
        let start = quote_at + 1;
        let end = opening.as_bytes()[start..]
            .iter()
            .position(|b| *b == quote)
            .map(|v| start + v)
            .ok_or_else(|| AppError::Message("Invalid style attribute.".into()))?;
        let replaced = styles.keys().cloned().collect::<HashSet<_>>();
        let mut kept = opening[start..end]
            .split(';')
            .map(str::trim)
            .filter(|part| {
                let key = part.split(':').next().unwrap_or("").trim();
                !replaced.contains(key)
            })
            .filter(|v| !v.is_empty())
            .map(str::to_string)
            .collect::<Vec<_>>();
        kept.append(&mut declarations);
        return Ok(format!(
            "{}{}{}",
            &opening[..start],
            kept.join("; "),
            &opening[end..]
        ));
    }
    let insert_at = opening
        .rfind("/>")
        .or_else(|| opening.rfind('>'))
        .ok_or_else(|| AppError::Message("Invalid HTML opening element.".into()))?;
    Ok(format!(
        "{} style=\"{}\"{}",
        &opening[..insert_at],
        declarations.join("; "),
        &opening[insert_at..]
    ))
}

fn replace_direct_text(
    source: &str,
    target: &DesignSourceTarget,
    text: &str,
) -> Result<String, AppError> {
    if target.node_end <= target.opening_end || target.node_end > source.len() {
        return Err(AppError::Message(
            "Text editing is unavailable for this self-closing element.".into(),
        ));
    }
    let body = &source[target.opening_end..target.node_end];
    let closing_at = body
        .rfind("</")
        .ok_or_else(|| AppError::Message("Could not find this element's closing tag.".into()))?;
    let direct = &body[..closing_at];
    if direct.contains('<') || direct.contains('{') {
        return Err(AppError::Message(
            "This text is generated by nested or dynamic content, so Shape left the code unchanged."
                .into(),
        ));
    }
    let escaped = text
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    Ok(format!(
        "{}{}{}",
        &source[..target.opening_end],
        escaped,
        &source[target.opening_end + closing_at..]
    ))
}

fn syntax_is_clean(path: &Path, source: &str) -> bool {
    let Some(language) = language_for(path) else {
        return true;
    };
    let mut parser = Parser::new();
    parser.set_language(&language).is_ok()
        && parser
            .parse(source, None)
            .is_some_and(|tree| !tree.root_node().has_error())
}

#[tauri::command]
pub fn apply_design_source_patch(patch: DesignSourcePatch) -> Result<DesignPatchResult, AppError> {
    let root = PathBuf::from(&patch.project_path);
    let source_path = canonical_inside(&root, &root.join(&patch.target.file))?;
    let before = std::fs::read_to_string(&source_path)?;
    if patch.target.opening_end > before.len()
        || patch.target.opening_start >= patch.target.opening_end
    {
        return Err(AppError::Message(
            "The source changed since selection. Select the element again.".into(),
        ));
    }
    let opening = &before[patch.target.opening_start..patch.target.opening_end];
    if !tag_from_opening(opening).eq_ignore_ascii_case(&patch.target.tag) {
        return Err(AppError::Message(
            "The source changed since selection. Select the element again.".into(),
        ));
    }

    let mut after = before.clone();
    match patch.operation.as_deref() {
        Some("delete") => {
            if patch.target.node_end > before.len()
                || patch.target.node_start >= patch.target.node_end
            {
                return Err(AppError::Message(
                    "The source changed since selection. Select the element again.".into(),
                ));
            }
            after.replace_range(patch.target.node_start..patch.target.node_end, "");
        }
        Some("duplicate") => {
            if patch.target.node_end > before.len()
                || patch.target.node_start >= patch.target.node_end
            {
                return Err(AppError::Message(
                    "The source changed since selection. Select the element again.".into(),
                ));
            }
            let duplicate = before[patch.target.node_start..patch.target.node_end].to_string();
            after.insert_str(patch.target.node_end, &duplicate);
        }
        Some(other) => {
            return Err(AppError::Message(format!(
                "Unsupported visual source operation: {other}"
            )));
        }
        None => {}
    }
    if patch.operation.is_some() && (!patch.styles.is_empty() || patch.text.is_some()) {
        return Err(AppError::Message(
            "Structural, text, and style changes are saved as separate safe edits.".into(),
        ));
    }
    if !patch.styles.is_empty() {
        let is_astro = source_path.extension().and_then(|v| v.to_str()) == Some("astro");
        let updated = if is_astro {
            merge_html_style(opening, &patch.styles)?
        } else {
            merge_react_style(opening, &patch.styles)?
        };
        after.replace_range(
            patch.target.opening_start..patch.target.opening_end,
            &updated,
        );
    }
    if let Some(text) = patch.text.as_deref() {
        if !patch.styles.is_empty() {
            return Err(AppError::Message(
                "Text and style changes are saved as separate safe edits.".into(),
            ));
        }
        after = replace_direct_text(&after, &patch.target, text)?;
    }
    if after == before {
        return Ok(DesignPatchResult {
            file: patch.target.file,
            changed: false,
            line: patch.target.line,
        });
    }
    let before_clean = syntax_is_clean(&source_path, &before);
    if before_clean && !syntax_is_clean(&source_path, &after) {
        return Err(AppError::Message(
            "Shape rejected this edit because it would make the source invalid.".into(),
        ));
    }
    std::fs::write(&source_path, &after)?;
    with_history(|history| {
        history.undo.push(HistoryEntry {
            path: source_path.clone(),
            before,
            after,
        });
        history.redo.clear();
        if history.undo.len() > 100 {
            history.undo.remove(0);
        }
    });
    Ok(DesignPatchResult {
        file: patch.target.file,
        changed: true,
        line: patch.target.line,
    })
}

#[tauri::command]
pub fn undo_design_source_patch() -> Result<bool, AppError> {
    let entry = with_history(|history| history.undo.pop());
    let Some(entry) = entry else { return Ok(false) };
    std::fs::write(&entry.path, &entry.before)?;
    with_history(|history| history.redo.push(entry));
    Ok(true)
}

#[tauri::command]
pub fn redo_design_source_patch() -> Result<bool, AppError> {
    let entry = with_history(|history| history.redo.pop());
    let Some(entry) = entry else { return Ok(false) };
    std::fs::write(&entry.path, &entry.after)?;
    with_history(|history| history.undo.push(entry));
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_react_style_without_duplicate_keys() {
        let mut styles = BTreeMap::new();
        styles.insert("display".into(), "flex".into());
        styles.insert("gap".into(), "16px".into());
        let out = merge_react_style(
            r#"<div className="card" style={{ display: "block", color: "red" }}>"#,
            &styles,
        )
        .unwrap();
        assert!(out.contains(r#"display: "flex""#));
        assert!(out.contains(r#"gap: "16px""#));
        assert!(out.contains(r#"color: "red""#));
        assert!(!out.contains(r#"display: "block""#));
    }

    #[test]
    fn preserves_commas_inside_existing_style_values() {
        let mut styles = BTreeMap::new();
        styles.insert("opacity".into(), "0.8".into());
        let out = merge_react_style(
            r#"<div style={{ boxShadow: "0 1px 2px red, 0 2px 8px blue" }}>"#,
            &styles,
        )
        .unwrap();
        assert!(out.contains(r#"boxShadow: "0 1px 2px red, 0 2px 8px blue""#));
        assert!(out.contains(r#"opacity: "0.8""#));
    }

    #[test]
    fn inserts_astro_style() {
        let mut styles = BTreeMap::new();
        styles.insert("padding".into(), "12px".into());
        let out = merge_html_style("<section class=\"hero\">", &styles).unwrap();
        assert_eq!(out, "<section class=\"hero\" style=\"padding: 12px\">");
    }

    #[test]
    fn recognizes_only_supported_frameworks() {
        assert_eq!(
            detect_framework(r#"{"dependencies":{"next":"16"}}"#),
            Some("next")
        );
        assert_eq!(
            detect_framework(r#"{"dependencies":{"vite":"7","react":"19"}}"#),
            Some("react-vite")
        );
        assert_eq!(
            detect_framework(r#"{"dependencies":{"vue":"3","vite":"7"}}"#),
            None
        );
    }

    #[test]
    fn resolves_and_patches_a_vite_react_element() {
        let root =
            std::env::temp_dir().join(format!("shape-design-source-{}", uuid::Uuid::new_v4()));
        let src = root.join("src");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(
            root.join("package.json"),
            r#"{"dependencies":{"vite":"7","react":"19"}}"#,
        )
        .unwrap();
        std::fs::write(
            src.join("App.tsx"),
            r#"export function App(){return <main className="hero shell">Hello Shape</main>}"#,
        )
        .unwrap();

        let matches = resolve_design_element(
            root.to_string_lossy().into_owned(),
            DesignElementQuery {
                tag: "main".into(),
                id: None,
                classes: vec!["hero".into(), "shell".into()],
                text: Some("Hello Shape".into()),
                route_source: Some("src/App.tsx".into()),
                source_file: None,
                source_line: None,
            },
        )
        .unwrap();
        assert_eq!(matches[0].file, "src/App.tsx");

        let mut styles = BTreeMap::new();
        styles.insert("display".into(), "flex".into());
        let result = apply_design_source_patch(DesignSourcePatch {
            project_path: root.to_string_lossy().into_owned(),
            target: matches[0].clone(),
            styles,
            text: None,
            operation: None,
        })
        .unwrap();
        assert!(result.changed);
        let updated = std::fs::read_to_string(src.join("App.tsx")).unwrap();
        assert!(updated.contains(r#"style={{ display: "flex" }}"#));
        assert!(syntax_is_clean(&src.join("App.tsx"), &updated));
        let _ = std::fs::remove_dir_all(root);
    }
}
