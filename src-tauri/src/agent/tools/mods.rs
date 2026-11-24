//! Writes mods in the loader a game folder already uses.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use super::dispatch::{ToolCtx, ToolOutcome};
use crate::agent::security::paths;

const WALK_DEPTH: usize = 4;
const WALK_BUDGET: usize = 2_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Engine {
    FiveM,
    Gta,
    Stardew,
    Tmod,
    Minecraft,
    Factorio,
    Unreal,
    Unity,
    Godot,
    Bethesda,
    Source,
    Bannerlord,
    RpgMaker,
    RenPy,
    Love,
    Unknown,
}

impl Engine {
    fn key(self) -> &'static str {
        match self {
            Self::FiveM => "fivem",
            Self::Gta => "gta",
            Self::Stardew => "smapi",
            Self::Tmod => "tmodloader",
            Self::Minecraft => "minecraft",
            Self::Factorio => "factorio",
            Self::Unreal => "ue4ss",
            Self::Unity => "bepinex",
            Self::Godot => "godot",
            Self::Bethesda => "bethesda",
            Self::Source => "sourcemod",
            Self::Bannerlord => "bannerlord",
            Self::RpgMaker => "rpgmaker",
            Self::RenPy => "renpy",
            Self::Love => "love",
            Self::Unknown => "unknown",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::FiveM => "FiveM (Cfx)",
            Self::Gta => "GTA V (Script Hook V .NET)",
            Self::Stardew => "Stardew Valley (SMAPI content pack)",
            Self::Tmod => "tModLoader",
            Self::Minecraft => "Minecraft Java (datapack)",
            Self::Factorio => "Factorio",
            Self::Unreal => "Unreal (UE4SS Lua)",
            Self::Unity => "Unity (BepInEx)",
            Self::Godot => "Godot",
            Self::Bethesda => "Bethesda (Papyrus source)",
            Self::Source => "Source (SourceMod)",
            Self::Bannerlord => "Mount & Blade II (module)",
            Self::RpgMaker => "RPG Maker MV/MZ",
            Self::RenPy => "Ren'Py",
            Self::Love => "LÖVE",
            Self::Unknown => "Unrecognized",
        }
    }

    fn framework(self) -> &'static str {
        match self {
            Self::FiveM => "FiveM resource (fxmanifest.lua)",
            Self::Gta => "ScriptHookVDotNet .cs script",
            Self::Stardew => "SMAPI content pack for Content Patcher",
            Self::Tmod => "tModLoader ModSources skeleton",
            Self::Minecraft => "Java datapack (pack.mcmeta + function tag)",
            Self::Factorio => "Factorio mod (info.json + control.lua)",
            Self::Unreal => "UE4SS Lua mod (enabled.txt + Scripts/main.lua)",
            Self::Unity => "BepInEx plugin project",
            Self::Godot => "Godot addon (plugin.cfg)",
            Self::Bethesda => "Papyrus script source",
            Self::Source => "SourceMod plugin source",
            Self::Bannerlord => "Bannerlord module (SubModule.xml)",
            Self::RpgMaker => "RPG Maker plugin",
            Self::RenPy => "Ren'Py script",
            Self::Love => "LÖVE module",
            Self::Unknown => "none",
        }
    }

    fn docs(self) -> &'static str {
        match self {
            Self::FiveM => "https://docs.fivem.net/docs/scripting-reference/resource-manifest/",
            Self::Gta => "https://github.com/scripthookvdotnet/scripthookvdotnet",
            Self::Stardew => "https://stardewvalleywiki.com/Modding:Content_pack_frameworks",
            Self::Tmod => "https://github.com/tModLoader/tModLoader/wiki/Basic-tModLoader-Modding-Guide",
            Self::Minecraft => "https://minecraft.wiki/w/Pack.mcmeta",
            Self::Factorio => "https://wiki.factorio.com/Tutorial:Modding_tutorial",
            Self::Unreal => "https://docs.ue4ss.com/guides/installing-a-c++-mod.html",
            Self::Unity => "https://docs.bepinex.dev/articles/dev_guide/plugin_tutorial/2_plugin_start.html",
            Self::Godot => "https://docs.godotengine.org/en/stable/tutorials/plugins/editor/making_plugins.html",
            Self::Bethesda => "https://ck.uesp.net/wiki/Papyrus",
            Self::Source => "https://wiki.alliedmods.net/Introduction_to_SourceMod_Plugins",
            Self::Bannerlord => "https://docs.bannerlordmodding.lt/modding/submodule/",
            Self::RpgMaker => "https://rpgmaker.net/tutorials/162/",
            Self::RenPy => "https://www.renpy.org/doc/html/lifecycle.html",
            Self::Love => "https://love2d.org/wiki/require",
            Self::Unknown => "",
        }
    }

    fn limitation(self) -> &'static str {
        match self {
            Self::Unity => "BepInEx loads a compiled DLL from BepInEx/plugins. This wrote the plugin class and project from the BepInEx tutorial. It did not run a compiler.",
            Self::Tmod => "tModLoader packages a .tmod when its own build runs. This wrote the ModSources skeleton from the tModLoader guide.",
            Self::Bethesda => "The game loads a compiled .pex. This wrote the Papyrus source the Creation Kit compiles.",
            Self::Source => "SourceMod loads a compiled .smx. This wrote the .sp source the SourceMod compiler reads.",
            Self::Bannerlord => "A full module also needs a SubModule class when you add code. This wrote the SubModule.xml the loader reads.",
            _ => "",
        }
    }
}

