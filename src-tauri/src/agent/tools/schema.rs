/// JSON Schema definitions for the agent's tool surface.
///
/// These follow the OpenAI / OpenRouter function-calling spec:
/// each tool is a `{type: "function", function: {name, description, parameters}}` object.
/// The model emits structured `tool_calls` referencing these names, the backend dispatches
/// them via `tools::dispatch::execute_tool`, and the JSON `tool_result` is returned to the
/// next model turn.
///
/// This is the single source of truth for *what* the model can do; the human-readable
/// system prompt only describes *when* to use which tool.

use serde_json::{json, Value};

use crate::agent::model_router::ModelFamily;

/// Return the full tool set as a JSON array ready to drop into a chat completion request.
#[allow(dead_code)]
pub fn all_tools() -> Vec<Value> {
    all_tools_for_family(ModelFamily::Other)
}

fn all_tools_for_family(family: ModelFamily) -> Vec<Value> {
    let mut tools = vec![
        read_file(),
        list_dir(),
        search_codebase(),
        search_files(),
        grep(),
        web_search(),
        visit_url(),
        create_directory(),
        create_file(),
    ];
    if family.uses_apply_patch() {
        tools.push(apply_patch());
    } else {
        tools.push(edit_file());
    }
    tools.extend([
        delete_file(),
        rename_file(),
        run_terminal(),
        git_status(),
        git_fetch(),
        git_log(),
        git_stage(),
        git_commit(),
        list_terminals(),
        read_terminal(),
        write_to_terminal(),
        wait(),
        read_lints(),
        update_todos(),
        finish(),
    ]);
    tools
}

fn ask_tools() -> Vec<Value> {
    vec![
        read_file(),
        list_dir(),
        search_codebase(),
        search_files(),
        grep(),
        web_search(),
        visit_url(),
        read_lints(),
        finish(),
    ]
}

/// Return tools appropriate for the active chat mode (reduces token overhead).
/// Unknown modes fail closed to Ask (read-only).
#[allow(dead_code)]
pub fn tools_for_mode(mode: &str, extra: Vec<Value>) -> Vec<Value> {
    tools_for_mode_and_family(mode, ModelFamily::Other, extra)
}

/// Mode + model-family tool selection (Cursor-style per-model tool shapes).
pub fn tools_for_mode_and_family(
    mode: &str,
    family: ModelFamily,
    extra: Vec<Value>,
) -> Vec<Value> {
    match mode.to_ascii_lowercase().as_str() {
        "plan" => {
            let mut tools = ask_tools();
            tools.insert(tools.len().saturating_sub(1), save_plan());
            tools
        }
        "ask" => ask_tools(),
        "visual" | "design" => {
            let mut tools = all_tools_for_family(family);
            tools.push(render_design_previews());
            tools.extend(extra);
            tools
        }
        "code" | "review" | "agent" => {
            let mut tools = all_tools_for_family(family);
            tools.extend(extra);
            tools
        }
        // Fail closed: unknown mode strings get read-only Ask tools.
        _ => ask_tools(),
    }
}

/// Build a tool descriptor. Kept as a small helper so the per-tool definitions stay terse.
fn tool(name: &str, description: &str, parameters: Value) -> Value {
    json!({
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": parameters,
        }
    })
}

fn read_file() -> Value {
    tool(
        "read_file",
        "Read the contents of a file in the project. Always call this before editing a file you have not yet seen this turn. Use start_line/end_line to page through large files (1-indexed, inclusive).",
        json!({
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Project-relative path to the file."},
                "start_line": {"type": "integer", "description": "Optional first line (1-indexed)."},
                "end_line": {"type": "integer", "description": "Optional last line (1-indexed, inclusive)."}
            },
            "required": ["path"],
            "additionalProperties": false
        }),
    )
}

fn list_dir() -> Value {
    tool(
        "list_dir",
        "List the immediate entries (files and folders) of a directory.",
        json!({
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Project-relative directory path. Use '.' for the project root."}
            },
            "required": ["path"],
            "additionalProperties": false
        }),
    )
}

