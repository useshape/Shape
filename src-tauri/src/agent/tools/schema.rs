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

pub fn all_tools_for_family(family: ModelFamily) -> Vec<Value> {
    let mut tools = vec![
        read_file(),
        list_dir(),
        search_codebase(),
        search_files(),
        grep(),
        web_search(),
        visit_url(),
        plugin_list(),
        plugin_search(),
        plugin_tools(),
        plugin_run(),
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
        git_diff(),
        git_branches(),
        git_create_branch(),
        git_switch(),
        git_sync(),
        git_worktree(),
        decide(),
        check_done(),
        list_terminals(),
        read_terminal(),
        write_to_terminal(),
        wait(),
        read_lints(),
        spawn_subagent(),
        update_todos(),
        screenshot_page(),
        inspect_runtime(),
        design_review(),
        generate_svg(),
        generate_image(),
        generate_audio(),
        edit_image(),
        save_media(),
        send_file(),
        ask_user(),
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
        plugin_list(),
        plugin_search(),
        plugin_tools(),
        read_lints(),
        send_file(),
        git_diff(),
        git_branches(),
        decide(),
        check_done(),
        spawn_subagent(),
        ask_user(),
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
    tools_for_mode_family_and_memory(mode, family, extra, false)
}

/// Like [`tools_for_mode_and_family`], optionally including past-chat memory tools.
pub fn tools_for_mode_family_and_memory(
    mode: &str,
    family: ModelFamily,
    extra: Vec<Value>,
    chat_memory_enabled: bool,
) -> Vec<Value> {
    let mut tools = match mode.to_ascii_lowercase().as_str() {
        "plan" => {
            let mut tools = ask_tools();
            tools.insert(tools.len().saturating_sub(1), save_plan());
            tools
        }
        "ask" => ask_tools(),
        "visual" | "design" => {
            let mut tools = all_tools_for_family(family);
            insert_before_finish(&mut tools, render_design_previews());
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
    };
    if chat_memory_enabled {
        insert_before_finish(&mut tools, list_chats());
        insert_before_finish(&mut tools, read_chat());
    }
    tools
}

/// One tool list for the whole conversation. Mode, git status, and MCP servers
/// must not add or remove tools: that invalidates the cached prefix.
pub fn stable_tools(family: ModelFamily) -> Vec<Value> {
    let mut tools = all_tools_for_family(family);
    for tool in [
        list_chats(),
        read_chat(),
        render_design_previews(),
        mcp_search(),
        mcp_call(),
    ] {
        insert_before_finish(&mut tools, tool);
    }
    tools
}

#[derive(Clone, Debug)]
pub struct SteerPacks {
    pub workspace: bool,
    pub plugins: bool,
    pub browse: bool,
    pub web: bool,
    pub git: bool,
    pub terminal: bool,
    pub media: bool,
    pub hint: String,
}

impl SteerPacks {
    pub fn all_on() -> Self {
        Self {
            workspace: true,
            plugins: true,
            browse: true,
            web: true,
            git: true,
            terminal: true,
            media: true,
            hint: String::new(),
        }
    }

    pub fn from_json(value: &Value) -> Self {
        let pack = |key: &str| value.get(key).and_then(|v| v.as_bool()).unwrap_or(true);
        let hint = value
            .get("hint")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let packs = Self {
            workspace: pack("workspace"),
            plugins: pack("plugins"),
            browse: pack("browse"),
            web: pack("web"),
            git: pack("git"),
            terminal: pack("terminal"),
            media: pack("media"),
            hint,
        };
        if !packs.workspace
            && !packs.plugins
            && !packs.web
            && !packs.git
            && !packs.terminal
            && !packs.media
        {
            return Self::all_on();
        }
        packs
    }
}

fn tool_fn_name(tool: &Value) -> &str {
    tool.get("function")
        .and_then(|f| f.get("name"))
        .and_then(|n| n.as_str())
        .unwrap_or("")
}

fn steer_pack_for(name: &str) -> Option<&'static str> {
    match name {
        "read_file" | "list_dir" | "search_codebase" | "search_files" | "grep"
        | "create_directory" | "create_file" | "apply_patch" | "edit_file" | "delete_file"
        | "rename_file" | "read_lints" | "screenshot_page" | "inspect_runtime"
        | "design_review" | "render_design_previews" | "mcp_search" | "mcp_call" => Some("workspace"),
        "plugin_search" | "plugin_run" => Some("plugins"),
        "plugin_list" | "plugin_tools" => Some("browse"),
        "web_search" | "visit_url" => Some("web"),
        "git_status" | "git_fetch" | "git_log" | "git_stage" | "git_commit" | "git_diff"
        | "git_branches" | "git_create_branch" | "git_switch" | "git_sync" | "git_worktree" => {
            Some("git")
        }
        "run_terminal" | "list_terminals" | "read_terminal" | "write_to_terminal" => Some("terminal"),
        "generate_svg" | "generate_image" | "generate_audio" | "edit_image" | "save_media" => {
            Some("media")
        }
        _ => None,
    }
}

/// Drop unused tool packs so the main model does not pay for their schemas.
/// Core tools (finish, ask_user, decide, …) always stay.
pub fn apply_steer_packs(tools: Vec<Value>, packs: &SteerPacks) -> Vec<Value> {
    if packs.workspace
        && packs.plugins
        && packs.browse
        && packs.web
        && packs.git
        && packs.terminal
        && packs.media
    {
        return tools;
    }
    tools
        .into_iter()
        .filter(|tool| match steer_pack_for(tool_fn_name(tool)) {
            Some("workspace") => packs.workspace,
            Some("plugins") => packs.plugins,
            Some("browse") => packs.browse,
            Some("web") => packs.web,
            Some("git") => packs.git,
            Some("terminal") => packs.terminal,
            Some("media") => packs.media,
            _ => true,
        })
        .collect()
}

fn insert_before_finish(tools: &mut Vec<Value>, tool: Value) {
    let finish_idx = tools.iter().position(|t| {
        t.get("function")
            .and_then(|f| f.get("name"))
            .and_then(|n| n.as_str())
            == Some("finish")
    });
    if let Some(i) = finish_idx {
        tools.insert(i, tool);
    } else {
        tools.push(tool);
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
        "Search the public web. When the user wants something on a site, search first and then browse open the exact result URL. Do not make the browser hunt through menus for a page search can name.",
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

fn git_diff() -> Value {
    tool(
        "git_diff",
        "Show a git diff. Read-only. Pass path for one file, or staged:true for the index.",
        json!({
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Project-relative file. Omit for the whole working tree."},
                "staged": {"type": "boolean", "description": "Diff the index instead of the working tree."}
            },
            "additionalProperties": false
        }),
    )
}

fn git_branches() -> Value {
    tool(
        "git_branches",
        "List local branches. The current branch is marked. Read-only.",
        json!({"type": "object", "properties": {}, "additionalProperties": false}),
    )
}

fn git_create_branch() -> Value {
    tool(
        "git_create_branch",
        "Create a branch at the current commit. Does not switch to it.",
        json!({
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Branch name."}
            },
            "required": ["name"],
            "additionalProperties": false
        }),
    )
}

fn git_switch() -> Value {
    tool(
        "git_switch",
        "Switch the checkout to an existing local branch. Do not use this to discard work.",
        json!({
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Existing branch name."}
            },
            "required": ["name"],
            "additionalProperties": false
        }),
    )
}

