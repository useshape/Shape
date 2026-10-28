//! Source-level module map. Reads symbols the workspace already has on disk.
//! Binary decompilation is intentionally not offered.

const BINARY_EXTS: &[&str] = &["exe", "dll", "so", "dylib", "bin", "o", "obj", "wasm"];

/// Compact import/export map for one source file.
pub fn map_source(path: &str, content: &str) -> String {
    let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    if BINARY_EXTS.contains(&ext.as_str()) {
        return format!(
            "{path} is a binary. Shape maps source in the open folder and does not decompile binaries."
        );
    }

    let (imports, symbols) = match ext.as_str() {
        "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" => scan_ecma(content),
        "rs" => scan_rust(content),
        "go" => scan_prefixed(content, &["func ", "type "], &["import "]),
        "py" => scan_prefixed(content, &["def ", "class "], &["import ", "from "]),
        _ => {
            return format!(
                "No symbol map for .{ext}. Use read_file or grep on {path}."
            );
        }
    };

    let mut out = format!("# {path}\n");
    push_section(&mut out, "imports", &imports);
    push_section(&mut out, "symbols", &symbols);
    if imports.is_empty() && symbols.is_empty() {
        out.push_str("\nNo imports or top-level symbols matched.\n");
    }
    out
}

fn push_section(out: &mut String, title: &str, lines: &[String]) {
    if lines.is_empty() {
        return;
    }
    out.push_str("\n");
    out.push_str(title);
    out.push_str(":\n");
    for line in lines.iter().take(80) {
        out.push_str("- ");
        out.push_str(line);
        out.push('\n');
    }
}

fn scan_ecma(content: &str) -> (Vec<String>, Vec<String>) {
    let mut imports = Vec::new();
    let mut symbols = Vec::new();
    for raw in content.lines() {
        let line = raw.trim();
        if line.starts_with("import ") {
            imports.push(clip_line(line));
            continue;
        }
        if let Some(name) = export_name(line) {
            symbols.push(name);
        }
    }
    (imports, symbols)
}

fn export_name(line: &str) -> Option<String> {
    let rest = line.strip_prefix("export ")?;
    let rest = rest
        .strip_prefix("default ")
        .or_else(|| rest.strip_prefix("async "))
        .unwrap_or(rest);
    let rest = rest
        .strip_prefix("async ")
        .unwrap_or(rest);
    for kind in ["function ", "class ", "const ", "let ", "type ", "interface ", "enum "] {
        if let Some(name) = rest.strip_prefix(kind) {
            return Some(format!("{kind}{}", first_ident(name)));
        }
    }
    None
}

fn scan_rust(content: &str) -> (Vec<String>, Vec<String>) {
    let mut imports = Vec::new();
    let mut symbols = Vec::new();
    for raw in content.lines() {
        let line = raw.trim().trim_start_matches("pub ").trim_start_matches("pub(crate) ");
        if line.starts_with("use ") {
            imports.push(clip_line(line));
            continue;
        }
        for kind in ["fn ", "struct ", "enum ", "trait ", "mod ", "type ", "const "] {
            if let Some(name) = line.strip_prefix(kind) {
                symbols.push(format!("{kind}{}", first_ident(name)));
                break;
            }
        }
    }
    (imports, symbols)
}

fn scan_prefixed(content: &str, symbols_at: &[&str], imports_at: &[&str]) -> (Vec<String>, Vec<String>) {
    let mut imports = Vec::new();
    let mut symbols = Vec::new();
    for raw in content.lines() {
        let line = raw.trim();
        if imports_at.iter().any(|p| line.starts_with(p)) {
            imports.push(clip_line(line));
            continue;
        }
        for kind in symbols_at {
            if let Some(name) = line.strip_prefix(kind) {
                symbols.push(format!("{kind}{}", first_ident(name)));
                break;
            }
        }
    }
    (imports, symbols)
}

fn first_ident(rest: &str) -> String {
    rest.split(|c: char| !c.is_ascii_alphanumeric() && c != '_')
        .next()
        .unwrap_or("")
        .to_string()
}

fn clip_line(line: &str) -> String {
    let mut s: String = line.chars().take(160).collect();
    if line.chars().count() > 160 {
        s.push('…');
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_typescript_exports() {
        let src = "import { useState } from \"react\";\nexport function Chat() {}\nexport const MODE = \"ask\";\n";
        let map = map_source("chat.tsx", src);
        assert!(map.contains("useState"));
        assert!(map.contains("function Chat"));
        assert!(map.contains("const MODE"));
    }

    #[test]
    fn refuses_binaries() {
        let map = map_source("app.exe", "MZ");
        assert!(map.contains("does not decompile"));
    }

    #[test]
    fn maps_rust_items() {
        let src = "use std::fs;\npub fn read_file() {}\nstruct Hidden {}\n";
        let map = map_source("files.rs", src);
        assert!(map.contains("use std::fs"));
        assert!(map.contains("fn read_file"));
        assert!(map.contains("struct Hidden"));
    }
}