fn search_files() -> Value {
    tool(
        "search_files",
        "Search the project for files matching a specific filename or partial path. Returns a list of matching file paths.",
        json!({
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Filename or partial path to search for (e.g., 'page.tsx' or 'components/ui')."}
            },
            "required": ["query"],
            "additionalProperties": false
        }),
    )
}

fn search_codebase() -> Value {
    tool(
        "search_codebase",
        "Search the indexed codebase by meaning and keywords. Returns relevant file excerpts with line ranges. Use this first for broad questions like 'where is X handled?' before grepping.",
        json!({
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural-language or keyword search query."},
                "top_k": {"type": "integer", "description": "Max results to return (default 8, max 20)."}
            },
            "required": ["query"],
            "additionalProperties": false
        }),
    )
}

fn grep() -> Value {
    tool(
        "grep",
        "Search file contents with ripgrep. Prefer a narrow path or glob so results stay small (cost). Query is a case-insensitive regex; invalid regex falls back to literal. For finding files by name, use search_files instead.",
        json!({
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Regex or literal text to search for in file contents. Use alternation (a|b|c) to check several name variants in one call."},
                "path": {"type": "string", "description": "Optional project-relative file or directory to limit the search (strongly preferred for large repos)."},
                "glob": {"type": "string", "description": "Optional ripgrep glob, e.g. '*.ts' or '**/*.{tsx,ts}'."},
                "context": {"type": "integer", "description": "Lines of context before/after each match (0–3, default 0). Keep low to save tokens."},
                "case_sensitive": {"type": "boolean", "description": "If true, disable ignore-case (default false)."},
                "head_limit": {"type": "integer", "description": "Max matching lines to return (default 80, max 200)."}
            },
            "required": ["query"],
            "additionalProperties": false
        }),
    )
}

fn web_search() -> Value {
    tool(
        "web_search",
        "Search the public web for documentation, APIs, or recent information. Use when the answer requires up-to-date or external knowledge.",
        json!({
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural-language search query."}
            },
            "required": ["query"],
            "additionalProperties": false
        }),
    )
}

fn create_directory() -> Value {
    tool(
        "create_directory",
        "Create a directory (and any missing parents). No-op if it already exists. Blocked in Ask mode.",
        json!({
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Project-relative directory path."}
            },
            "required": ["path"],
            "additionalProperties": false
        }),
    )
}

fn create_file() -> Value {
    tool(
        "create_file",
        "Create a brand-new file with the given content. Fails if the file already exists — use edit_file to modify existing files. On success the result may include SYNTAX ERRORS from a parse of the content — fix those before finish. Blocked in Ask mode.",
        json!({
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Project-relative path of the new file."},
                "content": {"type": "string", "description": "Full text content of the new file."}
            },
            "required": ["path", "content"],
            "additionalProperties": false
        }),
    )
}

fn edit_file() -> Value {
    tool(
        "edit_file",
        "Apply a targeted edit to an existing file. The `code_edit` argument MUST use the SEARCH/REPLACE block format. On success the result may include SYNTAX ERRORS and linter diagnostics — fix those before finish. Blocked in Ask mode.",
        json!({
            "type": "object",
            "properties": {
                "target_file": {"type": "string", "description": "Project-relative path of the file to edit."},
                "instructions": {"type": "string", "description": "One sentence describing what this edit accomplishes."},
                "code_edit": {"type": "string", "description": "The edit formatted as one or more SEARCH/REPLACE blocks. Example:\n<<<<<<< SEARCH\n[exact existing code]\n=======\n[new code]\n>>>>>>> REPLACE"}
            },
            "required": ["target_file", "instructions", "code_edit"],
            "additionalProperties": false
        }),
    )
}

