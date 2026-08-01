//! Post-edit syntax checking via tree-sitter ERROR/MISSING nodes.
//!
//! Runs synchronously on the merged file content so `edit_file` / `create_file`
//! tool results can surface parse errors for the agent to fix without waiting
//! for the user or for Monaco/LSP round-trips.

use std::path::Path;
use tree_sitter::{Language, Node, Parser, TreeCursor};

const MAX_ERRORS: usize = 12;
const SNIPPET_CHARS: usize = 80;

#[derive(Debug, Clone)]
pub struct SyntaxError {
    pub line: u32,
    pub column: u32,
    pub message: String,
}

fn language_for_path(path: &str) -> Option<Language> {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    match ext.to_ascii_lowercase().as_str() {
        "ts" => Some(tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()),
        "tsx" => Some(tree_sitter_typescript::LANGUAGE_TSX.into()),
        "js" | "jsx" | "mjs" | "cjs" => Some(tree_sitter_javascript::LANGUAGE.into()),
        "rs" => Some(tree_sitter_rust::LANGUAGE.into()),
        "py" => Some(tree_sitter_python::LANGUAGE.into()),
        "go" => Some(tree_sitter_go::LANGUAGE.into()),
        "java" => Some(tree_sitter_java::LANGUAGE.into()),
        "c" | "h" => Some(tree_sitter_c::LANGUAGE.into()),
        "cpp" | "cc" | "cxx" | "hpp" => Some(tree_sitter_cpp::LANGUAGE.into()),
        "json" => Some(tree_sitter_json::LANGUAGE.into()),
        "css" | "scss" => Some(tree_sitter_css::LANGUAGE.into()),
        "html" => Some(tree_sitter_html::LANGUAGE.into()),
        "yaml" | "yml" => Some(tree_sitter_yaml::LANGUAGE.into()),
        "toml" => Some(tree_sitter_toml_ng::LANGUAGE.into()),
        _ => None,
    }
}

fn snippet(source: &str, node: Node) -> String {
    let raw = node.utf8_text(source.as_bytes()).unwrap_or("").trim();
    let one_line: String = raw.chars().map(|c| if c == '\n' || c == '\r' { ' ' } else { c }).collect();
    if one_line.chars().count() <= SNIPPET_CHARS {
        return one_line;
    }
    let truncated: String = one_line.chars().take(SNIPPET_CHARS).collect();
    format!("{}…", truncated)
}

fn collect_errors(source: &str, root: Node, out: &mut Vec<SyntaxError>) {
    let mut cursor: TreeCursor = root.walk();
    loop {
        let node = cursor.node();
        if node.is_error() || node.is_missing() {
            let start = node.start_position();
            let kind = if node.is_missing() {
                "missing"
            } else {
                "syntax"
            };
            let detail = if node.is_missing() {
                format!("Missing {}", node.kind())
            } else {
                let snip = snippet(source, node);
                if snip.is_empty() {
                    format!("Unexpected {}", node.kind())
                } else {
                    format!("Unexpected token near `{}`", snip)
                }
            };
            out.push(SyntaxError {
                line: (start.row + 1) as u32,
                column: (start.column + 1) as u32,
                message: format!("[{}] {}", kind, detail),
            });
            if out.len() >= MAX_ERRORS {
                return;
            }
            // Don't descend into ERROR nodes — children are usually noise.
            if !cursor.goto_next_sibling() {
                loop {
                    if !cursor.goto_parent() {
                        return;
                    }
                    if cursor.goto_next_sibling() {
                        break;
                    }
                }
            }
            continue;
        }

        if cursor.goto_first_child() {
            continue;
        }
        if cursor.goto_next_sibling() {
            continue;
        }
        loop {
            if !cursor.goto_parent() {
                return;
            }
            if cursor.goto_next_sibling() {
                break;
            }
        }
    }
}

/// Parse `content` for `path`'s language and return syntax errors (empty if unsupported
/// language, empty file, or clean parse).
pub fn check_syntax(path: &str, content: &str) -> Vec<SyntaxError> {
    if content.trim().is_empty() {
        return Vec::new();
    }
    let Some(language) = language_for_path(path) else {
        return Vec::new();
    };
    let mut parser = Parser::new();
    if parser.set_language(&language).is_err() {
        return Vec::new();
    }
    let Some(tree) = parser.parse(content, None) else {
        return Vec::new();
    };
    let root = tree.root_node();
    if !root.has_error() {
        return Vec::new();
    }
    let mut errors = Vec::new();
    collect_errors(content, root, &mut errors);
    errors
}

/// Append-ready feedback block for tool results. `None` when there are no errors.
pub fn format_syntax_feedback(path: &str, errors: &[SyntaxError]) -> Option<String> {
    if errors.is_empty() {
        return None;
    }
    let mut lines = Vec::with_capacity(errors.len() + 2);
    lines.push(format!(
        "SYNTAX ERRORS in {} — fix these with another edit_file before calling finish:",
        path
    ));
    for e in errors.iter().take(MAX_ERRORS) {
        lines.push(format!("- L{}:C{}: {}", e.line, e.column, e.message));
    }
    if errors.len() > MAX_ERRORS {
        lines.push(format!("- …and {} more", errors.len() - MAX_ERRORS));
    }
    Some(format!("\n\n{}", lines.join("\n")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_js_syntax_error() {
        let errs = check_syntax("foo.js", "const x = {\n  a: 1\n");
        assert!(!errs.is_empty(), "expected syntax errors");
    }

    #[test]
    fn clean_ts_has_no_errors() {
        let errs = check_syntax("foo.ts", " const x: number = 1;\n");
        assert!(errs.is_empty());
    }

    #[test]
    fn unsupported_ext_is_empty() {
        let errs = check_syntax("notes.txt", "not {{ code");
        assert!(errs.is_empty());
    }
}
