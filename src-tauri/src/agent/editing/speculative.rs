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
/// 3. If no match or ambiguous match, returns an Error with feedback for the model.

pub fn resolve(original_text: &str, code_edit_text: &str) -> Result<String, String> {
    let original_text = original_text.replace("\r\n", "\n");
    let code_edit_text = code_edit_text.replace("\r\n", "\n");

    let blocks = parse_blocks(&code_edit_text);
    if blocks.is_empty() {
        return Err("No `<<<<<<< SEARCH` blocks found in the edit. You must use the search/replace block format.".to_string());
    }

    let mut out = original_text.clone();

    for block in blocks {
        let search_str = block.search.join("\n");
        let replace_str = block.replace.join("\n");

        if block.search.is_empty() && block.replace.is_empty() {
            continue;
        }

        // 1. Exact match
        let matches: Vec<_> = out.match_indices(&search_str).collect();
        if matches.len() == 1 {
            let pos = matches[0].0;
            out.replace_range(pos..pos+search_str.len(), &replace_str);
            continue;
        } else if matches.len() > 1 {
            return Err(format!(
                "The SEARCH block matched {} times. Provide more context lines to make it unique.",
                matches.len()
            ));
        }

        // 2. Whitespace-normalized match (fuzzy-ish)
        let out_lines: Vec<&str> = out.lines().collect();
        let mut matched_idx = None;
        let mut matched_count = 0;

        if !block.search.is_empty() {
            for i in 0..=out_lines.len().saturating_sub(block.search.len()) {
                let mut matches = true;
                for (j, search_line) in block.search.iter().enumerate() {
                    if !lines_match(out_lines[i + j], search_line) {
                        matches = false;
                        break;
                    }
                }
                if matches {
                    matched_idx = Some(i);
                    matched_count += 1;
                }
            }
        }

        if matched_count == 1 {
            let start_idx = matched_idx.unwrap();
            let end_idx = start_idx + block.search.len();

            let mut new_lines = out_lines[..start_idx].to_vec();
            for rline in &block.replace {
                new_lines.push(*rline);
            }
            new_lines.extend_from_slice(&out_lines[end_idx..]);

            out = new_lines.join("\n");
            // If the original text ended with a newline, preserve it
            if original_text.ends_with('\n') && !out.ends_with('\n') {
                out.push('\n');
            }
        } else if matched_count > 1 {
            return Err(format!(
                "The SEARCH block matched {} times (ignoring whitespace). Provide more context lines.",
                matched_count
            ));
        } else {
            return Err(format!(
                "The SEARCH block was not found in the file. Ensure you copied the original code exactly.\nSEARCH block was:\n```\n{}\n```",
                search_str
            ));
        }
    }

    Ok(out)
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
                search.push(lines[i]);
                i += 1;
            }
            let mut replace = Vec::new();
            if i < lines.len() && lines[i].starts_with("=======") {
                i += 1;
                while i < lines.len() && !lines[i].starts_with(">>>>>>> REPLACE") {
                    replace.push(lines[i]);
                    i += 1;
                }
            }
            blocks.push(EditBlock { search, replace });
        }
        i += 1;
    }
    blocks
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
}
