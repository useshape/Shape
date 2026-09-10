"""
One-shot cleanup / reorg for shape package.
- Rename lib/shape-auth -> lib/cloud, lib/github-auth -> lib/github
- Reorganize settings UI into sections/theme/shared
- Reorganize design UI into inspector/panels/fonts/shared/assets
- Delete dead editor files
- Group some lib flat files into subfolders
- Rewrite imports across the package
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path

ROOT = Path(r"c:\Users\User\Desktop\shape-monorepo\shape")

# ---------- helpers ----------

def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def move(src: Path, dest: Path) -> None:
    if not src.exists():
        print(f"  skip missing {src.relative_to(ROOT)}")
        return
    if dest.exists():
        print(f"  skip exists {dest.relative_to(ROOT)}")
        return
    ensure_parent(dest)
    shutil.move(str(src), str(dest))
    print(f"  move {src.relative_to(ROOT)} -> {dest.relative_to(ROOT)}")


def delete(path: Path) -> None:
    if not path.exists():
        return
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()
    print(f"  delete {path.relative_to(ROOT)}")


def rewrite_imports(replacements: list[tuple[str, str]]) -> int:
    """Replace import path strings in all ts/tsx/mdx/js files under ROOT."""
    exts = {".ts", ".tsx", ".mdx", ".js", ".mjs", ".cjs"}
    skip_dirs = {"node_modules", ".next", "dist", "target", ".git"}
    count = 0
    files = 0
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix not in exts:
            continue
        if any(part in skip_dirs for part in path.parts):
            continue
        text = path.read_text(encoding="utf-8")
        new = text
        for old, new_s in replacements:
            new = new.replace(old, new_s)
        if new != text:
            path.write_text(new, encoding="utf-8")
            files += 1
            count += 1
    print(f"  rewrote imports in {files} files")
    return files


def rewrite_relative_in_dir(dir_path: Path, mapping: dict[str, str]) -> None:
    """Rewrite relative imports inside moved files (./foo -> ../shared/foo etc)."""
    if not dir_path.exists():
        return
    for path in dir_path.rglob("*"):
        if path.suffix not in {".ts", ".tsx"}:
            continue
        text = path.read_text(encoding="utf-8")
        new = text
        for old, new_s in mapping.items():
            new = new.replace(old, new_s)
        if new != text:
            path.write_text(new, encoding="utf-8")
            print(f"  relative fix {path.relative_to(ROOT)}")


# ---------- 1) auth renames ----------
print("== auth renames ==")
move(ROOT / "lib/shape-auth", ROOT / "lib/cloud")
move(ROOT / "lib/github-auth", ROOT / "lib/github")
rewrite_imports(
    [
        ("@/lib/shape-auth/", "@/lib/cloud/"),
        ("@/lib/shape-auth\"", "@/lib/cloud\""),
        ("@/lib/shape-auth'", "@/lib/cloud'"),
        ("@/lib/github-auth/", "@/lib/github/"),
        ("@/lib/github-auth\"", "@/lib/github\""),
        ("@/lib/github-auth'", "@/lib/github'"),
        ("lib/shape-auth/", "lib/cloud/"),
        ("lib/github-auth/", "lib/github/"),
    ]
)

# ---------- 2) settings UI ----------
print("== settings UI ==")
settings = ROOT / "features/settings/ui"
settings_moves = [
    ("account-settings.tsx", "sections/account.tsx"),
    ("ai-settings.tsx", "sections/ai.tsx"),
    ("plugins-settings.tsx", "sections/plugins.tsx"),
    ("keyboard-shortcuts.tsx", "sections/shortcuts.tsx"),
    ("setting-controls.tsx", "shared/controls.tsx"),
    ("settings-nav.ts", "shared/nav.ts"),
    ("theme-picker.tsx", "theme/picker.tsx"),
    ("theme-workbench-preview.tsx", "theme/workbench-preview.tsx"),
]
for src_name, dest_name in settings_moves:
    move(settings / src_name, settings / dest_name)

# Fix settings.tsx and moved files' relative imports
settings_tsx = settings / "settings.tsx"
if settings_tsx.exists():
    t = settings_tsx.read_text(encoding="utf-8")
    t = (
        t.replace('from "./setting-controls"', 'from "./shared/controls"')
        .replace('from "./ai-settings"', 'from "./sections/ai"')
        .replace('from "./account-settings"', 'from "./sections/account"')
        .replace('from "./theme-picker"', 'from "./theme/picker"')
        .replace('from "./settings-nav"', 'from "./shared/nav"')
        .replace('from "./keyboard-shortcuts"', 'from "./sections/shortcuts"')
        .replace('from "./plugins-settings"', 'from "./sections/plugins"')
    )
    # also named exports that may differ
    t = t.replace("AiSettingsPanel", "AiSettingsPanel")  # keep names
    settings_tsx.write_text(t, encoding="utf-8")
    print("  fixed settings.tsx imports")

# sections import controls from ../shared
for name in ["account.tsx", "ai.tsx", "plugins.tsx", "shortcuts.tsx"]:
    p = settings / "sections" / name
    if p.exists():
        t = p.read_text(encoding="utf-8")
        t = t.replace('from "./setting-controls"', 'from "../shared/controls"')
        t = t.replace('from "./settings-nav"', 'from "../shared/nav"')
        p.write_text(t, encoding="utf-8")
        print(f"  fixed sections/{name}")

# theme picker
picker = settings / "theme/picker.tsx"
if picker.exists():
    t = picker.read_text(encoding="utf-8")
    t = t.replace('from "./theme-workbench-preview"', 'from "./workbench-preview"')
    picker.write_text(t, encoding="utf-8")
    print("  fixed theme/picker.tsx")

# external imports to old settings paths
rewrite_imports(
    [
        ("@/features/settings/ui/account-settings", "@/features/settings/ui/sections/account"),
        ("@/features/settings/ui/ai-settings", "@/features/settings/ui/sections/ai"),
        ("@/features/settings/ui/plugins-settings", "@/features/settings/ui/sections/plugins"),
        ("@/features/settings/ui/keyboard-shortcuts", "@/features/settings/ui/sections/shortcuts"),
        ("@/features/settings/ui/setting-controls", "@/features/settings/ui/shared/controls"),
        ("@/features/settings/ui/settings-nav", "@/features/settings/ui/shared/nav"),
        ("@/features/settings/ui/theme-picker", "@/features/settings/ui/theme/picker"),
        ("@/features/settings/ui/theme-workbench-preview", "@/features/settings/ui/theme/workbench-preview"),
    ]
)

# ---------- 3) design UI ----------
print("== design UI ==")
design = ROOT / "features/preview/ui/design"
design_moves = [
    ("inspector.tsx", "inspector/panel.tsx"),
    ("inspect-panel.tsx", "inspector/inspect-panel.tsx"),
    ("fields.tsx", "shared/fields.tsx"),
    ("controls.tsx", "shared/controls.tsx"),
    ("design-layout.ts", "shared/layout.ts"),
    ("panel-layout.ts", "shared/panel-layout.ts"),
    ("styles-model.ts", "shared/styles-model.ts"),
    ("parse-effects.ts", "shared/parse-effects.ts"),
    ("styles-section.tsx", "panels/styles.tsx"),
    ("typography-section.tsx", "panels/typography.tsx"),
    ("export-section.tsx", "panels/export.tsx"),
    ("layers.tsx", "panels/layers.tsx"),
    ("font-picker.tsx", "fonts/picker.tsx"),
    ("fonts.ts", "fonts/catalog.ts"),
    ("asset-icon.tsx", "assets/icon.tsx"),
]
for src_name, dest_name in design_moves:
    move(design / src_name, design / dest_name)

# Fix relative imports inside design tree — use absolute-ish relative paths carefully
# First, rewrite package imports to new paths
rewrite_imports(
    [
        ("@/features/preview/ui/design/inspector\"", "@/features/preview/ui/design/inspector/panel\""),
        ("@/features/preview/ui/design/inspector'", "@/features/preview/ui/design/inspector/panel'"),
        ("@/features/preview/ui/design/inspect-panel", "@/features/preview/ui/design/inspector/inspect-panel"),
        ("@/features/preview/ui/design/fields", "@/features/preview/ui/design/shared/fields"),
        ("@/features/preview/ui/design/controls", "@/features/preview/ui/design/shared/controls"),
        ("@/features/preview/ui/design/design-layout", "@/features/preview/ui/design/shared/layout"),
        ("@/features/preview/ui/design/panel-layout", "@/features/preview/ui/design/shared/panel-layout"),
        ("@/features/preview/ui/design/styles-model", "@/features/preview/ui/design/shared/styles-model"),
        ("@/features/preview/ui/design/parse-effects", "@/features/preview/ui/design/shared/parse-effects"),
        ("@/features/preview/ui/design/styles-section", "@/features/preview/ui/design/panels/styles"),
        ("@/features/preview/ui/design/typography-section", "@/features/preview/ui/design/panels/typography"),
        ("@/features/preview/ui/design/export-section", "@/features/preview/ui/design/panels/export"),
        ("@/features/preview/ui/design/layers", "@/features/preview/ui/design/panels/layers"),
        ("@/features/preview/ui/design/font-picker", "@/features/preview/ui/design/fonts/picker"),
        ("@/features/preview/ui/design/fonts\"", "@/features/preview/ui/design/fonts/catalog\""),
        ("@/features/preview/ui/design/fonts'", "@/features/preview/ui/design/fonts/catalog'"),
        ("@/features/preview/ui/design/asset-icon", "@/features/preview/ui/design/assets/icon"),
    ]
)

# Fix relative imports inside moved design files
rel_fixes: list[tuple[Path, list[tuple[str, str]]]] = [
    (
        design / "inspector",
        [
            ('from "./fields"', 'from "../shared/fields"'),
            ('from "./controls"', 'from "../shared/controls"'),
            ('from "./styles-model"', 'from "../shared/styles-model"'),
            ('from "./parse-effects"', 'from "../shared/parse-effects"'),
            ('from "./font-picker"', 'from "../fonts/picker"'),
            ('from "./fonts"', 'from "../fonts/catalog"'),
            ('from "./styles-section"', 'from "../panels/styles"'),
            ('from "./typography-section"', 'from "../panels/typography"'),
            ('from "./export-section"', 'from "../panels/export"'),
            ('from "./inspect-panel"', 'from "./inspect-panel"'),
            ('from "./layers"', 'from "../panels/layers"'),
            ('from "./asset-icon"', 'from "../assets/icon"'),
            ('from "./design-layout"', 'from "../shared/layout"'),
            ('from "./panel-layout"', 'from "../shared/panel-layout"'),
        ],
    ),
    (
        design / "panels",
        [
            ('from "./fields"', 'from "../shared/fields"'),
            ('from "./controls"', 'from "../shared/controls"'),
            ('from "./styles-model"', 'from "../shared/styles-model"'),
            ('from "./parse-effects"', 'from "../shared/parse-effects"'),
            ('from "./font-picker"', 'from "../fonts/picker"'),
            ('from "./fonts"', 'from "../fonts/catalog"'),
            ('from "./asset-icon"', 'from "../assets/icon"'),
            ('from "./design-layout"', 'from "../shared/layout"'),
            ('from "./panel-layout"', 'from "../shared/panel-layout"'),
        ],
    ),
    (
        design / "fonts",
        [
            ('from "./fonts"', 'from "./catalog"'),
            ('from "./fields"', 'from "../shared/fields"'),
            ('from "./controls"', 'from "../shared/controls"'),
        ],
    ),
    (
        design / "shared",
        [
            ('from "./fonts"', 'from "../fonts/catalog"'),
            ('from "./font-picker"', 'from "../fonts/picker"'),
            ('from "./styles-model"', 'from "./styles-model"'),
        ],
    ),
    (
        design,  # chrome/sidebar remaining at root
        [
            ('from "./fields"', 'from "./shared/fields"'),
            ('from "./controls"', 'from "./shared/controls"'),
            ('from "./styles-model"', 'from "./shared/styles-model"'),
            ('from "./design-layout"', 'from "./shared/layout"'),
            ('from "./panel-layout"', 'from "./shared/panel-layout"'),
            ('from "./layers"', 'from "./panels/layers"'),
            ('from "./styles-section"', 'from "./panels/styles"'),
            ('from "./typography-section"', 'from "./panels/typography"'),
            ('from "./export-section"', 'from "./panels/export"'),
            ('from "./inspector"', 'from "./inspector/panel"'),
            ('from "./inspect-panel"', 'from "./inspector/inspect-panel"'),
            ('from "./font-picker"', 'from "./fonts/picker"'),
            ('from "./fonts"', 'from "./fonts/catalog"'),
            ('from "./asset-icon"', 'from "./assets/icon"'),
        ],
    ),
]

for folder, pairs in rel_fixes:
    if not folder.exists():
        continue
    for path in folder.glob("*.ts*"):
        t = path.read_text(encoding="utf-8")
        new = t
        for a, b in pairs:
            new = new.replace(a, b)
        if new != t:
            path.write_text(new, encoding="utf-8")
            print(f"  relative {path.relative_to(ROOT)}")

# ---------- 4) dead editor cleanup ----------
print("== editor dead code ==")
editor = ROOT / "features/editor"
for rel in [
    "ui/tabs/tabs.tsx",
    "ui/tabs/tab-bar-actions.tsx",
    "ui/main/ui/tokens-menu.tsx",
    "ui/main/ui/cmd-palette.tsx",
    "ui/color-picker/index.tsx",
    "ui/color-picker/ui/variables-palette.tsx",
]:
    delete(editor / rel)

# ---------- 5) lib flat grouping (high-value clusters) ----------
print("== lib grouping ==")
lib = ROOT / "lib"
lib_moves = [
    # design-preview
    ("design-preview-store.ts", "design-preview/store.ts"),
    ("design-preview-tab.ts", "design-preview/tab.ts"),
    ("design-preview-sandbox.ts", "design-preview/sandbox.ts"),
    ("design-agent-options.ts", "design-preview/agent-options.ts"),
    # mcp
    ("mcp-config.ts", "mcp/config.ts"),
    ("mcp-oauth.ts", "mcp/oauth.ts"),
    ("mcp-install.ts", "mcp/install.ts"),
    # window
    ("open-settings.ts", "window/open-settings.ts"),
    ("open-git-window.ts", "window/open-git-window.ts"),
    ("open-branch-window.ts", "window/open-branch-window.ts"),
    ("open-editor-popout.ts", "window/open-editor-popout.ts"),
    ("open-project-file.ts", "window/open-project-file.ts"),
    ("tauri-window.ts", "window/tauri-window.ts"),
    ("app-route.ts", "window/app-route.ts"),
    # telemetry
    ("telemetry.ts", "telemetry/index.ts"),
    ("telemetry-sanitize.ts", "telemetry/sanitize.ts"),
    ("device-id.ts", "telemetry/device-id.ts"),
    # settings cluster at lib
    ("settings.ts", "settings/store.ts"),
    ("settings-tab.ts", "settings/tab.ts"),
    ("themes.ts", "settings/themes.ts"),
    ("models.ts", "settings/models.ts"),
]
for src_name, dest_name in lib_moves:
    move(lib / src_name, lib / dest_name)

rewrite_imports(
    [
        ("@/lib/design-preview-store", "@/lib/design-preview/store"),
        ("@/lib/design-preview-tab", "@/lib/design-preview/tab"),
        ("@/lib/design-preview-sandbox", "@/lib/design-preview/sandbox"),
        ("@/lib/design-agent-options", "@/lib/design-preview/agent-options"),
        ("@/lib/mcp-config", "@/lib/mcp/config"),
        ("@/lib/mcp-oauth", "@/lib/mcp/oauth"),
        ("@/lib/mcp-install", "@/lib/mcp/install"),
        ("@/lib/open-settings", "@/lib/window/open-settings"),
        ("@/lib/open-git-window", "@/lib/window/open-git-window"),
        ("@/lib/open-branch-window", "@/lib/window/open-branch-window"),
        ("@/lib/open-editor-popout", "@/lib/window/open-editor-popout"),
        ("@/lib/open-project-file", "@/lib/window/open-project-file"),
        ("@/lib/tauri-window", "@/lib/window/tauri-window"),
        ("@/lib/app-route", "@/lib/window/app-route"),
        ("@/lib/telemetry-sanitize", "@/lib/telemetry/sanitize"),
        ("@/lib/device-id", "@/lib/telemetry/device-id"),
        ("@/lib/settings-tab", "@/lib/settings/tab"),
        # settings.ts / themes.ts / models.ts / telemetry.ts keep working via barrels/shims below
    ]
)

# Fix internal relative imports inside moved lib folders if they imported each other by old names
# e.g. telemetry/index importing sanitize
tel = lib / "telemetry/index.ts"
if tel.exists():
    t = tel.read_text(encoding="utf-8")
    t = t.replace('from "./telemetry-sanitize"', 'from "./sanitize"')
    t = t.replace('from "@/lib/telemetry-sanitize"', 'from "./sanitize"')
    t = t.replace('from "@/lib/device-id"', 'from "./device-id"')
    tel.write_text(t, encoding="utf-8")

# Compatibility barrels so existing `@/lib/settings` / `@/lib/themes` / `@/lib/models` keep working
barrels = {
    "settings/index.ts": 'export * from "./store";\nexport * from "./tab";\nexport * from "./themes";\nexport * from "./models";\n',
    "settings/store.ts": None,  # already moved
}
# If settings/store exists, write index that re-exports store as default path surface
settings_store = lib / "settings/store.ts"
if settings_store.exists():
    (lib / "settings/index.ts").write_text('export * from "./store";\n', encoding="utf-8")
    print("  wrote lib/settings/index.ts")

for shim_name, target in [
    ("themes.ts", 'export * from "./settings/themes";\n'),
    ("models.ts", 'export * from "./settings/models";\n'),
]:
    if not (lib / shim_name).exists() and (lib / "settings" / shim_name).exists():
        (lib / shim_name).write_text(target, encoding="utf-8")
        print(f"  shim {shim_name}")

print("== done ==")
