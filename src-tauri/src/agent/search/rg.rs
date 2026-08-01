//! Shared ripgrep search for hybrid retrieval.

use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone)]
pub struct RgHit {
    pub file: String,
    pub line: usize,
    pub excerpt: String,
}

const SKIP_ARGS: &[&str] = &[
    "-g", "!node_modules",
    "-g", "!.git",
    "-g", "!target",
    "-g", "!dist",
    "-g", "!build",
    "-g", "!.next",
];

/// Run ripgrep and return top file:line hits with short excerpts.
pub fn rg_search(project_path: &str, query: &str, top_k: usize) -> Vec<RgHit> {
    if query.trim().is_empty() || !Path::new(project_path).exists() {
        return vec![];
    }

    let mut cmd = Command::new("rg");
    cmd.arg("-n")
        .arg("--no-heading")
        .arg("--color=never")
        .arg("-m")
        .arg("3")
        .arg("-F")
        .arg(query)
        .arg(project_path);
    for arg in SKIP_ARGS {
        cmd.arg(arg);
    }

    let output = match cmd.output() {
        Ok(o) => o,
        Err(_) => return git_grep_fallback(project_path, query, top_k),
    };

    if !output.status.success() && output.status.code() != Some(1) {
        return git_grep_fallback(project_path, query, top_k);
    }

    parse_rg_output(project_path, &output.stdout, top_k)
}

fn parse_rg_output(project_root: &str, stdout: &[u8], top_k: usize) -> Vec<RgHit> {
    let root = Path::new(project_root);
    let text = String::from_utf8_lossy(stdout);
    let mut hits = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for line in text.lines() {
        let Some((path_part, rest)) = line.split_once(':') else {
            continue;
        };
        let Some((line_str, excerpt)) = rest.split_once(':') else {
            continue;
        };
        let Ok(line_num) = line_str.parse::<usize>() else {
            continue;
        };
        let rel = Path::new(path_part)
            .strip_prefix(root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| path_part.replace('\\', "/"));
        let key = format!("{rel}:{line_num}");
        if !seen.insert(key) {
            continue;
        }
        hits.push(RgHit {
            file: rel,
            line: line_num,
            excerpt: excerpt.trim().to_string(),
        });
        if hits.len() >= top_k {
            break;
        }
    }
    hits
}

fn git_grep_fallback(project_path: &str, query: &str, top_k: usize) -> Vec<RgHit> {
    let output = crate::core::git_bin::git_command()
        .and_then(|mut cmd| Ok(cmd.args(["-C", project_path, "grep", "-n", "-I", query]).output()?));
    let Ok(output) = output else {
        return vec![];
    };
    if !output.status.success() {
        return vec![];
    }
    parse_rg_output(project_path, &output.stdout, top_k)
}
