use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::commands::preview_render::DesignAgentOptions;

#[derive(Debug, Clone, Default)]
pub struct DesignPreviewState {
    pub options: Option<DesignAgentOptions>,
    pub gate_active: bool,
    pub sandbox_session_id: Option<String>,
}

/// How the agent handles command execution approval for the current turn.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AutoRunMode {
    /// Every command asks for approval.
    Ask,
    /// Safe-listed commands run; everything else asks (default).
    #[default]
    Auto,
    /// Everything runs except hard-blocked commands (and protected classes).
    Always,
}

impl AutoRunMode {
    pub fn from_setting(value: Option<&str>) -> Self {
        match value.map(|v| v.trim().to_ascii_lowercase()).as_deref() {
            Some("ask") | Some("ask_every_time") => Self::Ask,
            Some("always") | Some("run_everything") | Some("yolo") => Self::Always,
            _ => Self::Auto,
        }
    }
}

/// Per-turn execution policy, set from user settings when the turn starts.
#[derive(Debug, Clone)]
pub struct TurnPolicy {
    pub auto_run_mode: AutoRunMode,
    /// When true, file edits/creations are staged and need user approval
    /// before they are written to disk.
    pub require_edit_approval: bool,
    /// Destructive git commands (reset/clean/restore…) always ask, even in
    /// "run everything" mode.
    pub protect_destructive_git: bool,
}

impl Default for TurnPolicy {
    fn default() -> Self {
        Self {
            auto_run_mode: AutoRunMode::Auto,
            require_edit_approval: false,
            protect_destructive_git: true,
        }
    }
}

/// A file edit staged for user approval (content is held by the waiting tool
/// call; this is the bookkeeping the UI needs to resolve it).
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingEdit {
    pub id: String,
    pub path: String,
    pub is_new_file: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MessageStats {
    pub time_ms: f64,
    pub cost: f64,
    pub tokens: usize,
    pub input_tokens: usize,
    pub output_tokens: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credits_charged: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub used_auto: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub timestamp: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats: Option<MessageStats>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub history: Vec<ChatMessage>,
    pub project_path: String,
    pub timestamp: f64,
}

/// Represents a terminal command proposed by the AI that needs user approval.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PendingCommand {
    pub id: String,
    pub command: String,
    pub safety: String,
    pub reason: String,
    /// When set, approval runs this internal action instead of a shell command.
    /// e.g. `"git_commit"` with `payload` = commit message.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InFlightTurn {
    pub turn_id: String,
    #[serde(default)]
    pub conversation_id: Option<String>,
    pub partial_content: String,
    pub started_at: f64,
    pub activity_label: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatGenerationState {
    pub is_generating: bool,
    pub turn_id: Option<String>,
    pub conversation_id: Option<String>,
    pub partial_content: Option<String>,
    pub activity_label: Option<String>,
}

/// Pre-edit snapshot of a single file, captured the first time a turn touches it.
/// `original_content: None` means the file did not exist before the turn (it was
/// created), so restoring means deleting it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSnapshot {
    pub path: String,
    pub original_content: Option<String>,
}

/// All file snapshots captured for edits made starting at a given chat history
/// index (the index of the user message that kicked off the turn).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TurnCheckpoint {
    pub message_index: usize,
    pub files: Vec<FileSnapshot>,
}