struct Hit {
    rel: String,
}

struct Scan {
    engine: Engine,
    anchor: PathBuf,
    il2cpp: bool,
    unreal_mods: String,
    markers: Vec<String>,
    anti_cheat: Vec<String>,
}

struct Installed {
    engine: Engine,
    files: Vec<(String, Vec<String>)>,
    limitation: String,
}

pub fn tool_mod_scan(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    match game_dir(args, ctx, "path") {
        Ok(path) => finish("mod_scan", &format_scan(&scan_dir(&path))),
        Err(message) => error_outcome("mod_scan", &message),
    }
}

pub fn tool_mod_create(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let root = match game_dir(args, ctx, "path") {
        Ok(path) => path,
        Err(message) => return error_outcome("mod_create", &message),
    };
    let name = arg_str(args, "name").unwrap_or_else(|| "ShapeMod".into());
    let idea = arg_str(args, "idea").unwrap_or_else(|| "A small mod.".into());
    match install_mod(&root, &name, &idea) {
        Ok(text) => finish("mod_create", &text),
        Err(message) => error_outcome("mod_create", &message),
    }
}

pub fn tool_mod_verify(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let root = match game_dir(args, ctx, "path") {
        Ok(path) => path,
        Err(message) => return error_outcome("mod_verify", &message),
    };
    let name = match arg_str(args, "name") {
        Some(name) => name,
        None => return error_outcome("mod_verify", "Pass name, the mod name used with mod_create."),
    };
    match verify_mod(&root, &name) {
        Ok(text) => finish("mod_verify", &text),
        Err(message) => error_outcome("mod_verify", &message),
    }
}

pub fn tool_mod_mashup(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let host = match game_dir(args, ctx, "host") {
        Ok(path) => path,
        Err(message) => return error_outcome("mod_mashup", &message),
    };
    let guest = match game_dir(args, ctx, "guest") {
        Ok(path) => path,
        Err(message) => return error_outcome("mod_mashup", &message),
    };
    let name = arg_str(args, "name").unwrap_or_else(|| "Mashup".into());
    let idea = arg_str(args, "idea").unwrap_or_else(|| "Share one piece of state between the two games.".into());
    match install_mashup(&host, &guest, &name, &idea) {
        Ok(text) => finish("mod_mashup", &text),
        Err(message) => error_outcome("mod_mashup", &message),
    }
}

fn error_outcome(name: &str, message: &str) -> ToolOutcome {
    ToolOutcome {
        tool_result: format!("ERROR: {message}"),
        ui_chunk: format!("\n<tool_result>\n[{name}] ERROR: {message}\n</tool_result>\n"),
        side_effect: None,
    }
}

fn finish(name: &str, text: &str) -> ToolOutcome {
    ToolOutcome {
        tool_result: text.to_string(),
        ui_chunk: format!("\n<tool_result>\n[{name}]\n{text}\n</tool_result>\n"),
        side_effect: None,
    }
}

fn game_dir(args: &Value, ctx: &ToolCtx<'_>, key: &str) -> Result<PathBuf, String> {
    let raw = args
        .get(key)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("Pass {key}: a game folder inside this project."))?;
    let path = paths::resolve_safe_path(raw, ctx.project_path).map_err(|e| e.to_string())?;
    if path.is_dir() {
        Ok(path)
    } else {
        Err(format!("{} is not a folder.", path.display()))
    }
}

fn arg_str(args: &Value, key: &str) -> Option<String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

pub fn install_mod(root: &Path, name: &str, idea: &str) -> Result<String, String> {
    refuse_idea(idea)?;
    let scan = scan_dir(root);
    refuse_scan(&scan)?;
    if scan.engine == Engine::Unknown {
        return Err(format!(
            "No documented loader matched this folder. Markers: {}.",
            if scan.markers.is_empty() { "none".into() } else { scan.markers.join(", ") }
        ));
    }
    let slug = slug(name);
    let idea = one_line(idea);
    let installed = write_engine(&scan, &slug, &idea)?;
    write_manifest(&scan.anchor, &slug, &installed, &idea)?;
    let check = verify_mod(root, &slug)?;
    Ok(format!(
        "{}\ninstalled {} file(s) for {}.\n{}",
        format_scan(&scan),
        installed.files.len(),
        installed.engine.framework(),
        check
    ))
}

