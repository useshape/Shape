/// Deterministic resolver for Aider-style edits with SEARCH/REPLACE blocks.
///
/// The model emits one or more blocks formatted like:
/// ```text
/// <<<<<<< SEARCH
/// existing code...
/// =======
/// new code...
/// >>>>>>> REPLACE
/// ```
///
/// This resolver tries to splice the edits sequentially.
/// 1. Exact string match
/// 2. Whitespace-normalized match
/// 3. Trailing-whitespace-insensitive line match
/// 4. Unique first+last line anchor (for 3+ line blocks)
/// If no match or ambiguous match, returns an Error with feedback for the model.

pub fn resolve(original_text: &str, code_edit_text: &str) -> Result<String, String> {
    let original_text = original_text.replace("\r\n", "\n");
    let code_edit_text = code_edit_text.replace("\r\n", "\n");

    let blocks = parse_blocks(&code_edit_text);
    if blocks.is_empty() {
        if code_edit_text.lines().any(|l| l.starts_with("<<<<<<< SEARCH")) {
            return Err(
                "Incomplete SEARCH/REPLACE block. Each block must include `<<<<<<< SEARCH`, \
`=======`, and `>>>>>>> REPLACE` markers. Do not leave REPLACE empty unless you intend to delete the matched region."
                    .to_string(),
            );
        }
        return Err("No `<<<<<<< SEARCH` blocks found in the edit. You must use the search/replace block format.".to_string());
    }

    let mut out = original_text.clone();

    for block in blocks {
        let search_lines = trim_block_edges(&block.search);
        let replace_lines = block.replace.clone();
        let search_str = search_lines.join("\n");
        let replace_str = replace_lines.join("\n");

        if search_lines.is_empty() && replace_lines.is_empty() {
            continue;
        }

        // 1. Exact match
        let matches: Vec<_> = out.match_indices(&search_str).collect();
        if matches.len() == 1 {
            let pos = matches[0].0;
            out.replace_range(pos..pos + search_str.len(), &replace_str);
            continue;
        } else if matches.len() > 1 {
            return Err(format!(
                "The SEARCH block matched {} times. Provide more context lines to make it unique.",
                matches.len()
            ));
        }

        // 2–4. Line-based fuzzy matches
        match apply_line_match(&out, &search_lines, &replace_lines, &original_text) {
            Ok(next) => {
                out = next;
                continue;
            }
            Err(msg) if msg.starts_with("AMBIGUOUS:") => {
                return Err(msg.trim_start_matches("AMBIGUOUS:").trim().to_string());
            }
            Err(_) => {
                return Err(format!(
                    "The SEARCH block was not found in the file. Ensure you copied the original code exactly.\nSEARCH block was:\n```\n{}\n```",
                    search_str
                ));
            }
        }
    }

    Ok(out)
}

fn trim_block_edges<'a>(lines: &[&'a str]) -> Vec<&'a str> {
    let mut out: Vec<&str> = lines.to_vec();
    while out.first().is_some_and(|l| l.trim().is_empty()) {
        out.remove(0);
    }
    while out.last().is_some_and(|l| l.trim().is_empty()) {
        out.pop();
    }
    out
}

fn apply_line_match(
    out: &str,
    search: &[&str],
    replace: &[&str],
    original_text: &str,
) -> Result<String, String> {
    let out_lines: Vec<&str> = out.lines().collect();
    if search.is_empty() {
        return Err("empty search".into());
    }

    // 2. Whitespace-normalized
    if let Some(idx) = unique_window_match(&out_lines, search, MatchMode::Whitespace) {
        return Ok(splice_lines(&out_lines, idx, search.len(), replace, original_text));
    }

    // 3. Trim trailing whitespace per line
    if let Some(idx) = unique_window_match(&out_lines, search, MatchMode::TrimEnd) {
        return Ok(splice_lines(&out_lines, idx, search.len(), replace, original_text));
    }

    // 4. First+last anchor when block is long enough
    if search.len() >= 3 {
        if let Some(idx) = unique_anchor_match(&out_lines, search) {
            return Ok(splice_lines(&out_lines, idx, search.len(), replace, original_text));
        }
    }

    Err("no match".into())
}

