//! Per-project statistics: tokei-style LOC scan + local activity time tracking.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

use crate::app_state::AppState;
use crate::core::error::AppError;

const DEFAULT_SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    ".turbo",
    ".vercel",
    "coverage",
    ".cache",
    "__pycache__",
    ".venv",
    "venv",
    ".tox",
    ".idea",
    ".vscode",
    ".shape",
    "vendor",
    "Pods",
    "DerivedData",
    ".gradle",
    ".dart_tool",
    "bower_components",
    ".sass-cache",
    ".parcel-cache",
    ".yarn",
    ".pnpm-store",
];

/// Extension → language display name (tokei-inspired).
fn language_for_ext(ext: &str) -> Option<&'static str> {
    Some(match ext {
        "ts" | "mts" | "cts" => "TypeScript",
        "tsx" => "TSX",
        "js" | "mjs" | "cjs" => "JavaScript",
        "jsx" => "JSX",
        "rs" => "Rust",
        "py" | "pyi" => "Python",
        "go" => "Go",
        "java" => "Java",
        "kt" | "kts" => "Kotlin",
        "swift" => "Swift",
        "c" => "C",
        "h" => "C Header",
        "cpp" | "cc" | "cxx" | "hpp" | "hxx" | "hh" => "C++",
        "cs" => "C#",
        "rb" => "Ruby",
        "php" => "PHP",
        "scala" => "Scala",
        "dart" => "Dart",
        "lua" => "Lua",
        "r" | "R" => "R",
        "css" => "CSS",
        "scss" | "sass" => "SCSS",
        "less" => "Less",
        "html" | "htm" => "HTML",
        "vue" => "Vue",
        "svelte" => "Svelte",
        "astro" => "Astro",
        "md" | "mdx" | "markdown" => "Markdown",
        "json" | "jsonc" => "JSON",
        "yaml" | "yml" => "YAML",
        "toml" => "TOML",
        "xml" => "XML",
        "sql" => "SQL",
        "sh" | "bash" | "zsh" => "Shell",
        "ps1" | "psm1" => "PowerShell",
        "bat" | "cmd" => "Batch",
        "dockerfile" => "Dockerfile",
        "graphql" | "gql" => "GraphQL",
        "proto" => "Protobuf",
        "zig" => "Zig",
        "nim" => "Nim",
        "ex" | "exs" => "Elixir",
        "hs" => "Haskell",
        "ml" | "mli" => "OCaml",
        "clj" | "cljs" | "cljc" => "Clojure",
        "elm" => "Elm",
        "tf" => "HCL",
        "prisma" => "Prisma",
        "wgsl" => "WGSL",
        "glsl" | "vert" | "frag" => "GLSL",
        _ => return None,
    })
}

