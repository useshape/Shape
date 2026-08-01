use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LintDiagnostic {
    pub line: u32,
    pub column: u32,
    pub end_line: u32,
    pub end_column: u32,
    pub message: String,
    pub severity: String,
    pub rule_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EslintLintResult {
    pub diagnostics: Vec<LintDiagnostic>,
    pub content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct EslintFileResult {
    #[serde(default)]
    messages: Vec<EslintMessage>,
}

#[derive(Debug, Deserialize)]
struct EslintMessage {
    #[serde(default)]
    line: u32,
    #[serde(default)]
    column: u32,
    #[serde(default, rename = "endLine")]
    end_line: u32,
    #[serde(default, rename = "endColumn")]
    end_column: u32,
    #[serde(default)]
    message: String,
    #[serde(default)]
    severity: u8,
    #[serde(default, rename = "ruleId")]
    rule_id: Option<String>,
}

fn npx_command() -> &'static str {
    if cfg!(target_os = "windows") {
        "npx.cmd"
    } else {
        "npx"
    }
}

fn write_temp_file(file_path: &str, content: &str) -> Result<PathBuf, String> {
    let path = Path::new(file_path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("txt");
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("lint");
    let temp_dir = std::env::temp_dir().join("shape-lint");
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let temp_path = temp_dir.join(format!("{}-{}.{}", stem, uuid_like(), ext));
    std::fs::write(&temp_path, content).map_err(|e| e.to_string())?;
    Ok(temp_path)
}

fn uuid_like() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0)
}

fn parse_eslint_json(stdout: &str) -> Vec<LintDiagnostic> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let parsed: Result<Vec<EslintFileResult>, _> = serde_json::from_str(trimmed);
    let files = match parsed {
        Ok(v) => v,
        Err(_) => {
            if let Ok(single) = serde_json::from_str::<EslintFileResult>(trimmed) {
                vec![single]
            } else {
                return Vec::new();
            }
        }
    };

    let mut diagnostics = Vec::new();
    for file in files {
        for msg in file.messages {
            let severity = match msg.severity {
                2 => "error",
                1 => "warning",
                _ => "info",
            };
            diagnostics.push(LintDiagnostic {
                line: msg.line.max(1),
                column: msg.column.max(1),
                end_line: if msg.end_line == 0 {
                    msg.line.max(1)
                } else {
                    msg.end_line
                },
                end_column: if msg.end_column == 0 {
                    msg.column.max(1)
                } else {
                    msg.end_column
                },
                message: msg.message,
                severity: severity.to_string(),
                rule_id: msg.rule_id,
            });
        }
    }
    diagnostics
}

pub fn eslint_lint_file(
    project_path: String,
    file_path: String,
    content: String,
    apply_fix: bool,
) -> Result<EslintLintResult, String> {
    let temp_path = write_temp_file(&file_path, &content)?;
    let temp_display = temp_path.to_string_lossy().to_string();

    let mut cmd = Command::new(npx_command());
    cmd.current_dir(&project_path)
        .arg("--yes")
        .arg("eslint")
        .arg("--format")
        .arg("json")
        .arg("--no-error-on-unmatched-pattern");
    crate::core::process::hide_console(&mut cmd);

    if apply_fix {
        cmd.arg("--fix");
    }

    cmd.arg(&temp_display);

    let output = cmd.output().map_err(|e| format!("Failed to run eslint: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let diagnostics = parse_eslint_json(&stdout);

    let fixed_content = if apply_fix {
        std::fs::read_to_string(&temp_path).ok()
    } else {
        None
    };

    let _ = std::fs::remove_file(&temp_path);

    Ok(EslintLintResult {
        diagnostics,
        content: fixed_content,
    })
}

pub fn prettier_format_file(
    project_path: String,
    file_path: String,
    content: String,
) -> Result<String, String> {
    let mut cmd = Command::new(npx_command());
    cmd.current_dir(&project_path)
        .arg("--yes")
        .arg("prettier")
        .arg("--stdin-filepath")
        .arg(&file_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    crate::core::process::hide_console(&mut cmd);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to run prettier: {e}"))?;

    if let Some(stdin) = child.stdin.take() {
        let mut stdin = stdin;
        stdin
            .write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write to prettier stdin: {e}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to read prettier output: {e}"))?;

    if output.status.success() {
        let formatted = String::from_utf8_lossy(&output.stdout).to_string();
        return Ok(if formatted.is_empty() {
            content
        } else {
            formatted
        });
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(format!("Prettier failed: {stderr}"))
}
