use crate::core::error::AppError;
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
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

fn npm_exe() -> &'static str {
    if cfg!(windows) {
        "npm.cmd"
    } else {
        "npm"
    }
}

fn npx_exe() -> &'static str {
    if cfg!(windows) {
        "npx.cmd"
    } else {
        "npx"
    }
}

fn run_scaffold_cli(dir: &str, program: &str, args: &[&str]) -> Result<(), AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = Command::new(program);
    cmd.current_dir(dir)
        .args(args)
        .env("CI", "1")
        .env("npm_config_yes", "true")
        .env("NPM_CONFIG_YES", "true");
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().map_err(|e| {
        AppError::Message(format!(
            "Could not run {program}. Install Node.js and npm, then try again. ({e})"
        ))
    })?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let msg = if !stderr.trim().is_empty() {
        stderr.to_string()
    } else {
        stdout.to_string()
    };
    Err(AppError::Message(
        msg.trim()
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("Project scaffold failed")
            .to_string(),
    ))
}

enum ScaffoldSpec {
    /// Run inside the selected folder. `args` are complete.
    InPlace {
        use_npx: bool,
        args: Vec<String>,
        npm_install: bool,
    },
    /// Create the selected folder by its name from the parent directory.
    Named {
        use_npx: bool,
        args: Vec<String>,
        npm_install: bool,
    },
    Files {
        files: Vec<(String, String)>,
        npm_install: bool,
    },
}

fn owned_args(args: &[&str]) -> Vec<String> {
    args.iter().map(|arg| (*arg).to_string()).collect()
}

fn package_name(folder_name: &str) -> String {
    let mut out = String::new();
    for ch in folder_name.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if ch == '-' || ch == '_' || ch.is_whitespace() {
            if !out.ends_with('-') && !out.is_empty() {
                out.push('-');
            }
        }
    }
    let out = out.trim_matches('-').to_string();
    if out.is_empty() {
        "app".to_string()
    } else {
        out
    }
}

fn fill_name_tokens(args: &[&str], folder_name: &str) -> Vec<String> {
    let pkg = package_name(folder_name);
    let ident = {
        let compact = pkg.replace('-', "");
        if compact.is_empty() {
            "app".to_string()
        } else {
            compact
        }
    };
    args.iter()
        .map(|arg| {
            arg.replace("{name}", folder_name)
                .replace("{pkg}", &pkg)
                .replace("{ident}", &ident)
        })
        .collect()
}

fn vite_template(template: &str) -> ScaffoldSpec {
    ScaffoldSpec::InPlace {
        use_npx: false,
        args: owned_args(&[
            "create",
            "vite@latest",
            ".",
            "--yes",
            "--",
            "--template",
            template,
        ]),
        npm_install: false,
    }
}

fn json_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"app\"".to_string())
}

fn vitepress_files(folder_name: &str) -> Vec<(String, String)> {
    let pkg = package_name(folder_name);
    let title = json_string(folder_name);
    vec![
        (
            "package.json".into(),
            format!(
                r#"{{
  "name": "{pkg}",
  "private": true,
  "type": "module",
  "scripts": {{
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs"
  }},
  "devDependencies": {{
    "vitepress": "^1.6.3"
  }}
}}
"#
            ),
        ),
        (
            "docs/index.md".into(),
            format!(
                r#"---
layout: home

hero:
  name: {title}
  text: Documentation
  tagline: Written with VitePress
---
"#
            ),
        ),
        (
            "docs/.vitepress/config.ts".into(),
            format!(
                r#"import {{ defineConfig }} from "vitepress";

export default defineConfig({{
  title: {title},
  description: "Documentation",
  themeConfig: {{
    nav: [{{ text: "Home", link: "/" }}],
    sidebar: [{{ text: "Guide", items: [{{ text: "Home", link: "/" }}] }}],
  }},
}});
"#
            ),
        ),
        (
            ".gitignore".into(),
            "node_modules\ndocs/.vitepress/cache\ndocs/.vitepress/dist\n".into(),
        ),
    ]
}

fn typescript_library_files(folder_name: &str) -> Vec<(String, String)> {
    let pkg = package_name(folder_name);
    vec![
        (
            "package.json".into(),
            format!(
                r#"{{
  "name": "{pkg}",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {{
    "build": "tsc",
    "dev": "tsc --watch"
  }},
  "devDependencies": {{
    "typescript": "^5.9.2"
  }}
}}
"#
            ),
        ),
        (
            "tsconfig.json".into(),
            r#"{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
"#
            .into(),
        ),
        (
            "src/index.ts".into(),
            "export function hello(name: string): string {\n  return `Hello, ${name}`;\n}\n".into(),
        ),
        (".gitignore".into(), "node_modules\ndist\n".into()),
    ]
}