pub fn verify_mod(root: &Path, name: &str) -> Result<String, String> {
    let scan = scan_dir(root);
    refuse_scan(&scan)?;
    let slug = slug(name);
    let manifest_path = scan.anchor.join(".shape").join("mods").join(format!("{slug}.json"));
    let raw = fs::read_to_string(&manifest_path).map_err(|_| "No manifest. Run mod_create first.".to_string())?;
    let manifest: Value = serde_json::from_str(&raw).map_err(|e| format!("Manifest is not JSON: {e}"))?;
    let files = manifest
        .get("files")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "Manifest has no files array.".to_string())?;
    let mut lines = vec![
        format!("mod: {slug}"),
        format!("engine: {}", manifest.get("engine").and_then(|v| v.as_str()).unwrap_or("?")),
    ];
    let mut failed = 0usize;
    for file in files {
        let rel = file.get("path").and_then(|v| v.as_str()).unwrap_or("");
        let abs = scan.anchor.join(rel);
        if !abs.exists() {
            failed += 1;
            lines.push(format!("FAIL {rel} missing"));
            continue;
        }
        let text = fs::read_to_string(&abs).unwrap_or_default();
        let needs = file
            .get("must_contain")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>())
            .unwrap_or_default();
        let missing: Vec<_> = needs.into_iter().filter(|need| !text.contains(need)).collect();
        if missing.is_empty() {
            lines.push(format!("ok {rel}"));
        } else {
            failed += 1;
            lines.push(format!("FAIL {rel} missing {}", missing.join(", ")));
        }
    }
    if let Some(limit) = manifest.get("limitation").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
        lines.push(format!("limitation: {limit}"));
    }
    if failed > 0 {
        lines.push(format!("{failed} check(s) failed."));
        return Err(lines.join("\n"));
    }
    lines.push(format!("{} check(s) matched the loader layout.", files.len()));
    Ok(lines.join("\n"))
}

pub fn install_mashup(host_root: &Path, guest_root: &Path, name: &str, idea: &str) -> Result<String, String> {
    refuse_idea(idea)?;
    if same_dir(host_root, guest_root) {
        return Err("Host and guest must be two different game folders.".into());
    }
    let host = scan_dir(host_root);
    let guest = scan_dir(guest_root);
    refuse_scan(&host)?;
    refuse_scan(&guest)?;
    if host.engine == Engine::Unknown || guest.engine == Engine::Unknown {
        return Err("Both folders need a recognized loader before a mashup. mod_scan each one.".into());
    }
    let slug = slug(name);
    let idea = one_line(idea);
    let state_rel = format!(".shape/mashups/{slug}/state.json");
    let bridge_rel = format!(".shape/mashups/{slug}/bridge.json");
    write_under(
        &host.anchor,
        &state_rel,
        serde_json::to_string_pretty(&json!({
            "host": host.engine.key(),
            "guest": guest.engine.key(),
            "idea": idea,
        }))
        .unwrap_or_else(|_| "{}".into()),
    )?;
    write_under(
        &host.anchor,
        &bridge_rel,
        serde_json::to_string_pretty(&json!({
            "route": "passthrough",
            "note": "Two mods exchange one state file. This does not embed one game's runtime inside the other.",
            "host_engine": host.engine.key(),
            "guest_engine": guest.engine.key(),
            "state": state_rel,
            "idea": idea,
        }))
        .unwrap_or_else(|_| "{}".into()),
    )?;
    let host_idea = format!("Read mashup state at {state_rel}. {idea}");
    let guest_idea = format!("Write mashup state at {state_rel}. {idea}");
    let host_mod = write_engine(&host, &format!("{slug}_host"), &host_idea)?;
    let guest_mod = write_engine(&guest, &format!("{slug}_guest"), &guest_idea)?;
    write_manifest(&host.anchor, &format!("{slug}_host"), &host_mod, &host_idea)?;
    write_manifest(&guest.anchor, &format!("{slug}_guest"), &guest_mod, &guest_idea)?;
    let host_check = verify_mod(host_root, &format!("{slug}_host"))?;
    let guest_check = verify_mod(guest_root, &format!("{slug}_guest"))?;
    Ok(format!(
        "mashup: {slug}\nroute: passthrough state file ({state_rel} on the host)\nhost: {}\nguest: {}\n{host_check}\n{guest_check}",
        host.engine.label(),
        guest.engine.label()
    ))
}

fn write_engine(scan: &Scan, slug: &str, idea: &str) -> Result<Installed, String> {
    let specs = engine_specs(scan, slug, idea)?;
    let mut files = Vec::new();
    for (rel, body, must) in specs {
        if rel != "js/plugins.js" && rel != "main.lua" {
            write_under(&scan.anchor, &rel, body)?;
        }
        files.push((rel, must));
    }
    Ok(Installed {
        engine: scan.engine,
        files,
        limitation: scan.engine.limitation().to_string(),
    })
}

