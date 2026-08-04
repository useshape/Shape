use crate::core::error::AppError;
use crate::domain::git::service;

pub use crate::commands::git::{GitActivityPoint, GitFileParams, GitLogEntry, GitSyncStatus, BlameLine, GitStashEntry, GitRemoteInfo, GitBranchDetail, GitBranchGraph, GitRepoInfo, GitTagEntry, GitHunkList};

#[tauri::command]
pub async fn git_discover_repos(workspace_root: String) -> Result<Vec<GitRepoInfo>, AppError> {
    service::git_discover_repos(workspace_root).await
}

#[tauri::command]
pub async fn git_resolve_repo_for_file(
    workspace_root: String,
    file_path: String,
) -> Result<Option<String>, AppError> {
    service::git_resolve_repo_for_file(workspace_root, file_path).await
}

#[tauri::command]
pub async fn git_status(path: String) -> Result<Vec<GitFileParams>, AppError> {
    service::git_status(path).await
}

#[tauri::command]
pub async fn git_stage(repo_path: String, file_path: String) -> Result<(), AppError> {
    service::git_stage(repo_path, file_path).await
}

#[tauri::command]
pub async fn git_stage_all(repo_path: String) -> Result<(), AppError> {
    service::git_stage_all(repo_path).await
}

#[tauri::command]
pub async fn git_unstage_all(repo_path: String) -> Result<(), AppError> {
    service::git_unstage_all(repo_path).await
}

#[tauri::command]
pub async fn git_unstage(repo_path: String, file_path: String) -> Result<(), AppError> {
    service::git_unstage(repo_path, file_path).await
}

#[tauri::command]
pub async fn git_discard_changes(repo_path: String, file_path: String) -> Result<(), AppError> {
    service::git_discard_changes(repo_path, file_path).await
}

#[tauri::command]
pub async fn git_list_hunks(
    repo_path: String,
    file_path: String,
    staged: bool,
) -> Result<GitHunkList, AppError> {
    service::git_list_hunks(repo_path, file_path, staged).await
}

#[tauri::command]
pub async fn git_stage_hunk(
    repo_path: String,
    file_path: String,
    hunk_index: usize,
    line_indices: Option<Vec<usize>>,
) -> Result<(), AppError> {
    service::git_stage_hunk(repo_path, file_path, hunk_index, line_indices).await
}

#[tauri::command]
pub async fn git_unstage_hunk(
    repo_path: String,
    file_path: String,
    hunk_index: usize,
    line_indices: Option<Vec<usize>>,
) -> Result<(), AppError> {
    service::git_unstage_hunk(repo_path, file_path, hunk_index, line_indices).await
}

#[tauri::command]
pub async fn git_restore_hunk(
    repo_path: String,
    file_path: String,
    hunk_index: usize,
    line_indices: Option<Vec<usize>>,
) -> Result<(), AppError> {
    service::git_restore_hunk(repo_path, file_path, hunk_index, line_indices).await
}

#[tauri::command]
pub async fn git_file_diff(repo_path: String, file_path: String) -> Result<String, AppError> {
    service::git_file_diff(repo_path, file_path).await
}

#[tauri::command]
pub async fn git_create_branch(repo_path: String, branch_name: String) -> Result<(), AppError> {
    service::git_create_branch(repo_path, branch_name).await
}

#[tauri::command]
pub async fn git_delete_branch(repo_path: String, branch_name: String) -> Result<(), AppError> {
    service::git_delete_branch(repo_path, branch_name).await
}

#[tauri::command]
pub async fn git_switch_branch(repo_path: String, branch_name: String) -> Result<(), AppError> {
    service::git_switch_branch(repo_path, branch_name).await
}

#[tauri::command]
pub async fn git_commit(repo_path: String, message: String) -> Result<(), AppError> {
    service::git_commit(repo_path, message).await
}

#[tauri::command]
pub async fn git_commit_amend(repo_path: String, message: String) -> Result<(), AppError> {
    service::git_commit_amend(repo_path, message).await
}

#[tauri::command]
pub async fn git_diff(repo_path: String) -> Result<String, AppError> {
    service::git_diff(repo_path).await
}

#[tauri::command]
pub async fn git_init(path: String) -> Result<(), AppError> {
    service::git_init(path).await
}

#[tauri::command]
pub async fn git_branch_details(
    path: String,
    current_branch: String,
    all_refs: Option<bool>,
) -> Result<Vec<GitBranchDetail>, AppError> {
    service::git_branch_details(path, current_branch, all_refs).await
}