fn git_sync() -> Value {
    tool(
        "git_sync",
        "Pull and push the current branch with its upstream. Never force-pushes.",
        json!({"type": "object", "properties": {}, "additionalProperties": false}),
    )
}

fn git_worktree() -> Value {
    tool(
        "git_worktree",
        "List, add, or remove a git worktree so parallel work does not share one checkout. add creates a sibling directory and a new branch. Never merge that branch into the user's current branch unless they explicitly asked.",
        json!({
            "type": "object",
            "properties": {
                "action": {"type": "string", "description": "list, add, or remove."},
                "branch": {"type": "string", "description": "Branch name when action is add."},
                "path": {"type": "string", "description": "Worktree path when action is remove."}
            },
            "required": ["action"],
            "additionalProperties": false
        }),
    )
}

fn decide() -> Value {
    tool(
        "decide",
        "Ask Jev for one typed choice about state you already have. Use this for yes/no or a short menu, not for writing code. Options are the only allowed answers.",
        json!({
            "type": "object",
            "properties": {
                "state": {"type": "string", "description": "Facts already gathered. Do not include instructions."},
                "prompt": {"type": "string", "description": "The decision question."},
                "options": {"type": "array", "items": {"type": "string"}, "description": "Two to eight choices."}
            },
            "required": ["state", "prompt", "options"],
            "additionalProperties": false
        }),
    )
}