fn engine_specs(scan: &Scan, slug: &str, idea: &str) -> Result<Vec<(String, String, Vec<String>)>, String> {
    let must = |items: &[&str]| items.iter().map(|s| (*s).to_string()).collect::<Vec<_>>();
    let mut specs = Vec::new();
    match scan.engine {
        Engine::FiveM => {
            specs.push((
                format!("resources/{slug}/fxmanifest.lua"),
                format!("fx_version 'cerulean'\ngame 'gta5'\n\nauthor 'Shape'\ndescription '{idea}'\nversion '1.0.0'\n\nclient_script 'client.lua'\n"),
                must(&["fx_version", "cerulean", "gta5", "client.lua"]),
            ));
            specs.push((format!("resources/{slug}/client.lua"), format!("-- {idea}\nprint('{slug} loaded')\n"), must(&[idea])));
        }
        Engine::Gta => {
            specs.push((
                format!("scripts/{slug}.cs"),
                format!("using GTA;\nusing System;\npublic class {slug} : Script {{\n  public {slug}() {{ Tick += OnTick; }}\n  void OnTick(object sender, EventArgs e) {{\n    // {idea}\n  }}\n}}\n"),
                must(&["using GTA;", ": Script", idea]),
            ));
        }
        Engine::Stardew => {
            specs.push((
                format!("Mods/{slug}/manifest.json"),
                pretty(&json!({
                    "Name": slug,
                    "Author": "Shape",
                    "Version": "1.0.0",
                    "Description": idea,
                    "UniqueID": format!("Shape.{slug}"),
                    "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" },
                    "MinimumApiVersion": "4.0.0"
                })),
                must(&["UniqueID", "ContentPackFor", "Pathoschild.ContentPatcher"]),
            ));
            specs.push((
                format!("Mods/{slug}/content.json"),
                pretty(&json!({"Format": "2.0.0", "Changes": []})),
                must(&["Format", "2.0.0"]),
            ));
        }
        Engine::Tmod => {
            specs.push((format!("ModSources/{slug}/build.txt"), format!("displayName = {slug}\nauthor = Shape\nversion = 1.0\n"), must(&["displayName", "version"])));
            specs.push((format!("ModSources/{slug}/description.txt"), format!("{idea}\n"), must(&[idea])));
            specs.push((
                format!("ModSources/{slug}/{slug}.cs"),
                format!("using Terraria.ModLoader;\nnamespace {slug} {{\n  public class {slug} : Mod {{\n    // {idea}\n  }}\n}}\n"),
                must(&["Terraria.ModLoader", ": Mod", idea]),
            ));
        }
        Engine::Minecraft => {
            let ns = slug.to_ascii_lowercase();
            let id = format!("{ns}:load");
            specs.push((
                format!("saves/shape-lab/datapacks/{ns}/pack.mcmeta"),
                pretty(&json!({"pack": {"pack_format": 48, "description": idea}})),
                must(&["pack_format", "description"]),
            ));
            specs.push((format!("saves/shape-lab/datapacks/{ns}/data/{ns}/function/load.mcfunction"), format!("# {idea}\n"), must(&[idea])));
            specs.push((
                format!("saves/shape-lab/datapacks/{ns}/data/minecraft/tags/function/load.json"),
                pretty(&json!({"replace": false, "values": [id.clone()]})),
                vec![id],
            ));
        }
        Engine::Factorio => {
            let dir = format!("mods/{}_1.0.0", slug.to_ascii_lowercase());
            specs.push((
                format!("{dir}/info.json"),
                pretty(&json!({
                    "name": slug.to_ascii_lowercase(),
                    "version": "1.0.0",
                    "title": slug,
                    "author": "Shape",
                    "factorio_version": "2.0",
                    "dependencies": ["base >= 2.0"]
                })),
                must(&["factorio_version", "1.0.0"]),
            ));
            specs.push((format!("{dir}/control.lua"), format!("-- {idea}\n"), must(&[idea])));
        }
        Engine::Unreal => {
            let mods = &scan.unreal_mods;
            specs.push((format!("{mods}/{slug}/enabled.txt"), String::new(), Vec::new()));
            specs.push((format!("{mods}/{slug}/Scripts/main.lua"), format!("print('{slug} loaded')\n-- {idea}\n"), must(&["print", idea])));
        }
        Engine::Unity => {
            let guid = format!("shape.{}", slug.to_ascii_lowercase());
            let base = if scan.il2cpp { "BasePlugin" } else { "BaseUnityPlugin" };
            let hook = if scan.il2cpp { "public override void Load()" } else { "private void Awake()" };
            specs.push((
                format!("BepInEx/plugins/{slug}/Plugin.cs"),
                format!("using BepInEx;\nnamespace {slug} {{\n  [BepInPlugin(\"{guid}\", \"{slug}\", \"1.0.0\")]\n  public class Plugin : {base} {{\n    {hook} {{\n      // {idea}\n    }}\n  }}\n}}\n"),
                must(&["[BepInPlugin(", base, &guid, idea]),
            ));
            specs.push((
                format!("BepInEx/plugins/{slug}/{slug}.csproj"),
                format!("<Project Sdk=\"Microsoft.NET.Sdk\">\n  <PropertyGroup>\n    <TargetFramework>net472</TargetFramework>\n    <AssemblyName>{slug}</AssemblyName>\n  </PropertyGroup>\n  <ItemGroup>\n    <Reference Include=\"BepInEx\"><HintPath>../../core/BepInEx.dll</HintPath></Reference>\n  </ItemGroup>\n</Project>\n"),
                must(&["BepInEx"]),
            ));
            specs.push((format!("BepInEx/config/{guid}.cfg"), format!("[{guid}]\n\n# {idea}\n"), vec![guid]));
        }
        Engine::Godot => {
            specs.push((
                format!("addons/{slug}/plugin.cfg"),
                format!("[plugin]\nname=\"{slug}\"\ndescription=\"{idea}\"\nauthor=\"Shape\"\nversion=\"1.0\"\nscript=\"plugin.gd\"\n"),
                must(&["[plugin]", "script=\"plugin.gd\""]),
            ));
            specs.push((format!("addons/{slug}/plugin.gd"), format!("@tool\nextends EditorPlugin\n# {idea}\n"), must(&["extends EditorPlugin", idea])));
        }
        Engine::Bethesda => {
            specs.push((
                format!("Data/Scripts/Source/{slug}.psc"),
                format!("Scriptname {slug} extends Quest\n; {idea}\nEvent OnInit()\nEndEvent\n"),
                must(&["Scriptname", idea]),
            ));
        }
        Engine::Source => {
            specs.push((
                format!("addons/sourcemod/scripting/{slug}.sp"),
                format!("#include <sourcemod>\npublic void OnPluginStart()\n{{\n  PrintToServer(\"{slug}\"); // {idea}\n}}\n"),
                must(&["OnPluginStart", idea]),
            ));
        }
        Engine::Bannerlord => {
            specs.push((
                format!("Modules/{slug}/SubModule.xml"),
                format!("<Module>\n  <Name value=\"{slug}\"/>\n  <Id value=\"{slug}\"/>\n  <Version value=\"v1.0.0\"/>\n  <SingleplayerModule value=\"true\"/>\n  <DependedModules><DependedModule Id=\"Native\"/></DependedModules>\n</Module>\n"),
                must(&["<Module>", "<Id"]),
            ));
        }
        Engine::RpgMaker => {
            specs.push((format!("js/plugins/{slug}.js"), format!("/*:\n * @plugindesc {idea}\n * @target MZ\n */\n"), must(&[idea])));
            splice_rpg_plugins(&scan.anchor, slug, idea)?;
            specs.push(("js/plugins.js".into(), String::new(), vec![slug.to_string()]));
        }
        Engine::RenPy => {
            specs.push((
                format!("game/{slug}.rpy"),
                format!("# {idea}\nlabel {}_mod:\n    return\n", slug.to_ascii_lowercase()),
                must(&["label", idea]),
            ));
        }
        Engine::Love => {
            specs.push((format!("mods/{slug}.lua"), format!("-- {idea}\nreturn {{}}\n"), must(&[idea])));
            let line = format!("require(\"mods.{slug}\")");
            let main = scan.anchor.join("main.lua");
            let mut text = fs::read_to_string(&main).unwrap_or_default();
            if !text.contains(&line) {
                if !text.ends_with('\n') && !text.is_empty() {
                    text.push('\n');
                }
                text.push_str(&line);
                text.push('\n');
                fs::write(&main, &text).map_err(|e| e.to_string())?;
            }
            specs.push(("main.lua".into(), String::new(), vec![line]));
        }
        Engine::Unknown => return Err("No loader.".into()),
    }
    Ok(specs)
}

