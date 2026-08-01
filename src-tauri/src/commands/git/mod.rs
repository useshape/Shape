use crate::core::error::AppError;
use git2::{DiffFormat, DiffOptions, Repository, StatusOptions};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::str;

mod hunks;
pub use hunks::{
    git_list_hunks, git_restore_hunk, git_stage_hunk, git_unstage_hunk, GitHunkList,
};

pub(super) fn git_cmd() -> Result<Command, AppError> {
    crate::core::git_bin::git_command()
}

#[derive(Serialize, Clone)]
pub struct GitRepoInfo {
    pub path: String,
    pub name: String,
    #[serde(rename = "isBare")]
    pub is_bare: bool,
}

const GIT_DISCOVER_MAX_DEPTH: usize = 8;
const GIT_DISCOVER_MAX_REPOS: usize = 64;

fn is_git_scan_ignored(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | "node_modules"
            | ".next"
            | "target"
            | "dist"
            | "build"
            | "out"
            | ".shape"
            | ".idea"
            | ".vscode"
            | "venv"
            | ".venv"
            | "__pycache__"
    )
}

fn normalize_path_str(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn is_git_metadata(path: &Path) -> bool {
    if path.is_dir() {
        return true;
    }
    if path.is_file() {
        if let Ok(contents) = fs::read_to_string(path) {
            return contents.trim().starts_with("gitdir:");
        }
    }
    false
}

fn repo_name_for(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "repository".to_string())
}

fn scan_for_git_repos(
    dir: &Path,
    workspace_root: &Path,
    depth: usize,
    repos: &mut Vec<GitRepoInfo>,
    seen: &mut HashMap<String, ()>,
) {
    if depth > GIT_DISCOVER_MAX_DEPTH || repos.len() >= GIT_DISCOVER_MAX_REPOS {
        return;
    }

    let git_meta = dir.join(".git");
    if is_git_metadata(&git_meta) {
        let key = normalize_path_str(dir);
        if !seen.contains_key(&key) {
            seen.insert(key.clone(), ());
            let is_bare = git_meta.is_file();
            repos.push(GitRepoInfo {
                path: key,
                name: repo_name_for(dir),
                is_bare,
            });
        }
    }

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if !file_type.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if is_git_scan_ignored(&name_str) {
            continue;
        }
        let child = entry.path();
        if !child.starts_with(workspace_root) {
            continue;
        }
        scan_for_git_repos(&child, workspace_root, depth + 1, repos, seen);
    }
}

/// Discover git repositories under a workspace folder (VS Code–style multi-root scan).
///
/// If the workspace root itself is a git repo, return only that repo and do **not**
/// walk the tree looking for nested repos. Walking depth-8 under trees like the
/// Linux kernel freezes the UI for minutes. Nested package repos are still found
/// when the workspace root is *not* itself a git checkout (parent-of-packages layout).
pub fn git_discover_repos(workspace_root: String) -> Result<Vec<GitRepoInfo>, AppError> {
    let root = PathBuf::from(&workspace_root);
    if !root.is_dir() {
        return Ok(Vec::new());
    }

    let root_git = root.join(".git");
    if is_git_metadata(&root_git) {
        return Ok(vec![GitRepoInfo {
            path: normalize_path_str(&root),
            name: repo_name_for(&root),
            is_bare: root_git.is_file(),
        }]);
    }

    let mut repos = Vec::new();
    let mut seen = HashMap::new();
    scan_for_git_repos(&root, &root, 0, &mut repos, &mut seen);

    repos.sort_by(|a, b| {
        a.path
            .matches('/')
            .count()
            .cmp(&b.path.matches('/').count())
            .then_with(|| a.path.cmp(&b.path))
    });

    Ok(repos)
}

/// Return the deepest discovered repo that contains `file_path`, or try libgit2 upward walk.
pub fn git_resolve_repo_for_file(workspace_root: String, file_path: String) -> Result<Option<String>, AppError> {
    let file = PathBuf::from(&file_path);
    let file_norm = normalize_path_str(&file);

    let repos = git_discover_repos(workspace_root.clone())?;
    let mut best: Option<&GitRepoInfo> = None;
    for repo in &repos {
        let repo_prefix = if repo.path.ends_with('/') {
            repo.path.clone()
        } else {
            format!("{}/", repo.path)
        };
        if file_norm == repo.path || file_norm.starts_with(&repo_prefix) {
            if best.map(|b| b.path.len()).unwrap_or(0) < repo.path.len() {
                best = Some(repo);
            }
        }
    }
    if let Some(repo) = best {
        return Ok(Some(repo.path.clone()));
    }

    // Fallback: libgit2 upward search from file or workspace
    if Repository::open(&file_path).is_ok() {
        return Ok(Some(normalize_path_str(&file)));
    }
    if let Some(parent) = file.parent() {
        if let Ok(repo) = Repository::open(parent) {
            if let Some(workdir) = repo.workdir() {
                return Ok(Some(normalize_path_str(workdir)));
            }
        }
    }
    if Repository::open(&workspace_root).is_ok() {
        return Ok(Some(normalize_path_str(Path::new(&workspace_root))));
    }

    Ok(None)
}

/// Open the best repo for a workspace path (direct open, nested discovery, or upward walk).
pub fn open_repo_path(workspace_root: &str) -> Result<Repository, AppError> {
    if let Ok(repo) = Repository::open(workspace_root) {
        return Ok(repo);
    }

    let repos = git_discover_repos(workspace_root.to_string())?;
    if repos.len() == 1 {
        return Repository::open(&repos[0].path).map_err(AppError::Git);
    }
    if !repos.is_empty() {
        // Prefer shallowest repo when workspace is parent of multiple packages
        return Repository::open(&repos[0].path).map_err(AppError::Git);
    }

    Repository::open(workspace_root).map_err(AppError::Git)
}

fn is_unborn_or_invalid_ref(e: &git2::Error) -> bool {
    e.code() == git2::ErrorCode::UnbornBranch
        || e.message().contains(".invalid")
        || e.message().contains("not valid")
}

fn default_branch_name(repo: &Repository) -> String {
    repo.config()
        .ok()
        .and_then(|cfg| cfg.get_string("init.defaultBranch").ok())
        .unwrap_or_else(|| "main".to_string())
}

#[derive(Serialize, Clone)]
pub struct GitFileParams {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

#[derive(Serialize, Clone)]
pub struct GraphPath {
    #[serde(rename = "type")]
    pub path_type: String, // "incoming", "outgoing", "passthrough"
    #[serde(rename = "fromX")]
    pub from_x: usize,
    #[serde(rename = "toX")]
    pub to_x: usize,
    pub color: String,
}

#[derive(Serialize, Clone)]
pub struct GraphNode {
    pub lane: usize,
    pub color: String,
    #[serde(rename = "isMerge")]
    pub is_merge: bool,
    pub paths: Vec<GraphPath>,
}

#[derive(Serialize, Clone)]
pub struct GitLogEntry {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub author_email: String,
    pub date: String,
    pub files_changed: usize,
    pub insertions: usize,
    pub deletions: usize,
    pub refs: Vec<String>,
    pub parent_count: usize,
    pub parents: Vec<String>,
    #[serde(rename = "graphNode")]
    pub graph_node: Option<GraphNode>,
}

/// Lightweight commit sample for the manager activity minimap (full history, tiny payload).
#[derive(Serialize, Clone)]
pub struct GitActivityPoint {
    pub timestamp: u64,
    pub hash: String,
}

/// Fetch only timestamp + short hash for every commit (or a filtered rev).
/// Used by the Git Manager activity chart so it covers the whole history without
/// waiting for the virtualized commit list to load.
pub fn git_activity_timeline(
    path: String,
    all_refs: Option<bool>,
    rev: Option<String>,
    author: Option<String>,
) -> Result<Vec<GitActivityPoint>, AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    use std::process::Stdio;

    let include_all = all_refs.unwrap_or(true);
    let mut cmd = git_cmd()?;
    cmd.current_dir(&path)
        .arg("log")
        .arg("--date-order")
        .arg("--format=%ct %h");

    if let Some(a) = author.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        cmd.arg(format!("--author={}", a));
    }

    let rev = rev.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty());
    if let Some(r) = rev {
        cmd.arg(r);
    } else if include_all {
        cmd.arg("--all");
    }

    cmd.stdout(Stdio::piped()).stderr(Stdio::null());

    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd
        .output()
        .map_err(|e| AppError::Message(format!("git activity timeline failed: {}", e)))?;
    if !output.status.success() {
        return Ok(Vec::new());
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut points = Vec::with_capacity(4096);
    const MAX_POINTS: usize = 80_000;
    for line in text.lines() {
        if points.len() >= MAX_POINTS {
            break;
        }
        let mut parts = line.split_whitespace();
        let Some(ts_raw) = parts.next() else { continue };
        let Some(hash) = parts.next() else { continue };
        let Ok(timestamp) = ts_raw.parse::<u64>() else { continue };
        points.push(GitActivityPoint {
            timestamp,
            hash: hash.to_string(),
        });
    }
    Ok(points)
}

