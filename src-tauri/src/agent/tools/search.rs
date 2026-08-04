use serde_json::{json, Value};

pub async fn execute_local_search(query: &str, project_path: &Option<String>) -> String {
    let Some(path) = project_path else {
        return "No project open.".to_string();
    };

    let search_path = std::path::PathBuf::from(path);

    // Models sometimes pass a file path to grep; return that file directly.
    // Must go through the same sensitive-path guards as read_file.
    let clean_query = query.trim_start_matches(|c| c == '/' || c == '\\');
    if !clean_query.contains("..") {
        match crate::agent::security::paths::validate_read_path(clean_query, path) {
            Ok(target) if target.is_file() => {
                if let Ok(content) = std::fs::read_to_string(&target) {
                    let char_count = content.chars().count();
                    if char_count > 40_000 {
                        let head: String = content.chars().take(40_000).collect();
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

    // Fast search using ripgrep (if available). Try the query as a regex first
    // (so alternations like `foo|bar` work), then fall back to a literal
    // search if the pattern doesn't parse.
    let run_rg = |fixed_string: bool| {
        let mut cmd = std::process::Command::new("rg");
        cmd.current_dir(path)
            .arg("-n")
            .arg("--color")
            .arg("never")
            .arg("--ignore-case")
            .arg("--max-columns")
            .arg("300")
            .arg("--max-columns-preview")
            .arg("--glob")
            .arg("!node_modules");
        for glob in crate::agent::security::paths::SENSITIVE_RG_GLOBS {
            cmd.arg("--glob").arg(glob);
        }
        if fixed_string {
            cmd.arg("-F");
        }
        crate::core::process::hide_console(&mut cmd);
        cmd.arg("-e").arg(query).arg(".").output()
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
            const CHAR_CAP: usize = 15_000;
            if res.chars().count() > CHAR_CAP {
                let total_lines = res.lines().count();
                let head: String = res.chars().take(CHAR_CAP).collect();
                return format!(
                    "{}\n... [truncated — {} matching lines total; results are INCOMPLETE. Narrow the query or search a subdirectory]",
                    head, total_lines
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
    let mut limits = 50;

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
    search_recursive(&base_path, query, 0, &mut limits, &mut output, &base_path);

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
