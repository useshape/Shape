use super::{OutlineSymbol, SymbolKind};
use crate::core::error::AppError;
use std::collections::HashMap;
use tree_sitter::{InputEdit, Node, Parser, Point, Tree};

const MAX_SYMBOLS: usize = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OutlineLanguage {
    TypeScript,
    Tsx,
    JavaScript,
    Jsx,
    Json,
    Css,
    Markdown,
    Html,
    Yaml,
    Python,
    Rust,
    Go,
    Java,
    C,
    Cpp,
    Toml,
    Unknown,
}

#[derive(Debug, Clone)]
pub struct ParseRequest {
    pub file_path: String,
    pub content: String,
    pub extension: String,
}

#[derive(Debug, Clone)]
pub struct ParseResult {
    pub symbols: Vec<OutlineSymbol>,
    pub total_symbols: usize,
    pub truncated: bool,
}

#[derive(Debug, Clone)]
struct RawSymbol {
    name: String,
    kind: SymbolKind,
    start_byte: usize,
    end_byte: usize,
    start_point: Point,
    end_point: Point,
}

#[derive(Debug, Clone)]
struct CachedDocument {
    language: OutlineLanguage,
    content: String,
    tree: Tree,
}

#[derive(Default)]
pub struct OutlineEngine {
    parsers: HashMap<OutlineLanguage, Parser>,
    documents: HashMap<String, CachedDocument>,
}

impl OutlineEngine {
    pub fn parse_document(&mut self, request: ParseRequest) -> Result<ParseResult, AppError> {
        let language = language_from_extension(&request.extension);
        if language == OutlineLanguage::Unknown {
            return Ok(ParseResult {
                symbols: Vec::new(),
                total_symbols: 0,
                truncated: false,
            });
        }

        let previous = self.documents.get(&request.file_path).cloned();
        let parser = self.get_or_create_parser(language)?;

        let tree = if let Some(prev) = previous.as_ref() {
            if prev.language == language {
                let mut previous_tree = prev.tree.clone();
                let edit = compute_single_edit(&prev.content, &request.content);
                previous_tree.edit(&edit);
                parser
                    .parse(&request.content, Some(&previous_tree))
                    .ok_or_else(|| {
                        AppError::Message("tree_sitter incremental parse failed".to_string())
                    })?
            } else {
                parser
                    .parse(&request.content, None)
                    .ok_or_else(|| AppError::Message("tree_sitter parse failed".to_string()))?
            }
        } else {
            parser
                .parse(&request.content, None)
                .ok_or_else(|| AppError::Message("tree_sitter parse failed".to_string()))?
        };

        self.documents.insert(
            request.file_path,
            CachedDocument {
                language,
                content: request.content.clone(),
                tree: tree.clone(),
            },
        );

        let mut raw_symbols = Vec::new();
        let mut truncated = false;
        collect_symbols(
            tree.root_node(),
            None,
            request.content.as_bytes(),
            language,
            &mut raw_symbols,
            &mut truncated,
        );

        let total_symbols = raw_symbols.len();
        let symbols = build_hierarchy(raw_symbols);

        Ok(ParseResult {
            symbols,
            total_symbols,
            truncated,
        })
    }

    fn get_or_create_parser(&mut self, language: OutlineLanguage) -> Result<&mut Parser, AppError> {
        use std::collections::hash_map::Entry;

        let grammar = grammar_for(language)?;
        match self.parsers.entry(language) {
            Entry::Occupied(entry) => Ok(entry.into_mut()),
            Entry::Vacant(entry) => {
                let mut parser = Parser::new();
                parser.set_language(&grammar).map_err(|e| {
                    AppError::Message(format!("failed to set parser language: {e}"))
                })?;
                Ok(entry.insert(parser))
            }
        }
    }
}

fn language_from_extension(extension: &str) -> OutlineLanguage {
    match extension.trim().to_ascii_lowercase().as_str() {
        "ts" => OutlineLanguage::TypeScript,
        "tsx" => OutlineLanguage::Tsx,
        "js" => OutlineLanguage::JavaScript,
        "jsx" => OutlineLanguage::Jsx,
        "json" => OutlineLanguage::Json,
        "css" => OutlineLanguage::Css,
        "md" | "markdown" => OutlineLanguage::Markdown,
        "html" | "htm" => OutlineLanguage::Html,
        "yml" | "yaml" => OutlineLanguage::Yaml,
        "py" => OutlineLanguage::Python,
        "rs" => OutlineLanguage::Rust,
        "go" => OutlineLanguage::Go,
        "java" => OutlineLanguage::Java,
        "c" | "h" => OutlineLanguage::C,
        "cc" | "cpp" | "cxx" | "hpp" | "hh" => OutlineLanguage::Cpp,
        "toml" => OutlineLanguage::Toml,
        _ => OutlineLanguage::Unknown,
    }
}