pub fn git_status(path: String) -> Result<Vec<GitFileParams>, AppError> {
    let repo = open_repo_path(&path)?;

    if let Ok(head) = repo.head() {
        if head.target().is_none() {
            return Ok(Vec::new());
        }
    }

    let mut opts = StatusOptions::new();
    // Do not recurse untracked dirs — on large trees (linux kernel, huge monorepos)
    // that walks millions of files and freezes the UI. Top-level untracked entries
    // still appear; open a folder to see its contents via the explorer.
    opts.include_untracked(true)
        .recurse_untracked_dirs(false)
        .exclude_submodules(true)
        .include_unmodified(false);

    let statuses = match repo.statuses(Some(&mut opts)) {
        Ok(s) => s,
        Err(e) if is_unborn_or_invalid_ref(&e) => return Ok(Vec::new()),
        Err(e) => return Err(AppError::Git(e)),
    };

    // Soft cap so a dirty mega-tree can't serialize/render tens of thousands of rows.
    const MAX_STATUS_ENTRIES: usize = 2_500;
    let mut results = Vec::with_capacity(statuses.len().min(MAX_STATUS_ENTRIES));
    for entry in statuses.iter() {
        if results.len() >= MAX_STATUS_ENTRIES {
            break;
        }
        let status_bits = entry.status();
        let file_path = entry.path().unwrap_or("").to_string();

        // Unmerged / conflicted entries take precedence over staged/WT classification.
        if status_bits.is_conflicted() {
            results.push(GitFileParams {
                path: file_path,
                status: "C".to_string(),
                staged: false,
            });
            continue;
        }

        // Check for staged changes (Index)
        if status_bits.is_index_new()
            || status_bits.is_index_modified()
            || status_bits.is_index_deleted()
            || status_bits.is_index_renamed()
            || status_bits.is_index_typechange()
        {
            let status_code = if status_bits.is_index_new() {
                "A"
            } else if status_bits.is_index_modified() {
                "M"
            } else if status_bits.is_index_deleted() {
                "D"
            } else if status_bits.is_index_renamed() {
                "R"
            } else {
                "M"
            };
            results.push(GitFileParams {
                path: file_path.clone(),
                status: status_code.to_string(),
                staged: true,
            });
        }

        if results.len() >= MAX_STATUS_ENTRIES {
            break;
        }

        // Check for unstaged changes (Working Tree)
        if status_bits.is_wt_new()
            || status_bits.is_wt_modified()
            || status_bits.is_wt_deleted()
            || status_bits.is_wt_renamed()
            || status_bits.is_wt_typechange()
        {
            let status_code = if status_bits.is_wt_new() {
                "U"
            } else if status_bits.is_wt_modified() {
                "M"
            } else if status_bits.is_wt_deleted() {
                "D"
            } else if status_bits.is_wt_renamed() {
                "R"
            } else {
                "M"
            };
            results.push(GitFileParams {
                path: file_path,
                status: status_code.to_string(),
                staged: false,
            });
        }
    }
    Ok(results)
}

pub fn git_stage(repo_path: String, file_path: String) -> Result<(), AppError> {
    let try_op = || -> Result<(), AppError> {
        let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
        let mut index = repo.index().map_err(|e| AppError::Git(e))?;

        let rel_path = resolve_repo_relative_path(&repo_path, &file_path);
        let path = Path::new(&rel_path);

        let full_path = Path::new(&repo_path).join(path);
        if full_path.exists() {
            index.add_path(path).map_err(|e| AppError::Git(e))?;
        } else {
            index.remove_path(path).map_err(|e| AppError::Git(e))?;
        }
        index.write().map_err(|e| AppError::Git(e))?;
        Ok(())
    };

    match try_op() {
        Err(AppError::Git(e)) if e.code() == git2::ErrorCode::Locked => {
            let lock_path = Path::new(&repo_path).join(".git").join("index.lock");
            let _ = std::fs::remove_file(lock_path);
            try_op()
        }
        res => res,
    }
}

/// Stage every changed path in one index write (avoids N× IPC round-trips).
pub fn git_stage_all(repo_path: String) -> Result<(), AppError> {
    let try_op = || -> Result<(), AppError> {
        let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
        let mut index = repo.index().map_err(|e| AppError::Git(e))?;
        let mut opts = StatusOptions::new();
        opts.include_untracked(true).recurse_untracked_dirs(true);
        let statuses = repo.statuses(Some(&mut opts)).map_err(|e| AppError::Git(e))?;
        for entry in statuses.iter() {
            if entry.status().is_conflicted() {
                continue;
            }
            let Some(path_str) = entry.path() else { continue };
            let path = Path::new(path_str);
            let full = Path::new(&repo_path).join(path);
            if full.exists() {
                index.add_path(path).map_err(|e| AppError::Git(e))?;
            } else {
                let _ = index.remove_path(path);
            }
        }
        index.write().map_err(|e| AppError::Git(e))?;
        Ok(())
    };

    match try_op() {
        Err(AppError::Git(e)) if e.code() == git2::ErrorCode::Locked => {
            let lock_path = Path::new(&repo_path).join(".git").join("index.lock");
            let _ = std::fs::remove_file(lock_path);
            try_op()
        }
        res => res,
    }
}

/// Reset the index to HEAD for all currently staged paths.
pub fn git_unstage_all(repo_path: String) -> Result<(), AppError> {
    let try_op = || -> Result<(), AppError> {
        let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
        let head = match repo.head() {
            Ok(h) => h,
            Err(_) => {
                let mut index = repo.index().map_err(|e| AppError::Git(e))?;
                let mut opts = StatusOptions::new();
                opts.include_untracked(true);
                let statuses = repo.statuses(Some(&mut opts)).map_err(|e| AppError::Git(e))?;
                for entry in statuses.iter() {
                    let bits = entry.status();
                    if bits.is_index_new()
                        || bits.is_index_modified()
                        || bits.is_index_deleted()
                        || bits.is_index_renamed()
                    {
                        if let Some(p) = entry.path() {
                            let _ = index.remove_path(Path::new(p));
                        }
                    }
                }
                index.write().map_err(|e| AppError::Git(e))?;
                return Ok(());
            }
        };
        let commit = head.peel_to_commit().map_err(|e| AppError::Git(e))?;
        let mut opts = StatusOptions::new();
        opts.include_untracked(false);
        let statuses = repo.statuses(Some(&mut opts)).map_err(|e| AppError::Git(e))?;
        let mut paths: Vec<String> = Vec::new();
        for entry in statuses.iter() {
            let bits = entry.status();
            if bits.is_index_new()
                || bits.is_index_modified()
                || bits.is_index_deleted()
                || bits.is_index_renamed()
                || bits.is_index_typechange()
            {
                if let Some(p) = entry.path() {
                    paths.push(p.to_string());
                }
            }
        }
        if !paths.is_empty() {
            let refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
            repo.reset_default(Some(commit.as_object()), &refs)
                .map_err(|e| AppError::Git(e))?;
        }
        Ok(())
    };

    match try_op() {
        Err(AppError::Git(e)) if e.code() == git2::ErrorCode::Locked => {
            let lock_path = Path::new(&repo_path).join(".git").join("index.lock");
            let _ = std::fs::remove_file(lock_path);
            try_op()
        }
        res => res,
    }
}

pub fn git_unstage(repo_path: String, file_path: String) -> Result<(), AppError> {
    let try_op = || -> Result<(), AppError> {
        let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
        let rel_path = resolve_repo_relative_path(&repo_path, &file_path);

        match repo.head() {
            Ok(head) => {
                let commit = head.peel_to_commit().map_err(|e| AppError::Git(e))?;
                repo.reset_default(Some(commit.as_object()), [&rel_path])
                    .map_err(|e| AppError::Git(e))?;
            }
            Err(_) => {
                let mut index = repo.index().map_err(|e| AppError::Git(e))?;
                let path = Path::new(&rel_path);
                let _ = index.remove_path(path);
                index.write().map_err(|e| AppError::Git(e))?;
            }
        }
        Ok(())
    };

    match try_op() {
        Err(AppError::Git(e)) if e.code() == git2::ErrorCode::Locked => {
            let lock_path = Path::new(&repo_path).join(".git").join("index.lock");
            let _ = std::fs::remove_file(lock_path);
            try_op()
        }
        res => res,
    }
}

pub fn git_discard_changes(repo_path: String, file_path: String) -> Result<(), AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
    let rel_path = resolve_repo_relative_path(&repo_path, &file_path);

    let mut opts = git2::build::CheckoutBuilder::new();
    opts.force();
    opts.path(&rel_path);

    repo.checkout_index(None, Some(&mut opts))
        .map_err(|e| AppError::Git(e))?;

    Ok(())
}

pub fn git_commit(repo_path: String, message: String) -> Result<(), AppError> {
    let try_op = || -> Result<(), AppError> {
        let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
        let mut index = repo.index().map_err(|e| AppError::Git(e))?;
        let oid = index.write_tree().map_err(|e| AppError::Git(e))?;
        let tree = repo.find_tree(oid).map_err(|e| AppError::Git(e))?;

        let sig = repo.signature().map_err(|_| {
            AppError::Message(
                "Failed to find git signature (user.name/email configured?)".to_string(),
            )
        })?;

        let parent_commit = match repo.head() {
            Ok(head) => {
                let target = head.target().unwrap();
                Some(repo.find_commit(target).map_err(|e| AppError::Git(e))?)
            }
            Err(_) => None,
        };

        let parents = if let Some(ref p) = parent_commit {
            vec![p]
        } else {
            vec![]
        };

        repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
            .map_err(|e| AppError::Git(e))?;

        Ok(())
    };

    let result = match try_op() {
        Err(AppError::Git(e)) if e.code() == git2::ErrorCode::Locked => {
            let lock_path = Path::new(&repo_path).join(".git").join("index.lock");
            let _ = std::fs::remove_file(lock_path);
            try_op()
        }
        res => res,
    };
    if result.is_ok() {
        crate::commands::stats::bump_event(&repo_path, "user_git_commits");
    }
    result
}