#[tauri::command]
pub async fn git_branch_graph(
    path: String,
    all_refs: Option<bool>,
) -> Result<GitBranchGraph, AppError> {
    service::git_branch_graph(path, all_refs).await
}

#[tauri::command]
pub async fn git_set_upstream(
    repo_path: String,
    branch: String,
    upstream: String,
) -> Result<(), AppError> {
    service::git_set_upstream(repo_path, branch, upstream).await
}

#[tauri::command]
pub async fn git_diff_branches(
    repo_path: String,
    base: String,
    compare: String,
) -> Result<String, AppError> {
    service::git_diff_branches(repo_path, base, compare).await
}

#[tauri::command]
pub async fn git_branches(path: String) -> Result<Vec<String>, AppError> {
    service::git_branches(path).await
}

#[tauri::command]
pub async fn git_remote_branches(path: String) -> Result<Vec<String>, AppError> {
    service::git_remote_branches(path).await
}

#[tauri::command]
pub async fn git_rename_branch(
    repo_path: String,
    old_name: String,
    new_name: String,
) -> Result<(), AppError> {
    service::git_rename_branch(repo_path, old_name, new_name).await
}

#[tauri::command]
pub async fn git_current_branch(path: String) -> Result<String, AppError> {
    service::git_current_branch(path).await
}

#[tauri::command]
pub async fn git_log_stream_start(
    path: String,
    caller_id: String,
    all_refs: Option<bool>,
) -> Result<(), AppError> {
    service::git_log_stream_start(path, caller_id, all_refs).await
}

#[tauri::command]
pub async fn git_log_stream_next(caller_id: String, limit: usize) -> Result<Vec<GitLogEntry>, AppError> {
    service::git_log_stream_next(caller_id, limit).await
}

#[tauri::command]
pub async fn git_log_stream_stop(caller_id: String) -> Result<(), AppError> {
    service::git_log_stream_stop(caller_id).await
}

#[tauri::command]
pub async fn git_activity_timeline(
    path: String,
    all_refs: Option<bool>,
    rev: Option<String>,
    author: Option<String>,
) -> Result<Vec<GitActivityPoint>, AppError> {
    service::git_activity_timeline(path, all_refs, rev, author).await
}

#[tauri::command]
pub async fn git_sync_status(path: String) -> Result<GitSyncStatus, AppError> {
    service::git_sync_status(path).await
}

#[tauri::command]
pub async fn git_commit_files(
    repo_path: String,
    hash: String,
) -> Result<Vec<GitFileParams>, AppError> {
    service::git_commit_files(repo_path, hash).await
}

#[tauri::command]
pub async fn git_sync(path: String) -> Result<(), AppError> {
    service::git_sync(path).await
}

#[tauri::command]
pub async fn git_pull(path: String) -> Result<(), AppError> {
    service::git_pull(path).await
}

#[tauri::command]
pub async fn git_push(path: String) -> Result<(), AppError> {
    service::git_push(path).await
}

#[tauri::command]
pub async fn git_fetch(path: String) -> Result<(), AppError> {
    service::git_fetch(path).await
}

#[tauri::command]
pub async fn git_cherry_pick(repo_path: String, hash: String) -> Result<(), AppError> {
    service::git_cherry_pick(repo_path, hash).await
}

#[tauri::command]
pub async fn git_revert_commit(repo_path: String, hash: String) -> Result<(), AppError> {
    service::git_revert_commit(repo_path, hash).await
}

#[tauri::command]
pub async fn git_create_branch_from_commit(repo_path: String, branch_name: String, hash: String) -> Result<(), AppError> {
    service::git_create_branch_from_commit(repo_path, branch_name, hash).await
}

#[tauri::command]
pub async fn git_checkout_commit(repo_path: String, hash: String) -> Result<(), AppError> {
    service::git_checkout_commit(repo_path, hash).await
}

#[tauri::command]
pub async fn git_has_remote(path: String) -> Result<bool, AppError> {
    service::git_has_remote(path).await
}

#[tauri::command]
pub async fn git_remote_url(path: String) -> Result<String, AppError> {
    service::git_remote_url(path).await
}

#[tauri::command]
pub async fn git_list_remotes(path: String) -> Result<Vec<GitRemoteInfo>, AppError> {
    service::git_list_remotes(path).await
}

#[tauri::command]
pub async fn git_add_remote(path: String, name: String, url: String) -> Result<(), AppError> {
    service::git_add_remote(path, name, url).await
}

