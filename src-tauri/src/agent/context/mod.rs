mod repo_map;

pub use repo_map::DEFAULT_REPO_MAP_TOKENS;

use crate::agent::context::repo_map::{build_repo_map, format_repo_map_section, RepoMapInput};
use crate::agent::index::IndexState;
use crate::app_state::AppState;
use crate::core::error::AppError;

pub fn context_options_for_query(query: String, index_state: IndexState) -> ContextOptions {
    ContextOptions {
        retrieval_query: Some(query),
        index_state: Some(index_state),
        ..ContextOptions::default()
    }
}

#[derive(Clone)]
pub struct ContextOptions {
    pub retrieval_query: Option<String>,
    pub repo_map_token_budget: usize,
    pub index_state: Option<IndexState>,
}

impl Default for ContextOptions {
    fn default() -> Self {
        Self {
            retrieval_query: None,
            repo_map_token_budget: DEFAULT_REPO_MAP_TOKENS,
            index_state: None,
        }
    }
}

pub async fn build_context_with_options(
    app_state: &tauri::State<'_, AppState>,
    opts: ContextOptions,
) -> Result<(String, Option<String>, Option<String>), AppError> {
    let mut context_string = String::new();
    let (active_path_opt, open_files, project_path_opt) = {
        let proj_state = app_state.0.lock()?;
        (
            proj_state.active_file.clone(),
            proj_state.open_files.clone(),
            proj_state.project_path.clone(),
        )
    };

    // Slim runtime slice (~200 tokens)
    context_string.push_str("=== RUNTIME ENVIRONMENT ===\n");
    #[cfg(target_os = "windows")]
    {
        context_string.push_str("OS: Windows | Shell: PowerShell\n");
    }
    #[cfg(target_os = "macos")]
    {
        context_string.push_str("OS: macOS | Shell: bash/sh\n");
    }
    #[cfg(target_os = "linux")]
    {
        context_string.push_str("OS: Linux | Shell: bash/sh\n");
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        context_string.push_str("OS: unknown | Shell: sh\n");
    }

    context_string.push_str("\n=== SYSTEM CONTEXT ===\n");
    if let Some(project_path) = &project_path_opt {
        context_string.push_str(&format!("Workspace: {}\n", project_path));
        if workspace_looks_empty(project_path) {
            context_string.push_str(
                "Workspace status: empty/greenfield (no package.json, Cargo.toml, app/, or src/). After Design concept selection, scaffold then implement — do not refuse.\n",
            );
        }
        let git_status = get_git_status_short(project_path, 5);
        if !git_status.is_empty() {
            context_string.push_str("Git:\n");
            context_string.push_str(&git_status);
        }
    } else {
        context_string.push_str("No project open.\n");
    }

    context_string.push_str("\n=== ACTIVE CONTEXT ===\n");
    if let Some(active_path) = &active_path_opt {
        context_string.push_str(&format!("Active file: {}\n", active_path));
    }

    // Critical diagnostics only (≤3 per file)
    {
        let state = app_state.0.lock()?;
        let mut diag_count = 0usize;
        for file in open_files.iter().take(5) {
            if let Some(diagnostics) = state.diagnostics.get(&file.path) {
                for diag in diagnostics.iter().take(3) {
                    if diag_count >= 9 {
                        break;
                    }
                    context_string.push_str(&format!(
                        "Diag {}: [{}] {} L{}\n",
                        file.path, diag.severity, diag.message, diag.line
                    ));
                    diag_count += 1;
                }
            }
        }
    }
    context_string.push_str("======================\n\n");

    // Repo map on send. Codebase retrieval happens on demand via `search_codebase`.
    if let (Some(_project_path), Some(_query)) = (&project_path_opt, opts.retrieval_query.as_ref()) {
        if opts.index_state.is_some() {
            let boost_paths: Vec<String> = open_files
                .iter()
                .map(|f| f.path.clone())
                .chain(active_path_opt.iter().cloned())
                .collect();
            let open_paths: Vec<String> = open_files.iter().map(|f| f.path.clone()).collect();
            let map = build_repo_map(RepoMapInput {
                open_files: &open_paths,
                active_file: active_path_opt.as_deref(),
                retrieval_files: &boost_paths,
                token_budget: opts.repo_map_token_budget,
            })
            .await;
            context_string.push_str(&format_repo_map_section(&map));
        }
    }

    Ok((context_string, active_path_opt, project_path_opt))
}

fn workspace_looks_empty(project_path: &str) -> bool {
    let root = std::path::Path::new(project_path);
    if !root.is_dir() {
        return true;
    }
    let markers = [
        "package.json",
        "Cargo.toml",
        "pyproject.toml",
        "go.mod",
        "app",
        "src",
        "pages",
        "components",
    ];
    !markers.iter().any(|name| root.join(name).exists())
}

fn get_git_status_short(project_path: &str, max_lines: usize) -> String {
    let output = crate::core::git_bin::git_command()
        .and_then(|mut cmd| {
            Ok(cmd.args(["-C", project_path, "status", "--short"]).output()?)
        });

    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout);
            let lines: Vec<&str> = text.lines().take(max_lines).collect();
            if lines.is_empty() {
                return "(clean)\n".to_string();
            }
            let mut result = lines.join("\n");
            if text.lines().count() > max_lines {
                result.push_str("\n...");
            }
            result.push('\n');
            result
        }
        Ok(out) => {
            let err = String::from_utf8_lossy(&out.stderr);
            if err.contains("not a git repository") {
                "(not a git repo)\n".to_string()
            } else {
                String::new()
            }
        }
        Err(_) => String::new(),
    }
}