pub fn git_diff(repo_path: String) -> Result<String, AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
    let mut output = String::new();

    // 1. Staged changes (HEAD -> Index)
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let mut staged_opts = DiffOptions::new();
    let staged_diff = repo
        .diff_tree_to_index(head_tree.as_ref(), None, Some(&mut staged_opts))
        .map_err(|e| AppError::Git(e))?;

    staged_diff
        .print(DiffFormat::Patch, |_delta, _hunk, line| {
            if let Ok(text) = str::from_utf8(line.content()) {
                output.push_str(text);
            }
            true
        })
        .map_err(|e| AppError::Git(e))?;

    // 2. Unstaged changes (Index -> Workdir)
    let mut unstaged_opts = DiffOptions::new();
    unstaged_opts
        .include_untracked(true)
        .recurse_untracked_dirs(true);

    let unstaged_diff = repo
        .diff_index_to_workdir(None, Some(&mut unstaged_opts))
        .map_err(|e| AppError::Git(e))?;

    unstaged_diff
        .print(DiffFormat::Patch, |_delta, _hunk, line| {
            if let Ok(text) = str::from_utf8(line.content()) {
                output.push_str(text);
            }
            true
        })
        .map_err(|e| AppError::Git(e))?;

    Ok(output)
}

pub fn git_staged_diff(repo_path: String) -> Result<String, AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
    let mut output = String::new();

    // 1. Staged changes (HEAD -> Index)
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let mut staged_opts = DiffOptions::new();
    let staged_diff = repo
        .diff_tree_to_index(head_tree.as_ref(), None, Some(&mut staged_opts))
        .map_err(|e| AppError::Git(e))?;

    staged_diff
        .print(DiffFormat::Patch, |_delta, _hunk, line| {
            if let Ok(text) = str::from_utf8(line.content()) {
                output.push_str(text);
            }
            true
        })
        .map_err(|e| AppError::Git(e))?;

    Ok(output)
}

pub fn git_file_diff(repo_path: String, file_path: String) -> Result<String, AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
    let rel_path = resolve_repo_relative_path(&repo_path, &file_path);
    let mut opts = DiffOptions::new();
    opts.pathspec(&rel_path);
    opts.include_untracked(true);

    // If it's staged, we want to see diff between HEAD and Index
    // If it's unstaged, we want to see diff between Index and Workdir
    // For simplicity, we'll return both or the relevant one.
    // VS Code usually shows them separately.

    let mut output = String::new();

    // Check HEAD to Index (staged)
    let head = repo.head().ok();
    let tree = head.and_then(|h| h.peel_to_tree().ok());
    let diff_staged = repo
        .diff_tree_to_index(tree.as_ref(), None, Some(&mut opts))
        .map_err(|e| AppError::Git(e))?;

    diff_staged
        .print(DiffFormat::Patch, |_delta, _hunk, line| {
            if let Ok(text) = str::from_utf8(line.content()) {
                output.push_str(text);
            }
            true
        })
        .map_err(|e| e.to_string())?;

    // Check Index to Workdir (unstaged)
    let mut opts_wd = DiffOptions::new();
    opts_wd.pathspec(&rel_path);
    opts_wd.include_untracked(true);

    let diff_wd = repo
        .diff_index_to_workdir(None, Some(&mut opts_wd))
        .map_err(|e| AppError::Git(e))?;

    diff_wd
        .print(DiffFormat::Patch, |_delta, _hunk, line| {
            if let Ok(text) = str::from_utf8(line.content()) {
                output.push_str(text);
            }
            true
        })
        .map_err(|e| e.to_string())?;

    Ok(output)
}

pub fn git_set_upstream(repo_path: String, branch: String, upstream: String) -> Result<(), AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = git_cmd()?;
    cmd.current_dir(&repo_path)
        .args(["branch", "--set-upstream-to", &upstream, &branch]);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let status = cmd
        .status()
        .map_err(|e| AppError::Message(format!("git set-upstream failed: {}", e)))?;
    if !status.success() {
        return Err(AppError::Message("git set-upstream failed".to_string()));
    }
    Ok(())
}

pub fn git_diff_branches(repo_path: String, base: String, compare: String) -> Result<String, AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let range = format!("{}...{}", base, compare);
    let mut cmd = git_cmd()?;
    cmd.current_dir(&repo_path).args(["diff", "--stat", &range]);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd
        .output()
        .map_err(|e| AppError::Message(format!("git diff failed: {}", e)))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Message(format!("git diff failed: {}", stderr)));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn git_init(path: String) -> Result<(), AppError> {
    let repo_path = Path::new(&path);
    if repo_path.join(".git").exists() {
        return Err(AppError::Message(
            "A Git repository already exists in this folder.".to_string(),
        ));
    }

    // Warn if a parent directory is already a git repository
    let mut parent = repo_path.parent();
    while let Some(dir) = parent {
        if dir.join(".git").exists() {
            return Err(AppError::Message(
                "A Git repository already exists in a parent folder. Open that repository or initialize in a folder outside it.".to_string(),
            ));
        }
        parent = dir.parent();
    }

    Repository::init(repo_path).map_err(|e| AppError::Git(e))?;
    Ok(())
}

pub fn git_branches(path: String) -> Result<Vec<String>, AppError> {
    let repo = Repository::open(&path).map_err(|e| AppError::Git(e))?;
    let branches = repo
        .branches(Some(git2::BranchType::Local))
        .map_err(|e| AppError::Git(e))?;

    let mut result = Vec::new();
    for b in branches {
        let (branch, _) = b.map_err(|e| AppError::Git(e))?;
        if let Ok(Some(name)) = branch.name() {
            result.push(name.to_string());
        }
    }
    Ok(result)
}

pub fn git_remote_branches(path: String) -> Result<Vec<String>, AppError> {
    let repo = Repository::open(&path).map_err(|e| AppError::Git(e))?;
    let branches = repo
        .branches(Some(git2::BranchType::Remote))
        .map_err(|e| AppError::Git(e))?;

    let mut result = Vec::new();
    for b in branches {
        let (branch, _) = b.map_err(|e| AppError::Git(e))?;
        if let Ok(Some(name)) = branch.name() {
            result.push(name.to_string());
        }
    }
    Ok(result)
}

pub fn git_rename_branch(
    repo_path: String,
    old_name: String,
    new_name: String,
) -> Result<(), AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
    let mut branch = repo
        .find_branch(&old_name, git2::BranchType::Local)
        .map_err(|e| AppError::Git(e))?;
    branch.rename(&new_name, false).map_err(|e| AppError::Git(e))?;
    Ok(())
}

pub fn git_create_branch(repo_path: String, branch_name: String) -> Result<(), AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
    let head = repo.head().map_err(|e| AppError::Git(e))?;
    let commit = head.peel_to_commit().map_err(|e| AppError::Git(e))?;

    repo.branch(&branch_name, &commit, false)
        .map_err(|e| AppError::Git(e))?;
    Ok(())
}

pub fn git_delete_branch(repo_path: String, branch_name: String) -> Result<(), AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
    let mut branch = repo
        .find_branch(&branch_name, git2::BranchType::Local)
        .map_err(|e| AppError::Git(e))?;
    branch.delete().map_err(|e| AppError::Git(e))?;
    Ok(())
}

pub fn git_switch_branch(repo_path: String, branch_name: String) -> Result<(), AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
    let (object, reference) = repo
        .revparse_ext(&branch_name)
        .map_err(|e| AppError::Git(e))?;

    repo.checkout_tree(&object, None)
        .map_err(|e| AppError::Git(e))?;

    match reference {
        Some(ref r) => repo
            .set_head(r.name().unwrap())
            .map_err(|e| AppError::Git(e))?,
        None => repo
            .set_head_detached(object.id())
            .map_err(|e| AppError::Git(e))?,
    }
    Ok(())
}

pub fn git_current_branch(path: String) -> Result<String, AppError> {
    let repo = Repository::open(&path).map_err(|e| AppError::Git(e))?;
    let head = match repo.head() {
        Ok(h) => h,
        Err(e) if e.code() == git2::ErrorCode::UnbornBranch => {
            return Ok(default_branch_name(&repo));
        }
        Err(e) => return Err(AppError::Git(e)),
    };
    if head.target().is_none() {
        return Ok(default_branch_name(&repo));
    }
    let name = head.shorthand().unwrap_or("main").to_string();
    Ok(name)
}

#[derive(Clone)]
struct LaneSlot {
    hash: String,
    color: String,
}

struct GitLogStreamer {
    _child: std::process::Child,
    stdout: std::io::BufReader<std::process::ChildStdout>,
    lanes: Vec<Option<LaneSlot>>,
    color_index: usize,
}

static STREAMERS: std::sync::LazyLock<
    std::sync::Mutex<HashMap<String, std::sync::Arc<std::sync::Mutex<GitLogStreamer>>>>,
> = std::sync::LazyLock::new(|| std::sync::Mutex::new(HashMap::new()));

#[derive(Serialize, Clone)]
pub struct GitSyncStatus {
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Serialize, Clone)]
pub struct GitBranchDetail {
    pub name: String,
    pub author: String,
    #[serde(rename = "authorEmail")]
    pub author_email: String,
    pub date: String,
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
}

