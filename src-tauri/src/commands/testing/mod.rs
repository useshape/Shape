use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TestFramework {
    Vitest,
    Jest,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestDiscovery {
    pub framework: TestFramework,
    pub test_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestCaseResult {
    pub id: String,
    pub name: String,
    pub file: String,
    pub suite: String,
    pub status: String,
    pub duration_ms: Option<u64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunSummary {
    pub passed: u32,
    pub failed: u32,
    pub skipped: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResultEvent {
    pub event_type: String,
    pub framework: String,
    pub test: Option<TestCaseResult>,
    pub summary: Option<TestRunSummary>,
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PackageJson {
    #[serde(default)]
    scripts: HashMap<String, String>,
    #[serde(default)]
    dev_dependencies: HashMap<String, String>,
    #[serde(default)]
    dependencies: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct JestStyleResult {
    #[serde(default, rename = "testResults")]
    test_results: Vec<JestStyleSuite>,
    #[serde(default, rename = "numPassedTests")]
    num_passed_tests: u32,
    #[serde(default, rename = "numFailedTests")]
    num_failed_tests: u32,
    #[serde(default, rename = "numPendingTests")]
    num_pending_tests: u32,
    #[serde(default, rename = "numTotalTests")]
    num_total_tests: u32,
}

#[derive(Debug, Deserialize)]
struct JestStyleSuite {
    name: String,
    #[serde(default)]
    #[allow(dead_code)]
    status: String,
    #[serde(default, rename = "assertionResults")]
    assertion_results: Vec<JestStyleAssertion>,
}

#[derive(Debug, Deserialize)]
struct JestStyleAssertion {
    #[serde(default, rename = "fullName")]
    full_name: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    duration: Option<u64>,
    #[serde(default, rename = "failureMessages")]
    failure_messages: Vec<String>,
    #[serde(default, rename = "ancestorTitles")]
    ancestor_titles: Vec<String>,
}

fn npm_command() -> &'static str {
    if cfg!(target_os = "windows") {
        "npx.cmd"
    } else {
        "npx"
    }
}

fn has_dep(map: &HashMap<String, String>, name: &str) -> bool {
    map.contains_key(name)
}

fn detect_framework(project_path: &Path, pkg: &PackageJson) -> TestFramework {
    let scripts = &pkg.scripts;
    let dev = &pkg.dev_dependencies;
    let deps = &pkg.dependencies;

    let has_vitest = has_dep(dev, "vitest") || has_dep(deps, "vitest");
    let has_jest = has_dep(dev, "jest") || has_dep(deps, "jest");

    if has_vitest
        || scripts.values().any(|s| s.contains("vitest"))
        || project_path.join("vitest.config.ts").exists()
        || project_path.join("vitest.config.js").exists()
        || project_path.join("vitest.config.mjs").exists()
    {
        return TestFramework::Vitest;
    }

    if has_jest
        || scripts.values().any(|s| s.contains("jest"))
        || project_path.join("jest.config.ts").exists()
        || project_path.join("jest.config.js").exists()
        || project_path.join("jest.config.mjs").exists()
    {
        return TestFramework::Jest;
    }

    TestFramework::None
}

fn is_test_file(path: &Path) -> bool {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if name.contains(".test.") || name.contains(".spec.") {
        return true;
    }
    if path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .map(|n| n == "__tests__")
        .unwrap_or(false)
    {
        return true;
    }
    false
}

pub fn discover_tests(project_path: String) -> Result<TestDiscovery, String> {
    let root = PathBuf::from(&project_path);
    let pkg_path = root.join("package.json");
    if !pkg_path.exists() {
        return Ok(TestDiscovery {
            framework: TestFramework::None,
            test_files: Vec::new(),
        });
    }

    let pkg_raw = std::fs::read_to_string(&pkg_path).map_err(|e| e.to_string())?;
    let pkg: PackageJson = serde_json::from_str(&pkg_raw).map_err(|e| e.to_string())?;
    let framework = detect_framework(&root, &pkg);

    let mut test_files = Vec::new();
    for entry in WalkDir::new(&root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();
        let rel = path
            .strip_prefix(&root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");
        if rel.contains("node_modules") || rel.contains("/dist/") || rel.contains("/build/") {
            continue;
        }
        if is_test_file(path) {
            test_files.push(path.to_string_lossy().to_string());
        }
    }

    test_files.sort();
    Ok(TestDiscovery {
        framework,
        test_files,
    })
}

fn emit_event(app: &AppHandle, event: TestResultEvent) {
    let _ = app.emit("test-result", event);
}

fn map_assertion_status(status: &str) -> String {
    match status {
        "passed" => "passed".to_string(),
        "failed" => "failed".to_string(),
        "pending" | "todo" => "skipped".to_string(),
        _ => "skipped".to_string(),
    }
}

fn parse_and_emit_results(
    app: &AppHandle,
    framework: &str,
    json_path: &Path,
) -> Result<TestRunSummary, String> {
    let raw = std::fs::read_to_string(json_path).map_err(|e| e.to_string())?;
    let parsed: JestStyleResult = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    let mut passed = 0u32;
    let mut failed = 0u32;
    let mut skipped = 0u32;

    for suite in &parsed.test_results {
        let suite_name = suite
            .assertion_results
            .first()
            .and_then(|a| a.ancestor_titles.first())
            .cloned()
            .unwrap_or_else(|| suite.name.clone());

        for assertion in &suite.assertion_results {
            let status = map_assertion_status(&assertion.status);
            if status == "passed" {
                passed += 1;
            } else if status == "failed" {
                failed += 1;
            } else {
                skipped += 1;
            }

            let test = TestCaseResult {
                id: format!("{}::{}", suite.name, assertion.full_name),
                name: if assertion.title.is_empty() {
                    assertion.full_name.clone()
                } else {
                    assertion.title.clone()
                },
                file: suite.name.clone(),
                suite: suite_name.clone(),
                status: status.clone(),
                duration_ms: assertion.duration,
                error: assertion.failure_messages.first().cloned(),
            };

            emit_event(
                app,
                TestResultEvent {
                    event_type: "test".to_string(),
                    framework: framework.to_string(),
                    test: Some(test),
                    summary: None,
                    message: None,
                },
            );
        }
    }

    let summary = TestRunSummary {
        passed: if parsed.num_passed_tests > 0 {
            parsed.num_passed_tests
        } else {
            passed
        },
        failed: if parsed.num_failed_tests > 0 {
            parsed.num_failed_tests
        } else {
            failed
        },
        skipped: if parsed.num_pending_tests > 0 {
            parsed.num_pending_tests
        } else {
            skipped
        },
        total: if parsed.num_total_tests > 0 {
            parsed.num_total_tests
        } else {
            passed + failed + skipped
        },
    };

    emit_event(
        app,
        TestResultEvent {
            event_type: "complete".to_string(),
            framework: framework.to_string(),
            test: None,
            summary: Some(summary.clone()),
            message: None,
        },
    );

    Ok(summary)
}

pub async fn run_tests(
    app: AppHandle,
    project_path: String,
    framework: String,
    pattern: Option<String>,
) -> Result<TestRunSummary, String> {
    let output_file = std::env::temp_dir().join(format!("shape-test-{}.json", uuid_like()));

    emit_event(
        &app,
        TestResultEvent {
            event_type: "start".to_string(),
            framework: framework.clone(),
            test: None,
            summary: None,
            message: pattern.clone(),
        },
    );

    let framework_lower = framework.to_lowercase();
    let mut cmd = Command::new(npm_command());
    cmd.current_dir(&project_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    crate::core::process::hide_console(&mut cmd);

    if framework_lower == "vitest" {
        cmd.arg("--yes")
            .arg("vitest")
            .arg("run")
            .arg("--reporter=json")
            .arg("--outputFile")
            .arg(&output_file);
        if let Some(p) = &pattern {
            if !p.is_empty() {
                cmd.arg(p);
            }
        }
    } else if framework_lower == "jest" {
        cmd.arg("--yes")
            .arg("jest")
            .arg("--json")
            .arg("--outputFile")
            .arg(&output_file)
            .arg("--testLocationInResults");
        if let Some(p) = &pattern {
            if !p.is_empty() {
                cmd.arg("--testPathPattern").arg(p);
            }
        }
    } else {
        return Err(format!("Unsupported test framework: {framework}"));
    }

    let output = tokio::task::spawn_blocking(move || cmd.output())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("Failed to run tests: {e}"))?;

    if !output_file.exists() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let message = if !stderr.trim().is_empty() {
            stderr.to_string()
        } else {
            stdout.to_string()
        };
        emit_event(
            &app,
            TestResultEvent {
                event_type: "error".to_string(),
                framework: framework.clone(),
                test: None,
                summary: None,
                message: Some(message.clone()),
            },
        );
        return Err(message);
    }

    let summary = parse_and_emit_results(&app, &framework, &output_file)?;
    let _ = std::fs::remove_file(&output_file);
    Ok(summary)
}

fn uuid_like() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0)
}