fn check_done() -> Value {
    tool(
        "check_done",
        "Check that a finished claim is backed by evidence copied from a tool result. FAIL means keep working. Do not invent the evidence.",
        json!({
            "type": "object",
            "properties": {
                "claim": {"type": "string", "description": "What you believe is done."},
                "evidence": {"type": "string", "description": "Tool output, diff, or test log that shows it."}
            },
            "required": ["claim", "evidence"],
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
        "Save the implementation plan. Research first, then call this with the full plan — do not outline in chat beforehand. Markdown body has Goal / Findings / Steps / Risks. Pass todos as a separate string array (not inside the markdown).",
        json!({
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Short slug for the plan file (e.g. auth-refactor)."},
                "content": {"type": "string", "description": "Markdown plan body. Do not include a ## Todos section."},
                "todos": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Checklist items shown under the plan (not in the markdown body)."
                }
            },
            "required": ["title", "content", "todos"],
            "additionalProperties": false
        }),
    )
}

fn spawn_subagent() -> Value {
    tool(
        "spawn_subagent",
        "Start a background subagent and return immediately so you can keep working. The subagent uses its own prompt and tools, then posts an update when finished — you are not blocked on this call. Default isolation is `shared` (same checkout; concurrent file edits can overwrite each other). Use `worktree` for true parallel coding (separate directory + branch). Never merge their branch yourself. Do not spawn a subagent for the whole user request.",
        json!({
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Short card title (e.g. Explore auth)."},
                "task": {"type": "string", "description": "Concrete task for the subagent. Include goals, constraints, and relevant paths."},
                "isolation": {
                    "type": "string",
                    "enum": ["shared", "worktree"],
                    "description": "shared (default): same checkout as you. worktree: isolated git worktree + new branch. Never auto-merged."
                },
                "model": {
                    "type": "string",
                    "description": "Optional. Must be one of the user's allowed subagent models (see turn context). Disallowed ids, including the parent chat model, are ignored and the user's default is used."
                }
            },
            "required": ["task"],
            "additionalProperties": false
        }),
    )
}

fn spawn_worker() -> Value {
    tool(
        "spawn_worker",
        "Start a full coding worker on the Multiwork board (max 6). Each worker gets an isolated git worktree and branch. Never merge those branches — leave them for the user to review. Prefer non-overlapping file scopes. Returns a worker id.",
        json!({
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Short card title."},
                "task": {"type": "string", "description": "Concrete implementation task for the worker."},
                "model": {"type": "string", "description": "Optional model id override for this worker."},
                "files": {
                    "description": "Optional file/path scope hints (string or array of paths).",
                    "oneOf": [
                        {"type": "string"},
                        {"type": "array", "items": {"type": "string"}}
                    ]
                }
            },
            "required": ["task"],
            "additionalProperties": false
        }),
    )
}

fn message_worker() -> Value {
    tool(
        "message_worker",
        "Send a message on the Multiwork session bus to one worker.",
        json!({
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "content": {"type": "string"}
            },
            "required": ["id", "content"],
            "additionalProperties": false
        }),
    )
}

fn broadcast_workers() -> Value {
    tool(
        "broadcast_workers",
        "Broadcast a message to all Multiwork workers on the session bus.",
        json!({
            "type": "object",
            "properties": {
                "content": {"type": "string"}
            },
            "required": ["content"],
            "additionalProperties": false
        }),
    )
}

