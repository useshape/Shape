use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tree_sitter::{Language, Node, Parser};
use walkdir::WalkDir;

use crate::commands::design_css::{merge_css_declarations, normalize_css_value};
use crate::core::error::AppError;
use crate::core::paths;

const MAX_SOURCE_BYTES: u64 = 2 * 1024 * 1024;

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
#[allow(dead_code)]
pub struct DesignElementQuery {
    pub tag: String,
    pub id: Option<String>,
    #[serde(default)]
    pub classes: Vec<String>,
    pub text: Option<String>,
    pub route_source: Option<String>,
    pub source_file: Option<String>,
    pub source_line: Option<usize>,
    #[serde(default)]
    pub source_column: Option<usize>,
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
            project_root: paths::spawn_cwd(&root.to_string_lossy()),
            supported: true,
        });
    }
    Ok(DesignProjectInfo {
        framework: "unsupported".into(),
        project_root: paths::spawn_cwd(&canonical.to_string_lossy()),
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

fn locate_source_path(root: &Path, raw: &str) -> Option<PathBuf> {
    let mut cleaned = raw.trim().replace('\\', "/");
    cleaned = cleaned
        .trim_start_matches("file:///")
        .trim_start_matches("file://")
        .trim_start_matches("/@fs/")
        .to_string();
    if let Some((path, _)) = cleaned.split_once('?') {
        cleaned = path.to_string();
    }
    let root_canon = root.canonicalize().ok()?;
    let absolute = PathBuf::from(&cleaned);
    if absolute.is_absolute() {
        if let Ok(canon) = absolute.canonicalize() {
            if canon.starts_with(&root_canon) && supported_source(&canon) && !skip_dir(&canon) {
                return Some(canon);
            }
        }
        let root_s = paths::spawn_cwd(&root_canon.to_string_lossy())
            .replace('\\', "/")
            .to_lowercase();
        let file_s = paths::spawn_cwd(&cleaned)
            .replace('\\', "/")
            .to_lowercase();
        if let Some(rest) = file_s.strip_prefix(root_s.trim_end_matches('/')) {
            let joined = root_canon.join(rest.trim_start_matches('/'));
            if joined.is_file() && supported_source(&joined) {
                return Some(joined);
            }
        }
    }
    let relative = cleaned.trim_start_matches('/');
    for base in [root, root_canon.as_path()] {
        let joined = base.join(relative);
        if joined.is_file() && supported_source(&joined) && !skip_dir(&joined) {
            return Some(joined);
        }
    }
    None
}

struct OpeningHit {
    tag: String,
    opening_start: usize,
    opening_end: usize,
    node_start: usize,
    node_end: usize,
    line: usize,
    column: usize,
}

fn pick_opening<'a>(
    hits: &'a [OpeningHit],
    tag: &str,
    line: usize,
    column: Option<usize>,
) -> Option<&'a OpeningHit> {
    hits.iter()
        .filter(|hit| hit.line == line)
        .min_by_key(|hit| {
            let tag_penalty: u8 = if hit.tag.eq_ignore_ascii_case(tag) { 0 } else { 1 };
            let col_dist = column.map(|col| hit.column.abs_diff(col)).unwrap_or(0);
            (tag_penalty, col_dist, hit.opening_start)
        })
}

fn collect_jsx_openings(node: Node<'_>, source: &str, out: &mut Vec<OpeningHit>) {
    if matches!(
        node.kind(),
        "jsx_opening_element" | "jsx_self_closing_element" | "start_tag" | "self_closing_tag"
    ) {
        let opening = &source[node.start_byte()..node.end_byte()];
        let edit_node = enclosing_edit_node(node);
        let point = node.start_position();
        out.push(OpeningHit {
            tag: tag_from_opening(opening),
            opening_start: node.start_byte(),
            opening_end: node.end_byte(),
            node_start: edit_node.start_byte(),
            node_end: edit_node.end_byte(),
            line: point.row + 1,
            column: point.column + 1,
        });
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_jsx_openings(child, source, out);
    }
}

fn collect_markup_openings(source: &str, out: &mut Vec<OpeningHit>) {
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
        let line = source[..start].bytes().filter(|b| *b == b'\n').count() + 1;
        let line_start = source[..start].rfind('\n').map(|idx| idx + 1).unwrap_or(0);
        out.push(OpeningHit {
            tag,
            opening_start: start,
            opening_end: end,
            node_start: start,
            node_end,
            line,
            column: start - line_start + 1,
        });
        i = end;
    }
}