/// Command lines for the project-create catalog. Kinds stay aligned with
/// `features/chat/ui/shell/project-catalog.ts`.
fn scaffold_spec(kind: &str, folder_name: &str) -> Result<ScaffoldSpec, AppError> {
    let spec = match kind {
        "next" => ScaffoldSpec::InPlace {
            use_npx: true,
            args: owned_args(&[
                "--yes",
                "create-next-app@latest",
                ".",
                "--yes",
                "--ts",
                "--tailwind",
                "--eslint",
                "--app",
                "--src-dir",
                "--import-alias",
                "@/*",
                "--use-npm",
            ]),
            npm_install: false,
        },
        "vite" => vite_template("react-ts"),
        "vite-vue" => vite_template("vue-ts"),
        "vite-svelte" => vite_template("svelte-ts"),
        "vite-solid" => vite_template("solid-ts"),
        "astro" => ScaffoldSpec::InPlace {
            use_npx: false,
            args: owned_args(&[
                "create",
                "astro@latest",
                ".",
                "--yes",
                "--",
                "--template",
                "minimal",
                "--install",
                "--no-git",
                "--typescript",
                "strict",
            ]),
            npm_install: false,
        },
        "remix" => ScaffoldSpec::InPlace {
            use_npx: true,
            args: owned_args(&["--yes", "create-remix@latest", ".", "--yes"]),
            npm_install: false,
        },
        "sveltekit" => ScaffoldSpec::InPlace {
            use_npx: true,
            args: owned_args(&[
                "--yes",
                "sv",
                "create",
                ".",
                "--template",
                "minimal",
                "--types",
                "ts",
                "--no-add-ons",
                "--install",
                "npm",
                "--no-dir-check",
            ]),
            npm_install: false,
        },
        "svelte-lib" => ScaffoldSpec::InPlace {
            use_npx: true,
            args: owned_args(&[
                "--yes",
                "sv",
                "create",
                ".",
                "--template",
                "library",
                "--types",
                "ts",
                "--no-add-ons",
                "--install",
                "npm",
                "--no-dir-check",
            ]),
            npm_install: false,
        },
        "nuxt" => ScaffoldSpec::InPlace {
            use_npx: true,
            args: owned_args(&[
                "--yes",
                "create-nuxt@latest",
                ".",
                "--template",
                "minimal",
                "--packageManager",
                "npm",
                "--no-gitInit",
                "--force",
                "--no-modules",
            ]),
            npm_install: false,
        },
        "tanstack" => ScaffoldSpec::Named {
            use_npx: true,
            args: fill_name_tokens(
                &[
                    "--yes",
                    "@tanstack/cli@latest",
                    "create",
                    "{name}",
                    "--framework",
                    "React",
                    "--package-manager",
                    "npm",
                    "--no-git",
                    "--no-examples",
                    "--no-toolchain",
                    "--no-intent",
                    "--yes",
                ],
                folder_name,
            ),
            npm_install: false,
        },
        "react-router" => ScaffoldSpec::Named {
            use_npx: true,
            args: fill_name_tokens(
                &[
                    "--yes",
                    "create-react-router@latest",
                    "{name}",
                    "--package-manager",
                    "npm",
                    "--no-git-init",
                    "--no-agent-skills",
                    "--yes",
                ],
                folder_name,
            ),
            npm_install: false,
        },
        "hono" => ScaffoldSpec::Named {
            use_npx: true,
            args: fill_name_tokens(
                &[
                    "--yes",
                    "create-hono@latest",
                    "{name}",
                    "--template",
                    "nodejs",
                    "--pm",
                    "npm",
                    "--install",
                ],
                folder_name,
            ),
            npm_install: false,
        },
        "nest" => ScaffoldSpec::InPlace {
            use_npx: true,
            args: fill_name_tokens(
                &[
                    "--yes",
                    "@nestjs/cli@latest",
                    "new",
                    "{pkg}",
                    "--directory",
                    ".",
                    "--skip-git",
                    "--package-manager",
                    "npm",
                    "--language",
                    "ts",
                    "--strict",
                ],
                folder_name,
            ),
            npm_install: false,
        },
        "fastify" => ScaffoldSpec::Named {
            use_npx: true,
            args: fill_name_tokens(
                &[
                    "--yes",
                    "fastify-cli@latest",
                    "generate",
                    "{name}",
                    "--lang=ts",
                    "--esm",
                ],
                folder_name,
            ),
            npm_install: true,
        },
        "express" => ScaffoldSpec::InPlace {
            use_npx: true,
            args: owned_args(&["--yes", "express-generator@latest", ".", "--no-view"]),
            npm_install: true,
        },
        "fumadocs" => ScaffoldSpec::InPlace {
            use_npx: true,
            args: owned_args(&[
                "--yes",
                "create-fumadocs-app@latest",
                ".",
                "--template",
                "+next+fuma-docs-mdx",
                "--install",
                "--pm",
                "npm",
                "--src",
                "--linter",
                "eslint",
                "--yes",
                "--no-git",
            ]),
            npm_install: false,
        },
        "starlight" => ScaffoldSpec::InPlace {
            use_npx: true,
            args: owned_args(&[
                "--yes",
                "create-astro@latest",
                ".",
                "--template",
                "starlight",
                "--install",
                "--no-git",
                "--no-ai",
                "--skip-houston",
                "--yes",
            ]),
            npm_install: false,
        },
        "docusaurus" => ScaffoldSpec::InPlace {
            use_npx: true,
            args: owned_args(&[
                "--yes",
                "create-docusaurus@latest",
                ".",
                "classic",
                "--typescript",
            ]),
            npm_install: false,
        },
        "vitepress" => ScaffoldSpec::Files {
            files: vitepress_files(folder_name),
            npm_install: true,
        },
        "tauri" => ScaffoldSpec::Named {
            use_npx: true,
            args: fill_name_tokens(
                &[
                    "--yes",
                    "create-tauri-app@latest",
                    "{name}",
                    "--template",
                    "react-ts",
                    "--manager",
                    "npm",
                    "--identifier",
                    "com.shape.{ident}",
                    "--yes",
                ],
                folder_name,
            ),
            npm_install: true,
        },
        "electron" => ScaffoldSpec::Named {
            use_npx: true,
            args: fill_name_tokens(
                &[
                    "--yes",
                    "@quick-start/create-electron@latest",
                    "{name}",
                    "--template",
                    "react-ts",
                    "--skip",
                ],
                folder_name,
            ),
            npm_install: true,
        },
        "expo" => ScaffoldSpec::InPlace {
            use_npx: true,
            args: owned_args(&[
                "--yes",
                "create-expo-app@latest",
                ".",
                "--template",
                "blank-typescript",
                "--yes",
            ]),
            npm_install: false,
        },
        "ts-lib" => ScaffoldSpec::Files {
            files: typescript_library_files(folder_name),
            npm_install: true,
        },
        other => {
            return Err(AppError::Message(format!(
                "Unknown project type '{other}'."
            )));
        }
    };
    Ok(spec)
}