fn set_worker_status() -> Value {
    tool(
        "set_worker_status",
        "Move a worker card between board columns: running, review, or done.",
        json!({
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "column": {"type": "string", "enum": ["running", "review", "done"]}
            },
            "required": ["id", "column"],
            "additionalProperties": false
        }),
    )
}

fn message_peer() -> Value {
    tool(
        "message_peer",
        "Talk to another Multiwork worker (id or title) or the orchestrator. Use this to coordinate overlapping files, hand off findings, or ask a sibling to wait. The other worker receives a follow-up turn with your message.",
        json!({
            "type": "object",
            "properties": {
                "to": {"type": "string", "description": "Worker id, worker title, or \"orchestrator\"."},
                "content": {"type": "string"}
            },
            "required": ["content"],
            "additionalProperties": false
        }),
    )
}

fn report_orchestrator() -> Value {
    tool(
        "report_orchestrator",
        "Report progress or a blocker to the Multiwork orchestrator (updates your board card).",
        json!({
            "type": "object",
            "properties": {
                "content": {"type": "string"}
            },
            "required": ["content"],
            "additionalProperties": false
        }),
    )
}

/// Tools for the Multiwork orchestrator turn (delegate-only; workers explore/implement).
pub fn multiwork_orchestrator_tools(family: ModelFamily) -> Vec<Value> {
    let _ = family;
    vec![
        spawn_worker(),
        message_worker(),
        broadcast_workers(),
        set_worker_status(),
        ask_user(),
        finish(),
    ]
}

/// Full code tools plus peer messaging for a Multiwork worker.
pub fn multiwork_worker_tools(family: ModelFamily) -> Vec<Value> {
    let mut tools = all_tools_for_family(family);
    // Drop research-only subagent; workers get bus tools instead.
    tools.retain(|t| {
        let name = t
            .get("function")
            .and_then(|f| f.get("name"))
            .and_then(|n| n.as_str());
        name != Some("spawn_subagent") && name != Some("git_sync")
    });
    insert_before_finish(&mut tools, message_peer());
    insert_before_finish(&mut tools, report_orchestrator());
    tools
}

fn update_todos() -> Value {
    tool(
        "update_todos",
        "Optional live checklist for LONG multi-step implementation only (e.g. building from a saved plan with 5+ phases). \
Skip for ordinary Code/Visual work — including slightly long prompts, single features, UI polish, installs, and small refactors. Just do the work. \
When used: 3–5 high-level items (never 8+ granular file-by-file steps). Labels like \"Rebuild homepage\" not \"Add Inter font import to index.css\". \
Exactly one in_progress (auto-healed if missing), pass the full merged list every call. Not available in Ask/Plan.",
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

fn ask_user() -> Value {
    tool(
        "ask_user",
        "Pause and show click-through multiple-choice questions in chat. Only when a real user decision would change the work and you cannot infer a default. Never use this to pick a plugin slug or Slack/Discord action — plugin_run the recommended slug instead. Prefer defaults. Do not quiz. Batch related questions in one call. Wait for the tool result.",
        json!({
            "type": "object",
            "properties": {
                "questions": {
                    "type": "array",
                    "description": "1–6 questions. Each needs a prompt and 2–8 options. Mark one option recommended when you have a lean.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string", "description": "Stable id (q1, palette). Optional; assigned if omitted."},
                            "prompt": {"type": "string", "description": "The question shown to the user."},
                            "allow_multiple": {"type": "boolean", "description": "If true, more than one option can be selected."},
                            "options": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id": {"type": "string"},
                                        "label": {"type": "string"},
                                        "recommended": {"type": "boolean"}
                                    },
                                    "required": ["label"],
                                    "additionalProperties": false
                                }
                            }
                        },
                        "required": ["prompt", "options"],
                        "additionalProperties": false
                    }
                }
            },
            "required": ["questions"],
            "additionalProperties": false
        }),
    )
}