fn apply_patch() -> Value {
    tool(
        "apply_patch",
        "Apply a Codex-style multi-file patch. Pass the entire patch as `input` (not JSON-wrapped hunks). Format:\n*** Begin Patch\n*** Update File: path\n@@\n context\n-old\n+new\n*** Add File: path\n+line\n*** Delete File: path\n*** End Patch\nAlways include Begin and End markers. Prefer this over shell edits. On success the result may include SYNTAX ERRORS and linter diagnostics — fix those before finish. Blocked in Ask mode.",
        json!({
            "type": "object",
            "properties": {
                "input": {"type": "string", "description": "Full apply_patch document including Begin/End markers."}
            },
            "required": ["input"],
            "additionalProperties": false
        }),
    )
}

fn read_lints() -> Value {
    tool(
        "read_lints",
        "Read current IDE/linter diagnostics for one or more files (or recently open files if paths omitted). Call after substantive edits to catch errors you introduced.",
        json!({
            "type": "object",
            "properties": {
                "paths": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Project-relative paths to check. Omit to read diagnostics for open files."
                }
            },
            "additionalProperties": false
        }),
    )
}

fn delete_file() -> Value {
    tool(
        "delete_file",
        "Delete a single file. Directories cannot be deleted by the agent. Blocked in Ask mode.",
        json!({
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Project-relative path of the file to delete."}
            },
            "required": ["path"],
            "additionalProperties": false
        }),
    )
}

fn rename_file() -> Value {
    tool(
        "rename_file",
        "Rename or move a file. Blocked in Ask mode.",
        json!({
            "type": "object",
            "properties": {
                "old_path": {"type": "string", "description": "Current project-relative path."},
                "new_path": {"type": "string", "description": "Target project-relative path."}
            },
            "required": ["old_path", "new_path"],
            "additionalProperties": false
        }),
    )
}

fn run_terminal() -> Value {
    tool(
        "run_terminal",
        "Run a shell command in the project directory. On Windows uses PowerShell; on macOS/Linux uses bash/sh. Prefer file/search tools for inspection — use this for build, test, install, scaffolding, and other shell workflows. For scaffolding tools always pass non-interactive flags (--yes, -y). Commands that finish quickly return their full output and exit code directly. Commands still running after ~25s keep running and return a background session_id — then call `wait` with that session_id (it returns as soon as the command finishes). Dev servers/watchers background immediately and run until stopped. Some commands require user approval; approval may take as long as the user needs, and a rejected command must NOT be retried. NEVER use cat/type/ls/dir for file inspection. Blocked in Ask and Plan modes.",
        json!({
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "The shell command to execute."}
            },
            "required": ["command"],
            "additionalProperties": false
        }),
    )
}

fn git_status() -> Value {
    tool(
        "git_status",
        "Show git working tree and staged file status for the project. Read-only.",
        json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        }),
    )
}

fn git_fetch() -> Value {
    tool(
        "git_fetch",
        "Fetch updates from all remotes (git fetch --all --prune). Does not modify the working tree.",
        json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        }),
    )
}

fn git_log() -> Value {
    tool(
        "git_log",
        "Show recent commit history. Read-only.",
        json!({
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Number of commits to show (default 10, max 50)."}
            },
            "additionalProperties": false
        }),
    )
}

fn git_stage() -> Value {
    tool(
        "git_stage",
        "Stage a file for commit (git add). Path is project-relative.",
        json!({
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Project-relative file path to stage."}
            },
            "required": ["path"],
            "additionalProperties": false
        }),
    )
}

fn git_commit() -> Value {
    tool(
        "git_commit",
        "Create a git commit from staged changes. Requires user approval before running.",
        json!({
            "type": "object",
            "properties": {
                "message": {"type": "string", "description": "Commit message."}
            },
            "required": ["message"],
            "additionalProperties": false
        }),
    )
}

fn list_terminals() -> Value {
    tool(
        "list_terminals",
        "List active background terminal sessions with session_id, running status, and command. Call before read_terminal or write_to_terminal.",
        json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        }),
    )
}