fn write_manifest(anchor: &Path, slug: &str, installed: &Installed, idea: &str) -> Result<(), String> {
    let files: Vec<Value> = installed
        .files
        .iter()
        .map(|(path, must)| json!({"path": path, "must_contain": must}))
        .collect();
    write_under(
        anchor,
        &format!(".shape/mods/{slug}.json"),
        serde_json::to_string_pretty(&json!({
            "engine": installed.engine.key(),
            "framework": installed.engine.framework(),
            "docs": installed.engine.docs(),
            "idea": idea,
            "limitation": installed.limitation,
            "files": files,
        }))
        .unwrap_or_else(|_| "{}".into()),
    )
}

fn splice_rpg_plugins(anchor: &Path, slug: &str, idea: &str) -> Result<(), String> {
    let path = anchor.join("js").join("plugins.js");
    let mut text = fs::read_to_string(&path).unwrap_or_else(|_| "var $plugins =\n[\n];\n".into());
    if text.contains(&format!("\"name\":\"{slug}\"")) {
        return Ok(());
    }
    let entry = format!("{{\"name\":\"{slug}\",\"status\":true,\"description\":\"{idea}\",\"parameters\":{{}}}}");
    let Some(idx) = text.rfind("];") else {
        return Err("js/plugins.js has no plugin array to register the plugin in.".into());
    };
    let needs_comma = text[..idx].trim_end().ends_with('}');
    let insert = if needs_comma { format!(",\n{entry}\n") } else { format!("{entry}\n") };
    text = format!("{}{}{}", &text[..idx], insert, &text[idx..]);
    fs::write(&path, text).map_err(|e| e.to_string())
}

fn pretty(value: &Value) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|_| "{}".into())
}

fn write_under(anchor: &Path, rel: &str, body: String) -> Result<(), String> {
    let path = anchor.join(rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Could not create {}: {e}", parent.display()))?;
    }
    fs::write(&path, body).map_err(|e| format!("Could not write {}: {e}", path.display()))
}

fn format_scan(scan: &Scan) -> String {
    let mut lines = vec![
        format!("engine: {}", scan.engine.label()),
        format!("framework: {}", scan.engine.framework()),
        format!("docs: {}", scan.engine.docs()),
        format!(
            "anti-cheat: {}",
            if scan.anti_cheat.is_empty() { "none found".into() } else { scan.anti_cheat.join(", ") }
        ),
        format!("markers: {}", if scan.markers.is_empty() { "none".into() } else { scan.markers.join(", ") }),
    ];
    if scan.il2cpp {
        lines.push("runtime: il2cpp".into());
    }
    let limit = scan.engine.limitation();
    if !limit.is_empty() {
        lines.push(format!("limitation: {limit}"));
    }
    lines.join("\n")
}

fn refuse_scan(scan: &Scan) -> Result<(), String> {
    if scan.anti_cheat.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Anti-cheat is in this folder ({}). Mods stay off protected online clients.",
            scan.anti_cheat.join(", ")
        ))
    }
}