fn list_chats() -> Value {
    tool(
        "list_chats",
        "List past chats in this project (id, title, message count). Use when earlier conversations may hold decisions, preferences, or context missing from the current thread. Then call read_chat for details. Do not call on every turn.",
        json!({
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Optional filter matched against chat title or id."},
                "limit": {"type": "integer", "description": "Max chats to return (default 20, max 50)."}
            },
            "additionalProperties": false
        }),
    )
}

fn read_chat() -> Value {
    tool(
        "read_chat",
        "Load messages from a past chat in this project by id (from list_chats). Prefer recent messages; raise max_messages only when needed.",
        json!({
            "type": "object",
            "properties": {
                "conversation_id": {"type": "string", "description": "Chat id from list_chats."},
                "max_messages": {"type": "integer", "description": "How many recent messages to include (default 40, max 80)."}
            },
            "required": ["conversation_id"],
            "additionalProperties": false
        }),
    )
}

fn render_design_previews() -> Value {
    tool(
        "render_design_previews",
        "Visual mode only. Show 1–3 style variants of ONE component in chat (e.g. three buttons, or three dropdowns — never mix types), then WAIT for the user to pick one (or @mention it). Call ONLY when they explicitly ask to see options, mock a component, or generate a small design-system of a single control before you add it. Do NOT call for routine 'build/add this'. Never full pages. Prefer jsx with function App(). Match the project's UI kit; otherwise Radix + Tailwind. No remote images. After this tool returns the chosen id, implement that variant.",
        json!({
            "type": "object",
            "properties": {
                "concepts": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 3,
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "name": {"type": "string", "description": "Short label shown on the card (e.g. Soft, Solid)."},
                            "style": {"type": "string", "description": "One-line difference vs the other variants."},
                            "jsx": {"type": "string", "description": "React source defining App (function App() { return (...); }). No export/import. Tailwind className only. One component, not a page."},
                            "html": {"type": "string", "description": "Legacy fallback: raw body HTML only (prefer jsx)."},
                            "width": {"type": "integer", "description": "Logical viewport width (default 640)."},
                            "height": {"type": "integer", "description": "Preview frame height (default 360)."}
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

fn plugin_list() -> Value {
    tool(
        "plugin_list",
        "Which apps are connected. Skip if the user already named Slack, GitHub, Linear, etc.",
        json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        }),
    )
}

fn plugin_search() -> Value {
    tool(
        "plugin_search",
        "Look up a connected app for the user's request and return the data. Pass their ask (e.g. 'whats going on in my shape chat in slack'). If the result is already the data, answer from it. Only plugin_run when the result includes an exact plugin_run slug= line.",
        json!({
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Short phrase, e.g. 'slack channel history'."}
            },
            "required": ["query"],
            "additionalProperties": false
        }),
    )
}

fn plugin_tools() -> Value {
    tool(
        "plugin_tools",
        "Short list of actions for one connected app. Always pass query for what you need. Never call this to dump the whole catalog.",
        json!({
            "type": "object",
            "properties": {
                "toolkit": {"type": "string", "description": "Plugin id (slack, github, linear, …)."},
                "query": {"type": "string", "description": "Required filter, e.g. list messages."}
            },
            "required": ["toolkit", "query"],
            "additionalProperties": false
        }),
    )
}

fn plugin_run() -> Value {
    tool(
        "plugin_run",
        "Run a connected plugin action. Use the recommended slug from plugin_search. Blocked in Ask/Plan.",
        json!({
            "type": "object",
            "properties": {
                "slug": {"type": "string", "description": "Exact tool slug (e.g. SLACK_SEND_MESSAGE)."},
                "toolkit": {"type": "string", "description": "Plugin id (slack, github, …). Optional if the slug prefix is enough."},
                "arguments": {"type": "object", "description": "Tool arguments as a JSON object.", "additionalProperties": true}
            },
            "required": ["slug"],
            "additionalProperties": false
        }),
    )
}

fn generate_svg() -> Value {
    tool(
        "generate_svg",
        "Generate a vector SVG via the svg tool (not a chat model). Use for icons, logos, and illustrations. Preview appears in chat at the tool call. Asking to generate an SVG is not a request to write a project file. If this tool errors as not configured or unavailable, tell the user generation is unavailable; do not retry generate_image; do not write an SVG with create_file or edit.",
        json!({
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "What to draw. Be specific about style, colors, and use (icon, logo, illustration)."}
            },
            "required": ["prompt"],
            "additionalProperties": false
        }),
    )
}

