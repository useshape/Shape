//! Rust decision kernel for one chat turn.
//!
//! Obvious turns are classified here, with no model call. The main model only
//! sees the tools, skills, and context this decision selects. Security checks
//! never read it. Uncertain turns stay on a small tool list. Jev may add packs
//! on those turns only (`agent::steer`); it cannot change capability or grant
//! writes on Ask/Plan. If Jev is skipped or fails closed, `load_tools` still
//! escalates.

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
    pub reverse: bool,
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
            reverse: self.reverse || other.reverse,
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
            "{}{}{}{}{}{}{}{}",
            self.workspace as u8,
            self.plugins as u8,
            self.browse as u8,
            self.web as u8,
            self.git as u8,
            self.terminal as u8,
            self.media as u8,
            self.reverse as u8,
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
    // Plan is a tool, not a mode. A stored Plan capability must not lock the turn.
    let sticky = sticky.filter(|cap| !matches!(cap, Capability::Plan));
    let hint = hint.filter(|cap| !matches!(cap, Capability::Plan));
    if is_internal_continuation(&text) {
        if let Some(stuck) = sticky {
            return TurnDecision {
                capability: stuck,
                packs: Packs::default(),
                skills: Vec::new(),
                context: ContextNeed {
                    repo_map: false,
                    diagnostics: false,
                    git_status: false,
                },
                confident: true,
            };
        }
    }
    let change = !is_internal_continuation(&text) && has_change_verb(&text);
    let go_ahead = is_go_ahead(&text);
    let question = is_question(&text);
    let browse = has_browse_signal(&text);
    let git = has_git_signal(&text);
    let media = has_media_signal(&text);
    let reverse = has_reverse_signal(&text);
    let terminal = has_terminal_signal(&text);
    let plugins = has_plugin_signal(&text);
    let web = has_web_signal(&text);

    let (capability, confident) = if hint == Some(Capability::Ask) && !go_ahead {
        (Capability::Ask, true)
    } else if change {
        (Capability::Code, true)
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
    // A web lookup is research. The browser stays with it, including in Ask and Plan.
    packs.browse = browse || web;
    packs.git = git;
    packs.media = media;
    packs.reverse = reverse;
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
            if packs.reverse {
                push_skill(&mut skills, "reverse");
            }
            if skills.is_empty() {
                push_skill(&mut skills, "edits");
            }
        }
        _ => {
            if packs.browse {
                push_skill(&mut skills, "browse");
            }
            if packs.reverse {
                push_skill(&mut skills, "reverse");
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

fn is_internal_continuation(text: &str) -> bool {
    text.contains("<subagent_update>") || text.contains("<scheduled_followup")
}

fn has_change_verb(text: &str) -> bool {
    const WORDS: &[&str] = &[
        "fix", "implement", "refactor", "add ", "create", "build", "edit", "update", "change",
        "write", "remove", "delete", "install", "wire", "rename", "replace", "debug", "generate",
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

fn has_web_signal(text: &str) -> bool {
    if text.contains("http://") || text.contains("https://") {
        return true;
    }
    const WORDS: &[&str] = &[
        "search the web",
        "web search",
        "look up",
        "look it up",
        "google ",
        "on the web",
        "online docs",
        "from the internet",
        "latest version of",
        "latest release of",
        "research",
    ];
    WORDS.iter().any(|w| text.contains(w))
}

fn has_browse_signal(text: &str) -> bool {
    text.contains("http://")
        || text.contains("https://")
        || text.contains("localhost")
        || text.contains("screenshot")
        || text.contains("open the page")
        || text.contains("open the site")
        || text.contains("website")
        || text.contains("brows")
        || text.contains("navigat")
        || text.contains("click through")
        || text.contains("go to the site")
        || text.contains("go to this site")
        || text.contains(".com")
        || text.contains(".org")
        || text.contains(".dev")
        || text.contains(".io")
        || text.contains(".app")
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

fn has_reverse_signal(text: &str) -> bool {
    text.contains("disassembl")
        || text.contains("decompile")
        || text.contains("reverse engineer")
        || text.contains("binary")
        || text.contains("firmware")
        || text.contains(".exe")
        || text.contains(" pe ")
        || text.contains("elf")
        || text.contains("wasm")
        || text.contains("imports of")
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
            assert!(!d.packs.web, "{sample}");
        }
    }

    #[test]
    fn identity_questions_do_not_load_web() {
        let d = decide("what model are you", None, locks(), None);
        assert_eq!(d.capability, Capability::Ask);
        assert!(!d.packs.web);
        assert!(!d.packs.workspace);
        assert!(!d.packs.browse);
        assert!(!d.packs.git);
        assert!(!d.packs.media);
    }

    #[test]
    fn explicit_web_lookup_still_loads_web() {
        let d = decide(
            "What is the latest DeepSeek release? Search the web.",
            None,
            locks(),
            None,
        );
        assert_eq!(d.capability, Capability::Ask);
        assert!(d.packs.web);
    }

    #[test]
    fn mentioning_a_plan_does_not_enter_plan_mode() {
        let perks = decide(
            "Go to useshape.org and tell me the free plan perks",
            None,
            locks(),
            None,
        );
        assert_ne!(perks.capability, Capability::Plan);
        assert!(perks.packs.browse);

        let asked = decide(
            "Plan how we should split the settings page",
            None,
            locks(),
            Some(Capability::Plan),
        );
        assert_ne!(asked.capability, Capability::Plan);
        assert!(!asked.packs.workspace);
    }

    #[test]
    fn go_ahead_upgrades_a_plan() {
        let d = decide("Go ahead and build it", Some(Capability::Plan), locks(), None);
        assert_eq!(d.capability, Capability::Code);
        assert!(d.packs.workspace);
    }

    #[test]
    fn a_stored_plan_does_not_block_the_next_edit() {
        let mut held = locks();
        held.allow_upgrade = false;
        let d = decide("Also fix the empty state", Some(Capability::Plan), held, None);
        assert_eq!(d.capability, Capability::Code);
        assert!(d.packs.workspace);
    }

    #[test]
    fn subagent_update_keeps_ask() {
        let body = "<subagent_update>\nThread finished. Create a summary of the files it touched.\n</subagent_update>";
        let d = decide(body, Some(Capability::Ask), locks(), None);
        assert_eq!(d.capability, Capability::Ask);
        assert!(!d.packs.workspace);
    }

    #[test]
    fn scheduled_followup_does_not_stay_in_plan_mode() {
        let body = "<scheduled_followup>create the missing tests</scheduled_followup>";
        let d = decide(body, Some(Capability::Plan), locks(), None);
        assert_ne!(d.capability, Capability::Plan);
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
    fn reverse_request_loads_reverse_pack() {
        let d = decide("Disassemble this PE binary and list imports", None, locks(), None);
        assert!(d.packs.reverse);
    }

    #[test]
    #[test]
    fn site_research_in_ask_keeps_the_browser() {
        let d = decide(
            "Look at sentry.io and tell me what the product actually does.",
            Some(Capability::Ask),
            locks(),
            Some(Capability::Ask),
        );
        assert_eq!(d.capability, Capability::Ask);
        assert!(d.packs.browse);
        assert!(d.packs.web);
        assert!(!d.packs.workspace);
    }

    #[test]
    fn web_lookup_also_offers_the_browser() {
        let d = decide(
            "What is the latest DeepSeek release? Search the web.",
            Some(Capability::Ask),
            locks(),
            Some(Capability::Ask),
        );
        assert!(d.packs.web);
        assert!(d.packs.browse);
    }

    #[test]
    fn read_only_still_offers_browser_research() {
        let d = decide(
            "I want you to conduct a hands-on browser research task.",
            Some(Capability::Ask),
            locks(),
            Some(Capability::Ask),
        );
        assert_eq!(d.capability, Capability::Ask);
        assert!(d.packs.browse);
        assert!(d.packs.web);
        assert!(!d.packs.workspace);
        assert!(!d.packs.terminal);
    }

    #[test]
    fn browse_is_a_pack_not_a_mode() {
        let d = decide("Open https://example.com and screenshot the header", None, locks(), None);
        assert!(d.packs.browse);
        assert_ne!(d.capability, Capability::Ask);
    }

    #[test]
    fn asking_to_browse_or_navigate_loads_the_browser() {
        assert!(decide("why isn't direct browsing working?", None, locks(), None).packs.browse);
        assert!(decide("maybe just actually navigate the site, dont just tool call", None, locks(), None).packs.browse);
        assert!(decide("use the visual browser tool", None, locks(), None).packs.browse);
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
    fn long_observation_stays_unconfident_without_edit_verbs() {
        let d = decide(
            "Look at the header spacing on the settings page and tell me what feels off about the alignment of the rows",
            None,
            locks(),
            None,
        );
        assert_eq!(d.capability, Capability::Code);
        assert!(!d.confident);
        assert!(!d.packs.workspace);
        assert!(!d.packs.terminal);
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
        eprintln!(
            "kernel 1000 classifications in {:?} ({:.1} µs/call)",
            elapsed,
            elapsed.as_secs_f64() * 1_000_000.0 / 1000.0
        );
        assert!(
            elapsed.as_millis() < 200,
            "kernel batch took {elapsed:?}, expected well under a model round trip"
        );
    }
}