pub fn git_branch_details(
    path: String,
    current_branch: String,
    all_refs: Option<bool>,
) -> Result<Vec<GitBranchDetail>, AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let include_remotes = all_refs.unwrap_or(false);
    let mut cmd = git_cmd()?;
    cmd.current_dir(&path).arg("for-each-ref").arg("--sort=-committerdate");
    cmd.arg("refs/heads/");
    if include_remotes {
        cmd.arg("refs/remotes/");
    }
    cmd.arg("--format=%(refname:short)|%(authorname)|%(authoremail)|%(committerdate:relative)");
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd
        .output()
        .map_err(|e| AppError::Message(format!("git for-each-ref failed: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Message(format!("git for-each-ref failed: {}", stderr)));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut details: Vec<GitBranchDetail> = stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(4, '|').collect();
            if parts.len() < 4 {
                return None;
            }
            let email = parts[2]
                .trim()
                .trim_start_matches('<')
                .trim_end_matches('>')
                .to_string();
            let name = parts[0].trim().to_string();
            if name.ends_with("/HEAD") {
                return None;
            }
            Some(GitBranchDetail {
                name,
                author: parts[1].trim().to_string(),
                author_email: email,
                date: parts[3].trim().to_string(),
                ahead: None,
                behind: None,
            })
        })
        .collect();

    if !current_branch.is_empty() {
        let mut sync_cmd = git_cmd()?;
        sync_cmd
            .current_dir(&path)
            .args(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]);
        #[cfg(windows)]
        sync_cmd.creation_flags(0x08000000);

        if let Ok(sync_output) = sync_cmd.output() {
            if sync_output.status.success() {
                let sync_stdout = String::from_utf8_lossy(&sync_output.stdout);
                let counts: Vec<&str> = sync_stdout.trim().split_whitespace().collect();
                if counts.len() == 2 {
                    if let (Ok(ahead), Ok(behind)) = (counts[0].parse::<u32>(), counts[1].parse::<u32>()) {
                        for detail in details.iter_mut() {
                            if detail.name == current_branch {
                                detail.ahead = Some(ahead);
                                detail.behind = Some(behind);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(details)
}

const GRAPH_NODE_W: f32 = 200.0;
const GRAPH_NODE_H: f32 = 56.0;
const GRAPH_COL_GAP: f32 = 100.0;
const GRAPH_ROW_GAP: f32 = 28.0;
const GRAPH_PAD: f32 = 48.0;
/// Cap for branch explorer. LOD + viewport culling keep UI responsive past this.
const GRAPH_MAX_NODES: usize = 400;
/// Max siblings stacked in one column before wrapping right (prevents the "long column").
const GRAPH_ROWS_PER_COL: usize = 5;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchGraphNode {
    pub name: String,
    pub commit: String,
    pub author: String,
    pub author_email: String,
    pub date: String,
    pub ahead: u32,
    pub x: f32,
    pub y: f32,
    /// Primary parent (upstream or trunk). Prefer `parents` for multi-edge.
    pub parent_name: Option<String>,
    /// All inbound edges (upstream, and optionally extra merge parents later).
    pub parents: Vec<String>,
    pub is_current: bool,
    pub is_remote: bool,
    pub is_detached: bool,
    /// True when this tip has no shared parent edge (orphan / alternate root).
    pub is_orphan_root: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchGraph {
    pub nodes: Vec<GitBranchGraphNode>,
    pub width: f32,
    pub height: f32,
    pub current_branch: String,
    pub total: u32,
    pub truncated: bool,
    pub detached: bool,
}

struct RawBranchRef {
    name: String,
    commit: String,
    author: String,
    author_email: String,
    date: String,
    is_remote: bool,
    upstream: Option<String>,
}

fn parse_branch_refs(stdout: &str, is_remote: bool) -> Vec<RawBranchRef> {
    let mut out = Vec::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(6, '|').collect();
        if parts.len() < 5 {
            continue;
        }
        let name = parts[0].trim().to_string();
        if name.is_empty() || name.ends_with("/HEAD") {
            continue;
        }
        let upstream = parts
            .get(5)
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        out.push(RawBranchRef {
            name,
            commit: parts[1].trim().to_string(),
            author: parts[2].trim().to_string(),
            author_email: parts[3]
                .trim()
                .trim_start_matches('<')
                .trim_end_matches('>')
                .to_string(),
            date: parts[4].trim().to_string(),
            is_remote,
            upstream,
        });
    }
    out
}

fn for_each_ref_branches(path: &str, refs: &str) -> Result<String, AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = git_cmd()?;
    cmd.current_dir(path).args([
        "for-each-ref",
        "--sort=-committerdate",
        refs,
        "--format=%(refname:short)|%(objectname:short)|%(authorname)|%(authoremail)|%(committerdate:relative)|%(upstream:short)",
    ]);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd
        .output()
        .map_err(|e| AppError::Message(format!("git for-each-ref failed: {}", e)))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Message(format!("git for-each-ref failed: {}", stderr)));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn head_state(path: &str) -> (String, Option<(String, String)>, bool) {
    // (display_name, Optional<(commit_short, author)>, detached)
    let Ok(repo) = Repository::open(path) else {
        return ("HEAD".into(), None, false);
    };
    let Ok(head) = repo.head() else {
        return ("HEAD".into(), None, false);
    };
    let detached = !head.is_branch();
    let commit_short = head
        .peel_to_commit()
        .ok()
        .map(|c| {
            let id = c.id().to_string();
            let short = id.chars().take(7).collect::<String>();
            let author = c.author().name().unwrap_or("").to_string();
            (short, author)
        });
    if detached {
        let name = commit_short
            .as_ref()
            .map(|(s, _)| format!("HEAD@{s}"))
            .unwrap_or_else(|| "HEAD".into());
        (name, commit_short, true)
    } else {
        let name = head.shorthand().unwrap_or("HEAD").to_string();
        (name, commit_short, false)
    }
}

/// Branch-tip flowchart (not the commit DAG — that lives in Git Graph).
/// Fast: for-each-ref + upstream edges only. No per-tip merge-base walks.
pub fn git_branch_graph(path: String, all_refs: Option<bool>) -> Result<GitBranchGraph, AppError> {
    let include_remotes = all_refs.unwrap_or(true);
    let (head_name, head_commit, detached) = head_state(&path);
    let current_branch = if detached {
        head_name.clone()
    } else {
        git_current_branch(path.clone()).unwrap_or(head_name.clone())
    };

    let local_out = for_each_ref_branches(&path, "refs/heads/")?;
    let mut locals = parse_branch_refs(&local_out, false);
    let mut remotes = if include_remotes {
        let remote_out = for_each_ref_branches(&path, "refs/remotes/")?;
        parse_branch_refs(&remote_out, true)
    } else {
        Vec::new()
    };

    let local_by_short: HashMap<String, String> = locals
        .iter()
        .map(|e| (e.name.clone(), e.commit.clone()))
        .collect();
    remotes.retain(|entry| {
        let short = entry
            .name
            .split_once('/')
            .map(|(_, rest)| rest)
            .unwrap_or(entry.name.as_str());
        match local_by_short.get(short) {
            Some(c) => c != &entry.commit,
            None => true,
        }
    });

    let total = (locals.len() + remotes.len() + if detached { 1 } else { 0 }) as u32;

    let mut selected: Vec<RawBranchRef> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let push_unique =
        |entry: RawBranchRef, selected: &mut Vec<RawBranchRef>, seen: &mut std::collections::HashSet<String>| {
            if selected.len() >= GRAPH_MAX_NODES {
                return;
            }
            if seen.insert(entry.name.clone()) {
                selected.push(entry);
            }
        };

    if detached {
        if let Some((commit, author)) = &head_commit {
            push_unique(
                RawBranchRef {
                    name: head_name.clone(),
                    commit: commit.clone(),
                    author: author.clone(),
                    author_email: String::new(),
                    date: "detached".into(),
                    is_remote: false,
                    upstream: None,
                },
                &mut selected,
                &mut seen,
            );
        }
    } else if let Some(pos) = locals.iter().position(|e| e.name == current_branch) {
        push_unique(locals.remove(pos), &mut selected, &mut seen);
    }

    for name in ["main", "master", "develop", "dev"] {
        if let Some(pos) = locals.iter().position(|e| e.name == name) {
            push_unique(locals.remove(pos), &mut selected, &mut seen);
        }
    }
    while !locals.is_empty() && selected.len() < GRAPH_MAX_NODES {
        push_unique(locals.remove(0), &mut selected, &mut seen);
    }
    while !remotes.is_empty() && selected.len() < GRAPH_MAX_NODES {
        push_unique(remotes.remove(0), &mut selected, &mut seen);
    }

    let truncated = total as usize > selected.len();
    if selected.is_empty() {
        return Ok(GitBranchGraph {
            nodes: Vec::new(),
            width: GRAPH_PAD * 2.0 + GRAPH_NODE_W,
            height: GRAPH_PAD * 2.0 + GRAPH_NODE_H,
            current_branch,
            total,
            truncated: false,
            detached,
        });
    }
    let names: std::collections::HashSet<String> =
        selected.iter().map(|e| e.name.clone()).collect();

    let trunk = selected
        .iter()
        .find(|e| e.name == "main" || e.name == "master")
        .map(|e| e.name.clone())
        .or_else(|| {
            if !detached {
                Some(current_branch.clone())
            } else {
                None
            }
        });

    // Resolve parents: prefer upstream if present in graph; else trunk; else orphan root.
    let mut parents_of: Vec<Vec<String>> = Vec::with_capacity(selected.len());
    for entry in &selected {
        let mut parents = Vec::new();
        if let Some(up) = &entry.upstream {
            if names.contains(up) && up != &entry.name {
                parents.push(up.clone());
            }
        }
        if parents.is_empty() {
            if let Some(t) = &trunk {
                if t != &entry.name && names.contains(t) {
                    // Don't force-link detached HEAD / alternate histories to trunk —
                    // only link when not already a known root candidate.
                    let looks_orphan_name = entry.name.starts_with("HEAD@") || entry.date == "detached";
                    if !looks_orphan_name {
                        parents.push(t.clone());
                    }
                }
            }
        }
        parents_of.push(parents);
    }

    // Roots = no parents (orphans + trunk + detached).
    let mut roots: Vec<usize> = (0..selected.len())
        .filter(|&i| parents_of[i].is_empty())
        .collect();
    if roots.is_empty() {
        roots.push(0);
    }
    roots.sort_by(|&a, &b| {
        let score = |i: usize| -> i32 {
            let n = &selected[i].name;
            if n == "main" || n == "master" {
                0
            } else if !detached && n == &current_branch {
                1
            } else if selected[i].name.starts_with("HEAD@") {
                2
            } else {
                3
            }
        };
        score(a).cmp(&score(b)).then_with(|| selected[a].name.cmp(&selected[b].name))
    });

    // Children grouped under first parent (tree for layout; extra parents drawn as extra edges).
    let mut children_of: HashMap<usize, Vec<usize>> = HashMap::new();
    let index_of: HashMap<String, usize> = selected
        .iter()
        .enumerate()
        .map(|(i, e)| (e.name.clone(), i))
        .collect();
    for (i, parents) in parents_of.iter().enumerate() {
        if let Some(p) = parents.first() {
            if let Some(&pi) = index_of.get(p) {
                // Skip self-loops and ignore edges to already-deeper cycles at build time.
                if pi != i {
                    children_of.entry(pi).or_default().push(i);
                }
            }
        }
    }
    for kids in children_of.values_mut() {
        kids.sort_by(|&a, &b| {
            branch_group(&selected[a].name, selected[a].is_remote)
                .cmp(&branch_group(&selected[b].name, selected[b].is_remote))
                .then_with(|| selected[a].name.cmp(&selected[b].name))
        });
    }

    let mut positions: HashMap<usize, (f32, f32)> = HashMap::new();
    let (max_x, max_y) = layout_layered(&roots, &children_of, selected.len(), &mut positions);

    // Place any unvisited nodes (shouldn't happen) in a leftover grid.
    let mut orphan_i = 0usize;
    let mut max_x = max_x;
    let mut max_y = max_y;
    for i in 0..selected.len() {
        if positions.contains_key(&i) {
            continue;
        }
        let col = orphan_i / GRAPH_ROWS_PER_COL;
        let row = orphan_i % GRAPH_ROWS_PER_COL;
        let x = max_x + GRAPH_COL_GAP + col as f32 * (GRAPH_NODE_W + GRAPH_COL_GAP);
        let y = GRAPH_PAD + row as f32 * (GRAPH_NODE_H + GRAPH_ROW_GAP);
        positions.insert(i, (x, y));
        max_x = max_x.max(x + GRAPH_NODE_W);
        max_y = max_y.max(y + GRAPH_NODE_H);
        orphan_i += 1;
    }

    let width = max_x + GRAPH_PAD;
    let height = max_y + GRAPH_PAD;

    let mut nodes: Vec<GitBranchGraphNode> = Vec::with_capacity(selected.len());
    for (idx, entry) in selected.iter().enumerate() {
        let Some((x, y)) = positions.get(&idx).copied() else {
            continue;
        };
        let parents = parents_of[idx].clone();
        let is_orphan_root = parents.is_empty();
        nodes.push(GitBranchGraphNode {
            name: entry.name.clone(),
            commit: entry.commit.clone(),
            author: entry.author.clone(),
            author_email: entry.author_email.clone(),
            date: entry.date.clone(),
            ahead: 0,
            x,
            y,
            parent_name: parents.first().cloned(),
            parents,
            is_current: entry.name == current_branch
                || (detached && entry.name.starts_with("HEAD@")),
            is_remote: entry.is_remote,
            is_detached: detached && entry.name.starts_with("HEAD@"),
            is_orphan_root,
        });
    }

    Ok(GitBranchGraph {
        nodes,
        width,
        height,
        current_branch,
        total,
        truncated,
        detached,
    })
}

/// Cycle-safe layered layout (BFS depths). No recursion — avoids stack overflow
/// when upstream edges form cycles or long chains.
/// Within each depth, siblings fan into a wide grid (not one tall column).
fn layout_layered(
    roots: &[usize],
    children_of: &HashMap<usize, Vec<usize>>,
    n: usize,
    positions: &mut HashMap<usize, (f32, f32)>,
) -> (f32, f32) {
    use std::collections::VecDeque;

    let mut depth = vec![usize::MAX; n];
    let mut q = VecDeque::new();
    for &r in roots {
        if r < n && depth[r] == usize::MAX {
            depth[r] = 0;
            q.push_back(r);
        }
    }
    while let Some(u) = q.pop_front() {
        let Some(kids) = children_of.get(&u) else {
            continue;
        };
        for &v in kids {
            if v >= n {
                continue;
            }
            // First visit wins — ignore back-edges / cycles.
            if depth[v] == usize::MAX {
                depth[v] = depth[u].saturating_add(1);
                q.push_back(v);
            }
        }
    }
    for i in 0..n {
        if depth[i] == usize::MAX {
            depth[i] = 0;
        }
    }

    let mut layers: HashMap<usize, Vec<usize>> = HashMap::new();
    for i in 0..n {
        layers.entry(depth[i]).or_default().push(i);
    }
    let mut depth_keys: Vec<usize> = layers.keys().copied().collect();
    depth_keys.sort_unstable();

    let cell_w = GRAPH_NODE_W + GRAPH_COL_GAP;
    let cell_h = GRAPH_NODE_H + GRAPH_ROW_GAP;
    let mut cursor_x = GRAPH_PAD;
    let mut max_x = GRAPH_PAD + GRAPH_NODE_W;
    let mut max_y = GRAPH_PAD + GRAPH_NODE_H;

    for d in depth_keys {
        let nodes = layers.get_mut(&d).unwrap();
        // Stable-ish order within layer
        nodes.sort_unstable();

        let count = nodes.len().max(1);
        let n_f = count as f32;
        let target_cols = ((n_f * cell_h / cell_w).sqrt().ceil() as usize).clamp(1, 24);
        let rows_per_col = ((count + target_cols - 1) / target_cols).clamp(1, 14);

        let mut layer_max_x = cursor_x;
        for (i, &idx) in nodes.iter().enumerate() {
            let col = i / rows_per_col;
            let row = i % rows_per_col;
            let stagger = if col % 2 == 1 { cell_h * 0.28 } else { 0.0 };
            let x = cursor_x + col as f32 * cell_w;
            let y = GRAPH_PAD + row as f32 * cell_h + stagger;
            positions.insert(idx, (x, y));
            layer_max_x = layer_max_x.max(x + GRAPH_NODE_W);
            max_y = max_y.max(y + GRAPH_NODE_H);
        }
        max_x = max_x.max(layer_max_x);
        // Next depth starts to the right of this layer's grid.
        cursor_x = layer_max_x + GRAPH_COL_GAP;
    }

    (max_x, max_y)
}

fn branch_group(name: &str, is_remote: bool) -> String {
    let bare = if is_remote {
        name.split_once('/').map(|(_, r)| r).unwrap_or(name)
    } else {
        name
    };
    bare.split_once('/')
        .map(|(g, _)| g.to_string())
        .unwrap_or_else(|| {
            if is_remote {
                "remote".into()
            } else {
                "local".into()
            }
        })
}

#[cfg(test)]
mod branch_graph_layout_tests {
    use super::*;

    #[test]
    fn star_graph_fans_out_horizontally() {
        let mut children_of: HashMap<usize, Vec<usize>> = HashMap::new();
        children_of.insert(0, (1..=20).collect());
        let mut positions = HashMap::new();
        let (max_x, max_y) = layout_layered(&[0], &children_of, 21, &mut positions);

        assert_eq!(positions.len(), 21);
        let xs: std::collections::HashSet<i32> = positions
            .values()
            .map(|(x, _)| (*x * 10.0) as i32)
            .collect();
        assert!(
            xs.len() >= 4,
            "expected multi-column fan-out, got {} unique x (max_x={max_x}, max_y={max_y})",
            xs.len()
        );
        let stacked_h = 20.0 * (GRAPH_NODE_H + GRAPH_ROW_GAP);
        assert!(
            max_y < stacked_h * 0.55,
            "layout still too tall: max_y={max_y} vs stacked={stacked_h}"
        );
    }

    #[test]
    fn cyclic_edges_do_not_stack_overflow() {
        let mut children_of: HashMap<usize, Vec<usize>> = HashMap::new();
        // A → B → C → A
        children_of.insert(0, vec![1]);
        children_of.insert(1, vec![2]);
        children_of.insert(2, vec![0]);
        let mut positions = HashMap::new();
        let (_max_x, _max_y) = layout_layered(&[0], &children_of, 3, &mut positions);
        assert_eq!(positions.len(), 3);
    }
}

pub fn git_sync_status(path: String) -> Result<GitSyncStatus, AppError> {
    let repo = Repository::open(&path).map_err(|e| AppError::Git(e))?;
    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return Ok(GitSyncStatus { ahead: 0, behind: 0 }),
    };

    let local_oid = match head.target() {
        Some(oid) => oid,
        None => return Ok(GitSyncStatus { ahead: 0, behind: 0 }),
    };

    let upstream_oid = {
        let branch = git2::Branch::wrap(head);
        match branch.upstream() {
            Ok(upstream) => upstream.get().target(),
            Err(_) => None,
        }
    };

    if let Some(upstream_oid) = upstream_oid {
        let (ahead, behind) = repo
            .graph_ahead_behind(local_oid, upstream_oid)
            .map_err(|e| AppError::Git(e))?;
        Ok(GitSyncStatus {
            ahead: ahead as u32,
            behind: behind as u32,
        })
    } else {
        Ok(GitSyncStatus { ahead: 0, behind: 0 })
    }
}

pub fn git_log_stream_start(
    path: String,
    caller_id: String,
    all_refs: Option<bool>,
) -> Result<(), AppError> {
    use std::io::BufReader;
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    use std::process::Stdio;

    // Stop any prior stream for this caller so refresh/unmount cannot leak children.
    let _ = git_log_stream_stop(caller_id.clone());

    let mut cmd = git_cmd()?;
    let order_flag = if caller_id == "graph" {
        "--date-order"
    } else {
        "--topo-order"
    };
    // Default: all refs for the graph; callers (source, empty-check) can pass false.
    let include_all = all_refs.unwrap_or(false);
    cmd.current_dir(&path).arg("log").arg(order_flag);
    if include_all {
        cmd.arg("--all");
    }
    cmd.args([
        "--format=@@@START@@@%H%x00%an%x00%ae%x00%ct%x00%B%x00%D%x00%P%x00@@@MSG_END@@@",
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::null());

    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Message(format!("git log start failed: {}", e)))?;
    let stdout = child.stdout.take().unwrap();

    let streamer = GitLogStreamer {
        _child: child,
        stdout: BufReader::new(stdout),
        lanes: Vec::new(),
        color_index: 0,
    };

    STREAMERS
        .lock()
        .unwrap()
        .insert(
            caller_id,
            std::sync::Arc::new(std::sync::Mutex::new(streamer)),
        );
    Ok(())
}

pub fn git_log_stream_stop(caller_id: String) -> Result<(), AppError> {
    if let Some(streamer) = STREAMERS.lock().unwrap().remove(&caller_id) {
        if let Ok(mut guard) = streamer.lock() {
            let _ = guard._child.kill();
            let _ = guard._child.wait();
        }
    }
    Ok(())
}

pub fn git_log_stream_next(caller_id: String, limit: usize) -> Result<Vec<GitLogEntry>, AppError> {
    use std::io::BufRead;

    let streamer_arc = {
        let guard = STREAMERS.lock().unwrap();
        guard.get(&caller_id).cloned()
    };
    let Some(streamer_arc) = streamer_arc else {
        return Ok(Vec::new());
    };

    let mut streamer = streamer_arc.lock().unwrap();

    let start = std::time::Instant::now();
    let mut logs = Vec::new();
    let mut current_block = String::new();
    let mut buf = String::new();

    let lane_colors = [
        "var(--color-accent)",
        "#f97316",
        "#a855f7",
        "#22c55e",
        "#ef4444",
        "#06b6d4",
        "#eab308",
        "#ec4899",
        "#14b8a6",
        "#8b5cf6",
    ];

    while logs.len() < limit {
        buf.clear();
        let bytes_read = streamer.stdout.read_line(&mut buf).unwrap_or(0);
        if bytes_read == 0 {
            break; // EOF
        }
        current_block.push_str(&buf);

        if current_block.contains("@@@MSG_END@@@") {
            if let Some(start_idx) = current_block.find("@@@START@@@") {
                let block = &current_block[start_idx + 11..];
                let parts: Vec<&str> = block.split('\x00').collect();

                if parts.len() >= 7 {
                    let hash = parts[0].trim();
                    let author = parts[1].trim();
                    let author_email = parts[2].trim();
                    let date = parts[3].trim();
                    let message = parts[4].trim();
                    let refs_str = parts[5].trim();
                    let parents_raw = parts[6].replace("@@@MSG_END@@@", "");
                    let parents_str = parents_raw.trim();

                    let refs: Vec<String> = if refs_str.is_empty() {
                        Vec::new()
                    } else {
                        refs_str.split(", ").map(|s| s.trim().to_string()).collect()
                    };

                    let parents: Vec<String> = if parents_str.is_empty() {
                        Vec::new()
                    } else {
                        parents_str
                            .split_whitespace()
                            .map(|h| h.to_string())
                            .collect()
                    };

                    let mut paths = Vec::new();
                    let dot_lane;
                    let mut was_expected = false;
                    let dot_color;

                    if let Some(idx) = streamer
                        .lanes
                        .iter()
                        .position(|l| l.as_ref().map_or(false, |slot| slot.hash == hash))
                    {
                        dot_lane = idx;
                        dot_color = streamer.lanes[idx].as_ref().unwrap().color.clone();
                        was_expected = true;
                    } else {
                        // Brand new tip. Find first `None` or append
                        dot_color = {
                            let c =
                                lane_colors[streamer.color_index % lane_colors.len()].to_string();
                            streamer.color_index += 1;
                            c
                        };
                        if let Some(idx) = streamer.lanes.iter().position(|l| l.is_none()) {
                            dot_lane = idx;
                            streamer.lanes[idx] = Some(LaneSlot {
                                hash: hash.to_string(),
                                color: dot_color.clone(),
                            });
                        } else {
                            dot_lane = streamer.lanes.len();
                            streamer.lanes.push(Some(LaneSlot {
                                hash: hash.to_string(),
                                color: dot_color.clone(),
                            }));
                        }
                    }

                    if was_expected {
                        paths.push(GraphPath {
                            path_type: "incoming".to_string(),
                            from_x: dot_lane,
                            to_x: dot_lane,
                            color: dot_color.clone(),
                        });
                    }

                    // Pre-capture before we consume it.
                    let prev_lanes = streamer.lanes.clone();
                    let mut next_lanes = prev_lanes.clone();

                    // Consume the dot_lane.
                    if !parents.is_empty() {
                        let parent0 = &parents[0];
                        let mut already_tracked_idx = None;
                        for (i, slot) in next_lanes.iter().enumerate() {
                            if i != dot_lane {
                                if let Some(s) = slot {
                                    if s.hash == *parent0 {
                                        already_tracked_idx = Some(i);
                                        break;
                                    }
                                }
                            }
                        }

                        if already_tracked_idx.is_some() {
                            next_lanes[dot_lane] = None;
                        } else {
                            next_lanes[dot_lane] = Some(LaneSlot {
                                hash: parent0.clone(),
                                color: dot_color.clone(),
                            });
                        }
                    } else {
                        next_lanes[dot_lane] = None;
                    }

                    // Extra parents
                    for p in 1..parents.len() {
                        let parent_hash = &parents[p];
                        let already_tracked = next_lanes
                            .iter()
                            .any(|l| l.as_ref().map_or(false, |s| s.hash == *parent_hash));
                        if !already_tracked {
                            let p_color = {
                                let c = lane_colors[streamer.color_index % lane_colors.len()]
                                    .to_string();
                                streamer.color_index += 1;
                                c
                            };
                            if let Some(empty_idx) = next_lanes.iter().position(|l| l.is_none()) {
                                next_lanes[empty_idx] = Some(LaneSlot {
                                    hash: parent_hash.clone(),
                                    color: p_color,
                                });
                            } else {
                                next_lanes.push(Some(LaneSlot {
                                    hash: parent_hash.clone(),
                                    color: p_color,
                                }));
                            }
                        }
                    }

                    // Compute clean outgoing vertical flows (SVG Paths)
                    for parent in &parents {
                        if let Some(target_idx) = next_lanes
                            .iter()
                            .position(|l| l.as_ref().map_or(false, |s| s.hash == *parent))
                        {
                            // Link node direct down to wherever the tracked parent landed.
                            paths.push(GraphPath {
                                path_type: "outgoing".to_string(),
                                from_x: dot_lane,
                                to_x: target_idx,
                                color: next_lanes[target_idx].as_ref().unwrap().color.clone(),
                            });
                        }
                    }

                    // Persist unchanged sparse columns visually
                    for (ni, slot_opt) in next_lanes.iter().enumerate() {
                        if ni != dot_lane {
                            if let Some(s) = slot_opt {
                                // Only draw passthrough if it was in prev_lanes! (otherwise it was an extra parent newly spawned by "outgoing")
                                if let Some(Some(_)) = prev_lanes.get(ni) {
                                    paths.push(GraphPath {
                                        path_type: "passthrough".to_string(),
                                        from_x: ni,
                                        to_x: ni,
                                        color: s.color.clone(),
                                    });
                                }
                            }
                        }
                    }

                    streamer.lanes = next_lanes;

                    logs.push(GitLogEntry {
                        hash: hash.to_string(),
                        author: author.to_string(),
                        author_email: author_email.to_string(),
                        date: date.to_string(),
                        message: message.to_string(),
                        files_changed: 0,
                        insertions: 0,
                        deletions: 0,
                        refs,
                        parent_count: parents.len(),
                        parents: parents.clone(),
                        graph_node: Some(GraphNode {
                            lane: dot_lane,
                            color: dot_color,
                            is_merge: parents.len() > 1,
                            paths,
                        }),
                    });
                }
            }
            current_block.clear();
        }
    }

    let duration = start.elapsed();
    eprintln!(
        "git_log_stream_next: dynamic load block of {} commits processed in {:?}",
        logs.len(),
        duration
    );

    Ok(logs)
}

pub fn git_log(path: String, limit: Option<usize>) -> Result<Vec<GitLogEntry>, AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let limit_str = limit.unwrap_or(10).to_string();
    let mut cmd = git_cmd()?;
    cmd.current_dir(&path).args(&[
        "log",
        "-n",
        &limit_str,
        "--format=%H%x00%an%x00%ae%x00%ct%x00%B%x00%D%x00%P",
    ]);

    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = cmd
        .output()
        .map_err(|e| AppError::Message(format!("git log failed: {}", e)))?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut logs = Vec::new();

    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('\x00').collect();
        if parts.len() < 7 {
            continue;
        }

        let hash = parts[0].trim().to_string();
        let message = parts[4].trim().to_string();

        logs.push(GitLogEntry {
            hash,
            author: String::new(),
            author_email: String::new(),
            date: String::new(),
            message,
            files_changed: 0,
            insertions: 0,
            deletions: 0,
            refs: Vec::new(),
            parent_count: 0,
            parents: Vec::new(),
            graph_node: None,
        });
    }

    Ok(logs)
}

pub fn git_commit_files(repo_path: String, hash: String) -> Result<Vec<GitFileParams>, AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
    let obj = repo.revparse_single(&hash).map_err(|e| AppError::Git(e))?;
    let commit = obj
        .as_commit()
        .ok_or(AppError::Message("Object is not a commit".to_string()))?;
    let tree = commit.tree().map_err(|e| AppError::Git(e))?;

    let mut results = Vec::new();
    let parent_tree = if commit.parent_count() > 0 {
        let parent = commit.parent(0).map_err(|e| AppError::Git(e))?;
        Some(parent.tree().map_err(|e| AppError::Git(e))?)
    } else {
        None
    };

    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)
        .map_err(|e| AppError::Git(e))?;

    diff.foreach(
        &mut |delta, _| {
            let path = delta
                .new_file()
                .path()
                .unwrap_or(delta.old_file().path().unwrap_or(Path::new("")))
                .to_string_lossy()
                .to_string();
            let status = match delta.status() {
                git2::Delta::Added => "A",
                git2::Delta::Modified => "M",
                git2::Delta::Deleted => "D",
                git2::Delta::Renamed => "R",
                _ => "?",
            };
            results.push(GitFileParams {
                path,
                status: status.to_string(),
                staged: true, // Files in a commit are by definition "staged" in that context
            });
            true
        },
        None,
        None,
        None,
    )
    .map_err(|e| AppError::Git(e))?;

    Ok(results)
}