fn generate_image() -> Value {
    tool(
        "generate_image",
        "Generate a raster image (PNG) via the image tool (not a chat model). Cheap quality suitable for mock assets, photos, and UI pictures. Preview appears in chat at the tool call. Asking to generate an image is not a request to write a project file. If this tool errors as not configured or unavailable, tell the user generation is unavailable; do not retry generate_svg; do not write an image with create_file or edit.",
        json!({
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "What to generate. Be specific about subject, style, and framing."}
            },
            "required": ["prompt"],
            "additionalProperties": false
        }),
    )
}

fn generate_audio() -> Value {
    tool(
        "generate_audio",
        "Generate a short speech audio clip from text (budget TTS). Preview plays in chat. Media is stashed locally as media_id — use save_media to put it in the project. Do not ask the user to download first.",
        json!({
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Text to speak."},
                "voice": {"type": "string", "description": "Optional voice id (provider-specific)."}
            },
            "required": ["prompt"],
            "additionalProperties": false
        }),
    )
}

fn edit_image() -> Value {
    tool(
        "edit_image",
        "Edit an existing image with a prompt (budget model, not frontier). Pass media_id from a prior generate, an attachment name, or a project path. Result is stashed as media_id.",
        json!({
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "How to change the image."},
                "media_id": {"type": "string", "description": "Stashed media id from generate/edit."},
                "attachment": {"type": "string", "description": "User-attached image filename."},
                "path": {"type": "string", "description": "Project-relative image path."}
            },
            "required": ["prompt"],
            "additionalProperties": false
        }),
    )
}

fn send_file() -> Value {
    tool(
        "send_file",
        "Hand the user a project file as a download card in chat. Use when they ask you to send, share, or give them a file. Does not write or change the project. Do not paste the file contents into the reply.",
        json!({
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Project file to send, e.g. public/hero.png or notes/brief.pdf."},
                "title": {"type": "string", "description": "Short title on the card. Defaults to the filename."}
            },
            "required": ["path"],
            "additionalProperties": false
        }),
    )
}

fn save_media() -> Value {
    tool(
        "save_media",
        "Write generated or attached media into the project. Prefer `media_id` from generate_*/edit_image (already on disk). Also accepts attachment name, data: URL, or https URL. ONLY when the user asked to save, move, or use the media as a file. Never ask them to download first.",
        json!({
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Project-relative destination, e.g. public/hero.png or src/assets/logo.svg."},
                "media_id": {"type": "string", "description": "Id returned by generate_svg/generate_image/generate_audio/edit_image."},
                "attachment": {"type": "string", "description": "Filename of a user-attached image in this chat."},
                "url": {"type": "string", "description": "https or data: URL from generation."}
            },
            "required": ["path"],
            "additionalProperties": false
        }),
    )
}

fn screenshot_page() -> Value {
    tool(
        "screenshot_page",
        "Capture a screenshot of the running local website preview and show it in your chat reply. \
Website/UI tasks only — never for CLIs, APIs, tests, or anything that has no webpage. \
Do NOT call on every edit. Call once after a new site/page first comes up, or after a large layout/structure change (new page, rebuilt hero, major grid/nav change). \
Skip copy tweaks, color/spacing nits, hover states, and small component polish. \
Pass `path` or `url` for the specific route you changed (e.g. /pricing, /login) — never assume the homepage if you worked on another page. \
If capture is impossible (no preview, not a website), skip it and continue. At most one screenshot per turn unless you changed two distinct routes.",
        json!({
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Route on the local preview, e.g. /pricing or /login. Preferred when the origin is already running."},
                "url": {"type": "string", "description": "Full local preview URL (http://localhost:…/that-page). Use when you know the exact page."}
            },
            "additionalProperties": false
        }),
    )
}

