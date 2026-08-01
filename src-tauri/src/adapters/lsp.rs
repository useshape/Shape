use crate::domain::lsp::service::{self, LspServerConfig, LspState};
use crate::core::workspace_trust::{command_path_under_project, WorkspaceTrustState};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};

fn validate_lsp_command(command: &str, args: &[String], cwd: Option<&str>) -> Result<(), String> {
    const ALLOWED: &[&str] = &["npx", "npx.cmd", "node", "node.exe"];

    let base = Path::new(command)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(command);

    if !ALLOWED.iter().any(|allowed| base.eq_ignore_ascii_case(allowed)) {
        return Err(format!("LSP command not allowed: {}", command));
    }

    if command_path_under_project(command, cwd) {
        return Err("LSP command cannot be a project-local binary".to_string());
    }

    if base.eq_ignore_ascii_case("node") || base.eq_ignore_ascii_case("node.exe") {
        if let Some(cwd) = cwd {
            let project = PathBuf::from(cwd);
            if let Some(first) = args.first() {
                let arg_path = PathBuf::from(first);
                if arg_path.is_absolute() {
                    if crate::core::workspace_trust::path_is_under_root(&arg_path, &project) {
                        return Err("LSP node entrypoint cannot live under the project root".to_string());
                    }
                }
            }
        }
    }

    Ok(())
}

/// Spawn a language server process. Messages are delivered via `lsp-message` events.
#[tauri::command]
#[specta::specta]
pub async fn lsp_start(
    app: AppHandle,
    state: State<'_, LspState>,
    trust_state: State<'_, WorkspaceTrustState>,
    language: String,
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
    isolate_npx: Option<bool>,
) -> Result<(), String> {
    if let Some(ref project) = cwd {
        if !trust_state.is_trusted(project) {
            return Err("Workspace is not trusted — LSP disabled until you trust this folder.".to_string());
        }
    }

    validate_lsp_command(&command, &args, cwd.as_deref())?;

    let config = LspServerConfig {
        language,
        command,
        args,
        cwd,
        isolate_npx: isolate_npx.unwrap_or(false),
    };
    service::spawn_lsp(app, &state, config).await
}

fn typescript_lib_from_dir(dir: &Path) -> Option<String> {
    let direct = dir.join("typescript").join("lib");
    if direct.join("tsserver.js").exists() {
        return Some(direct.to_string_lossy().to_string());
    }
    let lib = dir.join("node_modules").join("typescript").join("lib");
    if lib.join("tsserver.js").exists() {
        return Some(lib.to_string_lossy().to_string());
    }
    None
}

/// Resolve the TypeScript lib folder (contains tsserver.js) for a workspace.
#[tauri::command]
#[specta::specta]
pub fn resolve_typescript_tsdk(project_path: String) -> Option<String> {
    let project = Path::new(&project_path);
    if let Some(found) = typescript_lib_from_dir(project) {
        return Some(found);
    }

    // Monorepo: scan immediate child packages (e.g. shape/, website/)
    if let Ok(entries) = std::fs::read_dir(project) {
        for entry in entries.flatten() {
            let child = entry.path();
            if child.is_dir() {
                if let Some(found) = typescript_lib_from_dir(&child) {
                    return Some(found);
                }
            }
        }
    }

    let mut dir = project;
    for _ in 0..6 {
        dir = dir.parent()?;
        if let Some(found) = typescript_lib_from_dir(dir) {
            return Some(found);
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        if let Some(found) = typescript_lib_from_dir(&cwd) {
            return Some(found);
        }
    }

    // Global npm installs (Windows + Unix)
    if let Ok(appdata) = std::env::var("APPDATA") {
        let npm_modules = Path::new(&appdata).join("npm").join("node_modules");
        if let Some(found) = typescript_lib_from_dir(&npm_modules) {
            return Some(found);
        }
    }
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        for candidate in [
            Path::new(&home).join(".npm-global").join("lib").join("node_modules"),
            Path::new(&home).join(".npm").join("lib").join("node_modules"),
            Path::new(&home)
                .join("AppData")
                .join("Roaming")
                .join("npm")
                .join("node_modules"),
        ] {
            if let Some(found) = typescript_lib_from_dir(&candidate) {
                return Some(found);
            }
        }
    }

    // App-bundled TypeScript (Shape's own node_modules when running dev/build)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            for candidate in [
                exe_dir.join("..").join("..").join(".."),
                exe_dir.join("..").join(".."),
                exe_dir.to_path_buf(),
            ] {
                if let Ok(canonical) = candidate.canonicalize() {
                    if let Some(found) = typescript_lib_from_dir(&canonical) {
                        return Some(found);
                    }
                }
            }
        }
    }

    None
}

/// Send a JSON-RPC message to a language server's stdin
#[tauri::command]
#[specta::specta]
pub async fn lsp_send(
    state: State<'_, LspState>,
    language: String,
    message: String,
) -> Result<(), String> {
    service::send_to_lsp(&state, &language, message).await
}

/// Stop a single language server
#[tauri::command]
#[specta::specta]
pub async fn lsp_stop(state: State<'_, LspState>, language: String) -> Result<(), String> {
    service::stop_lsp(&state, &language).await
}

/// Stop all language servers
#[tauri::command]
#[specta::specta]
pub async fn lsp_stop_all(state: State<'_, LspState>) -> Result<(), String> {
    service::stop_all_lsp(&state).await;
    Ok(())
}