#[derive(Clone, Copy)]
enum MatchMode {
    Whitespace,
    TrimEnd,
}

fn unique_window_match(out_lines: &[&str], search: &[&str], mode: MatchMode) -> Option<usize> {
    let mut matched_idx = None;
    let mut matched_count = 0usize;
    if search.is_empty() || out_lines.len() < search.len() {
        return None;
    }
    for i in 0..=out_lines.len().saturating_sub(search.len()) {
        let mut ok = true;
        for (j, search_line) in search.iter().enumerate() {
            let a = out_lines[i + j];
            let b = *search_line;
            let matches = match mode {
                MatchMode::Whitespace => lines_match(a, b),
                MatchMode::TrimEnd => a.trim_end() == b.trim_end() || lines_match(a, b),
            };
            if !matches {
                ok = false;
                break;
            }
        }
        if ok {
            matched_idx = Some(i);
            matched_count += 1;
            if matched_count > 1 {
                return None;
            }
        }
    }
    if matched_count == 1 {
        matched_idx
    } else {
        None
    }
}

fn unique_anchor_match(out_lines: &[&str], search: &[&str]) -> Option<usize> {
    let first = *search.first()?;
    let last = *search.last()?;
    let mut hits = Vec::new();
    for i in 0..=out_lines.len().saturating_sub(search.len()) {
        if !lines_match(out_lines[i], first) && out_lines[i].trim_end() != first.trim_end() {
            continue;
        }
        let end = i + search.len() - 1;
        if !lines_match(out_lines[end], last) && out_lines[end].trim_end() != last.trim_end() {
            continue;
        }
        // Require at least half of the middle lines to match loosely
        let mut mid_ok = 0usize;
        let mut mid_total = 0usize;
        for (j, search_line) in search.iter().enumerate().skip(1).take(search.len().saturating_sub(2)) {
            mid_total += 1;
            if lines_match(out_lines[i + j], search_line)
                || out_lines[i + j].trim_end() == search_line.trim_end()
            {
                mid_ok += 1;
            }
        }
        if mid_total == 0 || mid_ok * 2 >= mid_total {
            hits.push(i);
        }
    }
    if hits.len() == 1 {
        Some(hits[0])
    } else {
        None
    }
}

fn splice_lines(
    out_lines: &[&str],
    start_idx: usize,
    search_len: usize,
    replace: &[&str],
    original_text: &str,
) -> String {
    let end_idx = start_idx + search_len;
    let mut new_lines = out_lines[..start_idx].to_vec();
    for rline in replace {
        new_lines.push(*rline);
    }
    new_lines.extend_from_slice(&out_lines[end_idx..]);
    let mut out = new_lines.join("\n");
    if original_text.ends_with('\n') && !out.ends_with('\n') {
        out.push('\n');
    }
    out
}

#[derive(Debug)]
struct EditBlock<'a> {
    search: Vec<&'a str>,
    replace: Vec<&'a str>,
}