fn inspect_runtime() -> Value {
    tool(
        "inspect_runtime",
        "Attach Chromium DevTools Protocol to a running local website or an Electron/Tauri/Wails webview and return Network + console evidence (failed requests, 4xx/5xx, console errors/warnings, slow resources). \
Same class of call as grep/search_files — no user approval. \
ONLY for websites and Chromium-webview desktop apps (Electron, Tauri, Wails). \
If this repo is a native app (SwiftUI, WinUI, GTK), a CLI, a game, or a headless API, do NOT call this; the tool will say so. Review source/tests/logs instead. \
Needs a running local preview or debug port. Pass `path` (e.g. /stats) or `url` (http://localhost:…).",
        json!({
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Route on the local preview, e.g. /stats or /dashboard."},
                "url": {"type": "string", "description": "Full local URL (http://localhost:5173/stats). Loopback only."}
            },
            "additionalProperties": false
        }),
    )
}

fn mcp_search() -> Value {
    tool(
        "mcp_search",
        "Find tools on connected MCP servers. Returns names, descriptions, and argument schemas. Call this before mcp_call. Individual MCP tools are not listed up front, so this catalog can change without breaking the session.",
        json!({
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Words to match against tool name or description. Empty lists a short catalog."},
                "limit": {"type": "integer", "description": "Max tools to return (default 6, max 8)."}
            },
            "required": ["query"],
            "additionalProperties": false
        }),
    )
}

fn mcp_call() -> Value {
    tool(
        "mcp_call",
        "Run one MCP tool by the qualified name from mcp_search. Pass that tool's arguments as `arguments`.",
        json!({
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Qualified tool name from mcp_search."},
                "arguments": {"type": "object", "description": "Arguments for that tool.", "additionalProperties": true}
            },
            "required": ["name"],
            "additionalProperties": false
        }),
    )
}

