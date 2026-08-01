use crate::core::error::AppError;
use serde::Serialize;
use serde_json::Value;
use std::path::Path;
use std::process::Command;

#[derive(Serialize, Clone)]
pub struct PackageDep {
    pub name: String,
    pub version: String,
    pub installed: Option<String>,
    pub wanted: Option<String>,
    pub latest: Option<String>,
    pub is_dev: bool,
}

#[derive(Serialize, Clone)]
pub struct PackageInfo {
    pub name: Option<String>,
    pub version: Option<String>,
    pub dependencies: Vec<PackageDep>,
    pub dev_dependencies: Vec<PackageDep>,
}

fn normalize_pm(pm: Option<String>) -> String {
    match pm.as_deref() {
        Some("yarn") => "yarn".to_string(),
        Some("pnpm") => "pnpm".to_string(),
        Some("bun") => "bun".to_string(),
        _ => "npm".to_string(),
    }
}

fn run_pm(project_path: &str, pm: &str, args: &[&str]) -> Result<std::process::Output, AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = Command::new(pm);
    cmd.current_dir(project_path).args(args);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    cmd.output().map_err(AppError::Io)
}

fn parse_json(stdout: &[u8]) -> Value {
    let text = String::from_utf8_lossy(stdout);
    serde_json::from_str(&text).unwrap_or(Value::Object(serde_json::Map::new()))
}

