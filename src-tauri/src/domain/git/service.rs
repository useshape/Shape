use crate::commands::git;
pub use crate::commands::git::{GitActivityPoint, GitFileParams, GitLogEntry, GitSyncStatus};
use crate::core::error::AppError;
use crate::core::state::{AppState, FileInfo};
use tauri::{AppHandle, Emitter, State};


pub async fn git_status(path: String) -> Result<Vec<GitFileParams>, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_status(path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_discover_repos(workspace_root: String) -> Result<Vec<git::GitRepoInfo>, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_discover_repos(workspace_root))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_resolve_repo_for_file(
    workspace_root: String,
    file_path: String,
) -> Result<Option<String>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::git_resolve_repo_for_file(workspace_root, file_path)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_stage(repo_path: String, file_path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_stage(repo_path, file_path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_stage_all(repo_path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_stage_all(repo_path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_unstage_all(repo_path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_unstage_all(repo_path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_unstage(repo_path: String, file_path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_unstage(repo_path, file_path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_discard_changes(repo_path: String, file_path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_discard_changes(repo_path, file_path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_list_hunks(
    repo_path: String,
    file_path: String,
    staged: bool,
) -> Result<git::GitHunkList, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_list_hunks(repo_path, file_path, staged))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_stage_hunk(
    repo_path: String,
    file_path: String,
    hunk_index: usize,
    line_indices: Option<Vec<usize>>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::git_stage_hunk(repo_path, file_path, hunk_index, line_indices)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_unstage_hunk(
    repo_path: String,
    file_path: String,
    hunk_index: usize,
    line_indices: Option<Vec<usize>>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::git_unstage_hunk(repo_path, file_path, hunk_index, line_indices)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_restore_hunk(
    repo_path: String,
    file_path: String,
    hunk_index: usize,
    line_indices: Option<Vec<usize>>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::git_restore_hunk(repo_path, file_path, hunk_index, line_indices)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_file_diff(repo_path: String, file_path: String) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_file_diff(repo_path, file_path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_create_branch(repo_path: String, branch_name: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_create_branch(repo_path, branch_name))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_delete_branch(repo_path: String, branch_name: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_delete_branch(repo_path, branch_name))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_switch_branch(repo_path: String, branch_name: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_switch_branch(repo_path, branch_name))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_commit(repo_path: String, message: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_commit(repo_path, message))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_commit_amend(repo_path: String, message: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_commit_amend(repo_path, message))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_diff(repo_path: String) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_diff(repo_path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_branches(path: String) -> Result<Vec<String>, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_branches(path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_init(path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_init(path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_branch_details(
    path: String,
    current_branch: String,
    all_refs: Option<bool>,
) -> Result<Vec<git::GitBranchDetail>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::git_branch_details(path, current_branch, all_refs)
    })
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_branch_graph(
    path: String,
    all_refs: Option<bool>,
) -> Result<git::GitBranchGraph, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_branch_graph(path, all_refs))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_set_upstream(
    repo_path: String,
    branch: String,
    upstream: String,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_set_upstream(repo_path, branch, upstream))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_diff_branches(
    repo_path: String,
    base: String,
    compare: String,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_diff_branches(repo_path, base, compare))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_remote_branches(path: String) -> Result<Vec<String>, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_remote_branches(path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_rename_branch(
    repo_path: String,
    old_name: String,
    new_name: String,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::git_rename_branch(repo_path, old_name, new_name)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_current_branch(path: String) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_current_branch(path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_log_stream_start(
    path: String,
    caller_id: String,
    all_refs: Option<bool>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_log_stream_start(path, caller_id, all_refs))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_log_stream_next(caller_id: String, limit: usize) -> Result<Vec<GitLogEntry>, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_log_stream_next(caller_id, limit))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_log_stream_stop(caller_id: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_log_stream_stop(caller_id))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_activity_timeline(
    path: String,
    all_refs: Option<bool>,
    rev: Option<String>,
    author: Option<String>,
) -> Result<Vec<GitActivityPoint>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::git_activity_timeline(path, all_refs, rev, author)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_sync_status(path: String) -> Result<GitSyncStatus, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_sync_status(path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_commit_files(
    repo_path: String,
    hash: String,
) -> Result<Vec<GitFileParams>, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_commit_files(repo_path, hash))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_sync(path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_sync(path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_pull(path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_pull(path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_push(path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_push(path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_fetch(path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_fetch(path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_cherry_pick(repo_path: String, hash: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_cherry_pick(repo_path, hash))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_revert_commit(repo_path: String, hash: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_revert_commit(repo_path, hash))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_create_branch_from_commit(repo_path: String, branch_name: String, hash: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_create_branch_from_commit(repo_path, branch_name, hash))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_checkout_commit(repo_path: String, hash: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_checkout_commit(repo_path, hash))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_has_remote(path: String) -> Result<bool, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_has_remote(path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_remote_url(path: String) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_remote_url(path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_list_remotes(path: String) -> Result<Vec<git::GitRemoteInfo>, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_list_remotes(path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_add_remote(path: String, name: String, url: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_add_remote(path, name, url))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_remove_remote(path: String, name: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_remove_remote(path, name))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_set_remote_url(path: String, name: String, url: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_set_remote_url(path, name, url))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_get_item_content(
    repo_path: String,
    file_path: String,
    staged: bool,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::git_get_item_content(repo_path, file_path, staged)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_get_commit_file_content(
    repo_path: String,
    file_path: String,
    hash: String,
) -> Result<(String, String), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::git_get_commit_file_content(repo_path, file_path, hash)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_blame_file(repo_path: String, file_path: String) -> Result<Vec<git::BlameLine>, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_blame_file(repo_path, file_path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_stash_list(repo_path: String) -> Result<Vec<git::GitStashEntry>, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_stash_list(repo_path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_stash_save(repo_path: String, message: String, include_untracked: bool) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_stash_save(repo_path, message, include_untracked))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_stash_apply(repo_path: String, index: usize) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_stash_apply(repo_path, index))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_stash_pop(repo_path: String, index: usize) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_stash_pop(repo_path, index))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_stash_drop(repo_path: String, index: usize) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_stash_drop(repo_path, index))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_stash_show(repo_path: String, index: usize) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_stash_show(repo_path, index))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub fn git_open_diff(
    app: AppHandle,
    state: State<AppState>,
    path: String,
    name: String,
    staged: bool,
) -> Result<(), AppError> {
    let mut state_guard = state.0.lock()?;
    let diff_path = if staged {
        format!("diff:staged:{}", path)
    } else {
        format!("diff:unstaged:{}", path)
    };

    if !state_guard.open_files.iter().any(|f| f.path == diff_path) {
        state_guard.open_files.push(FileInfo {
            path: diff_path.clone(),
            name: name.clone(),
            is_dirty: false,
            is_pinned: false,
            kind: crate::app_state::FileKind::Diff,
            diff_metadata: Some(crate::app_state::DiffMetadata { staged, commit_hash: None }),
        });
    }
    state_guard.active_file = Some(diff_path);
    let _ = app.emit("project-state-update", &*state_guard);
    Ok(())
}

pub async fn git_clone(url: String, parent_dir: String) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_clone(url, parent_dir))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_list_tags(repo_path: String) -> Result<Vec<git::GitTagEntry>, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_list_tags(repo_path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_reset(repo_path: String, hash: String, mode: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_reset(repo_path, hash, mode))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_create_tag(
    repo_path: String,
    name: String,
    hash: String,
    message: Option<String>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_create_tag(repo_path, name, hash, message))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_delete_tag(repo_path: String, name: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_delete_tag(repo_path, name))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_diff_name_status(
    repo_path: String,
    base: String,
    compare: String,
) -> Result<Vec<git::GitFileParams>, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_diff_name_status(repo_path, base, compare))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_get_file_at_ref(
    repo_path: String,
    rev: String,
    file_path: String,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_get_file_at_ref(repo_path, rev, file_path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_merge_abort(repo_path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_merge_abort(repo_path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_rebase_abort(repo_path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_rebase_abort(repo_path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn git_in_progress(repo_path: String) -> Result<serde_json::Value, AppError> {
    tauri::async_runtime::spawn_blocking(move || git::git_in_progress(repo_path))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

fn normalize_commit_file_path(path: &str, project_root: Option<&str>) -> String {
    let mut normalized = path.replace('\\', "/");
    if let Some(root) = project_root {
        let root_norm = root.replace('\\', "/").trim_end_matches('/').to_string();
        if normalized.starts_with(&root_norm) {
            normalized = normalized
                .strip_prefix(&root_norm)
                .unwrap_or(&normalized)
                .trim_start_matches('/')
                .to_string();
        }
    }
    normalized
}

pub fn git_open_commit_diff(
    app: AppHandle,
    state: State<AppState>,
    path: String,
    name: String,
    hash: String,
) -> Result<(), AppError> {
    let mut state_guard = state.0.lock()?;
    let project_root = state_guard.project_path.clone();
    let rel_path = normalize_commit_file_path(&path, project_root.as_deref());
    let diff_path = format!("diff:commit:{}:{}", hash, rel_path);

    if !state_guard.open_files.iter().any(|f| f.path == diff_path) {
        let short_hash = &hash[0..std::cmp::min(7, hash.len())];
        state_guard.open_files.push(FileInfo {
            path: diff_path.clone(),
            name: format!("{} ({})", name, short_hash),
            is_dirty: false,
            is_pinned: false,
            kind: crate::app_state::FileKind::Diff,
            diff_metadata: Some(crate::app_state::DiffMetadata { staged: false, commit_hash: Some(hash) }),
        });
    }
    state_guard.active_file = Some(diff_path);
    let _ = app.emit("project-state-update", &*state_guard);
    Ok(())
}