fn design_review() -> Value {
    tool(
        "design_review",
        "Send several persona agents through a live site at the same time, each in its own isolated browser session, and get back how the experience landed for them — the browser version of the adversarial review. Use it when the user asks for UX, UI, conversion, or marketing feedback on a running site, or in design mode after a redesign. Personas must be accurate, specific people with a real reason to be there (e.g. a parent buying a specific stroller on a budget, a CTO evaluating the pricing page), not generic 'users'. Results show as cards with a screenshot and a browser view; do not paste the transcripts back into the chat — summarize the shared findings and fix the top issues.",
        json!({
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Site to test, usually the local dev server."},
                "personas": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 4,
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "Short handle, e.g. Maya, budget parent."},
                            "profile": {"type": "string", "description": "Who they are: role, context, device habits, patience, what they compare against."},
                            "goal": {"type": "string", "description": "The one concrete thing they came to do on this site."}
                        },
                        "required": ["name", "profile", "goal"],
                        "additionalProperties": false
                    }
                },
                "steps": {"type": "number", "description": "Moves each persona may make, 3–10. Default 6."}
            },
            "required": ["url", "personas"],
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
        assert!(names.contains(&"plugin_list".to_string()));
        assert!(!names.contains(&"plugin_run".to_string()));
        assert!(!names.contains(&"generate_svg".to_string()));
        assert!(!names.contains(&"generate_image".to_string()));
        assert!(!names.contains(&"save_media".to_string()));
        assert!(names.contains(&"ask_user".to_string()));
    }

    #[test]
    fn code_mode_includes_plugin_run() {
        let tools = tools_for_mode_and_family("code", ModelFamily::OpenAi, vec![]);
        let names = tool_names(&tools);
        assert!(names.contains(&"plugin_run".to_string()));
        assert!(names.contains(&"plugin_list".to_string()));
        assert!(names.contains(&"screenshot_page".to_string()));
        assert!(names.contains(&"generate_svg".to_string()));
        assert!(names.contains(&"generate_image".to_string()));
        assert!(names.contains(&"save_media".to_string()));
        assert!(names.contains(&"ask_user".to_string()));
    }

    #[test]
    fn ask_mode_has_no_screenshot_page() {
        let tools = tools_for_mode_and_family("ask", ModelFamily::OpenAi, vec![]);
        let names = tool_names(&tools);
        assert!(!names.contains(&"screenshot_page".to_string()));
        assert!(!names.contains(&"inspect_runtime".to_string()));
    }

    #[test]
    fn review_mode_includes_inspect_runtime() {
        let tools = tools_for_mode_and_family("review", ModelFamily::OpenAi, vec![]);
        let names = tool_names(&tools);
        assert!(names.contains(&"inspect_runtime".to_string()));
        assert!(names.contains(&"screenshot_page".to_string()));
    }

    #[test]
    fn visual_mode_has_design_previews_code_does_not() {
        let visual = tools_for_mode_and_family("visual", ModelFamily::OpenAi, vec![]);
        let code = tools_for_mode_and_family("code", ModelFamily::OpenAi, vec![]);
        let v = tool_names(&visual);
        let c = tool_names(&code);
        assert!(v.contains(&"render_design_previews".to_string()));
        assert!(!c.contains(&"render_design_previews".to_string()));
    }

    #[test]
    fn stable_tools_ignore_mode() {
        let code = tool_names(&stable_tools(ModelFamily::OpenAi));
        assert!(code.contains(&"apply_patch".to_string()));
        assert!(code.contains(&"read_file".to_string()));
        assert!(code.contains(&"mcp_search".to_string()));
        assert!(code.contains(&"mcp_call".to_string()));
        assert!(code.contains(&"list_chats".to_string()));
        assert!(code.contains(&"render_design_previews".to_string()));
        assert_eq!(code, tool_names(&stable_tools(ModelFamily::OpenAi)));
    }

    #[test]
    fn steer_drops_unused_packs_keeps_core() {
        let tools = stable_tools(ModelFamily::OpenAi);
        let packs = SteerPacks {
            workspace: false,
            plugins: true,
            browse: false,
            web: false,
            git: false,
            terminal: false,
            media: false,
            hint: String::new(),
        };
        let names = tool_names(&apply_steer_packs(tools, &packs));
        assert!(names.contains(&"plugin_run".to_string()));
        assert!(names.contains(&"plugin_search".to_string()));
        assert!(!names.contains(&"plugin_list".to_string()));
        assert!(!names.contains(&"plugin_tools".to_string()));
        assert!(names.contains(&"finish".to_string()));
        assert!(names.contains(&"ask_user".to_string()));
        assert!(names.contains(&"decide".to_string()));
        assert!(!names.contains(&"read_file".to_string()));
        assert!(!names.contains(&"run_terminal".to_string()));
        assert!(!names.contains(&"web_search".to_string()));
        assert!(!names.contains(&"git_status".to_string()));
        assert!(!names.contains(&"generate_image".to_string()));
    }

    #[test]
    fn steer_all_on_keeps_full_list() {
        let full = tool_names(&stable_tools(ModelFamily::OpenAi));
        assert_eq!(
            full,
            tool_names(&apply_steer_packs(
                stable_tools(ModelFamily::OpenAi),
                &SteerPacks::all_on()
            ))
        );
    }

    #[test]
    fn chat_memory_tools_only_when_enabled() {
        let off = tools_for_mode_family_and_memory("code", ModelFamily::OpenAi, vec![], false);
        let on = tools_for_mode_family_and_memory("code", ModelFamily::OpenAi, vec![], true);
        let off_names = tool_names(&off);
        let on_names = tool_names(&on);
        assert!(!off_names.contains(&"list_chats".to_string()));
        assert!(!off_names.contains(&"read_chat".to_string()));
        assert!(on_names.contains(&"list_chats".to_string()));
        assert!(on_names.contains(&"read_chat".to_string()));
        let ask_on = tools_for_mode_family_and_memory("ask", ModelFamily::OpenAi, vec![], true);
        let ask_names = tool_names(&ask_on);
        assert!(ask_names.contains(&"list_chats".to_string()));
        assert!(ask_names.contains(&"read_chat".to_string()));
    }
}