fn refuse_idea(idea: &str) -> Result<(), String> {
    let text = idea.to_ascii_lowercase();
    const BLOCKED: &[&str] = &[
        "bypass anti-cheat",
        "bypass anticheat",
        "disable eac",
        "disable battleye",
        "disable easy anti-cheat",
        "aimbot",
        "wallhack",
        "wall hack",
    ];
    if BLOCKED.iter().any(|phrase| text.contains(phrase)) {
        Err("That request is a cheat against other players or an anti-cheat bypass. Those are not installed.".into())
    } else {
        Ok(())
    }
}

fn one_line(idea: &str) -> String {
    let text: String = idea
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .filter(|c| !matches!(c, '"' | '\\' | '<' | '>'))
        .take(160)
        .collect();
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.is_empty() { "Shape mod".into() } else { text }
}

fn slug(name: &str) -> String {
    let mut out = String::new();
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if (c == ' ' || c == '-' || c == '_') && !out.ends_with('_') {
            out.push('_');
        }
    }
    let out: String = out.trim_matches('_').chars().take(40).collect();
    if out.is_empty() { "ShapeMod".into() } else { out }
}

fn same_dir(a: &Path, b: &Path) -> bool {
    let aa = a.canonicalize().unwrap_or_else(|_| a.to_path_buf());
    let bb = b.canonicalize().unwrap_or_else(|_| b.to_path_buf());
    aa == bb
}

fn scan_dir(root: &Path) -> Scan {
    let hits = index_hits(root);
    let anti = anti_cheat(&hits);
    let (engine, markers, il2cpp, unreal_mods) = detect(&hits);
    Scan {
        engine,
        anchor: install_anchor(root, &hits),
        il2cpp,
        unreal_mods,
        markers,
        anti_cheat: anti,
    }
}

fn hit_key(rel: &str) -> String {
    rel.to_ascii_lowercase()
}

fn detect(hits: &[Hit]) -> (Engine, Vec<String>, bool, String) {
    let named = |names: &[&str]| {
        hits.iter().any(|h| {
            let key = hit_key(&h.rel);
            names.iter().any(|n| key == *n || key.ends_with(&format!("/{n}")))
        })
    };
    let markers_for = |names: &[&str]| names.iter().filter(|n| named(&[*n])).map(|s| (*s).to_string()).collect::<Vec<_>>();
    let resources = hits.iter().any(|h| {
        let key = hit_key(&h.rel);
        key == "resources" || key.starts_with("resources/")
    });
    if named(&["fxserver.exe"]) || named(&["fxserver"]) || (named(&["server.cfg"]) && resources) {
        return (Engine::FiveM, markers_for(&["fxserver.exe", "fxserver", "server.cfg"]), false, String::new());
    }
    if named(&["gta5.exe"]) {
        return (Engine::Gta, vec!["gta5.exe".into()], false, String::new());
    }
    if named(&["stardewmoddingapi.exe"]) || named(&["stardew valley.exe"]) || file_stem_is(hits, &["stardew valley", "stardewmoddingapi"]) {
        return (Engine::Stardew, vec!["Stardew Valley".into()], false, String::new());
    }
    if named(&["tmodloader.exe"]) || named(&["tmodloader.dll"]) {
        return (Engine::Tmod, markers_for(&["tmodloader.exe", "tmodloader.dll"]), false, String::new());
    }
    if named(&["launcher_profiles.json"]) {
        return (Engine::Minecraft, vec!["launcher_profiles.json".into()], false, String::new());
    }
    if named(&["factorio.exe"]) || hits.iter().any(|h| hit_key(&h.rel).ends_with("data/base/info.json")) {
        return (Engine::Factorio, vec!["factorio".into()], false, String::new());
    }
    if let Some(rel) = hits.iter().find_map(|h| unreal_prefix(&h.rel)) {
        return (Engine::Unreal, vec![rel.clone()], false, format!("{rel}/ue4ss/Mods"));
    }
    if hits.iter().any(|h| hit_key(&h.rel).ends_with(".uproject")) {
        return (Engine::Unreal, vec![".uproject".into()], false, "Binaries/Win64/ue4ss/Mods".into());
    }
    if named(&["unityplayer.dll", "unityplayer.dylib"]) || hits.iter().any(|h| hit_key(&h.rel).contains("_data/managed/assembly-csharp.dll")) {
        return (Engine::Unity, vec!["UnityPlayer".into()], false, String::new());
    }
    if named(&["gameassembly.dll", "gameassembly.dylib"]) || named(&["global-metadata.dat"]) {
        return (Engine::Unity, vec!["GameAssembly".into()], true, String::new());
    }
    if named(&["project.godot"]) {
        return (Engine::Godot, vec!["project.godot".into()], false, String::new());
    }
    if named(&["skyrimse.exe"]) || named(&["fallout4.exe"]) {
        return (Engine::Bethesda, markers_for(&["skyrimse.exe", "fallout4.exe"]), false, String::new());
    }
    if named(&["gameinfo.txt"]) {
        return (Engine::Source, vec!["gameinfo.txt".into()], false, String::new());
    }
    if hits.iter().any(|h| hit_key(&h.rel).contains("win64_shipping_client")) {
        return (Engine::Bannerlord, vec!["Win64_Shipping_Client".into()], false, String::new());
    }
    if named(&["js/plugins.js"]) && named(&["data/system.json"]) {
        return (Engine::RpgMaker, vec!["js/plugins.js".into()], false, String::new());
    }
    if hits.iter().any(|h| {
        let key = hit_key(&h.rel);
        key.ends_with(".rpy") || key.ends_with("renpy.py")
    }) {
        return (Engine::RenPy, vec![".rpy".into()], false, String::new());
    }
    if named(&["main.lua"]) && named(&["conf.lua"]) {
        return (Engine::Love, vec!["main.lua".into(), "conf.lua".into()], false, String::new());
    }
    (Engine::Unknown, Vec::new(), false, String::new())
}