fn language_for_filename(name: &str) -> Option<&'static str> {
    let lower = name.to_ascii_lowercase();
    match lower.as_str() {
        "dockerfile" | "containerfile" => Some("Dockerfile"),
        "makefile" | "gnumakefile" => Some("Makefile"),
        "cmakelists.txt" => Some("CMake"),
        "cargo.toml" | "cargo.lock" => None, // counted as TOML via ext if .toml
        _ => None,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageStats {
    pub name: String,
    pub files: u64,
    pub code: u64,
    pub blank: u64,
    pub comment: u64,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LargeFileStat {
    pub path: String,
    pub lines: u64,
    pub code: u64,
    pub bytes: u64,
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct LocReport {
    pub scanned_at: f64,
    pub total_files: u64,
    pub total_bytes: u64,
    pub code: u64,
    pub blank: u64,
    pub comment: u64,
    pub total_lines: u64,
    pub avg_lines_per_file: f64,
    pub avg_bytes_per_file: f64,
    pub avg_code_per_file: f64,
    pub comment_ratio: f64,
    pub blank_ratio: f64,
    pub code_ratio: f64,
    pub files_over_500_lines: u64,
    pub files_over_1000_lines: u64,
    pub test_files: u64,
    pub config_files: u64,
    pub doc_files: u64,
    pub unique_languages: u64,
    pub largest_files: Vec<LargeFileStat>,
    pub languages: Vec<LanguageStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct EventCounters {
    pub ai_terminal_runs: u64,
    pub ai_file_edits: u64,
    pub ai_file_creates: u64,
    pub ai_file_deletes: u64,
    pub ai_file_renames: u64,
    pub ai_searches: u64,
    pub ai_reads: u64,
    pub ai_git_commits: u64,
    pub ai_git_fetches: u64,
    pub ai_git_stages: u64,
    pub ai_chat_turns: u64,
    pub ai_subagents: u64,
    pub ai_design_previews: u64,
    pub ai_mcp_calls: u64,
    pub ai_plan_saves: u64,
    pub ai_todo_updates: u64,
    pub user_file_saves: u64,
    pub user_files_opened: u64,
    pub user_git_commits: u64,
    pub user_git_pushes: u64,
    pub user_git_fetches: u64,
    pub user_git_pulls: u64,
    pub chat_stops: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct GitInsights {
    pub is_repo: bool,
    pub commits: u64,
    pub contributors: u64,
    pub branches: u64,
    pub remote_branches: u64,
    pub tags: u64,
    pub remotes: u64,
    pub merge_commits: u64,
    pub commits_today: u64,
    pub commits_last_7_days: u64,
    pub commits_last_30_days: u64,
    pub commits_last_90_days: u64,
    pub additions_last_30_days: u64,
    pub deletions_last_30_days: u64,
    pub files_touched_last_30_days: u64,
    pub stash_count: u64,
    pub dirty_files: u64,
    pub untracked_files: u64,
    pub first_commit_at: Option<f64>,
    pub age_days: f64,
    pub avg_commits_per_week: f64,
    pub busiest_weekday: Option<String>,
    pub top_author: Option<String>,
    pub top_author_commits: u64,
    pub current_branch: Option<String>,
    pub last_commit_at: Option<f64>,
    pub last_commit_message: Option<String>,
    pub last_commit_author: Option<String>,
    pub computed_at: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ActivityTotals {
    /// Active editing / focused work in the IDE (ms).
    pub coding_ms: u64,
    /// Time while an AI chat turn was generating (ms).
    pub ai_generating_ms: u64,
    /// Main window focused (may include idle) (ms).
    pub focused_ms: u64,
    pub updated_at: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStatsStore {
    pub project_path: String,
    /// Extra directory name segments to skip (in addition to defaults).
    pub custom_ignore: Vec<String>,
    pub loc: Option<LocReport>,
    pub activity: ActivityTotals,
    #[serde(default)]
    pub events: EventCounters,
    pub git: Option<GitInsights>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStatsSnapshot {
    pub project_path: String,
    pub project_name: String,
    pub custom_ignore: Vec<String>,
    pub default_ignore: Vec<String>,
    pub loc: Option<LocReport>,
    pub activity: ActivityTotals,
    /// Convenience: coding + AI + focused broken out as hours.
    pub hours: ActivityHours,
    pub events: EventCounters,
    pub git: Option<GitInsights>,
    /// Top-level folders available for custom ignore picking.
    pub project_folders: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ActivityHours {
    pub coding: f64,
    pub ai_generating: f64,
    pub focused: f64,
    pub total_active: f64,
}

fn now_secs() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

fn project_hash(proj_path: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    proj_path.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn stats_path(proj_path: &str) -> PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("Shape");
    path.push("stats");
    let _ = std::fs::create_dir_all(&path);
    path.push(format!("{}.json", project_hash(proj_path)));
    path
}

fn load_store(proj_path: &str) -> ProjectStatsStore {
    let file = stats_path(proj_path);
    if let Ok(content) = std::fs::read_to_string(&file) {
        if let Ok(mut store) = serde_json::from_str::<ProjectStatsStore>(&content) {
            store.project_path = proj_path.to_string();
            return store;
        }
    }
    ProjectStatsStore {
        project_path: proj_path.to_string(),
        ..Default::default()
    }
}

fn save_store(store: &ProjectStatsStore) -> Result<(), AppError> {
    let file = stats_path(&store.project_path);
    let content = serde_json::to_string_pretty(store)?;
    std::fs::write(file, content)?;
    Ok(())
}

fn hours_from(activity: &ActivityTotals) -> ActivityHours {
    let coding = activity.coding_ms as f64 / 3_600_000.0;
    let ai = activity.ai_generating_ms as f64 / 3_600_000.0;
    let focused = activity.focused_ms as f64 / 3_600_000.0;
    ActivityHours {
        coding,
        ai_generating: ai,
        focused,
        total_active: coding + ai,
    }
}

fn project_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(path)
        .to_string()
}

fn resolve_project(app_state: &AppState, project_path: Option<String>) -> Result<String, AppError> {
    if let Some(p) = project_path.filter(|s| !s.trim().is_empty()) {
        return Ok(p);
    }
    app_state
        .0
        .lock()
        .map_err(|e| AppError::Poison(e.to_string()))?
        .project_path
        .clone()
        .ok_or_else(|| AppError::Message("No project open".into()))
}

fn is_skipped_dir(name: &str, custom: &[String]) -> bool {
    let lower = name.to_ascii_lowercase();
    if DEFAULT_SKIP_DIRS.iter().any(|d| d.eq_ignore_ascii_case(&lower)) {
        return true;
    }
    custom.iter().any(|c| {
        let c = c.trim().trim_matches(|ch| ch == '/' || ch == '\\');
        !c.is_empty() && c.eq_ignore_ascii_case(name)
    })
}

fn classify_line(line: &str, in_block: &mut bool) -> LineKind {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return LineKind::Blank;
    }
    if *in_block {
        if trimmed.contains("*/") || trimmed.contains("-->") {
            *in_block = false;
        }
        return LineKind::Comment;
    }
    if trimmed.starts_with("/*") {
        if !trimmed.contains("*/") {
            *in_block = true;
        }
        return LineKind::Comment;
    }
    if trimmed.starts_with("<!--") {
        if !trimmed.contains("-->") {
            *in_block = true;
        }
        return LineKind::Comment;
    }
    if trimmed.starts_with("//")
        || trimmed.starts_with('#')
        || trimmed.starts_with("-- ")
        || trimmed == "--"
        || trimmed.starts_with("* ")
        || trimmed == "*"
    {
        return LineKind::Comment;
    }
    LineKind::Code
}

#[derive(Copy, Clone)]
enum LineKind {
    Code,
    Blank,
    Comment,
}

fn count_file(path: &Path) -> Option<(u64, u64, u64, u64)> {
    let file = File::open(path).ok()?;
    let meta = file.metadata().ok()?;
    let bytes = meta.len();
    // Skip huge / likely binary
    if bytes > 8 * 1024 * 1024 {
        return None;
    }
    let reader = BufReader::new(file);
    let mut code = 0u64;
    let mut blank = 0u64;
    let mut comment = 0u64;
    let mut in_block = false;
    let mut checked = 0u64;
    for line in reader.lines() {
        let Ok(line) = line else {
            return None; // binary / invalid utf8
        };
        if checked < 32 {
            // Reject binary-ish early
            if line.bytes().any(|b| b == 0) {
                return None;
            }
            checked += 1;
        }
        match classify_line(&line, &mut in_block) {
            LineKind::Code => code += 1,
            LineKind::Blank => blank += 1,
            LineKind::Comment => comment += 1,
        }
    }
    Some((code, blank, comment, bytes))
}

fn is_test_path(path: &Path) -> bool {
    let s = path.to_string_lossy().to_ascii_lowercase();
    s.contains("/test/")
        || s.contains("\\test\\")
        || s.contains("/tests/")
        || s.contains("\\tests\\")
        || s.contains("/__tests__/")
        || s.contains("\\__tests__\\")
        || s.contains(".test.")
        || s.contains(".spec.")
        || s.ends_with("_test.rs")
        || s.ends_with("_test.go")
        || s.ends_with("_test.py")
}

fn is_config_file(name: &str, lang: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "package.json"
            | "package-lock.json"
            | "pnpm-lock.yaml"
            | "yarn.lock"
            | "cargo.toml"
            | "cargo.lock"
            | "go.mod"
            | "go.sum"
            | "pyproject.toml"
            | "requirements.txt"
            | "tsconfig.json"
            | "jsconfig.json"
            | "next.config.js"
            | "next.config.ts"
            | "vite.config.ts"
            | "vite.config.js"
            | "webpack.config.js"
            | "dockerfile"
            | "makefile"
            | ".gitignore"
            | ".editorconfig"
            | "eslint.config.js"
            | "eslint.config.mjs"
            | "prettier.config.js"
            | "tailwind.config.ts"
            | "tailwind.config.js"
            | "biome.json"
            | "rust-toolchain.toml"
    ) || lang == "TOML" && lower.ends_with(".toml")
        || lang == "YAML" && (lower.ends_with(".yml") || lower.ends_with(".yaml"))
            && (lower.contains("config") || lower.contains("ci") || lower.starts_with('.'))
}

fn scan_loc(root: &str, custom_ignore: &[String]) -> Result<LocReport, AppError> {
    let root_path = PathBuf::from(root);
    if !root_path.is_dir() {
        return Err(AppError::Message("Project path is not a directory".into()));
    }

    let mut by_lang: HashMap<&'static str, LanguageStats> = HashMap::new();
    let mut total_files = 0u64;
    let mut total_bytes = 0u64;
    let mut total_code = 0u64;
    let mut total_blank = 0u64;
    let mut total_comment = 0u64;
    let mut files_over_500 = 0u64;
    let mut files_over_1000 = 0u64;
    let mut test_files = 0u64;
    let mut config_files = 0u64;
    let mut doc_files = 0u64;
    let mut largest: Vec<LargeFileStat> = Vec::new();

    let walker = WalkDir::new(&root_path)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if e.file_type().is_dir() {
                let name = e.file_name().to_string_lossy();
                return !is_skipped_dir(&name, custom_ignore);
            }
            true
        });

    for entry in walker.flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or_default();

        let lang = language_for_filename(file_name).or_else(|| {
            path.extension()
                .and_then(|e| e.to_str())
                .and_then(|ext| language_for_ext(&ext.to_ascii_lowercase()))
        });
        let Some(lang) = lang else {
            continue;
        };

        let Some((code, blank, comment, bytes)) = count_file(path) else {
            continue;
        };

        let lines = code + blank + comment;
        total_files += 1;
        total_bytes += bytes;
        total_code += code;
        total_blank += blank;
        total_comment += comment;
        if lines >= 500 {
            files_over_500 += 1;
        }
        if lines >= 1000 {
            files_over_1000 += 1;
        }
        if is_test_path(path) {
            test_files += 1;
        }
        if is_config_file(file_name, lang) {
            config_files += 1;
        }
        if lang == "Markdown" {
            doc_files += 1;
        }

        let rel = path
            .strip_prefix(&root_path)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");
        largest.push(LargeFileStat {
            path: rel,
            lines,
            code,
            bytes,
            language: lang.to_string(),
        });
        if largest.len() > 40 {
            largest.sort_by(|a, b| b.lines.cmp(&a.lines));
            largest.truncate(12);
        }

        let entry = by_lang.entry(lang).or_insert_with(|| LanguageStats {
            name: lang.to_string(),
            files: 0,
            code: 0,
            blank: 0,
            comment: 0,
            bytes: 0,
        });
        entry.files += 1;
        entry.code += code;
        entry.blank += blank;
        entry.comment += comment;
        entry.bytes += bytes;
    }

    largest.sort_by(|a, b| b.lines.cmp(&a.lines));
    largest.truncate(10);

    let mut languages: Vec<LanguageStats> = by_lang.into_values().collect();
    languages.sort_by(|a, b| b.code.cmp(&a.code).then_with(|| a.name.cmp(&b.name)));

    let total_lines = total_code + total_blank + total_comment;
    let files_f = total_files.max(1) as f64;
    let lines_f = total_lines.max(1) as f64;

    Ok(LocReport {
        scanned_at: now_secs(),
        total_files,
        total_bytes,
        code: total_code,
        blank: total_blank,
        comment: total_comment,
        total_lines,
        avg_lines_per_file: total_lines as f64 / files_f,
        avg_bytes_per_file: total_bytes as f64 / files_f,
        avg_code_per_file: total_code as f64 / files_f,
        comment_ratio: total_comment as f64 / lines_f,
        blank_ratio: total_blank as f64 / lines_f,
        code_ratio: total_code as f64 / lines_f,
        files_over_500_lines: files_over_500,
        files_over_1000_lines: files_over_1000,
        test_files,
        config_files,
        doc_files,
        unique_languages: languages.len() as u64,
        largest_files: largest,
        languages,
    })
}

fn snapshot_from_store(store: &ProjectStatsStore) -> ProjectStatsSnapshot {
    ProjectStatsSnapshot {
        project_path: store.project_path.clone(),
        project_name: project_name(&store.project_path),
        custom_ignore: store.custom_ignore.clone(),
        default_ignore: DEFAULT_SKIP_DIRS.iter().map(|s| (*s).to_string()).collect(),
        loc: store.loc.clone(),
        activity: store.activity.clone(),
        hours: hours_from(&store.activity),
        events: store.events.clone(),
        git: store.git.clone(),
        project_folders: list_top_level_folders(&store.project_path),
    }
}

fn list_top_level_folders(root: &str) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(root) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| !n.starts_with('.'))
        .collect();
    names.sort_by_key(|s| s.to_ascii_lowercase());
    names
}

fn compute_git_insights(project_path: &str) -> GitInsights {
    let mut out = GitInsights {
        computed_at: now_secs(),
        ..Default::default()
    };
    let Ok(repo) = git2::Repository::open(project_path) else {
        return out;
    };
    out.is_repo = true;
    if let Ok(head) = repo.head() {
        out.current_branch = head.shorthand().map(|s| s.to_string());
        if let Ok(commit) = head.peel_to_commit() {
            out.last_commit_at = Some(commit.time().seconds() as f64);
            out.last_commit_message = commit.summary().map(|s| s.to_string());
            {
                let author = commit.author();
                out.last_commit_author = author
                    .name()
                    .map(|s| s.to_string())
                    .or_else(|| author.email().map(|s| s.to_string()));
            }
        }
    }
    if let Ok(branches) = repo.branches(Some(git2::BranchType::Local)) {
        out.branches = branches.count() as u64;
    }
    if let Ok(branches) = repo.branches(Some(git2::BranchType::Remote)) {
        out.remote_branches = branches.count() as u64;
    }
    if let Ok(tags) = repo.tag_names(None) {
        out.tags = tags.len() as u64;
    }
    if let Ok(remotes) = repo.remotes() {
        out.remotes = remotes.len() as u64;
    }
    if let Ok(statuses) = repo.statuses(Some(
        git2::StatusOptions::new()
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .include_ignored(false),
    )) {
        for entry in statuses.iter() {
            let st = entry.status();
            if st.contains(git2::Status::WT_NEW) || st.contains(git2::Status::INDEX_NEW) {
                out.untracked_files = out.untracked_files.saturating_add(1);
            }
            if !st.is_empty() && !st.contains(git2::Status::IGNORED) {
                out.dirty_files = out.dirty_files.saturating_add(1);
            }
        }
    }
    if let Ok(output) = std::process::Command::new("git")
        .args(["-C", project_path, "stash", "list"])
        .output()
    {
        if output.status.success() {
            out.stash_count = String::from_utf8_lossy(&output.stdout)
                .lines()
                .filter(|l| !l.trim().is_empty())
                .count() as u64;
        }
    }

    let now = now_secs() as i64;
    let day_start = now - (now % 86_400);
    let week_ago = now - 7 * 24 * 3600;
    let month_ago = now - 30 * 24 * 3600;
    let ninety_ago = now - 90 * 24 * 3600;
    let mut authors: HashMap<String, u64> = HashMap::new();
    let mut weekday_counts = [0u64; 7];
    let mut commits = 0u64;
    let mut merges = 0u64;
    let mut c_today = 0u64;
    let mut c7 = 0u64;
    let mut c30 = 0u64;
    let mut c90 = 0u64;
    let mut first_at: Option<i64> = None;

    if let Ok(mut revwalk) = repo.revwalk() {
        let _ = revwalk.push_head();
        revwalk.set_sorting(git2::Sort::TIME).ok();
        for oid in revwalk.take(8_000).flatten() {
            let Ok(commit) = repo.find_commit(oid) else {
                continue;
            };
            commits += 1;
            if commit.parent_count() > 1 {
                merges += 1;
            }
            let t = commit.time().seconds();
            first_at = Some(match first_at {
                Some(prev) => prev.min(t),
                None => t,
            });
            if t >= day_start {
                c_today += 1;
            }
            if t >= week_ago {
                c7 += 1;
            }
            if t >= month_ago {
                c30 += 1;
            }
            if t >= ninety_ago {
                c90 += 1;
            }
            // weekday: 0 = Sunday
            let days = t.div_euclid(86_400);
            let weekday = ((days + 4) % 7) as usize; // Unix epoch was Thursday; +4 → Sunday=0
            if weekday < 7 {
                weekday_counts[weekday] = weekday_counts[weekday].saturating_add(1);
            }
            {
                let author = commit.author();
                let key = author
                    .email()
                    .map(|s| s.to_string())
                    .or_else(|| author.name().map(|s| s.to_string()))
                    .unwrap_or_else(|| "unknown".into());
                *authors.entry(key).or_insert(0) += 1;
            }
        }
    }
    out.commits = commits;
    out.contributors = authors.len() as u64;
    out.merge_commits = merges;
    out.commits_today = c_today;
    out.commits_last_7_days = c7;
    out.commits_last_30_days = c30;
    out.commits_last_90_days = c90;
    if let Some(first) = first_at {
        out.first_commit_at = Some(first as f64);
        let age = ((now - first).max(0) as f64) / 86_400.0;
        out.age_days = age;
        if age > 0.0 {
            out.avg_commits_per_week = (commits as f64) / (age / 7.0).max(1.0 / 7.0);
        }
    }
    if let Some((name, count)) = authors.into_iter().max_by_key(|(_, c)| *c) {
        out.top_author = Some(name);
        out.top_author_commits = count;
    }
    if let Some((idx, _)) = weekday_counts
        .iter()
        .enumerate()
        .max_by_key(|(_, c)| *c)
        .filter(|(_, c)| **c > 0)
    {
        const NAMES: [&str; 7] = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
        ];
        out.busiest_weekday = Some(NAMES[idx].to_string());
    }

    // Churn via git log --numstat for last 30 days (capped).
    let mut touched: std::collections::HashSet<String> = std::collections::HashSet::new();
    if let Ok(output) = std::process::Command::new("git")
        .args([
            "-C",
            project_path,
            "log",
            "--since=30.days",
            "--pretty=tformat:",
            "--numstat",
            "-n",
            "2000",
        ])
        .output()
    {
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                let mut parts = line.split_whitespace();
                let add = parts.next().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
                let del = parts.next().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
                if let Some(path) = parts.next() {
                    touched.insert(path.to_string());
                }
                out.additions_last_30_days = out.additions_last_30_days.saturating_add(add);
                out.deletions_last_30_days = out.deletions_last_30_days.saturating_add(del);
            }
        }
    }
    out.files_touched_last_30_days = touched.len() as u64;

    out
}

