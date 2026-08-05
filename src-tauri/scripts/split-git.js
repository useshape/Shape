/**
 * Split commands/git/mod.rs into focused submodules with stable public re-exports.
 */
const fs = require("fs");
const path = require("path");

const dir = "c:/Users/User/Desktop/shape-monorepo/shape/src-tauri/src/commands/git";
const srcPath = path.join(dir, "mod.rs");
const bakPath = path.join(dir, "mod.rs.bak");
const raw = fs.readFileSync(srcPath, "utf8");
if (!fs.existsSync(bakPath)) fs.writeFileSync(bakPath, raw);
const lines = raw.split(/\n/);
const slice = (a, b) => lines.slice(a - 1, b).join("\n").replace(/\r/g, "");

// --- repo.rs ---
fs.writeFileSync(
  path.join(dir, "repo.rs"),
  `//! Repo discovery and open helpers shared by git submodules.
use crate::core::error::AppError;
use git2::Repository;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

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

${slice(30, 229)}
`
);

// --- status.rs: working tree / stage / commit / diff (includes shared param types) ---
fs.writeFileSync(
  path.join(dir, "status.rs"),
  `//! Working-tree status, staging, commits, and diffs.
use crate::core::error::AppError;
use git2::{DiffFormat, DiffOptions, Repository, StatusOptions};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::repo::{default_branch_name, git_cmd, is_unborn_or_invalid_ref, open_repo_path};

${slice(231, 838)}
`
);

// --- branches.rs: branch CRUD + graph (exclude log streamer types 941-972) ---
fs.writeFileSync(
  path.join(dir, "branches.rs"),
  `//! Branch listing, switching, details, and graph layout.
use crate::core::error::AppError;
use serde::Serialize;
use std::collections::HashMap;
use std::process::Command;

use super::repo::{git_cmd, open_repo_path};

${slice(840, 940)}

${slice(974, 1581)}
`
);

// --- log.rs: includes streamer types + log ops ---
fs.writeFileSync(
  path.join(dir, "log.rs"),
  `//! Commit log, streaming, and history mutations.
use crate::core::error::AppError;
use git2::{DiffOptions, Repository};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::str;

use super::repo::{git_cmd, open_repo_path};
use super::status::{GitFileParams, GitLogEntry};

${slice(941, 972)}

${slice(1583, 2099)}
`
);

// --- remotes.rs ---
fs.writeFileSync(
  path.join(dir, "remotes.rs"),
  `//! Sync and remote configuration.
use crate::core::error::AppError;
use serde::Serialize;
use std::process::Command;

use super::repo::{git_cmd, open_repo_path};

${slice(2101, 2224)}
`
);

// --- stash.rs ---
fs.writeFileSync(
  path.join(dir, "stash.rs"),
  `//! Blame, stash, and commit blob content.
use crate::core::error::AppError;
use serde::Serialize;
use std::path::Path;
use std::process::Command;
use std::str;

use super::repo::{git_cmd, open_repo_path};

${slice(2226, 2503)}
`
);

// --- clone_tags.rs ---
fs.writeFileSync(
  path.join(dir, "clone_tags.rs"),
  `//! Clone, tags, and in-progress rebase/merge state.
use crate::core::error::AppError;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::repo::{git_cmd, open_repo_path};

${slice(2505, lines.length)}
`
);

// --- mod.rs re-exports ---
fs.writeFileSync(
  path.join(dir, "mod.rs"),
  `//! Git commands — split by concern; public surface unchanged for adapters.

mod repo;
mod status;
mod branches;
mod log;
mod remotes;
mod stash;
mod clone_tags;

mod hunks;
pub use hunks::{
    git_list_hunks, git_restore_hunk, git_stage_hunk, git_unstage_hunk, GitHunkList,
};

pub use repo::{
    git_discover_repos, git_resolve_repo_for_file, open_repo_path, GitRepoInfo,
};

pub use status::{
    git_activity_timeline, git_commit, git_diff, git_diff_branches, git_discard_changes,
    git_file_diff, git_init, git_set_upstream, git_stage, git_stage_all, git_staged_diff,
    git_status, git_unstage, git_unstage_all, GitActivityPoint, GitFileParams, GitLogEntry,
    GraphNode, GraphPath,
};

pub use branches::{
    git_branch_details, git_branch_graph, git_branches, git_create_branch, git_current_branch,
    git_delete_branch, git_remote_branches, git_rename_branch, git_switch_branch, git_sync_status,
    GitBranchDetail, GitBranchGraph, GitBranchGraphNode, GitSyncStatus,
};

pub use log::{
    git_checkout_commit, git_cherry_pick, git_commit_files, git_create_branch_from_commit, git_log,
    git_log_stream_next, git_log_stream_start, git_log_stream_stop, git_revert_commit,
};

pub use remotes::{
    git_add_remote, git_fetch, git_get_item_content, git_has_remote, git_list_remotes, git_pull,
    git_push, git_remote_url, git_remove_remote, git_set_remote_url, git_sync, GitRemoteInfo,
};

pub use stash::{
    git_blame_file, git_get_commit_file_content, git_stash_apply, git_stash_drop, git_stash_list,
    git_stash_pop, git_stash_save, git_stash_show, BlameLine, GitStashEntry,
};

pub use clone_tags::{
    git_clone, git_in_progress, git_list_tags, git_merge_abort, git_rebase_abort, GitTagEntry,
};
`
);

console.log("git split written");
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".rs")).sort()) {
  const n = fs.readFileSync(path.join(dir, f), "utf8").split("\n").length;
  console.log(String(n).padStart(5), f);
}