fn grammar_for(language: OutlineLanguage) -> Result<tree_sitter::Language, AppError> {
    let lang = match language {
        OutlineLanguage::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
        OutlineLanguage::Tsx => tree_sitter_typescript::LANGUAGE_TSX.into(),
        OutlineLanguage::JavaScript => tree_sitter_javascript::LANGUAGE.into(),
        OutlineLanguage::Jsx => tree_sitter_javascript::LANGUAGE.into(),
        OutlineLanguage::Json => tree_sitter_json::LANGUAGE.into(),
        OutlineLanguage::Css => tree_sitter_css::LANGUAGE.into(),
        OutlineLanguage::Markdown => tree_sitter_md::LANGUAGE.into(),
        OutlineLanguage::Html => tree_sitter_html::LANGUAGE.into(),
        OutlineLanguage::Yaml => tree_sitter_yaml::LANGUAGE.into(),
        OutlineLanguage::Python => tree_sitter_python::LANGUAGE.into(),
        OutlineLanguage::Rust => tree_sitter_rust::LANGUAGE.into(),
        OutlineLanguage::Go => tree_sitter_go::LANGUAGE.into(),
        OutlineLanguage::Java => tree_sitter_java::LANGUAGE.into(),
        OutlineLanguage::C => tree_sitter_c::LANGUAGE.into(),
        OutlineLanguage::Cpp => tree_sitter_cpp::LANGUAGE.into(),
        OutlineLanguage::Toml => tree_sitter_toml_ng::LANGUAGE.into(),
        OutlineLanguage::Unknown => {
            return Err(AppError::Message("unsupported language".to_string()))
        }
    };
    Ok(lang)
}

fn collect_symbols(
    node: Node<'_>,
    parent_kind: Option<&str>,
    source: &[u8],
    language: OutlineLanguage,
    out: &mut Vec<RawSymbol>,
    truncated: &mut bool,
) {
    if out.len() >= MAX_SYMBOLS {
        *truncated = true;
        return;
    }

    if let Some((kind, name)) = symbol_from_node(node, parent_kind, source, language) {
        if !name.is_empty() && node.end_byte() > node.start_byte() {
            out.push(RawSymbol {
                name,
                kind,
                start_byte: node.start_byte(),
                end_byte: node.end_byte(),
                start_point: node.start_position(),
                end_point: node.end_position(),
            });
        }
    }

    let current_kind = node.kind();
    let child_count = node.child_count();
    for i in 0..child_count {
        if let Some(child) = node.child(i as u32) {
            collect_symbols(child, Some(current_kind), source, language, out, truncated);
            if out.len() >= MAX_SYMBOLS {
                *truncated = true;
                return;
            }
        }
    }
}

fn symbol_from_node(
    node: Node<'_>,
    parent_kind: Option<&str>,
    source: &[u8],
    language: OutlineLanguage,
) -> Option<(SymbolKind, String)> {
    let kind = node.kind();

    match kind {
        // top-level declarations
        "function_declaration" | "function_item" | "function_definition" => {
            return extract_name(node, source).map(|name| (SymbolKind::Function, name));
        }
        "class_declaration" | "class_definition" | "class_specifier" => {
            return extract_name(node, source).map(|name| (SymbolKind::Class, name));
        }
        "interface_declaration" => {
            return extract_name(node, source).map(|name| (SymbolKind::Interface, name));
        }
        "type_alias_declaration" | "type_definition" => {
            return extract_name(node, source).map(|name| (SymbolKind::Type, name));
        }
        "enum_declaration" | "enum_specifier" => {
            return extract_name(node, source).map(|name| (SymbolKind::Enum, name));
        }
        // nested members
        "method_definition" | "method_signature" | "method_declaration" => {
            return extract_name(node, source).map(|name| (SymbolKind::Method, name));
        }
        "public_field_definition" | "field_definition" | "field_declaration" => {
            return extract_name(node, source).map(|name| (SymbolKind::Field, name));
        }
        "property_signature" => {
            return extract_name(node, source).map(|name| (SymbolKind::Property, name));
        }
        "enum_assignment" | "enum_variant" => {
            return extract_name(node, source).map(|name| (SymbolKind::Field, name));
        }
        // declarations with identifiers
        "const_item" => {
            return extract_name(node, source).map(|name| (SymbolKind::Constant, name));
        }
        "let_declaration" | "short_var_declaration" => {
            return extract_name(node, source).map(|name| (SymbolKind::Variable, name));
        }
        "variable_declarator" => {
            if let Some(parent) = parent_kind {
                let p = parent.to_ascii_lowercase();
                let sym_kind = if p.contains("lexical_declaration")
                    || p.contains("const")
                    || p.contains("const_statement")
                {
                    SymbolKind::Constant
                } else {
                    SymbolKind::Variable
                };
                return extract_name(node, source).map(|name| (sym_kind, name));
            }
            return extract_name(node, source).map(|name| (SymbolKind::Variable, name));
        }
        // JSON / object-like
        "pair" => {
            return extract_name(node, source).map(|name| (SymbolKind::Property, name));
        }
        // CSS
        "rule_set" | "style_rule" | "qualified_rule" => {
            return extract_name(node, source).map(|name| (SymbolKind::Selector, name));
        }
        "declaration" => {
            if language == OutlineLanguage::Css {
                return extract_name(node, source).map(|name| (SymbolKind::Property, name));
            }
        }
        // Markdown
        "atx_heading" | "setext_heading" => {
            return extract_name(node, source).map(|name| (SymbolKind::Heading, name));
        }
        _ => {}
    }

    None
}