fn parse_blocks<'a>(edit_text: &'a str) -> Vec<EditBlock<'a>> {
    let mut blocks = Vec::new();
    let lines: Vec<&str> = edit_text.lines().collect();
    let mut i = 0;
    while i < lines.len() {
        if lines[i].starts_with("<<<<<<< SEARCH") {
            let mut search = Vec::new();
            i += 1;
            while i < lines.len() && !lines[i].starts_with("=======") {
                // Incomplete: another SEARCH before separator.
                if lines[i].starts_with("<<<<<<< SEARCH") {
                    break;
                }
                search.push(lines[i]);
                i += 1;
            }
            // Require a complete block: ======= separator and >>>>>>> REPLACE closer.
            if i >= lines.len() || !lines[i].starts_with("=======") {
                // Incomplete block — skip so resolve() can error clearly.
                // Push a sentinel empty block that resolve will reject via incomplete check.
                return Vec::new(); // signal incomplete via empty + marker presence
            }
            let mut replace = Vec::new();
            i += 1; // skip =======
            let mut closed = false;
            while i < lines.len() {
                if lines[i].starts_with(">>>>>>> REPLACE") {
                    closed = true;
                    break;
                }
                if lines[i].starts_with("<<<<<<< SEARCH") {
                    // Nested SEARCH without closing previous — incomplete.
                    return Vec::new();
                }
                replace.push(lines[i]);
                i += 1;
            }
            if !closed {
                return Vec::new();
            }
            blocks.push(EditBlock { search, replace });
        }
        i += 1;
    }
    blocks
}

/// Returns true when the edit text contains SEARCH markers but no complete blocks.
pub fn has_incomplete_search_blocks(edit_text: &str) -> bool {
    let text = edit_text.replace("\r\n", "\n");
    if !text.lines().any(|l| l.starts_with("<<<<<<< SEARCH")) {
        return false;
    }
    parse_blocks(&text).is_empty()
}

fn lines_match(a: &str, b: &str) -> bool {
    if a == b {
        return true;
    }
    let a_norm = a.split_whitespace().collect::<Vec<_>>().join(" ");
    let b_norm = b.split_whitespace().collect::<Vec<_>>().join(" ");
    a_norm == b_norm
}

pub fn is_marker_line_pub(line: &str) -> bool {
    line.starts_with("<<<<<<< SEARCH") || line.starts_with("=======") || line.starts_with(">>>>>>> REPLACE")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_match_replacement() {
        let orig = "fn a() {\n  let x = 1;\n}\n";
        let edit = "<<<<<<< SEARCH\n  let x = 1;\n=======\n  let x = 2;\n>>>>>>> REPLACE\n";
        let out = resolve(orig, edit).unwrap();
        assert!(out.contains("let x = 2;"));
    }

    #[test]
    fn whitespace_match_replacement() {
        let orig = "fn a() {\n  let x = 1;\n}\n";
        // Edit has different indentation
        let edit = "<<<<<<< SEARCH\nlet x = 1;\n=======\nlet x = 2;\n>>>>>>> REPLACE\n";
        let out = resolve(orig, edit).unwrap();
        assert!(out.contains("let x = 2;"));
    }

    #[test]
    fn trailing_whitespace_and_blank_edge_match() {
        let orig = "fn a() {\n  let x = 1;  \n  let y = 2;\n}\n";
        let edit = "<<<<<<< SEARCH\n\n  let x = 1;\n  let y = 2;\n\n=======\n  let x = 9;\n  let y = 2;\n>>>>>>> REPLACE\n";
        let out = resolve(orig, edit).unwrap();
        assert!(out.contains("let x = 9;"));
    }

    #[test]
    fn first_last_anchor_match() {
        let orig = "a\nb\nc\ne\n";
        let edit = "<<<<<<< SEARCH\na\nb\nWRONG\ne\n=======\na\nb\nZZ\ne\n>>>>>>> REPLACE\n";
        let out = resolve(orig, edit).unwrap();
        assert!(out.contains("ZZ"));
    }

    #[test]
    fn incomplete_block_rejected() {
        let orig = "fn a() {\n  let x = 1;\n}\n";
        let edit = "<<<<<<< SEARCH\n  let x = 1;\n=======\n  let x = 2;\n";
        let err = resolve(orig, edit).unwrap_err();
        assert!(err.contains("Incomplete"));
    }

    #[test]
    fn has_incomplete_search_blocks_detects() {
        assert!(has_incomplete_search_blocks(
            "<<<<<<< SEARCH\nfoo\n=======\nbar\n"
        ));
        assert!(!has_incomplete_search_blocks(
            "<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE\n"
        ));
    }
}
