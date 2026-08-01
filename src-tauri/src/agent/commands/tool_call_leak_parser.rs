//! Parses model-specific tool-call markup leaked into `delta.content` (Kimi, Qwen, etc.)
//! and promotes them to structured tool calls instead of streaming garbage to the UI.

use serde_json::Value;
use uuid::Uuid;

const MAX_HOLDBACK: usize = 128;

/// Markers that may appear split across SSE chunks — hold back this many trailing bytes.
const MARKER_PREFIXES: &[&str] = &[
    "<|tool_calls_begin|>",
    "<|tool_calls_end|>",
    "<|tool_call_begin|>",
    "<|tool_call_end|>",
    "<|tool_calls_section_begin|>",
    "<|tool_calls_section_end|>",
    "<|tool_call_begin|>",
    "<|tool_call_end|>",
    "<|tool_call_argument_begin|>",
    "<|tool_sep|>",
    "<tool_call>",
    "</tool_call>",
];

pub struct ParsedLeakCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

pub struct LeakedToolCallParser {
    pending: String,
}

impl LeakedToolCallParser {
    pub fn new() -> Self {
        Self {
            pending: String::new(),
        }
    }

    /// Push a content delta; returns clean prose safe to emit and any newly parsed tool calls.
    pub fn push(&mut self, piece: &str) -> (String, Vec<ParsedLeakCall>) {
        if piece.is_empty() {
            return (String::new(), Vec::new());
        }
        self.pending.push_str(piece);
        self.drain(false)
    }

    /// Flush remaining buffer at end of stream.
    pub fn finalize(&mut self) -> (String, Vec<ParsedLeakCall>) {
        self.drain(true)
    }

    fn drain(&mut self, flush: bool) -> (String, Vec<ParsedLeakCall>) {
        let calls = extract_leaked_tool_calls(&self.pending);
        self.pending = strip_tool_markup(&self.pending);

        let emit_len = if flush {
            self.pending.len()
        } else {
            safe_emit_prefix_len(&self.pending)
        };

        let clean = self.pending[..emit_len].to_string();
        self.pending = self.pending[emit_len..].to_string();

        (clean, calls)
    }
}

fn safe_emit_prefix_len(text: &str) -> usize {
    if text.is_empty() {
        return 0;
    }
    let char_count = text.chars().count();
    if char_count <= MAX_HOLDBACK {
        return 0;
    }
    let mut prefix_len = 0;
    let mut idx = 0;
    for ch in text.chars() {
        if idx >= char_count.saturating_sub(MAX_HOLDBACK) {
            break;
        }
        prefix_len += ch.len_utf8();
        idx += 1;
    }
    // Shrink prefix if its suffix could be start of a marker
    let prefix = &text[..prefix_len];
    for marker in MARKER_PREFIXES {
        for i in 1..marker.len() {
            let partial = &marker[..i];
            if prefix.ends_with(partial) {
                if let Some(strip) = prefix_len.checked_sub(partial.len()) {
                    return strip;
                }
            }
        }
    }
    prefix_len
}

fn strip_tool_markup(text: &str) -> String {
    let mut out = text.to_string();
    let patterns: &[(&str, &str)] = &[
        ("<|tool_calls_begin|>", "<|tool_calls_end|>"),
        ("<|tool_call_begin|>", "<|tool_call_end|>"),
        (
            "<|tool_calls_section_begin|>",
            "<|tool_calls_section_end|>",
        ),
        (
            "<|tool_call_begin|>",
            "<|tool_call_end|>",
        ),
        ("<tool_call>", "</tool_call>"),
    ];
    for (start, end) in patterns {
        loop {
            let Some(s) = out.find(start) else { break };
            if let Some(e) = out[s..].find(end) {
                let end_pos = s + e + end.len();
                out.replace_range(s..end_pos, "");
            } else {
                out.replace_range(s.., "");
                break;
            }
        }
    }
    for marker in MARKER_PREFIXES {
        out = out.replace(marker, "");
    }
    // Kimi inline: function<|tool_sep|>name ... argument JSON
    while let Some(idx) = out.find("function<|tool_sep|>") {
        let after = &out[idx..];
        if let Some(arg_start) = after.find("<|tool_call_argument_begin|>") {
            if let Some(arg_end) = after[arg_start..].find("<|tool_call_end|>") {
                let end_pos = idx + arg_start + arg_end + "<|tool_call_end|>".len();
                out.replace_range(idx..end_pos.min(out.len()), "");
                continue;
            }
        }
        if let Some(nl) = after.find('\n') {
            out.replace_range(idx..idx + nl + 1, "");
        } else {
            out.replace_range(idx.., "");
            break;
        }
    }
    // Bare {"name":"...","arguments":{...}}
    while let Some(start) = out.find("{\"name\"") {
        if let Some(end) = find_json_object_end(&out, start) {
            let slice = &out[start..=end];
            if let Ok(v) = serde_json::from_str::<Value>(slice) {
                if v.get("name").and_then(|n| n.as_str()).is_some() {
                    out.replace_range(start..=end, "");
                    continue;
                }
            }
        }
        break;
    }
    // Gemini-style: ```json\n{ "tool_code": "print(fn(...))" }\n```
    out = strip_tool_code_fences(&out);
    // Bare { "tool_code": "print(...)" } (complete or truncated mid-stream)
    out = strip_tool_code_json(&out);
    out
}

fn looks_like_tool_code_body(body: &str) -> bool {
    let t = body.trim();
    t.contains("\"tool_code\"")
        || t.contains("tool_code") && t.contains("print(")
        || (t.contains("print(") && t.contains("render_design_previews"))
}

