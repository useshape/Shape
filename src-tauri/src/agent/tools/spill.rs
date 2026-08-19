/// Spill large tool outputs to `.shape/agent-out/` for dynamic context discovery
/// (Cursor-style: files as memory instead of silent truncation).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// Spill when tool/terminal output exceeds this many characters.
pub const SPILL_THRESHOLD: usize = 10_000;
/// Characters of head+tail kept in the in-context excerpt.
const EXCERPT_HEAD: usize = 2_000;
const EXCERPT_TAIL: usize = 1_500;

static SPILL_SEQ: AtomicU64 = AtomicU64::new(1);

fn agent_out_dir(project_path: &str) -> PathBuf {
    Path::new(project_path).join(".shape").join("agent-out")
}

fn next_spill_name(prefix: &str) -> String {
    let n = SPILL_SEQ.fetch_add(1, Ordering::Relaxed);
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{prefix}-{ts}-{n}.txt")
}

/// If `content` is large, write full text under `.shape/agent-out/` and return an
/// excerpt that points the agent at the spill file. Small content is returned as-is.
pub fn maybe_spill_tool_output(
    project_path: &str,
    tool_name: &str,
    content: &str,
) -> String {
    if project_path.is_empty() || content.len() <= SPILL_THRESHOLD {
        return content.to_string();
    }

    let dir = agent_out_dir(project_path);
    if fs::create_dir_all(&dir).is_err() {
        return truncate_inplace(content);
    }

    let filename = next_spill_name(tool_name);
    let abs = dir.join(&filename);
    if fs::write(&abs, content).is_err() {
        return truncate_inplace(content);
    }

    let rel = format!(".shape/agent-out/{filename}");
    let head: String = content.chars().take(EXCERPT_HEAD).collect();
    let tail: String = content
        .chars()
        .rev()
        .take(EXCERPT_TAIL)
        .collect::<String>()
        .chars()
        .rev()
        .collect();

    format!(
        "{head}\n\n…[{} chars total; full output spilled to `{rel}` — use read_file or grep on that path if you need more]…\n\n{tail}",
        content.len()
    )
}

/// Write a pre-compaction transcript so the agent can recover details after summarization.
pub fn spill_history_transcript(project_path: &str, transcript: &str) -> Option<String> {
    if project_path.is_empty() || transcript.is_empty() {
        return None;
    }
    let dir = agent_out_dir(project_path);
    fs::create_dir_all(&dir).ok()?;
    let filename = next_spill_name("history");
    let abs = dir.join(&filename);
    fs::write(&abs, transcript).ok()?;
    Some(format!(".shape/agent-out/{filename}"))
}

fn truncate_inplace(content: &str) -> String {
    let head: String = content.chars().take(EXCERPT_HEAD).collect();
    let tail: String = content
        .chars()
        .rev()
        .take(EXCERPT_TAIL)
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    format!(
        "{head}\n\n…[truncated — spill unavailable; {} chars total]…\n\n{tail}",
        content.len()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_output_not_spilled() {
        let out = maybe_spill_tool_output("/tmp/proj", "run_terminal", "hello");
        assert_eq!(out, "hello");
    }
}