fn hit_to_target(relative: &str, hit: &OpeningHit) -> DesignSourceTarget {
    DesignSourceTarget {
        file: relative.to_string(),
        tag: hit.tag.clone(),
        opening_start: hit.opening_start,
        opening_end: hit.opening_end,
        node_start: hit.node_start,
        node_end: hit.node_end,
        line: hit.line,
        confidence: 100,
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
    let Some(source_file) = query.source_file.as_deref().filter(|value| !value.is_empty()) else {
        return Ok(Vec::new());
    };
    let Some(path) = locate_source_path(&root, source_file) else {
        return Ok(Vec::new());
    };
    if path
        .metadata()
        .map(|meta| meta.len())
        .unwrap_or(u64::MAX)
        > MAX_SOURCE_BYTES
    {
        return Ok(Vec::new());
    }
    let Ok(source) = std::fs::read_to_string(&path) else {
        return Ok(Vec::new());
    };
    let relative = path
        .strip_prefix(root.canonicalize().unwrap_or(root.clone()))
        .or_else(|_| path.strip_prefix(&root))
        .unwrap_or(&path)
        .to_string_lossy()
        .replace('\\', "/");
    let line = query.source_line.unwrap_or(0);
    if line == 0 {
        return Ok(Vec::new());
    }
    let mut hits = Vec::new();
    let is_markup = matches!(
        path.extension().and_then(|value| value.to_str()),
        Some("astro" | "mdx")
    );
    if is_markup {
        collect_markup_openings(&source, &mut hits);
    } else if let Some(language) = language_for(&path) {
        let mut parser = Parser::new();
        if parser.set_language(&language).is_ok() {
            if let Some(tree) = parser.parse(&source, None) {
                collect_jsx_openings(tree.root_node(), &source, &mut hits);
            }
        }
    }
    let Some(hit) = pick_opening(&hits, &query.tag, line, query.source_column) else {
        return Ok(Vec::new());
    };
    Ok(vec![hit_to_target(&relative, hit)])
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
        .map(|(key, value)| {
            format!(
                "{}: {}",
                css_to_react_key(key),
                js_string(&normalize_css_value(key, value))
            )
        })
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
    if styles.is_empty() {
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
        let merged = merge_css_declarations(&opening[start..end], styles);
        return Ok(format!("{}{}{}", &opening[..start], merged, &opening[end..]));
    }
    let insert_at = opening
        .rfind("/>")
        .or_else(|| opening.rfind('>'))
        .ok_or_else(|| AppError::Message("Invalid HTML opening element.".into()))?;
    Ok(format!(
        "{} style=\"{}\"{}",
        &opening[..insert_at],
        merge_css_declarations("", styles),
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
        let source = r#"export function App(){return <main className="hero shell">Hello Shape</main>}"#;
        std::fs::write(src.join("App.tsx"), source).unwrap();
        let column = source.find("<main").unwrap() + 1;

        let matches = resolve_design_element(
            root.to_string_lossy().into_owned(),
            DesignElementQuery {
                tag: "main".into(),
                id: None,
                classes: vec!["hero".into(), "shell".into()],
                text: Some("Hello Shape".into()),
                route_source: Some("src/App.tsx".into()),
                source_file: Some("src/App.tsx".into()),
                source_line: Some(1),
                source_column: Some(column),
            },
        )
        .unwrap();
        assert_eq!(matches.len(), 1);
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

    #[test]
    fn resolves_the_opening_tag_at_file_line_and_column() {
        let root =
            std::env::temp_dir().join(format!("shape-design-source-{}", uuid::Uuid::new_v4()));
        let src = root.join("src");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(
            root.join("package.json"),
            r#"{"dependencies":{"vite":"7","react":"19"}}"#,
        )
        .unwrap();
        let source = "export function App(){\n  return (\n    <>\n      <main className=\"first\">A</main>\n      <main className=\"second\">B</main>\n    </>\n  );\n}\n";
        std::fs::write(src.join("App.tsx"), source).unwrap();
        let second = source.match_indices("<main").nth(1).unwrap().0;
        let line = source[..second].bytes().filter(|b| *b == b'\n').count() + 1;
        let column = second - source[..second].rfind('\n').unwrap() ;

        let matches = resolve_design_element(
            root.to_string_lossy().into_owned(),
            DesignElementQuery {
                tag: "main".into(),
                id: None,
                classes: vec![],
                text: None,
                route_source: None,
                source_file: Some("src/App.tsx".into()),
                source_line: Some(line),
                source_column: Some(column),
            },
        )
        .unwrap();
        assert_eq!(matches.len(), 1);
        let opening = &source[matches[0].opening_start..matches[0].opening_end];
        assert!(opening.contains("second"), "{opening}");
        assert!(!opening.contains("first"), "{opening}");

        let none = resolve_design_element(
            root.to_string_lossy().into_owned(),
            DesignElementQuery {
                tag: "main".into(),
                id: None,
                classes: vec!["first".into()],
                text: Some("A".into()),
                route_source: Some("src/App.tsx".into()),
                source_file: None,
                source_line: None,
                source_column: None,
            },
        )
        .unwrap();
        assert!(none.is_empty());
        let _ = std::fs::remove_dir_all(root);
    }
}