fn file_stem_is(hits: &[Hit], names: &[&str]) -> bool {
    hits.iter().any(|hit| {
        let key = hit_key(&hit.rel);
        let base = key.rsplit('/').next().unwrap_or("");
        let stem = base.strip_suffix(".app").unwrap_or(base);
        names.iter().any(|name| base == *name || stem == *name)
    })
}

fn install_anchor(root: &Path, hits: &[Hit]) -> PathBuf {
    let inside_bundle = hits.iter().any(|hit| {
        let key = hit_key(&hit.rel);
        key.starts_with("contents/macos/") || key.starts_with("contents/frameworks/")
    });
    if inside_bundle {
        root.parent().unwrap_or(root).to_path_buf()
    } else {
        root.to_path_buf()
    }
}

fn unreal_prefix(rel: &str) -> Option<String> {
    let key = rel.to_ascii_lowercase();
    for token in ["binaries/win64", "binaries/mac"] {
        if let Some(idx) = key.find(token) {
            return Some(rel[..idx + token.len()].trim_end_matches(['/', '\\']).to_string());
        }
    }
    None
}

fn anti_cheat(hits: &[Hit]) -> Vec<String> {
    const MARKERS: &[&str] = &["easyanticheat", "battleye", "start_protected_game.exe", "eac_launcher.exe"];
    let mut found = Vec::new();
    for hit in hits {
        for marker in MARKERS {
            if hit_key(&hit.rel).contains(marker) && !found.iter().any(|f| f == *marker) {
                found.push((*marker).to_string());
            }
        }
    }
    found
}

fn index_hits(root: &Path) -> Vec<Hit> {
    let mut out = Vec::new();
    let mut budget = WALK_BUDGET;
    walk(root, root, 0, &mut budget, &mut out);
    out
}

