use serde_json::{json, Value};

#[derive(Debug, Clone)]
pub struct GrepOptions {
    pub path: Option<String>,
    pub glob: Option<String>,
    pub context: usize,
    pub case_sensitive: bool,
    pub head_limit: usize,
}

impl Default for GrepOptions {
    fn default() -> Self {
        Self {
            path: None,
            glob: None,
            context: 0,
            case_sensitive: false,
            head_limit: 80,
        }
    }
}

pub async fn execute_grep(query: &str, project_path: &Option<String>, opts: GrepOptions) -> String {
    let Some(path) = project_path else {
        return "No project open.".to_string();
    };

    let search_path = std::path::PathBuf::from(path);
    let head_limit = opts.head_limit.clamp(1, 200);
    let context = opts.context.min(3);
    let scope = opts
        .path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    // Models sometimes pass a file path to grep; return that file directly.
    // Must go through the same sensitive-path guards as read_file.
    let clean_query = query.trim_start_matches(|c| c == '/' || c == '\\');
    if scope.is_none() && !clean_query.contains("..") {
        match crate::agent::security::paths::validate_read_path(clean_query, path) {
            Ok(target) if target.is_file() => {
                if let Ok(content) = std::fs::read_to_string(&target) {
                    let char_count = content.chars().count();
                    if char_count > 20_000 {
                        let head: String = content.chars().take(20_000).collect();
                        return format!(
                            "File {}:\n{}\n\n[truncated — file is {} chars; use read_file with start_line/end_line to see more]",
                            clean_query, head, char_count
                        );
                    }
                    return format!("File {}:\n{}", clean_query, content);
                }
            }
            Ok(target) if target.is_dir() => {
                let mut list = String::new();
                if let Ok(entries) = std::fs::read_dir(&target) {
                    list.push_str(&format!("Listing Folder contents of '{}':\n", clean_query));
                    for entry in entries.filter_map(|e| e.ok()) {
                        let name = entry.file_name().to_string_lossy().into_owned();
                        if entry.path().is_dir() {
                            list.push_str(&format!("- {}/\n", name));
                        } else {
                            list.push_str(&format!("- {}\n", name));
                        }
                    }
                    return list;
                }
            }
            Err(e) => {
                // Exact path looked sensitive / out of bounds — do not fall through to rg.
                if search_path.join(clean_query).exists() {
                    return format!("ERROR: {}", e);
                }
            }
            _ => {}
        }
    }

    let rg_target = if let Some(rel) = scope {
        match crate::agent::security::paths::validate_read_path(rel, path) {
            Ok(p) => p,
            Err(e) => return format!("ERROR: {}", e),
        }
    } else {
        search_path.join(".")
    };

    // Fast search using ripgrep (if available). Try the query as a regex first
    // (so alternations like `foo|bar` work), then fall back to a literal
    // search if the pattern doesn't parse.
    let run_rg = |fixed_string: bool| {
        let mut cmd = std::process::Command::new("rg");
        cmd.current_dir(path)
            .arg("-n")
            .arg("--color")
            .arg("never")
            .arg("--max-columns")
            .arg("240")
            .arg("--max-columns-preview")
            .arg("--glob")
            .arg("!node_modules")
            .arg("--glob")
            .arg("!**/dist/**")
            .arg("--glob")
            .arg("!**/.git/**");
        if !opts.case_sensitive {
            cmd.arg("--ignore-case");
        }
        for glob in crate::agent::security::paths::SENSITIVE_RG_GLOBS {
            cmd.arg("--glob").arg(glob);
        }
        if let Some(g) = opts.glob.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            cmd.arg("--glob").arg(g);
        }
        if context > 0 {
            cmd.arg("-C").arg(context.to_string());
        }
        // Soft line cap via rg; we also trim after.
        cmd.arg("-m").arg(head_limit.to_string());
        if fixed_string {
            cmd.arg("-F");
        }
        crate::core::process::hide_console(&mut cmd);
        cmd.arg("-e").arg(query).arg(&rg_target).output()
    };

    let mut rg_out = run_rg(false);
    if let Ok(out) = &rg_out {
        let pattern_error = !out.status.success()
            && !String::from_utf8_lossy(&out.stderr).trim().is_empty();
        if pattern_error {
            rg_out = run_rg(true);
        }
    }

    if let Ok(out) = rg_out {
        let res = String::from_utf8_lossy(&out.stdout).to_string();
        if !res.trim().is_empty() {
            const CHAR_CAP: usize = 8_000;
            let line_count = res.lines().count();
            if res.chars().count() > CHAR_CAP || line_count > head_limit {
                let head: String = res
                    .lines()
                    .take(head_limit)
                    .collect::<Vec<_>>()
                    .join("\n")
                    .chars()
                    .take(CHAR_CAP)
                    .collect();
                return format!(
                    "{}\n... [truncated — showing up to {} lines / {} chars; narrow path/glob/query]",
                    head, head_limit, CHAR_CAP
                );
            }
            return res;
        }
        // rg exit code 1 with empty output = searched successfully, no matches.
        if out.status.code() == Some(1) {
            return "No results found.".to_string();
        }
    }

    // Ultimate fallback native rust search
    let mut output = String::new();
    let mut limits = head_limit.min(50);

    fn search_recursive(
        dir: &std::path::Path,
        q: &str,
        depth: usize,
        limits: &mut usize,
        out: &mut String,
        base: &std::path::Path,
    ) {
        if *limits == 0 || depth > 6 {
            return;
        }
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                if *limits == 0 {
                    break;
                }
                let p = entry.path();
                let name = entry.file_name().to_string_lossy().into_owned();

                if name.starts_with('.')
                    || matches!(name.as_str(), "node_modules" | "dist" | "build" | "target")
                {
                    continue;
                }

                if p.is_dir() {
                    search_recursive(&p, q, depth + 1, limits, out, base);
                } else if crate::agent::security::paths::is_sensitive_path(&p) {
                    continue;
                } else if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                    if matches!(
                        ext,
                        "rs" | "ts"
                            | "tsx"
                            | "js"
                            | "jsx"
                            | "json"
                            | "css"
                            | "html"
                            | "md"
                            | "toml"
                            | "go"
                            | "py"
                            | "c"
                            | "cpp"
                            | "java"
                    ) {
                        if let Ok(file) = std::fs::File::open(&p) {
                            use std::io::{BufRead, BufReader};
                            let reader = BufReader::new(file);
                            let q_lower = q.to_lowercase();

                            for (i, line_res) in reader.lines().enumerate() {
                                if let Ok(line) = line_res {
                                    if line.to_lowercase().contains(&q_lower) {
                                        let rel = p.strip_prefix(base).unwrap_or(&p);
                                        out.push_str(&format!(
                                            "{}:{}\t{}\n",
                                            rel.display(),
                                            i + 1,
                                            line.trim()
                                        ));
                                        *limits -= 1;
                                        if *limits == 0 {
                                            break;
                                        }
                                    }
                                }
                                if i > 10000 {
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let base_path = std::path::PathBuf::from(path);
    let start = if rg_target.is_file() {
        rg_target.parent().unwrap_or(&base_path).to_path_buf()
    } else {
        rg_target.clone()
    };
    if rg_target.is_file() {
        // Narrow fallback: search just that file's parent walk is wasteful — read the file.
        if let Ok(content) = std::fs::read_to_string(&rg_target) {
            let q_lower = query.to_lowercase();
            let rel = rg_target.strip_prefix(&base_path).unwrap_or(&rg_target);
            let mut hits = 0usize;
            for (i, line) in content.lines().enumerate() {
                if line.to_lowercase().contains(&q_lower) {
                    output.push_str(&format!("{}:{}\t{}\n", rel.display(), i + 1, line.trim()));
                    hits += 1;
                    if hits >= head_limit {
                        break;
                    }
                }
            }
        }
    } else {
        search_recursive(&start, query, 0, &mut limits, &mut output, &base_path);
    }

    if output.is_empty() {
        "No results found.".to_string()
    } else {
        output
    }
}

pub async fn execute_file_search(query: &str, project_path: &Option<String>) -> String {
    let Some(path) = project_path else {
        return "No project open.".to_string();
    };

    let mut results = Vec::new();
    let q_lower = query.to_lowercase();
    
    let walk_dir = walkdir::WalkDir::new(path)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.') && name != "node_modules" && name != "target" && name != "dist" && name != "build"
        });

    for entry in walk_dir.filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let path_str = entry.path().to_string_lossy().to_lowercase();
            if path_str.contains(&q_lower) {
                let rel = entry.path().strip_prefix(path).unwrap_or(entry.path());
                results.push(rel.display().to_string().replace('\\', "/"));
                if results.len() >= 100 {
                    results.push("... [truncated, more than 100 results]".to_string());
                    break;
                }
            }
        }
    }

    if results.is_empty() {
        "No matching files found.".to_string()
    } else {
        results.join("\n")
    }
}