pub fn git_cherry_pick(repo_path: String, hash: String) -> Result<(), AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = git_cmd()?;
    cmd.current_dir(&repo_path).args(&["cherry-pick", &hash]);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| AppError::Io(e))?;
    if !output.status.success() {
        return Err(AppError::Message(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

pub fn git_revert_commit(repo_path: String, hash: String) -> Result<(), AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = git_cmd()?;
    cmd.current_dir(&repo_path)
        .args(&["revert", "--no-edit", &hash]);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| AppError::Io(e))?;
    if !output.status.success() {
        return Err(AppError::Message(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

pub fn git_create_branch_from_commit(
    repo_path: String,
    branch_name: String,
    hash: String,
) -> Result<(), AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
    let obj = repo.revparse_single(&hash).map_err(|e| AppError::Git(e))?;
    let commit = obj
        .as_commit()
        .ok_or(AppError::Message("Object is not a commit".to_string()))?;
    repo.branch(&branch_name, commit, false)
        .map_err(|e| AppError::Git(e))?;
    Ok(())
}

pub fn git_checkout_commit(repo_path: String, hash: String) -> Result<(), AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = git_cmd()?;
    cmd.current_dir(&repo_path).args(&["checkout", &hash]);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| AppError::Io(e))?;
    if !output.status.success() {
        return Err(AppError::Message(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

pub fn git_sync(path: String) -> Result<(), AppError> {
    git_pull(path.clone())?;
    git_push(path)
}

pub fn git_pull(path: String) -> Result<(), AppError> {
    let output = git_cmd()?
        .args(&["-C", &path, "pull", "--rebase"])
        .output()
        .map_err(|e| AppError::Io(e))?;

    if !output.status.success() {
        return Err(AppError::Message(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }
    crate::commands::stats::bump_event(&path, "user_git_pulls");
    Ok(())
}

pub fn git_push(path: String) -> Result<(), AppError> {
    let output = git_cmd()?
        .args(&["-C", &path, "push"])
        .output()
        .map_err(|e| AppError::Io(e))?;

    if !output.status.success() {
        return Err(AppError::Message(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }
    crate::commands::stats::bump_event(&path, "user_git_pushes");
    Ok(())
}

pub fn git_fetch(path: String) -> Result<(), AppError> {
    let output = git_cmd()?
        .args(&["-C", &path, "fetch", "--all", "--prune"])
        .output()
        .map_err(|e| AppError::Io(e))?;

    if !output.status.success() {
        return Err(AppError::Message(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }
    crate::commands::stats::bump_event(&path, "user_git_fetches");
    Ok(())
}

pub fn git_has_remote(path: String) -> Result<bool, AppError> {
    let repo = Repository::open(&path).map_err(|e| AppError::Git(e))?;
    let remotes = repo.remotes().map_err(|e| AppError::Git(e))?;
    Ok(remotes.len() > 0)
}

pub fn git_remote_url(path: String) -> Result<String, AppError> {
    let repo = Repository::open(&path).map_err(|e| AppError::Git(e))?;
    let remotes = repo.remotes().map_err(|e| AppError::Git(e))?;

    // Default to 'origin' if it exists
    let remote_name = if remotes.iter().any(|n| n == Some("origin")) {
        "origin"
    } else {
        match remotes.get(0) {
            Some(name) => name,
            _ => return Err(AppError::Message("No remote found".to_string())),
        }
    };

    let remote = repo
        .find_remote(remote_name)
        .map_err(|e| AppError::Git(e))?;
    let url = remote.url().unwrap_or("").to_string();
    Ok(url)
}

#[derive(Serialize, Clone)]
pub struct GitRemoteInfo {
    pub name: String,
    pub url: String,
}

pub fn git_list_remotes(path: String) -> Result<Vec<GitRemoteInfo>, AppError> {
    let repo = Repository::open(&path).map_err(|e| AppError::Git(e))?;
    let remotes = repo.remotes().map_err(|e| AppError::Git(e))?;
    let mut out = Vec::new();
    for name in remotes.iter().flatten() {
        let remote = repo.find_remote(name).map_err(|e| AppError::Git(e))?;
        out.push(GitRemoteInfo {
            name: name.to_string(),
            url: remote.url().unwrap_or("").to_string(),
        });
    }
    Ok(out)
}

pub fn git_add_remote(path: String, name: String, url: String) -> Result<(), AppError> {
    let repo = Repository::open(&path).map_err(|e| AppError::Git(e))?;
    repo.remote(&name, &url).map_err(|e| AppError::Git(e))?;
    Ok(())
}

pub fn git_remove_remote(path: String, name: String) -> Result<(), AppError> {
    let repo = Repository::open(&path).map_err(|e| AppError::Git(e))?;
    repo.remote_delete(&name).map_err(|e| AppError::Git(e))?;
    Ok(())
}

pub fn git_set_remote_url(path: String, name: String, url: String) -> Result<(), AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = git_cmd()?;
    cmd.current_dir(&path).args(["remote", "set-url", &name, &url]);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().map_err(|e| AppError::Io(e))?;
    if !output.status.success() {
        return Err(AppError::Message(String::from_utf8_lossy(&output.stderr).to_string()));
    }
    Ok(())
}

pub fn git_get_item_content(
    repo_path: String,
    file_path: String,
    staged: bool,
) -> Result<String, AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
    let rel_path = resolve_repo_relative_path(&repo_path, &file_path);

    if staged {
        // If staged, base is HEAD
        let head = match repo.head() {
            Ok(h) => h,
            Err(_) => return Ok(String::new()), // No commits yet
        };
        let commit = head.peel_to_commit().map_err(|e| AppError::Git(e))?;
        let tree = commit.tree().map_err(|e| AppError::Git(e))?;
        let entry = match tree.get_path(Path::new(&rel_path)) {
            Ok(e) => e,
            Err(_) => return Ok(String::new()), // Not in HEAD (newly added)
        };
        let object = entry.to_object(&repo).map_err(|e| AppError::Git(e))?;
        let blob = object
            .as_blob()
            .ok_or(AppError::Message("Not a blob".to_string()))?;
        Ok(String::from_utf8_lossy(blob.content()).to_string())
    } else {
        // If unstaged, base is Index
        let index = repo.index().map_err(|e| AppError::Git(e))?;
        let entry = match index.get_path(Path::new(&rel_path), 0) {
            Some(e) => e,
            None => return Ok(String::new()), // Not in index (untracked)
        };
        let blob = repo.find_blob(entry.id).map_err(|e| AppError::Git(e))?;
        Ok(String::from_utf8_lossy(blob.content()).to_string())
    }
}

#[derive(Serialize, Clone)]
pub struct BlameLine {
    pub line: u32,
    pub commit: String,
    pub author: String,
    pub date: String,
    pub summary: String,
}

#[derive(Serialize, Clone)]
pub struct GitStashEntry {
    pub index: usize,
    pub message: String,
    pub date: String,
}

pub(super) fn resolve_repo_relative_path(repo_path: &str, file_path: &str) -> String {
    let clean_path = file_path.replace('\\', "/");
    let joined: PathBuf = if Path::new(&clean_path).is_absolute() {
        PathBuf::from(&clean_path)
    } else {
        Path::new(repo_path).join(&clean_path)
    };
    if let Ok(repo_canon) = std::fs::canonicalize(repo_path) {
        if let Ok(file_canon) = std::fs::canonicalize(&joined) {
            if let Ok(rel) = file_canon.strip_prefix(&repo_canon) {
                return rel.to_string_lossy().replace('\\', "/");
            }
        }
    }

    let norm_repo = repo_path.replace('\\', "/").trim_end_matches('/').to_string();
    let norm_file = clean_path.clone();
    if norm_file.len() > norm_repo.len()
        && norm_file[..norm_repo.len()].eq_ignore_ascii_case(&norm_repo)
        && norm_file.chars().nth(norm_repo.len()) == Some('/')
    {
        return norm_file[norm_repo.len() + 1..].to_string();
    }

    if Path::new(&clean_path).is_absolute() {
        clean_path
            .rsplit('/')
            .next()
            .unwrap_or(&clean_path)
            .to_string()
    } else {
        clean_path
    }
}

pub fn git_blame_file(repo_path: String, file_path: String) -> Result<Vec<BlameLine>, AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
    let rel_path = resolve_repo_relative_path(&repo_path, &file_path);

    let mut opts = git2::BlameOptions::new();
    let blame = repo
        .blame_file(Path::new(&rel_path), Some(&mut opts))
        .map_err(|e| AppError::Git(e))?;

    let mut results = Vec::new();
    for line_idx in 0..blame.len() {
        if let Some(hunk) = blame.get_index(line_idx) {
            let commit_id = hunk.final_commit_id();
            let commit = repo.find_commit(commit_id).map_err(|e| AppError::Git(e))?;
            let author = commit
                .author()
                .name()
                .unwrap_or("Unknown")
                .to_string();
            let date = commit.time().seconds().to_string();
            let summary = commit.summary().unwrap_or("").to_string();
            results.push(BlameLine {
                line: line_idx as u32 + 1,
                commit: commit_id.to_string(),
                author,
                date,
                summary,
            });
        }
    }
    Ok(results)
}

pub fn git_stash_list(repo_path: String) -> Result<Vec<GitStashEntry>, AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = git_cmd()?;
    cmd.current_dir(&repo_path)
        .args(["stash", "list", "--format=%gd%x00%gs%x00%ct"]);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().map_err(|e| AppError::Io(e))?;
    if !output.status.success() && output.stdout.is_empty() {
        return Err(AppError::Message(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();
    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\x00').collect();
        if parts.len() < 3 {
            continue;
        }
        let ref_str = parts[0].trim();
        let index = ref_str
            .strip_prefix("stash@{")
            .and_then(|s| s.strip_suffix('}'))
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(entries.len());
        entries.push(GitStashEntry {
            index,
            message: parts[1].trim().to_string(),
            date: parts[2].trim().to_string(),
        });
    }
    Ok(entries)
}

pub fn git_stash_save(repo_path: String, message: String, include_untracked: bool) -> Result<(), AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = git_cmd()?;
    cmd.current_dir(&repo_path).arg("stash").arg("push");
    if include_untracked {
        cmd.arg("-u");
    }
    if !message.is_empty() {
        cmd.args(["-m", &message]);
    }
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().map_err(|e| AppError::Io(e))?;
    if !output.status.success() {
        return Err(AppError::Message(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

pub fn git_stash_apply(repo_path: String, index: usize) -> Result<(), AppError> {
    run_git_stash_action(&repo_path, "apply", index)
}

pub fn git_stash_pop(repo_path: String, index: usize) -> Result<(), AppError> {
    run_git_stash_action(&repo_path, "pop", index)
}

pub fn git_stash_drop(repo_path: String, index: usize) -> Result<(), AppError> {
    run_git_stash_action(&repo_path, "drop", index)
}

fn run_git_stash_action(repo_path: &str, action: &str, index: usize) -> Result<(), AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let stash_ref = format!("stash@{{{}}}", index);
    let mut cmd = git_cmd()?;
    cmd.current_dir(repo_path).args(["stash", action, &stash_ref]);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().map_err(|e| AppError::Io(e))?;
    if !output.status.success() {
        return Err(AppError::Message(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

pub fn git_stash_show(repo_path: String, index: usize) -> Result<String, AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let stash_ref = format!("stash@{{{}}}", index);
    let mut cmd = git_cmd()?;
    cmd.current_dir(&repo_path).args(["stash", "show", "-p", &stash_ref]);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().map_err(|e| AppError::Io(e))?;
    if !output.status.success() {
        return Err(AppError::Message(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn git_get_commit_file_content(
    repo_path: String,
    file_path: String,
    hash: String,
) -> Result<(String, String), AppError> {
    let repo = Repository::open(&repo_path).map_err(|e| AppError::Git(e))?;
    let obj = repo.revparse_single(&hash).map_err(|e| AppError::Git(e))?;
    let commit = obj
        .as_commit()
        .ok_or(AppError::Message("Object is not a commit".to_string()))?;

    let get_blob_content = |tree: &git2::Tree<'_>, path: &Path| -> String {
        if let Ok(entry) = tree.get_path(path) {
            if let Ok(object) = entry.to_object(&repo) {
                if let Some(blob) = object.as_blob() {
                    return String::from_utf8_lossy(blob.content()).to_string();
                }
            }
        }
        "".to_string()
    };

    let tree = commit.tree().map_err(|e| AppError::Git(e))?;
    let commit_content = get_blob_content(&tree, Path::new(&file_path));

    let parent_content = if commit.parent_count() > 0 {
        if let Ok(parent) = commit.parent(0) {
            if let Ok(parent_tree) = parent.tree() {
                get_blob_content(&parent_tree, Path::new(&file_path))
            } else {
                "".to_string()
            }
        } else {
            "".to_string()
        }
    } else {
        "".to_string()
    };

    Ok((parent_content, commit_content))
}

fn validate_clone_url(url: &str) -> Result<(), AppError> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(AppError::Message("Clone URL is required".to_string()));
    }
    let lower = trimmed.to_lowercase();
    if !(lower.starts_with("https://")
        || lower.starts_with("http://")
        || lower.starts_with("git@")
        || lower.starts_with("ssh://"))
    {
        return Err(AppError::Message("Unsupported clone URL scheme".to_string()));
    }
    if trimmed
        .chars()
        .any(|c| matches!(c, ';' | '&' | '|' | '`' | '$' | '\n' | '\r'))
    {
        return Err(AppError::Message(
            "Clone URL contains invalid characters".to_string(),
        ));
    }
    Ok(())
}

fn clone_folder_name(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches(".git");
    if let Some(idx) = trimmed.rfind('/') {
        trimmed[idx + 1..].to_string()
    } else if let Some(idx) = trimmed.rfind(':') {
        trimmed[idx + 1..].to_string()
    } else {
        "repository".to_string()
    }
}

/// Clone a repository using argv (never shell interpolation).
pub fn git_clone(url: String, parent_dir: String) -> Result<String, AppError> {
    validate_clone_url(&url)?;
    let parent = Path::new(&parent_dir);
    if !parent.is_dir() {
        return Err(AppError::Message(
            "Parent directory does not exist".to_string(),
        ));
    }
    let folder = clone_folder_name(&url);
    if folder.is_empty() {
        return Err(AppError::Message("Could not derive clone folder name".to_string()));
    }
    let dest = parent.join(&folder);
    if dest.exists() {
        return Err(AppError::Message(format!(
            "Target folder already exists: {}",
            dest.display()
        )));
    }

    let output = git_cmd()?
        .current_dir(parent)
        .args(["clone", url.trim(), &folder])
        .output()
        .map_err(|e| AppError::Message(format!("git clone failed: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Message(format!("git clone failed: {}", stderr)));
    }

    Ok(dest.to_string_lossy().to_string())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitTagEntry {
    pub name: String,
    pub hash: String,
    pub date: String,
    pub message: String,
}

pub fn git_list_tags(repo_path: String) -> Result<Vec<GitTagEntry>, AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = git_cmd()?;
    cmd.current_dir(&repo_path).args([
        "for-each-ref",
        "--sort=-creatordate",
        "refs/tags/",
        "--format=%(refname:short)%00%(objectname:short)%00%(creatordate:relative)%00%(subject)",
    ]);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd
        .output()
        .map_err(|e| AppError::Message(format!("git for-each-ref tags failed: {}", e)))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Message(format!("git list tags failed: {}", stderr)));
    }

    let mut tags = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\x00').collect();
        if parts.is_empty() || parts[0].is_empty() {
            continue;
        }
        tags.push(GitTagEntry {
            name: parts[0].to_string(),
            hash: parts.get(1).unwrap_or(&"").to_string(),
            date: parts.get(2).unwrap_or(&"").to_string(),
            message: parts.get(3).unwrap_or(&"").to_string(),
        });
    }
    Ok(tags)
}

/// Abort an in-progress merge (`MERGE_HEAD` present).
pub fn git_merge_abort(repo_path: String) -> Result<(), AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = git_cmd()?;
    cmd.current_dir(&repo_path).args(["merge", "--abort"]);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| AppError::Io(e))?;
    if !output.status.success() {
        return Err(AppError::Message(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

/// Abort an in-progress rebase.
pub fn git_rebase_abort(repo_path: String) -> Result<(), AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = git_cmd()?;
    cmd.current_dir(&repo_path).args(["rebase", "--abort"]);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| AppError::Io(e))?;
    if !output.status.success() {
        return Err(AppError::Message(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

/// True when merge or rebase is in progress (conflict recovery UI).
pub fn git_in_progress(repo_path: String) -> Result<serde_json::Value, AppError> {
    let git_dir = Path::new(&repo_path).join(".git");
    let merge = git_dir.join("MERGE_HEAD").exists();
    let rebase = git_dir.join("rebase-merge").exists() || git_dir.join("rebase-apply").exists();
    Ok(serde_json::json!({
        "merge": merge,
        "rebase": rebase,
    }))
}
