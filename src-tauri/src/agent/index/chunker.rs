use super::ast_chunker;

#[derive(Debug, Clone)]
pub struct Chunk {
    pub path: String,
    pub start_line: usize,
    pub end_line: usize,
    pub text: String,
}

/// AST-aware chunking with sliding-window fallback for non-AST files.
pub fn chunk_file(path: &str, content: &str) -> Vec<Chunk> {
    ast_chunker::chunk_file_ast(path, content)
}