fn read_terminal() -> Value {
    tool(
        "read_terminal",
        "Read recent output and status from a terminal session. Reports running state, exit code when finished, and flags output that looks like an interactive prompt waiting for input. For waiting on completion prefer `wait` with session_id — it returns the same status the moment the command finishes.",
        json!({
            "type": "object",
            "properties": {
                "session_id": {"type": "integer", "description": "Session ID from run_terminal or list_terminals."},
                "tail_chars": {"type": "integer", "description": "How many trailing characters of output to return (default 8000, max 50000)."}
            },
            "required": ["session_id"],
            "additionalProperties": false
        }),
    )
}

fn wait() -> Value {
    tool(
        "wait",
        "Wait for a background terminal session to finish. With session_id, returns IMMEDIATELY when the session exits (with exit code and output) — one call rides until completion, no repeated polling needed. Give `seconds` as the max you are willing to wait (e.g. 120–180 for installs/builds). If it returns with the session still running, call wait again or continue other work. Without session_id, plain sleep. Respects user stop.",
        json!({
            "type": "object",
            "properties": {
                "seconds": {"type": "integer", "description": "Max seconds to wait (1–180, default 10). With session_id, returns as soon as the command finishes — a generous value costs nothing."},
                "session_id": {"type": "integer", "description": "Terminal session to wait on (from run_terminal). Strongly preferred over blind sleeping."},
                "reason": {"type": "string", "description": "Short note on why you are waiting (shown in UI)."}
            },
            "required": ["seconds"],
            "additionalProperties": false
        }),
    )
}

fn write_to_terminal() -> Value {
    tool(
        "write_to_terminal",
        "Write text or keystrokes to an active terminal session. Use when a command is waiting for interactive input. Append \\r for Enter. Use list_terminals first to get the session_id. Blocked in Ask and Plan modes.",
        json!({
            "type": "object",
            "properties": {
                "session_id": {"type": "integer", "description": "PTY session ID from list_terminals."},
                "input": {"type": "string", "description": "Text to send. Use \\r for Enter, \\x03 for Ctrl+C."}
            },
            "required": ["session_id", "input"],
            "additionalProperties": false
        }),
    )
}

fn save_plan() -> Value {
    tool(
        "save_plan",
        "Save an implementation plan as markdown to .shape/plans/{title}.md. Plan mode only. Call after researching the codebase. Include a markdown checkbox todo list under ## Todos (or numbered implementation steps) so Build can track progress.",
        json!({
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Short slug for the plan file (e.g. auth-refactor)."},
                "content": {"type": "string", "description": "Full markdown plan body. Must include a ## Todos section with `- [ ]` checkboxes or a numbered implementation steps list."}
            },
            "required": ["title", "content"],
            "additionalProperties": false
        }),
    )
}

fn update_todos() -> Value {
    tool(
        "update_todos",
        "Optional live checklist for LONG multi-step implementation only (e.g. building from a saved plan). \
Skip for ordinary Code/Visual work: single features, UI polish, shadcn installs, refactors of a few files — just do the work. \
When used: 3–5 high-level items (never 8+ granular file-by-file steps). Labels like \"Rebuild homepage\" not \"Add Inter font import to index.css\". \
Exactly one in_progress, pass the full merged list every call. Not available in Ask/Plan.",
        json!({
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Checklist title (default: Todos)."},
                "todos": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 5,
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string", "description": "Stable id for the todo (e.g. 1, setup-auth)."},
                            "content": {"type": "string", "description": "Short todo label."},
                            "status": {
                                "type": "string",
                                "enum": ["pending", "in_progress", "completed", "cancelled"],
                                "description": "pending | in_progress | completed | cancelled"
                            }
                        },
                        "required": ["id", "content", "status"],
                        "additionalProperties": false
                    }
                }
            },
            "required": ["todos"],
            "additionalProperties": false
        }),
    )
}