/// Increment a named event counter for a project (fire-and-forget from other commands).
pub fn bump_event(project_path: &str, key: &str) {
    if project_path.trim().is_empty() {
        return;
    }
    let mut store = load_store(project_path);
    match key {
        "ai_terminal_runs" => store.events.ai_terminal_runs = store.events.ai_terminal_runs.saturating_add(1),
        "ai_file_edits" => store.events.ai_file_edits = store.events.ai_file_edits.saturating_add(1),
        "ai_file_creates" => store.events.ai_file_creates = store.events.ai_file_creates.saturating_add(1),
        "ai_file_deletes" => store.events.ai_file_deletes = store.events.ai_file_deletes.saturating_add(1),
        "ai_file_renames" => store.events.ai_file_renames = store.events.ai_file_renames.saturating_add(1),
        "ai_searches" => store.events.ai_searches = store.events.ai_searches.saturating_add(1),
        "ai_reads" => store.events.ai_reads = store.events.ai_reads.saturating_add(1),
        "ai_git_commits" => store.events.ai_git_commits = store.events.ai_git_commits.saturating_add(1),
        "ai_git_fetches" => store.events.ai_git_fetches = store.events.ai_git_fetches.saturating_add(1),
        "ai_git_stages" => store.events.ai_git_stages = store.events.ai_git_stages.saturating_add(1),
        "ai_chat_turns" => store.events.ai_chat_turns = store.events.ai_chat_turns.saturating_add(1),
        "ai_subagents" => store.events.ai_subagents = store.events.ai_subagents.saturating_add(1),
        "ai_design_previews" => {
            store.events.ai_design_previews = store.events.ai_design_previews.saturating_add(1)
        }
        "ai_mcp_calls" => store.events.ai_mcp_calls = store.events.ai_mcp_calls.saturating_add(1),
        "ai_plan_saves" => store.events.ai_plan_saves = store.events.ai_plan_saves.saturating_add(1),
        "ai_todo_updates" => {
            store.events.ai_todo_updates = store.events.ai_todo_updates.saturating_add(1)
        }
        "user_file_saves" => store.events.user_file_saves = store.events.user_file_saves.saturating_add(1),
        "user_files_opened" => store.events.user_files_opened = store.events.user_files_opened.saturating_add(1),
        "user_git_commits" => store.events.user_git_commits = store.events.user_git_commits.saturating_add(1),
        "user_git_pushes" => store.events.user_git_pushes = store.events.user_git_pushes.saturating_add(1),
        "user_git_fetches" => store.events.user_git_fetches = store.events.user_git_fetches.saturating_add(1),
        "user_git_pulls" => store.events.user_git_pulls = store.events.user_git_pulls.saturating_add(1),
        "chat_stops" => store.events.chat_stops = store.events.chat_stops.saturating_add(1),
        _ => return,
    }
    let _ = save_store(&store);
}