fn collect_deps(
    pkg_deps: &Value,
    ls_tree: &Value,
    outdated: &Value,
    is_dev: bool,
) -> Vec<PackageDep> {
    let mut deps = Vec::new();
    if let Some(obj) = pkg_deps.as_object() {
        for (name, version_val) in obj {
            let version = match version_val {
                Value::String(s) => s.clone(),
                _ => version_val.to_string(),
            };
            let installed = ls_tree
                .get("dependencies")
                .and_then(|d| d.get(name))
                .and_then(|v| v.get("version"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let wanted = outdated
                .get(name)
                .and_then(|v| v.get("wanted"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let latest = outdated
                .get(name)
                .and_then(|v| v.get("latest"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            deps.push(PackageDep {
                name: name.clone(),
                version,
                installed,
                wanted,
                latest,
                is_dev,
            });
        }
    }
    deps.sort_by(|a, b| a.name.cmp(&b.name));
    deps
}

pub fn get_package_info(project_path: String, package_manager: Option<String>) -> Result<PackageInfo, AppError> {
    let pm = normalize_pm(package_manager);
    let pkg_path = Path::new(&project_path).join("package.json");
    if !pkg_path.exists() {
        return Err(AppError::Message("package.json not found".to_string()));
    }

    let content = std::fs::read_to_string(&pkg_path).map_err(AppError::Io)?;
    let pkg: Value = serde_json::from_str(&content)
        .map_err(|e| AppError::Message(format!("Invalid package.json: {}", e)))?;

    let ls_output = match pm.as_str() {
        "yarn" => run_pm(&project_path, "yarn", &["list", "--depth=0", "--json"]),
        "pnpm" => run_pm(&project_path, "pnpm", &["list", "--json", "--depth=0"]),
        "bun" => run_pm(&project_path, "bun", &["pm", "ls"]),
        _ => run_pm(&project_path, "npm", &["ls", "--json", "--depth=0"]),
    };
    let ls_tree = ls_output.ok().map(|o| parse_json(&o.stdout)).unwrap_or(Value::Null);

    let outdated_output = match pm.as_str() {
        "yarn" => run_pm(&project_path, "yarn", &["outdated", "--json"]),
        "pnpm" => run_pm(&project_path, "pnpm", &["outdated", "--format=json"]),
        "bun" => run_pm(&project_path, "bun", &["outdated"]),
        _ => run_pm(&project_path, "npm", &["outdated", "--json"]),
    };
    let outdated = outdated_output.ok().map(|o| parse_json(&o.stdout)).unwrap_or(Value::Null);

    let dependencies = collect_deps(
        &pkg.get("dependencies").cloned().unwrap_or(Value::Null),
        &ls_tree,
        &outdated,
        false,
    );
    let dev_dependencies = collect_deps(
        &pkg.get("devDependencies").cloned().unwrap_or(Value::Null),
        &ls_tree,
        &outdated,
        true,
    );

    Ok(PackageInfo {
        name: pkg.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()),
        version: pkg.get("version").and_then(|v| v.as_str()).map(|s| s.to_string()),
        dependencies,
        dev_dependencies,
    })
}

pub fn npm_install(
    project_path: String,
    package_name: String,
    dev: bool,
    package_manager: Option<String>,
) -> Result<(), AppError> {
    let pm = normalize_pm(package_manager);
    let output = match pm.as_str() {
        "yarn" => {
            let mut args = vec!["add", &package_name];
            if dev { args.push("--dev"); }
            run_pm(&project_path, "yarn", &args)?
        }
        "pnpm" => {
            let mut args = vec!["add", &package_name];
            if dev { args.push("-D"); }
            run_pm(&project_path, "pnpm", &args)?
        }
        "bun" => {
            let mut args = vec!["add", &package_name];
            if dev { args.push("--dev"); }
            run_pm(&project_path, "bun", &args)?
        }
        _ => {
            let mut args = vec!["install", &package_name];
            if dev { args.push("--save-dev"); }
            run_pm(&project_path, "npm", &args)?
        }
    };
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let msg = if !stderr.trim().is_empty() { stderr.to_string() } else { stdout.to_string() };
        return Err(AppError::Message(msg.trim().to_string()));
    }
    Ok(())
}

pub fn npm_uninstall(project_path: String, package_name: String, package_manager: Option<String>) -> Result<(), AppError> {
    let pm = normalize_pm(package_manager);
    let output = match pm.as_str() {
        "yarn" => run_pm(&project_path, "yarn", &["remove", &package_name])?,
        "pnpm" => run_pm(&project_path, "pnpm", &["remove", &package_name])?,
        "bun" => run_pm(&project_path, "bun", &["remove", &package_name])?,
        _ => run_pm(&project_path, "npm", &["uninstall", &package_name])?,
    };
    if !output.status.success() {
        return Err(AppError::Message(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

pub fn npm_update(
    project_path: String,
    package_name: Option<String>,
    package_manager: Option<String>,
) -> Result<(), AppError> {
    let pm = normalize_pm(package_manager);
    let output = match pm.as_str() {
        "yarn" => {
            let args: Vec<&str> = match package_name.as_deref() {
                Some(name) => vec!["upgrade", name],
                None => vec!["upgrade"],
            };
            run_pm(&project_path, "yarn", &args)?
        }
        "pnpm" => {
            let args: Vec<&str> = match package_name.as_deref() {
                Some(name) => vec!["update", name],
                None => vec!["update"],
            };
            run_pm(&project_path, "pnpm", &args)?
        }
        "bun" => {
            let args: Vec<&str> = match package_name.as_deref() {
                Some(name) => vec!["update", name],
                None => vec!["update"],
            };
            run_pm(&project_path, "bun", &args)?
        }
        _ => {
            let mut args = vec!["update"];
            if let Some(ref name) = package_name {
                args.push(name);
            }
            run_pm(&project_path, "npm", &args)?
        }
    };
    if !output.status.success() {
        return Err(AppError::Message(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

pub fn run_install_all(project_path: String, package_manager: Option<String>) -> Result<(), AppError> {
    let pm = normalize_pm(package_manager);
    let output = match pm.as_str() {
        "yarn" => run_pm(&project_path, "yarn", &["install"])?,
        "pnpm" => run_pm(&project_path, "pnpm", &["install"])?,
        "bun" => run_pm(&project_path, "bun", &["install"])?,
        _ => run_pm(&project_path, "npm", &["install"])?,
    };
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let msg = if !stderr.trim().is_empty() { stderr.to_string() } else { stdout.to_string() };
        return Err(AppError::Message(msg.trim().to_string()));
    }
    Ok(())
}
