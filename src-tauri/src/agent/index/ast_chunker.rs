//! Structure-aware chunking via tree-sitter (cAST-inspired).
//! Budget: ~2000 non-whitespace characters per chunk.

use super::chunker::Chunk;
use std::path::Path;
use tree_sitter::{Language, Node, Parser};

pub const CHUNK_NW_CHAR_BUDGET: usize = 2000;
pub const LINE_OVERLAP: usize = 15;

fn nw_char_count(s: &str) -> usize {
    s.chars().filter(|c| !c.is_whitespace()).count()
}

fn language_for_extension(ext: &str) -> Option<Language> {
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
        "md" => Some(tree_sitter_md::LANGUAGE.into()),
        _ => None,
    }
}

fn is_chunk_root(kind: &str) -> bool {
    matches!(
        kind,
        "function_item"
            | "function_declaration"
            | "function_definition"
            | "method_definition"
            | "class_declaration"
            | "class_definition"
            | "impl_item"
            | "struct_item"
            | "enum_item"
            | "trait_item"
            | "interface_declaration"
            | "type_alias_declaration"
            | "lexical_declaration"
            | "export_statement"
            | "module"
            | "namespace_definition"
    )
}

fn node_text<'a>(node: Node, source: &'a [u8]) -> Option<&'a str> {
    node.utf8_text(source).ok()
}

fn line_range(node: &Node) -> (usize, usize) {
    let start = node.start_position().row + 1;
    let end = node.end_position().row + 1;
    (start, end.max(start))
}

fn push_chunk_from_node(
    path: &str,
    node: Node,
    source: &[u8],
    out: &mut Vec<Chunk>,
) {
    let Some(text) = node_text(node, source) else {
        return;
    };
    if text.trim().is_empty() {
        return;
    }
    let (start_line, end_line) = line_range(&node);
    out.push(Chunk {
        path: path.to_string(),
        start_line,
        end_line,
        text: text.to_string(),
    });
}

fn collect_ast_chunks(
    path: &str,
    node: Node,
    source: &[u8],
    budget: usize,
    out: &mut Vec<Chunk>,
) {
    let kind = node.kind();
    if node.is_named() && is_chunk_root(kind) {
        let text = node_text(node, source).unwrap_or("");
        if nw_char_count(text) <= budget {
            push_chunk_from_node(path, node, source, out);
            return;
        }
        let child_count = node.named_child_count();
        if child_count == 0 {
            push_chunk_from_node(path, node, source, out);
            return;
        }
        for i in 0..child_count {
            if let Some(child) = node.named_child(i as u32) {
                collect_ast_chunks(path, child, source, budget, out);
            }
        }
        return;
    }

    let mut i = 0;
    while i < node.named_child_count() {
        if let Some(child) = node.named_child(i as u32) {
            collect_ast_chunks(path, child, source, budget, out);
        }
        i += 1;
    }
}

fn sliding_window_chunks(path: &str, content: &str) -> Vec<Chunk> {
    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return vec![Chunk {
            path: path.to_string(),
            start_line: 1,
            end_line: 1,
            text: String::new(),
        }];
    }

    let mut chunks = Vec::new();
    let mut start = 0usize;

    while start < lines.len() {
        let mut end = start;
        let mut nw = 0usize;
        while end < lines.len() {
            let line_nw = nw_char_count(lines[end]);
            if end > start && nw + line_nw > CHUNK_NW_CHAR_BUDGET {
                break;
            }
            nw += line_nw;
            end += 1;
        }
        if end == start {
            end = (start + 1).min(lines.len());
        }
        let text = lines[start..end].join("\n");
        chunks.push(Chunk {
            path: path.to_string(),
            start_line: start + 1,
            end_line: end,
            text,
        });
        if end >= lines.len() {
            break;
        }
        start = end.saturating_sub(LINE_OVERLAP);
        if start >= lines.len() {
            break;
        }
    }

    chunks
}

/// Chunk a file using AST boundaries when tree-sitter supports the language,
/// otherwise fall back to sliding-window line chunking.
pub fn chunk_file_ast(path: &str, content: &str) -> Vec<Chunk> {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    let Some(lang) = language_for_extension(ext) else {
        return sliding_window_chunks(path, content);
    };

    let mut parser = Parser::new();
    if parser.set_language(&lang).is_err() {
        return sliding_window_chunks(path, content);
    }

    let tree = match parser.parse(content, None) {
        Some(t) => t,
        None => return sliding_window_chunks(path, content),
    };

    let source = content.as_bytes();
    let root = tree.root_node();
    let mut chunks = Vec::new();
    collect_ast_chunks(path, root, source, CHUNK_NW_CHAR_BUDGET, &mut chunks);

    if chunks.is_empty() {
        return sliding_window_chunks(path, content);
    }

    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rust_function_becomes_chunk() {
        let src = r#"
fn hello() {
    println!("world");
}

fn other() {
    let x = 1;
}
"#;
        let chunks = chunk_file_ast("lib.rs", src);
        assert!(chunks.len() >= 2);
        assert!(chunks.iter().any(|c| c.text.contains("hello")));
    }

    #[test]
    fn markdown_uses_sliding_window() {
        let src = "# Title\n\nSome prose.\n";
        let chunks = chunk_file_ast("readme.md", src);
        assert!(!chunks.is_empty());
    }
}