fn reject_existing_package(dir: &Path) -> Result<(), AppError> {
    if dir.join("package.json").exists() {
        return Err(AppError::Message(
            "That folder already has a package.json. Pick an empty folder.".into(),
        ));
    }
    Ok(())
}

fn prepare_in_place(dir: &Path) -> Result<(), AppError> {
    if !dir.exists() {
        std::fs::create_dir_all(dir).map_err(AppError::Io)?;
    }
    if !dir.is_dir() {
        return Err(AppError::Message("Selected path is not a folder".into()));
    }
    reject_existing_package(dir)
}

fn dir_is_empty(dir: &Path) -> Result<bool, AppError> {
    let mut entries = std::fs::read_dir(dir).map_err(AppError::Io)?;
    Ok(entries.next().is_none())
}

struct NamedPrep {
    parent: PathBuf,
    removed_empty: bool,
    target: PathBuf,
}

fn prepare_named(dir: &Path) -> Result<NamedPrep, AppError> {
    if dir.exists() {
        if !dir.is_dir() {
            return Err(AppError::Message("Selected path is not a folder".into()));
        }
        reject_existing_package(dir)?;
        if !dir_is_empty(dir)? {
            return Err(AppError::Message(
                "That folder is not empty. Pick an empty folder.".into(),
            ));
        }
    }
    let parent = dir
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| AppError::Message("Pick a folder inside another folder".into()))?
        .to_path_buf();
    if !parent.exists() {
        std::fs::create_dir_all(&parent).map_err(AppError::Io)?;
    }
    let removed_empty = dir.exists();
    if removed_empty {
        std::fs::remove_dir(dir).map_err(AppError::Io)?;
    }
    Ok(NamedPrep {
        parent,
        removed_empty,
        target: dir.to_path_buf(),
    })
}

