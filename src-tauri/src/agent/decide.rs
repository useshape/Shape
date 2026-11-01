//! Rust decision kernel for one chat turn.
//!
//! Obvious turns are classified here, with no model call. The main model only
//! sees the tools, skills, and context this decision selects. Security checks
//! never read it. Uncertain turns stay on a small tool list and the main model
//! loads anything else through `load_tools`.
//!
//! A second classifier (a fast chat model, or a typed decision model such as
//! Jev) was not adopted. It adds a network round trip on the user-visible path,
//! sends the user's words to another provider, and can mark a read-only turn as
//! writable. `load_tools` already escalates the uncertain case to the model
//! that is doing the work.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Capability {
    Ask,
    Plan,
    Code,
}

impl Capability {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Ask => "Ask",
            Self::Plan => "Plan",
            Self::Code => "Code",
        }
    }

    pub fn is_read_only(self) -> bool {
        matches!(self, Self::Ask | Self::Plan)
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "ask" => Some(Self::Ask),
            "plan" => Some(Self::Plan),
            "code" | "review" | "agent" => Some(Self::Code),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Packs {
    pub workspace: bool,
    pub plugins: bool,
    pub browse: bool,
    pub web: bool,
    pub git: bool,
    pub terminal: bool,
    pub media: bool,
}

impl Packs {
    pub fn union(self, other: Self) -> Self {
        Self {
            workspace: self.workspace || other.workspace,
            plugins: self.plugins || other.plugins,
            browse: self.browse || other.browse,
            web: self.web || other.web,
            git: self.git || other.git,
            terminal: self.terminal || other.terminal,
            media: self.media || other.media,
        }
    }

    /// Settings can only remove packs. They cannot grant a pack the kernel withheld.
    pub fn clamp(self, browse_enabled: bool, shell_enabled: bool) -> Self {
        Self {
            browse: self.browse && browse_enabled,
            terminal: self.terminal && shell_enabled,
            ..self
        }
    }

    pub fn signature(self) -> String {
        format!(
            "{}{}{}{}{}{}{}",
            self.workspace as u8,
            self.plugins as u8,
            self.browse as u8,
            self.web as u8,
            self.git as u8,
            self.terminal as u8,
            self.media as u8,
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ContextNeed {
    pub repo_map: bool,
    pub diagnostics: bool,
    pub git_status: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Locks {
    pub browse_enabled: bool,
    pub shell_enabled: bool,
    /// When false, a Plan conversation does not become Code because the message
    /// contains an edit verb. An explicit "go ahead" still upgrades.
    pub allow_upgrade: bool,
}

impl Default for Locks {
    fn default() -> Self {
        Self {
            browse_enabled: true,
            shell_enabled: true,
            allow_upgrade: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TurnDecision {
    pub capability: Capability,
    pub packs: Packs,
    pub skills: Vec<&'static str>,
    pub context: ContextNeed,
    /// High means the kernel is sure. Low means the schema stays small and the
    /// main model loads packs if it needs them.
    pub confident: bool,
}

/// Classify one user message.
///
/// `sticky` is the capability this conversation already settled on.
/// `hint` is a legacy Ask or Plan selection from an older client. "Code" is
/// ignored so a default composer value cannot force every question into edits.
pub fn decide(
    message: &str,
    sticky: Option<Capability>,
    locks: Locks,
    hint: Option<Capability>,
) -> TurnDecision {
    let text = message.trim().to_ascii_lowercase();
    let change = has_change_verb(&text);
    let plan = has_plan_signal(&text);
    let go_ahead = is_go_ahead(&text);
    let question = is_question(&text);
    let browse = has_browse_signal(&text);
    let git = has_git_signal(&text);
    let media = has_media_signal(&text);
    let terminal = has_terminal_signal(&text);
    let plugins = has_plugin_signal(&text);
    let web = question || text.contains("search") || text.contains("look up") || text.contains("http");

    let (capability, confident) = if go_ahead && matches!(sticky, Some(Capability::Plan) | None) && matches!(hint, Some(Capability::Plan) | None) && (sticky == Some(Capability::Plan) || hint == Some(Capability::Plan)) {
        (Capability::Code, true)
    } else if hint == Some(Capability::Ask) && !go_ahead {
        (Capability::Ask, true)
    } else if hint == Some(Capability::Plan) && !go_ahead {
        (Capability::Plan, true)
    } else if plan && !change {
        (Capability::Plan, true)
    } else if change {
        if sticky == Some(Capability::Plan) && !locks.allow_upgrade && !go_ahead {
            (Capability::Plan, true)
        } else {
            (Capability::Code, true)
        }
    } else if question {
        (Capability::Ask, true)
    } else if let Some(stuck) = sticky {
        if is_short_continuation(&text) || !text.is_empty() {
            (stuck, true)
        } else {
            (stuck, true)
        }
    } else if text.chars().count() <= 24 {
        (Capability::Ask, true)
    } else {
        (Capability::Code, false)
    };

    let mut packs = Packs::default();
    packs.browse = browse;
    packs.git = git;
    packs.media = media;
    packs.plugins = plugins;
    packs.web = web || browse;
    match capability {
        Capability::Ask => {
            packs.workspace = false;
            packs.terminal = false;
        }
        Capability::Plan => {
            packs.workspace = false;
            packs.terminal = false;
        }
        Capability::Code if confident => {
            packs.workspace = true;
            packs.terminal = terminal || change;
        }
        Capability::Code => {
            packs.workspace = false;
            packs.terminal = false;
        }
    }
    packs = packs.clamp(locks.browse_enabled, locks.shell_enabled);

    let context = match capability {
        Capability::Code if confident => ContextNeed {
            repo_map: true,
            diagnostics: true,
            git_status: true,
        },
        Capability::Plan => ContextNeed {
            repo_map: true,
            diagnostics: false,
            git_status: true,
        },
        Capability::Ask => ContextNeed {
            repo_map: text.contains("file") || text.contains("function") || text.contains("code") || text.contains("repo"),
            diagnostics: false,
            git_status: git,
        },
        Capability::Code => ContextNeed {
            repo_map: false,
            diagnostics: false,
            git_status: false,
        },
    };

    let mut skills: Vec<&'static str> = Vec::new();
    if hint.map(|h| matches!(h, Capability::Code)) == Some(true) && text.contains("review") {
        skills.push("review");
    }
    if text.contains("review") || text.contains("security") {
        push_skill(&mut skills, "review");
    }
    match capability {
        Capability::Plan => push_skill(&mut skills, "plan"),
        Capability::Code if confident => {
            if packs.terminal {
                push_skill(&mut skills, "terminal");
            }
            if packs.git {
                push_skill(&mut skills, "git");
            }
            if packs.browse {
                push_skill(&mut skills, "browse");
            }
            if skills.is_empty() {
                push_skill(&mut skills, "edits");
            }
        }
        _ => {
            if packs.browse {
                push_skill(&mut skills, "browse");
            }
        }
    }
    skills.truncate(2);

    TurnDecision {
        capability,
        packs,
        skills,
        context,
        confident,
    }
}

fn push_skill(skills: &mut Vec<&'static str>, name: &'static str) {
    if skills.len() < 2 && !skills.contains(&name) {
        skills.push(name);
    }
}

fn has_change_verb(text: &str) -> bool {
    const WORDS: &[&str] = &[
        "fix", "implement", "refactor", "add ", "create", "build", "edit", "update", "change",
        "write", "remove", "delete", "install", "wire", "rename", "replace", "debug",
    ];
    WORDS.iter().any(|w| text.contains(w))
}

fn has_plan_signal(text: &str) -> bool {
    const WORDS: &[&str] = &[
        "plan", "how should", "outline", "don't code", "do not code", "before you code",
        "approach should",
    ];
    WORDS.iter().any(|w| text.contains(w))
}

fn is_go_ahead(text: &str) -> bool {
    const WORDS: &[&str] = &[
        "go ahead", "implement the plan", "build it", "start building", "proceed", "ship it",
    ];
    WORDS.iter().any(|w| text.contains(w))
}

fn is_question(text: &str) -> bool {
    if text.contains('?') {
        return true;
    }
    const STARTS: &[&str] = &[
        "what ", "why ", "explain", "how does", "how do", "who ", "when ", "where ", "which ",
    ];
    STARTS.iter().any(|s| text.starts_with(s))
}

fn has_browse_signal(text: &str) -> bool {
    text.contains("http://")
        || text.contains("https://")
        || text.contains("localhost")
        || text.contains("screenshot")
        || text.contains("open the page")
        || text.contains("website")
        || text.contains("browse ")
}

fn has_git_signal(text: &str) -> bool {
    text.contains("git ")
        || text.contains("commit")
        || text.contains("branch")
        || text.contains("pull request")
        || text.contains("merge")
}

fn has_media_signal(text: &str) -> bool {
    text.contains("svg")
        || text.contains("icon")
        || text.contains("logo")
        || text.contains("generate an image")
        || text.contains("generate image")
        || text.contains("audio")
}

fn has_terminal_signal(text: &str) -> bool {
    const WORDS: &[&str] = &[
        "npm", "pnpm", "yarn", "bun ", "cargo", "pytest", "pip ", "compile", "run the tests",
        "run tests", "install",
    ];
    WORDS.iter().any(|w| text.contains(w))
}

fn has_plugin_signal(text: &str) -> bool {
    const WORDS: &[&str] = &["slack", "linear", "notion", "discord", "plugin"];
    WORDS.iter().any(|w| text.contains(w))
}

fn is_short_continuation(text: &str) -> bool {
    const WORDS: &[&str] = &["ok", "okay", "yes", "thanks", "continue", "go on", "do that"];
    text.chars().count() <= 24 && WORDS.iter().any(|w| text == *w || text.starts_with(&format!("{w} ")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn locks() -> Locks {
        Locks::default()
    }

    #[test]
    fn questions_stay_read_only() {
        let samples = [
            "Why does the save button stay disabled?",
            "What does send_chat_message do?",
            "Explain how the agent picks a model",
            "How does prompt caching work here?",
        ];
        for sample in samples {
            let d = decide(sample, None, locks(), None);
            assert_eq!(d.capability, Capability::Ask, "{sample}");
            assert!(d.confident, "{sample}");
            assert!(!d.packs.workspace, "{sample}");
            assert!(!d.packs.terminal, "{sample}");
        }
    }

    #[test]
    fn plan_requests_do_not_enable_writes() {
        let d = decide("Plan how we should split the settings page", None, locks(), None);
        assert_eq!(d.capability, Capability::Plan);
        assert!(!d.packs.workspace);
        assert!(d.skills.contains(&"plan"));
    }

    #[test]
    fn go_ahead_upgrades_a_plan() {
        let d = decide("Go ahead and build it", Some(Capability::Plan), locks(), None);
        assert_eq!(d.capability, Capability::Code);
        assert!(d.packs.workspace);
    }

    #[test]
    fn cautious_lock_holds_a_plan() {
        let mut held = locks();
        held.allow_upgrade = false;
        let d = decide("Also fix the empty state", Some(Capability::Plan), held, None);
        assert_eq!(d.capability, Capability::Plan);
        assert!(!d.packs.workspace);
    }

    #[test]
    fn implementation_requests_enable_edits_and_shell() {
        let d = decide("Fix the off-by-one in the pager and run the tests", None, locks(), None);
        assert_eq!(d.capability, Capability::Code);
        assert!(d.confident);
        assert!(d.packs.workspace);
        assert!(d.packs.terminal);
    }

    #[test]
    fn browse_is_a_pack_not_a_mode() {
        let d = decide("Open https://example.com and screenshot the header", None, locks(), None);
        assert!(d.packs.browse);
        assert_ne!(d.capability, Capability::Ask);
    }

    #[test]
    fn disabled_browse_cannot_be_turned_on() {
        let mut held = locks();
        held.browse_enabled = false;
        let d = decide("Screenshot localhost:3000", None, held, None);
        assert!(!d.packs.browse);
    }

    #[test]
    fn legacy_code_hint_does_not_override_a_question() {
        let d = decide("Why is the button disabled?", None, locks(), Some(Capability::Code));
        assert_eq!(d.capability, Capability::Ask);
    }

    #[test]
    fn legacy_ask_hint_blocks_an_edit() {
        let d = decide("Fix the button", None, locks(), Some(Capability::Ask));
        assert_eq!(d.capability, Capability::Ask);
        assert!(!d.packs.workspace);
    }

    #[test]
    fn kernel_classifies_a_batch_quickly() {
        let samples = [
            "Why does save fail?",
            "Plan the migration",
            "Fix the parser and run cargo test",
            "Go ahead",
            "Look at the header spacing on the settings page and tell me what feels off about the alignment of the rows",
        ];
        let start = Instant::now();
        for _ in 0..200 {
            for sample in samples {
                let _ = decide(sample, None, locks(), None);
            }
        }
        let elapsed = start.elapsed();
        assert!(
            elapsed.as_millis() < 200,
            "kernel batch took {elapsed:?}, expected well under a model round trip"
        );
    }
}