fn walk(root: &Path, dir: &Path, depth: usize, budget: &mut usize, out: &mut Vec<Hit>) {
    if depth > WALK_DEPTH || *budget == 0 {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        if *budget == 0 {
            return;
        }
        *budget -= 1;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        if name == ".git" || name == "node_modules" {
            continue;
        }
        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        out.push(Hit { rel });
        if path.is_dir() {
            walk(root, &path, depth + 1, budget, out);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("shape-mod-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn touch(root: &Path, rel: &str) {
        let path = root.join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, b"").unwrap();
    }

    #[test]
    fn unity_plugin_matches_bepinex_tutorial() {
        let root = temp("unity");
        touch(&root, "UnityPlayer.dll");
        touch(&root, "Game_Data/Managed/Assembly-CSharp.dll");
        let text = install_mod(&root, "Hello Gun", "show a message when the player jumps").unwrap();
        assert!(text.contains("BepInEx"), "{text}");
        let plugin = fs::read_to_string(root.join("BepInEx/plugins/Hello_Gun/Plugin.cs")).unwrap();
        assert!(plugin.contains("[BepInPlugin("));
        assert!(plugin.contains("BaseUnityPlugin"));
        assert!(plugin.contains("shape.hello_gun"));
        assert!(verify_mod(&root, "Hello Gun").unwrap().contains("matched"));
    }

    #[test]
    fn unreal_lua_mod_matches_ue4ss_layout() {
        let root = temp("unreal");
        touch(&root, "Demo/Binaries/Win64/Demo.exe");
        install_mod(&root, "ExtraNpc", "spawn one npc").unwrap();
        let lua = root.join("Demo/Binaries/Win64/ue4ss/Mods/ExtraNpc/Scripts/main.lua");
        assert!(lua.is_file(), "{}", lua.display());
        assert!(root.join("Demo/Binaries/Win64/ue4ss/Mods/ExtraNpc/enabled.txt").is_file());
        assert!(fs::read_to_string(&lua).unwrap().contains("print"));
        assert!(verify_mod(&root, "ExtraNpc").unwrap().contains("ok"));
    }

    #[test]
    fn minecraft_datapack_matches_pack_mcmeta() {
        let root = temp("mc");
        touch(&root, "launcher_profiles.json");
        install_mod(&root, "OrePing", "count ticks").unwrap();
        let meta = fs::read_to_string(root.join("saves/shape-lab/datapacks/oreping/pack.mcmeta")).unwrap();
        let parsed: Value = serde_json::from_str(&meta).unwrap();
        assert!(parsed["pack"]["pack_format"].as_u64().unwrap() >= 1);
        let tag = fs::read_to_string(root.join("saves/shape-lab/datapacks/oreping/data/minecraft/tags/function/load.json")).unwrap();
        assert!(tag.contains("oreping:load"));
        assert!(verify_mod(&root, "OrePing").is_ok());
    }

    #[test]
    fn fivem_resource_matches_fxmanifest() {
        let root = temp("fivem");
        fs::create_dir_all(root.join("resources")).unwrap();
        fs::write(root.join("server.cfg"), "endpoint_add_tcp \"0.0.0.0:30120\"\n").unwrap();
        install_mod(&root, "radio", "play a station").unwrap();
        let manifest = fs::read_to_string(root.join("resources/radio/fxmanifest.lua")).unwrap();
        assert!(manifest.contains("fx_version 'cerulean'"));
        assert!(manifest.contains("game 'gta5'"));
        assert!(manifest.contains("client_script 'client.lua'"));
        assert!(root.join("resources/radio/client.lua").is_file());
        assert!(verify_mod(&root, "radio").is_ok());
    }

    #[test]
    fn gta_script_hook_dotnet_script_is_source() {
        let root = temp("gta");
        touch(&root, "GTA5.exe");
        install_mod(&root, "Horn", "honk when H is pressed").unwrap();
        let script = fs::read_to_string(root.join("scripts/Horn.cs")).unwrap();
        assert!(script.contains("using GTA;"));
        assert!(script.contains(": Script"));
        assert!(verify_mod(&root, "Horn").is_ok());
    }

    #[test]
    fn anti_cheat_blocks_install() {
        let root = temp("eac");
        touch(&root, "UnityPlayer.dll");
        touch(&root, "EasyAntiCheat/eac_launcher.exe");
        let err = install_mod(&root, "Nope", "anything").unwrap_err();
        assert!(err.to_ascii_lowercase().contains("anti-cheat"), "{err}");
        assert!(!root.join("BepInEx").exists());
    }

    #[test]
    fn mashup_writes_passthrough_on_both_games() {
        let base = temp("mash");
        let host = base.join("gta");
        let guest = base.join("mc");
        fs::create_dir_all(&host).unwrap();
        fs::create_dir_all(&guest).unwrap();
        touch(&host, "GTA5.exe");
        touch(&guest, "launcher_profiles.json");
        let text = install_mashup(&host, &guest, "CraftCity", "share a score").unwrap();
        assert!(text.contains("passthrough"), "{text}");
        let bridge: Value = serde_json::from_str(&fs::read_to_string(host.join(".shape/mashups/CraftCity/bridge.json")).unwrap()).unwrap();
        assert_eq!(bridge["route"], "passthrough");
        assert_eq!(bridge["guest_engine"], "minecraft");
        let state = bridge["state"].as_str().unwrap();
        let host_script = fs::read_to_string(host.join("scripts/CraftCity_host.cs")).unwrap();
        assert!(host_script.contains(state), "{host_script}");
        let guest_fn = fs::read_to_string(guest.join("saves/shape-lab/datapacks/craftcity_guest/data/craftcity_guest/function/load.mcfunction")).unwrap();
        assert!(guest_fn.contains(state), "{guest_fn}");
        assert!(verify_mod(&host, "CraftCity_host").is_ok());
        assert!(verify_mod(&guest, "CraftCity_guest").is_ok());
    }

    #[test]
    fn cheat_request_is_refused() {
        let root = temp("gta2");
        touch(&root, "GTA5.exe");
        let err = install_mod(&root, "Aim", "add an aimbot").unwrap_err();
        assert!(err.contains("not installed"), "{err}");
        assert!(!root.join("scripts").exists());
    }

    #[test]
    fn godot_addon_matches_plugin_cfg() {
        let root = temp("godot");
        fs::write(root.join("project.godot"), "config_version=5\n").unwrap();
        install_mod(&root, "Dock", "add a panel").unwrap();
        let cfg = fs::read_to_string(root.join("addons/Dock/plugin.cfg")).unwrap();
        assert!(cfg.contains("[plugin]"));
        assert!(cfg.contains("script=\"plugin.gd\""));
        assert!(fs::read_to_string(root.join("addons/Dock/plugin.gd")).unwrap().contains("extends EditorPlugin"));
        assert!(verify_mod(&root, "Dock").is_ok());
    }

    #[test]
    fn mac_layouts_match_windows_loaders() {
        let root = temp("mac");
        let app = root.join("Hades.app");
        touch(&app, "Contents/Frameworks/UnityPlayer.dylib");
        install_mod(&app, "Hint", "show a hint").unwrap();
        let plugin = root.join("BepInEx/plugins/Hint/Plugin.cs");
        assert!(plugin.is_file(), "{}", plugin.display());
        assert!(fs::read_to_string(root.join("BepInEx/plugins/Hint/Hint.csproj")).unwrap().contains("../../core/BepInEx.dll"));
        assert!(verify_mod(&app, "Hint").is_ok());

        let unreal = temp("mac-unreal");
        touch(&unreal, "Demo/Binaries/Mac/Demo");
        install_mod(&unreal, "Npc", "one npc").unwrap();
        assert!(unreal.join("Demo/Binaries/Mac/ue4ss/Mods/Npc/Scripts/main.lua").is_file());

        let source = temp("source");
        touch(&source, "gameinfo.txt");
        touch(&source, "cfg/server.cfg");
        let text = install_mod(&source, "Alias", "bind a key").unwrap();
        assert!(text.contains("SourceMod"), "{text}");
        assert!(source.join("addons/sourcemod/scripting/Alias.sp").is_file());
    }
}