fn restore_named(prep: &NamedPrep) {
    if prep.removed_empty && !prep.target.exists() {
        let _ = std::fs::create_dir(&prep.target);
    }
}

fn run_spec_cli(cwd: &str, use_npx: bool, args: &[String]) -> Result<(), AppError> {
    let program = if use_npx { npx_exe() } else { npm_exe() };
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    run_scaffold_cli(cwd, program, &refs)
}

fn write_project_files(dir: &Path, files: &[(String, String)]) -> Result<(), AppError> {
    for (relative, contents) in files {
        let path = dir.join(relative);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(AppError::Io)?;
        }
        std::fs::write(path, contents).map_err(AppError::Io)?;
    }
    Ok(())
}

fn folder_name_of(directory: &str) -> String {
    Path::new(directory)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("app")
        .to_string()
}

/// Scaffold a project preset into `directory`.
pub fn scaffold_web_project(kind: String, directory: String) -> Result<String, AppError> {
    let folder_name = folder_name_of(&directory);
    let spec = scaffold_spec(&kind, &folder_name)?;
    let dir = Path::new(&directory);

    let npm_install = match spec {
        ScaffoldSpec::InPlace {
            use_npx,
            args,
            npm_install,
        } => {
            prepare_in_place(dir)?;
            run_spec_cli(&directory, use_npx, &args)?;
            npm_install
        }
        ScaffoldSpec::Named {
            use_npx,
            args,
            npm_install,
        } => {
            let prep = prepare_named(dir)?;
            let parent = prep.parent.to_string_lossy().to_string();
            if let Err(err) = run_spec_cli(&parent, use_npx, &args) {
                restore_named(&prep);
                return Err(err);
            }
            if !prep.target.exists() {
                restore_named(&prep);
                return Err(AppError::Message(
                    "Project scaffold did not create the selected folder.".into(),
                ));
            }
            npm_install
        }
        ScaffoldSpec::Files { files, npm_install } => {
            prepare_in_place(dir)?;
            write_project_files(dir, &files)?;
            npm_install
        }
    };

    if npm_install {
        run_install_all(directory.clone(), Some("npm".into()))?;
    }
    Ok(directory)
}

#[cfg(test)]
mod tests {
    use super::{scaffold_spec, scaffold_web_project, ScaffoldSpec};

    fn command_line(kind: &str) -> String {
        match scaffold_spec(kind, "Demo App").unwrap() {
            ScaffoldSpec::InPlace { args, .. } | ScaffoldSpec::Named { args, .. } => args.join(" "),
            ScaffoldSpec::Files { files, .. } => format!("files:{}", files.len()),
        }
    }

    #[test]
    fn rejects_unknown_kind() {
        let err = scaffold_web_project("webpack".into(), "/tmp/shape-scaffold-test".into());
        assert!(err.is_err());
        assert!(format!("{}", err.unwrap_err()).contains("Unknown project type"));
    }

    #[test]
    fn keeps_original_web_scaffolds() {
        let next = command_line("next");
        assert!(next.contains("create-next-app@latest"));
        assert!(next.contains("--tailwind"));
        assert!(command_line("vite").contains("react-ts"));
        assert!(command_line("astro").contains("astro@latest"));
        assert!(command_line("remix").contains("create-remix@latest"));
    }

    #[test]
    fn plans_category_presets() {
        assert!(command_line("vite-vue").contains("vue-ts"));
        assert!(command_line("fumadocs").contains("+next+fuma-docs-mdx"));
        assert!(command_line("starlight").contains("starlight"));
        assert!(command_line("docusaurus").contains("classic"));
        assert!(command_line("hono").contains("create-hono@latest"));
        assert!(command_line("hono").contains("Demo App"));
        assert!(command_line("tauri").contains("com.shape.demoapp"));
        assert!(command_line("vitepress").starts_with("files:"));
        assert!(command_line("ts-lib").starts_with("files:"));
        assert!(matches!(
            scaffold_spec("fastify", "api").unwrap(),
            ScaffoldSpec::Named { .. }
        ));
    }
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