pub struct AgentState {
    pub history: Mutex<Vec<ChatMessage>>,
    pub title: Mutex<Option<String>>,
    pub current_project: Mutex<Option<String>>,
    pub conversations: Mutex<HashMap<String, Vec<Conversation>>>,
    pub current_conversation_id: Mutex<Option<String>>,
    pub cancellation_token: Mutex<CancellationToken>,
    /// In-flight agent terminal session ids for stop/cancel (supports concurrent background jobs).
    pub active_terminals: Mutex<std::collections::HashSet<u32>>,
    /// Terminal commands awaiting user approval.
    pub pending_commands: Mutex<HashMap<String, PendingCommand>>,
    /// User decisions for pending commands: id -> approved. The waiting tool
    /// call consumes the decision and (on approval) executes the command.
    pub command_decisions: Mutex<HashMap<String, bool>>,
    /// File edits awaiting user approval.
    pub pending_edits: Mutex<HashMap<String, PendingEdit>>,
    /// User decisions for pending edits: id -> approved.
    pub edit_decisions: Mutex<HashMap<String, bool>>,
    /// Execution policy for the active turn (auto-run mode, edit approval).
    pub turn_policy: Mutex<TurnPolicy>,
    /// Accumulates input/output tokens for the active user turn.
    pub turn_meter: Mutex<(usize, usize)>,
    /// Compressed summary of older chat turns when history grows long.
    pub history_summary: Mutex<Option<String>>,
    /// Partial assistant turn while generation is in flight.
    pub in_flight: Mutex<Option<InFlightTurn>>,
    /// Debounce timestamp for persisting in-flight partial content.
    pub in_flight_last_save: Mutex<f64>,
    /// Design-mode preview gate and temporary React sandbox session.
    pub design_preview: Mutex<DesignPreviewState>,
    /// Pre-edit file snapshots for the active conversation, keyed by the chat
    /// history index of the user turn that produced them. Restoring a checkpoint
    /// replays these (most recent first) back onto disk.
    pub file_checkpoints: Mutex<Vec<TurnCheckpoint>>,
}

impl Default for AgentState {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentState {
    pub fn new() -> Self {
        Self {
            history: Mutex::new(Vec::new()),
            title: Mutex::new(None),
            current_project: Mutex::new(None),
            conversations: Mutex::new(HashMap::new()),
            current_conversation_id: Mutex::new(None),
            cancellation_token: Mutex::new(CancellationToken::new()),
            active_terminals: Mutex::new(std::collections::HashSet::new()),
            pending_commands: Mutex::new(HashMap::new()),
            command_decisions: Mutex::new(HashMap::new()),
            pending_edits: Mutex::new(HashMap::new()),
            edit_decisions: Mutex::new(HashMap::new()),
            turn_policy: Mutex::new(TurnPolicy::default()),
            turn_meter: Mutex::new((0, 0)),
            history_summary: Mutex::new(None),
            in_flight: Mutex::new(None),
            in_flight_last_save: Mutex::new(0.0),
            design_preview: Mutex::new(DesignPreviewState::default()),
            file_checkpoints: Mutex::new(Vec::new()),
        }
    }

    /// Atomically claim the in-flight slot. Returns false if a turn is already running.
    pub fn try_begin_in_flight(&self, turn_id: String, conversation_id: Option<String>) -> bool {
        let Ok(mut guard) = self.in_flight.lock() else {
            return false;
        };
        if guard.is_some() {
            return false;
        }
        *guard = Some(InFlightTurn {
            turn_id,
            conversation_id,
            partial_content: String::new(),
            started_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs_f64())
                .unwrap_or(0.0),
            activity_label: None,
        });
        true
    }

    #[allow(dead_code)]
    pub fn begin_in_flight(&self, turn_id: String, conversation_id: Option<String>) {
        let _ = self.try_begin_in_flight(turn_id, conversation_id);
    }

    pub fn set_in_flight_activity_label(&self, label: Option<&str>) {
        if let Ok(mut guard) = self.in_flight.lock() {
            if let Some(in_flight) = guard.as_mut() {
                in_flight.activity_label = label.map(|s| s.to_string());
            }
        }
    }