#[tauri::command]
pub async fn git_remove_remote(path: String, name: String) -> Result<(), AppError> {
    service::git_remove_remote(path, name).await
}

#[tauri::command]
pub async fn git_set_remote_url(path: String, name: String, url: String) -> Result<(), AppError> {
    service::git_set_remote_url(path, name, url).await
}

#[tauri::command]
pub async fn git_get_item_content(
    repo_path: String,
    file_path: String,
    staged: bool,
) -> Result<String, AppError> {
    service::git_get_item_content(repo_path, file_path, staged).await
}

#[tauri::command]
pub async fn git_get_commit_file_content(
    repo_path: String,
    file_path: String,
    hash: String,
) -> Result<(String, String), AppError> {
    service::git_get_commit_file_content(repo_path, file_path, hash).await
}

#[tauri::command]
pub async fn git_blame_file(repo_path: String, file_path: String) -> Result<Vec<BlameLine>, AppError> {
    service::git_blame_file(repo_path, file_path).await
}

#[tauri::command]
pub async fn git_stash_list(repo_path: String) -> Result<Vec<GitStashEntry>, AppError> {
    service::git_stash_list(repo_path).await
}

#[tauri::command]
pub async fn git_stash_save(repo_path: String, message: String, include_untracked: bool) -> Result<(), AppError> {
    service::git_stash_save(repo_path, message, include_untracked).await
}

#[tauri::command]
pub async fn git_stash_apply(repo_path: String, index: usize) -> Result<(), AppError> {
    service::git_stash_apply(repo_path, index).await
}

#[tauri::command]
pub async fn git_stash_pop(repo_path: String, index: usize) -> Result<(), AppError> {
    service::git_stash_pop(repo_path, index).await
}

#[tauri::command]
pub async fn git_stash_drop(repo_path: String, index: usize) -> Result<(), AppError> {
    service::git_stash_drop(repo_path, index).await
}

#[tauri::command]
pub async fn git_stash_show(repo_path: String, index: usize) -> Result<String, AppError> {
    service::git_stash_show(repo_path, index).await
}

#[tauri::command]
pub fn git_open_diff(
    app: tauri::AppHandle,
    state: tauri::State<crate::core::state::AppState>,
    path: String,
    name: String,
    staged: bool,
) -> Result<(), AppError> {
    service::git_open_diff(app, state, path, name, staged)
}

#[tauri::command]
pub fn git_open_commit_diff(
    app: tauri::AppHandle,
    state: tauri::State<crate::core::state::AppState>,
    path: String,
    name: String,
    hash: String,
) -> Result<(), AppError> {
    service::git_open_commit_diff(app, state, path, name, hash)
}

#[tauri::command]
pub async fn git_clone(url: String, parent_dir: String) -> Result<String, AppError> {
    service::git_clone(url, parent_dir).await
}

#[tauri::command]
pub async fn git_list_tags(repo_path: String) -> Result<Vec<GitTagEntry>, AppError> {
    service::git_list_tags(repo_path).await
}

#[tauri::command]
pub async fn git_reset(repo_path: String, hash: String, mode: String) -> Result<(), AppError> {
    service::git_reset(repo_path, hash, mode).await
}

#[tauri::command]
pub async fn git_create_tag(
    repo_path: String,
    name: String,
    hash: String,
    message: Option<String>,
) -> Result<(), AppError> {
    service::git_create_tag(repo_path, name, hash, message).await
}

#[tauri::command]
pub async fn git_delete_tag(repo_path: String, name: String) -> Result<(), AppError> {
    service::git_delete_tag(repo_path, name).await
}

#[tauri::command]
pub async fn git_diff_name_status(
    repo_path: String,
    base: String,
    compare: String,
) -> Result<Vec<GitFileParams>, AppError> {
    service::git_diff_name_status(repo_path, base, compare).await
}

#[tauri::command]
pub async fn git_get_file_at_ref(
    repo_path: String,
    rev: String,
    file_path: String,
) -> Result<String, AppError> {
    service::git_get_file_at_ref(repo_path, rev, file_path).await
}

#[tauri::command]
pub async fn git_merge_abort(repo_path: String) -> Result<(), AppError> {
    service::git_merge_abort(repo_path).await
}

#[tauri::command]
pub async fn git_rebase_abort(repo_path: String) -> Result<(), AppError> {
    service::git_rebase_abort(repo_path).await
}

#[tauri::command]
pub async fn git_in_progress(repo_path: String) -> Result<serde_json::Value, AppError> {
    service::git_in_progress(repo_path).await
}