fn strip_tool_code_fences(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(fence_rel) = rest.find("```") {
        out.push_str(&rest[..fence_rel]);
        let after_open = &rest[fence_rel + 3..];
        // Skip optional language tag + newline
        let body_start = after_open.find('\n').map(|i| i + 1).unwrap_or(0);
        let body = &after_open[body_start..];
        if let Some(close_rel) = body.find("```") {
            let fence_body = &body[..close_rel];
            if looks_like_tool_code_body(fence_body) {
                rest = &body[close_rel + 3..];
                continue;
            }
            out.push_str(&rest[fence_rel..fence_rel + 3 + body_start + close_rel + 3]);
            rest = &body[close_rel + 3..];
        } else if looks_like_tool_code_body(body) {
            // Incomplete fence still streaming — drop the rest.
            break;
        } else {
            out.push_str(&rest[fence_rel..]);
            rest = "";
            break;
        }
    }
    out.push_str(rest);
    out
}

fn strip_tool_code_json(text: &str) -> String {
    let mut out = text.to_string();
    // Complete objects
    while let Some(start) = out.find("{\"tool_code\"") {
        if let Some(end) = find_json_object_end(&out, start) {
            out.replace_range(start..=end, "");
            continue;
        }
        out.replace_range(start.., "");
        break;
    }
    while let Some(start) = out.find("{ \"tool_code\"") {
        if let Some(end) = find_json_object_end(&out, start) {
            out.replace_range(start..=end, "");
            continue;
        }
        out.replace_range(start.., "");
        break;
    }
    out
}

fn find_json_object_end(s: &str, start: usize) -> Option<usize> {
    let bytes = s.as_bytes();
    if start >= bytes.len() || bytes[start] != b'{' {
        return None;
    }
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape = false;
    for (i, &b) in bytes.iter().enumerate().skip(start) {
        if in_string {
            if escape {
                escape = false;
            } else if b == b'\\' {
                escape = true;
            } else if b == b'"' {
                in_string = false;
            }
            continue;
        }
        match b {
            b'"' => in_string = true,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

fn extract_leaked_tool_calls(text: &str) -> Vec<ParsedLeakCall> {
    let mut calls = Vec::new();
    // Kimi: function<|tool_sep|>tool_name ... <|tool_call_argument_begin|>{json}
    let mut search_from = 0;
    while let Some(rel) = text[search_from..].find("function<|tool_sep|>") {
        let idx = search_from + rel;
        let after_sep = idx + "function<|tool_sep|>".len();
        let name_end = text[after_sep..]
            .find(|c: char| c.is_whitespace() || c == '<' || c == '\n')
            .map(|p| after_sep + p)
            .unwrap_or(text.len());
        let name = text[after_sep..name_end].trim().to_string();
        if name.is_empty() {
            search_from = after_sep;
            continue;
        }
        let arg_marker = "<|tool_call_argument_begin|>";
        if let Some(arg_rel) = text[name_end..].find(arg_marker) {
            let json_start = name_end + arg_rel + arg_marker.len();
            if let Some(json_end) = find_json_object_end(text, json_start) {
                let args = text[json_start..=json_end].to_string();
                calls.push(ParsedLeakCall {
                    id: format!("leak_{}", Uuid::new_v4()),
                    name,
                    arguments: args,
                });
                search_from = json_end + 1;
                continue;
            }
        }
        search_from = name_end;
    }
    // Bare JSON tool calls
    let mut pos = 0;
    while let Some(start) = text[pos..].find("{\"name\"") {
        let abs = pos + start;
        if let Some(end) = find_json_object_end(text, abs) {
            let slice = &text[abs..=end];
            if let Ok(v) = serde_json::from_str::<Value>(slice) {
                if let (Some(name), Some(args)) = (
                    v.get("name").and_then(|n| n.as_str()),
                    v.get("arguments"),
                ) {
                    let args_str = if args.is_string() {
                        args.as_str().unwrap_or("{}").to_string()
                    } else {
                        args.to_string()
                    };
                    calls.push(ParsedLeakCall {
                        id: format!("leak_{}", Uuid::new_v4()),
                        name: name.to_string(),
                        arguments: args_str,
                    });
                    pos = end + 1;
                    continue;
                }
            }
        }
        pos = abs + 1;
    }
    calls
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_kimi_inline_tool() {
        let raw = r#"I'll explore.<|tool_calls_begin|><|tool_call_begin|>function<|tool_sep|>list_dir
<|tool_call_argument_begin|>{"path": "."}<|tool_call_end|><|tool_calls_end|>"#;
        let clean = strip_tool_markup(raw);
        assert!(clean.contains("I'll explore"));
        assert!(!clean.contains("tool_calls_begin"));
    }

    #[test]
    fn extracts_kimi_tool_call() {
        let raw = r#"function<|tool_sep|>list_dir<|tool_call_argument_begin|>{"path": "."}<|tool_call_end|>"#;
        let calls = extract_leaked_tool_calls(raw);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "list_dir");
        assert!(calls[0].arguments.contains("path"));
    }

    #[test]
    fn strips_gemini_tool_code_fence() {
        let raw = r#"Here are two concepts.

```json
{ "tool_code": "print(render_design_previews(concepts=[
  {
"#;
        let clean = strip_tool_markup(raw);
        assert!(clean.contains("Here are two concepts"));
        assert!(!clean.contains("tool_code"));
        assert!(!clean.contains("render_design_previews"));
    }

    #[test]
    fn strips_complete_tool_code_json() {
        let raw = r#"Done. {"tool_code": "print(list_dir(path='.'))" }"#;
        let clean = strip_tool_markup(raw);
        assert!(clean.contains("Done."));
        assert!(!clean.contains("tool_code"));
    }
}
