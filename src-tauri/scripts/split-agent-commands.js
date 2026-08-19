/**
 * Split agent/commands/mod.rs: send_chat, titles, commit_message, conversation, approvals.
 */
const fs = require("fs");
const path = require("path");

const dir = "c:/Users/User/Desktop/shape-monorepo/shape/src-tauri/src/agent/commands";
const srcPath = path.join(dir, "mod.rs");
const bakPath = path.join(dir, "mod.rs.bak");
const raw = fs.readFileSync(srcPath, "utf8");
if (!fs.existsSync(bakPath)) fs.writeFileSync(bakPath, raw);
const lines = raw.split(/\n/);
const slice = (a, b) => lines.slice(a - 1, b).join("\n").replace(/\r/g, "");

// preamble imports that modules need variously — each file gets its own imports.

// titles.rs: 723-930 (estimate + title helpers) — used by send_chat
fs.writeFileSync(
  path.join(dir, "titles.rs"),
  `//! Chat title generation helpers.
use super::logging;
use super::streaming;
use crate::agent::model_router;
use crate::core::error::AppError;
use reqwest::Client;

const MODEL_TITLE_GEN: &str = model_router::MODEL_FAST;

${slice(723, 930)}
`
);

// commit_message.rs: 931-1107
fs.writeFileSync(
  path.join(dir, "commit_message.rs"),
  `//! Generate commit message command + helpers.
use super::logging;
use super::streaming;
use super::titles::{sanitize_generated_title, short_fallback_title};
use crate::agent::model_router;
use crate::agent::models::AgentState;
use crate::app_state::AppState;
use crate::commands::git;
use crate::core::error::AppError;
use reqwest::Client;

const MODEL_TITLE_GEN: &str = model_router::MODEL_FAST;

${slice(931, 1107)}
`
);

// conversation.rs: 1109-1418
fs.writeFileSync(
  path.join(dir, "conversation.rs"),
  `//! Conversation list / load / clear / checkpoint restore / journals.
use super::checkpoints;
use super::history;
use super::journals;
use super::logging;
use crate::agent::models::{AgentState, ChatMessage};
use crate::app_state::AppState;
use crate::commands::preview_render::PreviewCaptureState;
use crate::core::error::AppError;
use serde_json::json;
use tauri::{Emitter, Manager};

${slice(1109, 1418)}
`
);

// approvals.rs: 1420-end
fs.writeFileSync(
  path.join(dir, "approvals.rs"),
  `//! Stop turn, apply edit, terminal/edit approvals.
use super::logging;
use crate::agent::models::AgentState;
use crate::app_state::AppState;
use crate::commands::pty::PtyState;
use crate::core::error::AppError;
use serde_json::json;
use tauri::{Emitter, Manager};

${slice(1420, lines.length)}
`
);

// send_chat.rs: the big turn runner (35-721) — needs titles helpers
fs.writeFileSync(
  path.join(dir, "send_chat.rs"),
  `//! Primary chat turn entrypoint.
use super::context::{build_context_with_options, context_options_for_query};
use super::history;
use super::journals;
use super::logging;
use super::messages;
use super::run_turn;
use super::streaming;
use super::titles::{
    estimate_cost_per_token, estimate_credits_charged, maybe_regenerate_title, title_from_message,
};
use super::tools::schema;
use crate::agent::model_router;
use crate::agent::models::{AgentState, AutoRunMode, ChatMessage, TurnPolicy};
use crate::agent::prompts;
use crate::app_state::AppState;
use crate::commands::pty::PtyState;
use crate::core::error::AppError;
use reqwest::Client;
use serde_json::json;
use tauri::{Emitter, Manager};

use history::now_f64;

const MODEL_DEFAULT: &str = "anthropic/claude-sonnet-4.6";
const MODEL_TITLE_GEN: &str = model_router::MODEL_FAST;

${slice(35, 721)}
`
);

// Fix send_chat imports — context/tools/prompts are under agent not commands
let send = fs.readFileSync(path.join(dir, "send_chat.rs"), "utf8");
send = send
  .replace(
    "use super::context::{build_context_with_options, context_options_for_query};",
    "use crate::agent::context::{build_context_with_options, context_options_for_query};"
  )
  .replace("use super::tools::schema;", "use crate::agent::tools::schema;")
  .replace(
    "use crate::agent::prompts;",
    "use crate::agent::prompts;"
  );
fs.writeFileSync(path.join(dir, "send_chat.rs"), send);

// Fix titles — estimate_credits and capitalize are in the slice; streaming::ProxyContext used by maybe_regenerate
let titles = fs.readFileSync(path.join(dir, "titles.rs"), "utf8");
// maybe_regenerate uses AgentState, AppHandle, etc. — check slice starts at estimate_credits
if (!titles.includes("AgentState")) {
  titles = titles.replace(
    "use crate::core::error::AppError;",
    `use crate::agent::models::AgentState;
use crate::core::error::AppError;
use tauri::Emitter;`
  );
}
fs.writeFileSync(path.join(dir, "titles.rs"), titles);

// mod.rs
fs.writeFileSync(
  path.join(dir, "mod.rs"),
  `pub mod adversarial_review;
pub mod approvals;
pub mod checkpoints;
pub mod commit_message;
pub mod conversation;
pub mod history;
pub mod indexing;
pub mod journals;
pub mod logging;
pub mod mcp_cmds;
pub mod messages;
pub mod run_turn;
pub mod send_chat;
pub mod streaming;
pub mod terminal;
pub mod titles;
pub mod tool_call_leak_parser;

pub use approvals::{
    apply_file_edit, approve_terminal_command, reject_terminal_command, resolve_edit_approval,
    stop_chat_message,
};
pub use commit_message::generate_commit_message;
pub use conversation::{
    clear_chat_history, delete_conversation, get_chat_generation_state, get_chat_history,
    get_chat_title, get_conversations, get_current_conversation_id, get_open_turn_journals,
    get_turn_journal, load_conversation, new_chat, restore_checkpoint,
};
pub use send_chat::send_chat_message;
`
);

console.log("agent commands split written");
for (const f of ["mod.rs", "send_chat.rs", "titles.rs", "commit_message.rs", "conversation.rs", "approvals.rs"]) {
  const n = fs.readFileSync(path.join(dir, f), "utf8").split("\n").length;
  console.log(String(n).padStart(5), f);
}