    pub fn append_in_flight(&self, chunk: &str, activity_label: Option<&str>, project_path: Option<&str>) {
        let (should_save, owner_conv_id, title_snapshot, partial_snapshot) = {
            let mut guard = match self.in_flight.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            let Some(in_flight) = guard.as_mut() else {
                return;
            };
            in_flight.partial_content.push_str(chunk);
            if let Some(label) = activity_label {
                in_flight.activity_label = Some(label.to_string());
            }
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs_f64())
                .unwrap_or(0.0);
            let last_ts = self
                .in_flight_last_save
                .lock()
                .map(|l| *l)
                .unwrap_or(0.0);
            let bytes = in_flight.partial_content.len();
            let should_save = now - last_ts > 2.0 || (bytes > 0 && bytes % 8192 < chunk.len());
            (
                should_save,
                in_flight.conversation_id.clone(),
                self.title.lock().ok().and_then(|t| t.clone()),
                in_flight.partial_content.clone(),
            )
        };
        if !should_save {
            return;
        }
        if let Some(path) = project_path {
            let current_id = self
                .current_conversation_id
                .lock()
                .ok()
                .and_then(|g| g.clone());
            let owns_live = owner_conv_id.is_some() && owner_conv_id == current_id;
            if owns_live {
                let _ = crate::agent::commands::history::save_current_conversation(self, path);
            } else if let Some(conv_id) = owner_conv_id.as_deref() {
                // Background turn: persist partial onto the owning conversation only.
                let mut hist = {
                    let convs = self.conversations.lock().ok();
                    convs
                        .as_ref()
                        .and_then(|map| map.get(path))
                        .and_then(|list| list.iter().find(|c| c.id == conv_id))
                        .map(|c| c.history.clone())
                        .unwrap_or_default()
                };
                if hist.is_empty() {
                    // Fall back to live history only when it still belongs to this turn's chat.
                    if current_id.as_deref() == Some(conv_id) {
                        hist = self.history.lock().map(|h| h.clone()).unwrap_or_default();
                    }
                }
                if !hist.is_empty() {
                    hist = Self::merge_partial_into_history(hist, &partial_snapshot, None);
                    let title = title_snapshot.unwrap_or_else(|| "Untitled".to_string());
                    let _ = crate::agent::commands::history::upsert_conversation_snapshot(
                        self,
                        path,
                        conv_id,
                        &title,
                        hist,
                    );
                }
            }
        }
        if let Ok(mut last) = self.in_flight_last_save.lock() {
            *last = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs_f64())
                .unwrap_or(0.0);
        }
    }

    #[allow(dead_code)]
    pub fn clear_in_flight(&self) {
        if let Ok(mut guard) = self.in_flight.lock() {
            *guard = None;
        }
    }

    pub fn clear_in_flight_if(&self, turn_id: &str) {
        if let Ok(mut guard) = self.in_flight.lock() {
            if guard.as_ref().map(|f| f.turn_id.as_str()) == Some(turn_id) {
                *guard = None;
            }
        }
    }

    pub fn in_flight_turn_id(&self) -> Option<String> {
        self.in_flight_snapshot().map(|f| f.turn_id)
    }

    pub fn in_flight_conversation_id(&self) -> Option<String> {
        self.in_flight_snapshot().and_then(|f| f.conversation_id)
    }

    pub fn in_flight_snapshot(&self) -> Option<InFlightTurn> {
        self.in_flight.lock().ok().and_then(|g| g.clone())
    }

    pub fn history_for_persistence(&self) -> Result<Vec<ChatMessage>, crate::core::error::AppError> {
        let base = self.history.lock()?.clone();
        let current_id = self.current_conversation_id.lock()?.clone();
        Ok(self.merge_in_flight_into_history_for(base, current_id.as_deref()))
    }

    pub fn merge_in_flight_into_history(&self, history: Vec<ChatMessage>) -> Vec<ChatMessage> {
        let current_id = self
            .current_conversation_id
            .lock()
            .ok()
            .and_then(|g| g.clone());
        self.merge_in_flight_into_history_for(history, current_id.as_deref())
    }

    pub fn merge_in_flight_into_history_for(
        &self,
        history: Vec<ChatMessage>,
        conversation_id: Option<&str>,
    ) -> Vec<ChatMessage> {
        let Some(in_flight) = self.in_flight_snapshot() else {
            return history;
        };
        // Never merge a background turn into a different conversation's history.
        if let (Some(owner), Some(viewing)) = (in_flight.conversation_id.as_deref(), conversation_id) {
            if owner != viewing {
                return history;
            }
        } else if in_flight.conversation_id.is_some() && conversation_id.is_none() {
            return history;
        }
        Self::merge_partial_into_history(history, &in_flight.partial_content, Some(in_flight.started_at))
    }

    fn merge_partial_into_history(
        mut history: Vec<ChatMessage>,
        partial: &str,
        started_at: Option<f64>,
    ) -> Vec<ChatMessage> {
        if partial.is_empty() {
            return history;
        }
        if let Some(last) = history.last_mut() {
            if last.role == "assistant" {
                last.content = partial.to_string();
                return history;
            }
        }
        history.push(ChatMessage {
            role: "assistant".to_string(),
            content: partial.to_string(),
            timestamp: started_at.unwrap_or_else(|| {
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs_f64())
                    .unwrap_or(0.0)
            }),
            stats: None,
            model: None,
        });
        history
    }

    pub fn generation_state(&self) -> ChatGenerationState {
        match self.in_flight_snapshot() {
            Some(f) => ChatGenerationState {
                is_generating: true,
                turn_id: Some(f.turn_id),
                conversation_id: f.conversation_id,
                partial_content: Some(f.partial_content),
                activity_label: f.activity_label,
            },
            None => ChatGenerationState {
                is_generating: false,
                turn_id: None,
                conversation_id: None,
                partial_content: None,
                activity_label: None,
            },
        }
    }

    pub fn reset_turn_meter(&self) {
        if let Ok(mut meter) = self.turn_meter.lock() {
            *meter = (0, 0);
        }
    }

    pub fn record_turn_usage(&self, input_tokens: usize, output_tokens: usize) {
        if let Ok(mut meter) = self.turn_meter.lock() {
            meter.0 += input_tokens;
            meter.1 += output_tokens;
        }
    }

    pub fn turn_meter_totals(&self) -> (usize, usize) {
        self.turn_meter
            .lock()
            .map(|m| *m)
            .unwrap_or((0, 0))
    }

    /// Index of the "current turn" for checkpoint purposes: the position of the
    /// most recently pushed user message in chat history.
    pub fn current_turn_index(&self) -> usize {
        self.history
            .lock()
            .map(|h| h.len().saturating_sub(1))
            .unwrap_or(0)
    }

    /// Record the pre-edit content of `path` the first time it is touched by the
    /// turn starting at `message_index`. Subsequent edits to the same file within
    /// the same turn are no-ops (we only ever want the *original* state).
    pub fn record_file_checkpoint(&self, message_index: usize, path: &str, original_content: Option<String>) {
        let Ok(mut checkpoints) = self.file_checkpoints.lock() else {
            return;
        };
        let entry = checkpoints
            .iter_mut()
            .find(|c| c.message_index == message_index);
        match entry {
            Some(cp) => {
                if cp.files.iter().any(|f| f.path == path) {
                    return;
                }
                cp.files.push(FileSnapshot {
                    path: path.to_string(),
                    original_content,
                });
            }
            None => {
                checkpoints.push(TurnCheckpoint {
                    message_index,
                    files: vec![FileSnapshot {
                        path: path.to_string(),
                        original_content,
                    }],
                });
            }
        }
    }

    pub fn file_checkpoints_snapshot(&self) -> Vec<TurnCheckpoint> {
        self.file_checkpoints.lock().map(|c| c.clone()).unwrap_or_default()
    }

    pub fn replace_file_checkpoints(&self, checkpoints: Vec<TurnCheckpoint>) {
        if let Ok(mut guard) = self.file_checkpoints.lock() {
            *guard = checkpoints;
        }
    }

    pub fn clear_file_checkpoints(&self) {
        if let Ok(mut guard) = self.file_checkpoints.lock() {
            guard.clear();
        }
    }

    /// Remove and return every file snapshot captured at or after `message_index`,
    /// deduplicated so the earliest (closest to the true "before" state) snapshot
    /// wins per path. Used by `restore_checkpoint` to roll files back alongside
    /// chat history.
    pub fn take_checkpoints_from(&self, message_index: usize) -> Vec<FileSnapshot> {
        let Ok(mut checkpoints) = self.file_checkpoints.lock() else {
            return Vec::new();
        };
        let mut affected: Vec<TurnCheckpoint> = Vec::new();
        checkpoints.retain(|cp| {
            if cp.message_index >= message_index {
                affected.push(cp.clone());
                false
            } else {
                true
            }
        });
        affected.sort_by_key(|cp| cp.message_index);

        let mut seen = std::collections::HashSet::new();
        let mut result = Vec::new();
        for cp in affected {
            for f in cp.files {
                if seen.insert(f.path.clone()) {
                    result.push(f);
                }
            }
        }
        result
    }

    pub fn register_session(&self, id: u32) {
        if let Ok(mut set) = self.active_terminals.lock() {
            set.insert(id);
        }
    }

    pub fn clear_active_terminal(&self) {
        // Prefer unregister_session(id). Kept for Stop/cancel fallbacks that
        // need to drop every tracked agent session at once.
        if let Ok(mut set) = self.active_terminals.lock() {
            set.clear();
        }
    }

    #[allow(dead_code)]
    pub fn has_active_terminals(&self) -> bool {
        self.active_terminals
            .lock()
            .map(|s| !s.is_empty())
            .unwrap_or(false)
    }

    pub fn unregister_session(&self, id: u32) {
        if let Ok(mut set) = self.active_terminals.lock() {
            set.remove(&id);
        }
    }

    pub async fn kill_active_terminal(&self, pty_state: &crate::commands::pty::PtyState) {
        let ids: Vec<u32> = self
            .active_terminals
            .lock()
            .ok()
            .map(|mut guard| guard.drain().collect())
            .unwrap_or_default();
        for id in ids {
            let _ = crate::commands::pty::kill_session(pty_state, id).await;
        }
    }

    pub fn set_turn_policy(&self, policy: TurnPolicy) {
        if let Ok(mut guard) = self.turn_policy.lock() {
            *guard = policy;
        }
    }

    pub fn turn_policy(&self) -> TurnPolicy {
        self.turn_policy
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default()
    }

    /// Clear approval bookkeeping from a previous turn so stale decisions can
    /// never resolve a new pending item.
    pub fn clear_pending_approvals(&self) {
        if let Ok(mut g) = self.pending_commands.lock() {
            g.clear();
        }
        if let Ok(mut g) = self.command_decisions.lock() {
            g.clear();
        }
        if let Ok(mut g) = self.pending_edits.lock() {
            g.clear();
        }
        if let Ok(mut g) = self.edit_decisions.lock() {
            g.clear();
        }
    }

    pub fn begin_design_turn(&self, _options: Option<DesignAgentOptions>, _user_message: &str) {
        // Visual mode: never hard-gate writes. Previews are opt-in via the tool when
        // the user asks to see a component first; otherwise the agent implements directly.
        if let Ok(mut guard) = self.design_preview.lock() {
            guard.options = None;
            guard.gate_active = false;
            if guard.sandbox_session_id.is_none() {
                guard.sandbox_session_id = Some(uuid::Uuid::new_v4().to_string());
            }
        }
    }

    pub fn design_gate_blocks_writes(&self) -> bool {
        self.design_preview
            .lock()
            .map(|g| g.gate_active)
            .unwrap_or(false)
    }

    #[allow(dead_code)]
    pub fn design_visual_previews_enabled(&self) -> bool {
        self.design_preview
            .lock()
            .ok()
            .and_then(|g| g.options.as_ref().map(|o| o.visual_previews))
            .unwrap_or(false)
    }

    pub fn clear_design_preview_state(&self) {
        if let Ok(mut guard) = self.design_preview.lock() {
            if let Some(session_id) = guard.sandbox_session_id.take() {
                crate::commands::design_sandbox::cleanup_session(&session_id);
            }
            *guard = DesignPreviewState::default();
        }
        crate::commands::preview_render::cleanup_preview_dir();
    }

    pub fn ensure_design_sandbox_session(&self) -> String {
        if let Ok(mut guard) = self.design_preview.lock() {
            if guard.sandbox_session_id.is_none() {
                guard.sandbox_session_id = Some(uuid::Uuid::new_v4().to_string());
            }
            return guard.sandbox_session_id.clone().unwrap_or_default();
        }
        uuid::Uuid::new_v4().to_string()
    }

    #[allow(dead_code)]
    pub fn design_sandbox_session_id(&self) -> Option<String> {
        self.design_preview
            .lock()
            .ok()
            .and_then(|g| g.sandbox_session_id.clone())
    }
}
