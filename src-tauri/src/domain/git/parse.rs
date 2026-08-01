//! Pure parsers for git CLI output (unit-testable without libgit2).

#![allow(dead_code)]

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PorcelainStatus {
    pub index_status: char,
    pub worktree_status: char,
    pub path: String,
}

/// Parse a single line of `git status --porcelain` output.
pub fn parse_porcelain_status_line(line: &str) -> Option<PorcelainStatus> {
    let line = line.trim_end();
    if line.len() < 4 {
        return None;
    }
    let bytes = line.as_bytes();
    let index_status = bytes[0] as char;
    let worktree_status = bytes[1] as char;
    let path = line[3..].trim().to_string();
    if path.is_empty() {
        return None;
    }
    Some(PorcelainStatus {
        index_status,
        worktree_status,
        path,
    })
}

/// Parse a line from `git branch` output (`* main` or `  feature`).
pub fn parse_git_branch_line(line: &str) -> Option<(bool, String)> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Some(name) = trimmed.strip_prefix('*') {
        let branch = name.trim().to_string();
        if branch.is_empty() {
            return None;
        }
        return Some((true, branch));
    }
    if trimmed.starts_with('+') || trimmed.starts_with('-') {
        return None;
    }
    Some((false, trimmed.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_porcelain_modified() {
        let entry = parse_porcelain_status_line(" M src/app.ts").unwrap();
        assert_eq!(entry.index_status, ' ');
        assert_eq!(entry.worktree_status, 'M');
        assert_eq!(entry.path, "src/app.ts");
    }

    #[test]
    fn parse_porcelain_staged_added() {
        let entry = parse_porcelain_status_line("A  src/new.ts").unwrap();
        assert_eq!(entry.index_status, 'A');
        assert_eq!(entry.worktree_status, ' ');
        assert_eq!(entry.path, "src/new.ts");
    }

    #[test]
    fn parse_porcelain_renamed() {
        let entry = parse_porcelain_status_line("R  src/old.ts -> src/new.ts").unwrap();
        assert_eq!(entry.path, "src/old.ts -> src/new.ts");
    }

    #[test]
    fn parse_porcelain_ignores_short_lines() {
        assert!(parse_porcelain_status_line(" M").is_none());
    }

    #[test]
    fn parse_branch_current() {
        assert_eq!(
            parse_git_branch_line("* main"),
            Some((true, "main".to_string()))
        );
    }

    #[test]
    fn parse_branch_other() {
        assert_eq!(
            parse_git_branch_line("  feature/login"),
            Some((false, "feature/login".to_string()))
        );
    }

    #[test]
    fn parse_branch_skips_decorations() {
        assert!(parse_git_branch_line("+ merged").is_none());
    }
}