#[tauri::command]
pub fn get_project_stats(
    project_path: Option<String>,
    app_state: tauri::State<'_, AppState>,
) -> Result<ProjectStatsSnapshot, AppError> {
    let path = resolve_project(&app_state, project_path)?;
    let mut store = load_store(&path);
    // Refresh git insights if missing or older than 2 minutes.
    let stale = store
        .git
        .as_ref()
        .map(|g| now_secs() - g.computed_at > 120.0)
        .unwrap_or(true);
    if stale {
        store.git = Some(compute_git_insights(&path));
        let _ = save_store(&store);
    }
    Ok(snapshot_from_store(&store))
}

#[tauri::command]
pub async fn scan_project_loc(
    project_path: Option<String>,
    app_state: tauri::State<'_, AppState>,
) -> Result<ProjectStatsSnapshot, AppError> {
    let path = resolve_project(&app_state, project_path)?;
    let custom = load_store(&path).custom_ignore;
    let path_clone = path.clone();
    let custom_clone = custom.clone();
    let report = tauri::async_runtime::spawn_blocking(move || scan_loc(&path_clone, &custom_clone))
        .await
        .map_err(|e| AppError::Message(format!("Scan task failed: {e}")))??;

    let mut store = load_store(&path);
    store.custom_ignore = custom;
    store.loc = Some(report);
    save_store(&store)?;
    Ok(snapshot_from_store(&store))
}

