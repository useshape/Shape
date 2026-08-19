const fs = require("fs");
const path = require("path");

const bak =
  "c:/Users/User/Desktop/shape-monorepo/shape/src-tauri/src/agent/commands/mod.rs.bak";
const lines = fs.readFileSync(bak, "utf8").split(/\n/);
const slice = (a, b) => lines.slice(a - 1, b).join("\n").replace(/\r/g, "");
const dir =
  "c:/Users/User/Desktop/shape-monorepo/shape/src-tauri/src/agent/commands";

let titlesBody = slice(723, 928)
  .replace(/^fn estimate_credits/m, "pub(crate) fn estimate_credits")
  .replace(/^fn estimate_cost/m, "pub(crate) fn estimate_cost")
  .replace(/^fn title_from_message/m, "pub(crate) fn title_from_message")
  .replace(/^async fn maybe_regenerate_title/m, "pub(crate) async fn maybe_regenerate_title")
  .replace(/^fn sanitize_generated_title/m, "pub(crate) fn sanitize_generated_title")
  .replace(/^fn short_fallback_title/m, "pub(crate) fn short_fallback_title")
  .replace(/\n\/\/ ----- Tauri[\s\S]*$/, "");

fs.writeFileSync(
  path.join(dir, "titles.rs"),
  `//! Chat title generation helpers.
use super::logging;
use super::streaming;
use crate::agent::model_router;
use crate::agent::models::AgentState;
use crate::core::error::AppError;
use reqwest::Client;
use tauri::Emitter;

const MODEL_TITLE_GEN: &str = model_router::MODEL_FAST;

${titlesBody}
`
);

let ap = fs.readFileSync(path.join(dir, "approvals.rs"), "utf8");
if (!ap.includes("use super::history")) {
  ap = ap.replace(
    "use super::logging;\nuse crate::agent::models::AgentState;",
    `use super::history;
use super::journals;
use super::logging;
use crate::agent::models::{AgentState, ChatMessage};
use crate::commands::preview_render::PreviewCaptureState;`
  );
}
for (const name of [
  "stop_chat_message",
  "apply_file_edit",
  "approve_terminal_command",
  "reject_terminal_command",
  "resolve_edit_approval",
]) {
  const re = new RegExp(`(?<!#\\[tauri::command\\]\\n)pub (async )?fn ${name}`);
  if (!new RegExp(`#\\[tauri::command\\]\\s*\\npub (async )?fn ${name}`).test(ap)) {
    ap = ap.replace(
      new RegExp(`pub (async )?fn ${name}`),
      "#[tauri::command]\npub $1fn " + name
    );
  }
}
ap = ap.replace(/\bnow_f64\(/g, "history::now_f64(");
fs.writeFileSync(path.join(dir, "approvals.rs"), ap);

let sc = fs.readFileSync(path.join(dir, "send_chat.rs"), "utf8");
if (!sc.includes("use super::adversarial_review")) {
  sc = sc.replace(
    "use super::history;",
    "use super::adversarial_review;\nuse super::history;"
  );
}
if (!sc.includes("sanitize_generated_title")) {
  sc = sc.replace(
    "use super::titles::{",
    "use super::titles::{sanitize_generated_title, "
  );
}
sc = sc.replace(/super::models::/g, "crate::agent::models::");
fs.writeFileSync(path.join(dir, "send_chat.rs"), sc);

let cv = fs.readFileSync(path.join(dir, "conversation.rs"), "utf8");
cv = cv.replace(/super::models::/g, "crate::agent::models::");
fs.writeFileSync(path.join(dir, "conversation.rs"), cv);

let cm = fs.readFileSync(path.join(dir, "commit_message.rs"), "utf8");
if (!cm.includes("use super::messages")) {
  cm = cm.replace(
    "use crate::agent::models::AgentState;",
    `use crate::agent::models::{AgentState, ChatMessage};
use crate::agent::prompts;
use super::messages;`
  );
}
if (!cm.includes("#[tauri::command]")) {
  cm = cm.replace(
    /pub async fn generate_commit_message/,
    "#[tauri::command]\npub async fn generate_commit_message"
  );
}
fs.writeFileSync(path.join(dir, "commit_message.rs"), cm);

let lib = fs.readFileSync(
  "c:/Users/User/Desktop/shape-monorepo/shape/src-tauri/src/lib.rs",
  "utf8"
);
const map = {
  "agent::send_chat_message": "agent::commands::send_chat::send_chat_message",
  "agent::get_chat_history": "agent::commands::conversation::get_chat_history",
  "agent::get_chat_generation_state":
    "agent::commands::conversation::get_chat_generation_state",
  "agent::clear_chat_history":
    "agent::commands::conversation::clear_chat_history",
  "agent::new_chat": "agent::commands::conversation::new_chat",
  "agent::load_conversation":
    "agent::commands::conversation::load_conversation",
  "agent::delete_conversation":
    "agent::commands::conversation::delete_conversation",
  "agent::stop_chat_message": "agent::commands::approvals::stop_chat_message",
  "agent::get_chat_title": "agent::commands::conversation::get_chat_title",
  "agent::get_current_conversation_id":
    "agent::commands::conversation::get_current_conversation_id",
  "agent::get_conversations":
    "agent::commands::conversation::get_conversations",
  "agent::apply_file_edit": "agent::commands::approvals::apply_file_edit",
  "agent::generate_commit_message":
    "agent::commands::commit_message::generate_commit_message",
  "agent::approve_terminal_command":
    "agent::commands::approvals::approve_terminal_command",
  "agent::reject_terminal_command":
    "agent::commands::approvals::reject_terminal_command",
  "agent::resolve_edit_approval":
    "agent::commands::approvals::resolve_edit_approval",
  "agent::restore_checkpoint":
    "agent::commands::conversation::restore_checkpoint",
  "agent::get_turn_journal": "agent::commands::conversation::get_turn_journal",
  "agent::get_open_turn_journals":
    "agent::commands::conversation::get_open_turn_journals",
};
for (const [a, b] of Object.entries(map)) {
  // Avoid double-rewriting if already updated
  if (!lib.includes(b)) {
    lib = lib.split(a).join(b);
  }
}
fs.writeFileSync(
  "c:/Users/User/Desktop/shape-monorepo/shape/src-tauri/src/lib.rs",
  lib
);

console.log("fixed");
console.log(
  "titles has maybe_regenerate",
  fs.readFileSync(path.join(dir, "titles.rs"), "utf8").includes("maybe_regenerate_title")
);
console.log(
  "approvals attrs",
  (fs.readFileSync(path.join(dir, "approvals.rs"), "utf8").match(/#\[tauri::command\]/g) || [])
    .length
);