fn extract_name(node: Node<'_>, source: &[u8]) -> Option<String> {
    let direct_fields = [
        "name",
        "key",
        "property",
        "declarator",
        "label",
        "type",
        "selector",
        "selectors",
    ];

    for field in direct_fields {
        if let Some(named) = node.child_by_field_name(field) {
            let text = node_text(named, source);
            if !text.is_empty() {
                return Some(clean_name(&text));
            }
        }
    }

    let fallback_child_kinds = [
        "identifier",
        "type_identifier",
        "property_identifier",
        "field_identifier",
        "shorthand_property_identifier",
        "shorthand_property_identifier_pattern",
        "string",
    ];

    let child_count = node.child_count();
    for i in 0..child_count {
        if let Some(child) = node.child(i as u32) {
            if fallback_child_kinds.contains(&child.kind()) {
                let text = node_text(child, source);
                if !text.is_empty() {
                    return Some(clean_name(&text));
                }
            }
        }
    }

    let text = node_text(node, source);
    if text.is_empty() {
        return None;
    }
    Some(clean_name(&text))
}

fn clean_name(raw: &str) -> String {
    raw.replace('\n', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_matches('"')
        .trim_matches('\'')
        .trim()
        .to_string()
}

fn node_text(node: Node<'_>, source: &[u8]) -> String {
    node.utf8_text(source)
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

fn build_hierarchy(mut symbols: Vec<RawSymbol>) -> Vec<OutlineSymbol> {
    if symbols.is_empty() {
        return Vec::new();
    }

    symbols.sort_unstable_by(|a, b| {
        if a.start_byte == b.start_byte {
            b.end_byte.cmp(&a.end_byte)
        } else {
            a.start_byte.cmp(&b.start_byte)
        }
    });

    struct TempNode {
        symbol: OutlineSymbol,
        start_byte: usize,
        end_byte: usize,
        parent: Option<usize>,
        children: Vec<usize>,
    }

    let mut temp = Vec::<TempNode>::with_capacity(symbols.len());
    let mut stack = Vec::<usize>::new();

    for (idx, raw) in symbols.into_iter().enumerate() {
        while let Some(parent_idx) = stack.last().copied() {
            let parent = &temp[parent_idx];
            if contains_range(
                parent.start_byte,
                parent.end_byte,
                raw.start_byte,
                raw.end_byte,
            ) {
                break;
            }
            stack.pop();
        }

        let parent = stack.last().copied();
        let symbol = OutlineSymbol {
            id: format!(
                "sym-{idx}-{}-{}",
                raw.start_point.row + 1,
                raw.start_point.column + 1
            ),
            name: raw.name,
            kind: raw.kind.as_str().to_string(),
            start_line: raw.start_point.row + 1,
            start_col: raw.start_point.column + 1,
            end_line: raw.end_point.row + 1,
            end_col: raw.end_point.column + 1,
            children: Vec::new(),
        };

        let next_index = temp.len();
        temp.push(TempNode {
            symbol,
            start_byte: raw.start_byte,
            end_byte: raw.end_byte,
            parent,
            children: Vec::new(),
        });

        if let Some(parent_index) = parent {
            temp[parent_index].children.push(next_index);
        }

        stack.push(next_index);
    }

    fn build_node(index: usize, nodes: &[TempNode]) -> OutlineSymbol {
        let mut symbol = nodes[index].symbol.clone();
        symbol.children = nodes[index]
            .children
            .iter()
            .map(|child_index| build_node(*child_index, nodes))
            .collect();
        symbol
    }

    temp.iter()
        .enumerate()
        .filter_map(|(index, node)| {
            if node.parent.is_none() {
                Some(build_node(index, &temp))
            } else {
                None
            }
        })
        .collect()
}

fn contains_range(
    container_start: usize,
    container_end: usize,
    candidate_start: usize,
    candidate_end: usize,
) -> bool {
    container_start <= candidate_start
        && container_end >= candidate_end
        && (container_start != candidate_start || container_end != candidate_end)
}

fn compute_single_edit(old_content: &str, new_content: &str) -> InputEdit {
    let old_bytes = old_content.as_bytes();
    let new_bytes = new_content.as_bytes();

    let mut prefix = 0usize;
    let min_len = old_bytes.len().min(new_bytes.len());
    while prefix < min_len && old_bytes[prefix] == new_bytes[prefix] {
        prefix += 1;
    }

    let mut old_suffix = old_bytes.len();
    let mut new_suffix = new_bytes.len();
    while old_suffix > prefix
        && new_suffix > prefix
        && old_bytes[old_suffix - 1] == new_bytes[new_suffix - 1]
    {
        old_suffix -= 1;
        new_suffix -= 1;
    }

    InputEdit {
        start_byte: prefix,
        old_end_byte: old_suffix,
        new_end_byte: new_suffix,
        start_position: byte_to_point(old_bytes, prefix),
        old_end_position: byte_to_point(old_bytes, old_suffix),
        new_end_position: byte_to_point(new_bytes, new_suffix),
    }
}

fn byte_to_point(content: &[u8], byte_index: usize) -> Point {
    let mut row = 0usize;
    let mut col = 0usize;
    let limit = byte_index.min(content.len());
    for byte in &content[..limit] {
        if *byte == b'\n' {
            row += 1;
            col = 0;
        } else {
            col += 1;
        }
    }
    Point { row, column: col }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn test_outline_engine_parsing_benchmark() {
        let mut engine = OutlineEngine::default();
        let file_path = "benchmark_file.ts".to_string();

        // 1. Prepare text sizes: 100, 1000, 10000 lines
        let small_content = "function add(a: number, b: number) { return a + b; }\n".repeat(10);
        let medium_content = "function add(a: number, b: number) { return a + b; }\n".repeat(100);
        let large_content = "function add(a: number, b: number) { return a + b; }\n".repeat(1000);

        // Benchmark Small (100 lines) - Initial Parse
        let start = Instant::now();
        let _ = engine.parse_document(ParseRequest {
            file_path: file_path.clone(),
            content: small_content.clone(),
            extension: "ts".to_string(),
        }).unwrap();
        let init_small_duration = start.elapsed();

        // Benchmark Small (100 lines) - Incremental Edit
        let edit_small_content = format!("{}function sub(a: number, b: number) {{ return a - b; }}\n", small_content);
        let start = Instant::now();
        let _ = engine.parse_document(ParseRequest {
            file_path: file_path.clone(),
            content: edit_small_content,
            extension: "ts".to_string(),
        }).unwrap();
        let incr_small_duration = start.elapsed();

        // Reset engine for Medium
        let mut engine = OutlineEngine::default();
        // Benchmark Medium (1,000 lines) - Initial Parse
        let start = Instant::now();
        let _ = engine.parse_document(ParseRequest {
            file_path: file_path.clone(),
            content: medium_content.clone(),
            extension: "ts".to_string(),
        }).unwrap();
        let init_medium_duration = start.elapsed();

        // Benchmark Medium (1,000 lines) - Incremental Edit
        let edit_medium_content = format!("{}function sub(a: number, b: number) {{ return a - b; }}\n", medium_content);
        let start = Instant::now();
        let _ = engine.parse_document(ParseRequest {
            file_path: file_path.clone(),
            content: edit_medium_content,
            extension: "ts".to_string(),
        }).unwrap();
        let incr_medium_duration = start.elapsed();

        // Reset engine for Large
        let mut engine = OutlineEngine::default();
        // Benchmark Large (10,000 lines) - Initial Parse
        let start = Instant::now();
        let _ = engine.parse_document(ParseRequest {
            file_path: file_path.clone(),
            content: large_content.clone(),
            extension: "ts".to_string(),
        }).unwrap();
        let init_large_duration = start.elapsed();

        // Benchmark Large (10,000 lines) - Incremental Edit
        let edit_large_content = format!("{}function sub(a: number, b: number) {{ return a - b; }}\n", large_content);
        let start = Instant::now();
        let _ = engine.parse_document(ParseRequest {
            file_path: file_path.clone(),
            content: edit_large_content,
            extension: "ts".to_string(),
        }).unwrap();
        let incr_large_duration = start.elapsed();

        println!("\n=== SHAPE AST PARSING BENCHMARK RESULTS ===");
        println!("100 Lines   | Initial Parse: {:?} | Incremental Parse: {:?}", init_small_duration, incr_small_duration);
        println!("1,000 Lines | Initial Parse: {:?} | Incremental Parse: {:?}", init_medium_duration, incr_medium_duration);
        println!("10,000 Lines| Initial Parse: {:?} | Incremental Parse: {:?}", init_large_duration, incr_large_duration);
        println!("============================================\n");
    }
}