fn finish() -> Value {
    tool(
        "finish",
        "Optional: end the turn with a user-visible summary. Prefer this when you want a clean stop after tools. You may also end by replying in plain prose with no further tool calls — that also completes the turn. `summary` is the user-facing reply when using this tool.",
        json!({
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "User-facing reply. Direct and specific. Never third-person logs or permission asks."}
            },
            "additionalProperties": false
        }),
    )
}

fn render_design_previews() -> Value {
    tool(
        "render_design_previews",
        "Show ONE interactive component preview in chat (Visual mode). Call ONLY when the user asks to see / preview / mock a component before adding it. Do NOT call for routine builds — if they say build it / add it / don't stop, edit the project directly. Exactly one concept. Prefer jsx with function App(). Use the project's UI kit when present; otherwise Radix-style primitives + Tailwind. No remote images. No multi-option galleries. The preview frame is full-width and centers #root — keep the component in normal document flow (no full-bleed absolute positioning that clips). Leave room for menus/popovers. Prefer width≈640 height≈360. After the preview renders, call finish immediately with a short note; do not keep calling tools.",
        json!({
            "type": "object",
            "properties": {
                "concepts": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 1,
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "name": {"type": "string", "description": "Internal component name (not shown in chat)."},
                            "style": {"type": "string", "description": "Internal note (not shown in chat)."},
                            "jsx": {"type": "string", "description": "React source defining App (function App() { return (...); }). No export/import. Tailwind className only. Keep the component centered; avoid position:fixed/absolute that pins to the iframe corner."},
                            "html": {"type": "string", "description": "Legacy fallback: raw body HTML only (prefer jsx)."},
                            "width": {"type": "integer", "description": "Logical viewport width (default 640)."},
                            "height": {"type": "integer", "description": "Preview card height (default 360)."}
                        },
                        "required": ["id", "name", "style"],
                        "additionalProperties": false
                    }
                }
            },
            "required": ["concepts"],
            "additionalProperties": false
        }),
    )
}

fn visit_url() -> Value {
    tool(
        "visit_url",
        "Open a public webpage and extract its text, structure, and styling cues (colors, fonts, theme). Use when the user pastes a URL, asks you to recreate/reference a site, or @-mentions a browser/site. Prefer this over web_search when you need the actual page contents.",
        json!({
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Full URL (https://…) or bare hostname (shape.com)."}
            },
            "required": ["url"],
            "additionalProperties": false
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::model_router::ModelFamily;

    fn tool_names(tools: &[Value]) -> Vec<String> {
        tools
            .iter()
            .filter_map(|t| {
                t.get("function")
                    .and_then(|f| f.get("name"))
                    .and_then(|n| n.as_str())
                    .map(|s| s.to_string())
            })
            .collect()
    }

    #[test]
    fn openai_family_gets_apply_patch_not_edit_file() {
        let tools = tools_for_mode_and_family("code", ModelFamily::OpenAi, vec![]);
        let names = tool_names(&tools);
        assert!(names.contains(&"apply_patch".to_string()));
        assert!(!names.contains(&"edit_file".to_string()));
        assert!(names.contains(&"read_lints".to_string()));
    }

    #[test]
    fn deepseek_family_gets_edit_file_not_apply_patch() {
        let tools = tools_for_mode_and_family("code", ModelFamily::DeepSeek, vec![]);
        let names = tool_names(&tools);
        assert!(names.contains(&"edit_file".to_string()));
        assert!(!names.contains(&"apply_patch".to_string()));
        assert!(names.contains(&"read_lints".to_string()));
    }

    #[test]
    fn ask_mode_is_read_only() {
        let tools = tools_for_mode_and_family("ask", ModelFamily::OpenAi, vec![]);
        let names = tool_names(&tools);
        assert!(!names.contains(&"edit_file".to_string()));
        assert!(!names.contains(&"apply_patch".to_string()));
        assert!(!names.contains(&"run_terminal".to_string()));
        assert!(names.contains(&"read_lints".to_string()));
    }
}