#[tauri::command]
pub fn set_stats_custom_ignore(
    ignore: Vec<String>,
    project_path: Option<String>,
    app_state: tauri::State<'_, AppState>,
) -> Result<ProjectStatsSnapshot, AppError> {
    let path = resolve_project(&app_state, project_path)?;
    let mut store = load_store(&path);
    store.custom_ignore = ignore
        .into_iter()
        .map(|s| s.trim().trim_matches(|c| c == '/' || c == '\\').to_string())
        .filter(|s| !s.is_empty())
        .collect();
    // Dedupe case-insensitively
    let mut seen = std::collections::HashSet::new();
    store.custom_ignore.retain(|s| seen.insert(s.to_ascii_lowercase()));
    save_store(&store)?;
    Ok(snapshot_from_store(&store))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDelta {
    pub coding_ms: Option<u64>,
    pub ai_generating_ms: Option<u64>,
    pub focused_ms: Option<u64>,
}

#[tauri::command]
pub fn record_project_activity(
    delta: ActivityDelta,
    project_path: Option<String>,
    app_state: tauri::State<'_, AppState>,
) -> Result<ActivityTotals, AppError> {
    let path = resolve_project(&app_state, project_path)?;
    let mut store = load_store(&path);
    store.activity.coding_ms = store
        .activity
        .coding_ms
        .saturating_add(delta.coding_ms.unwrap_or(0).min(120_000));
    store.activity.ai_generating_ms = store
        .activity
        .ai_generating_ms
        .saturating_add(delta.ai_generating_ms.unwrap_or(0).min(120_000));
    store.activity.focused_ms = store
        .activity
        .focused_ms
        .saturating_add(delta.focused_ms.unwrap_or(0).min(120_000));
    store.activity.updated_at = now_secs();
    save_store(&store)?;
    Ok(store.activity)
}