pub async fn execute_web_search(query: &str, access_token: &str) -> String {
    let base = crate::core::website_url::shape_website_base();
    let url = format!("{}/api/tools/web-search", base.trim_end_matches('/'));

    let client = reqwest::Client::new();
    match client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&json!({ "query": query }))
        .send()
        .await
    {
        Ok(resp) => {
            if resp.status().as_u16() == 401 {
                return "Error: Sign in to Shape to use web search.".to_string();
            }
            if !resp.status().is_success() {
                let text = resp.text().await.unwrap_or_default();
                return format!(
                    "Web search error: {}",
                    text.chars().take(400).collect::<String>()
                );
            }
            match resp.json::<Value>().await {
                Ok(data) => data
                    .get("formatted")
                    .and_then(|v| v.as_str())
                    .unwrap_or("No web results found.")
                    .to_string(),
                Err(e) => format!("Failed to parse web search response: {}", e),
            }
        }
        Err(e) => format!("Web search request failed: {}", e),
    }
}

#[derive(Debug, Clone)]
pub struct VisitUrlResult {
    pub formatted: String,
    pub title: String,
    pub url: String,
    pub host: String,
}

pub async fn execute_visit_url(url: &str, access_token: &str) -> Result<VisitUrlResult, String> {
    let base = crate::core::website_url::shape_website_base();
    let endpoint = format!("{}/api/tools/visit-url", base.trim_end_matches('/'));

    let client = reqwest::Client::new();
    let resp = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&json!({ "url": url }))
        .send()
        .await
        .map_err(|e| format!("Visit URL request failed: {}", e))?;

    if resp.status().as_u16() == 401 {
        return Err("Sign in to Shape to visit websites.".to_string());
    }
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Visit URL error: {}",
            text.chars().take(400).collect::<String>()
        ));
    }

    let data: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse visit URL response: {}", e))?;

    if let Some(err) = data.get("error").and_then(|v| v.as_str()) {
        return Err(err.to_string());
    }

    let formatted = data
        .get("formatted")
        .and_then(|v| v.as_str())
        .unwrap_or("No page content extracted.")
        .to_string();
    let title = data
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let final_url = data
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or(url)
        .to_string();
    let host = data
        .get("host")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(VisitUrlResult {
        formatted,
        title,
        url: final_url,
        host,
    })
}
