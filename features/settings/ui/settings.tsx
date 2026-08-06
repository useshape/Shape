"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
    useSettings,
    updateSettingSection,
    updateSettings,
    DEFAULT_SETTINGS,
    type ShapeSettings,
} from "@/lib/settings";
import { commands, useProjectState } from "@/lib/backend";
import type { PackageDep, PackageInfo } from "@/lib/backend/types";
import { resolvePackageManager } from "@/lib/package-manager";
import { notify } from "@/features/notifications";
import { appRoute } from "@/lib/app-route";
import { listen, WebviewWindow } from "@/lib/tauri/client-api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    SettingRow,
    SettingSection,
    SettingSelect,
    SettingSwitch,
    SettingNumberSelect,
    FontFamilySelect,
    ExcludePatternsSelect,
    EDITOR_FONT_PRESETS,
    TERMINAL_FONT_PRESETS,
    FONT_SIZE_PRESETS,
    TAB_SIZE_PRESETS,
    SCROLLBACK_PRESETS,
    AUTO_SAVE_DELAY_PRESETS,
    AUTO_FETCH_INTERVAL_PRESETS,
    MAX_CONTEXT_PRESETS,
} from "./setting-controls";
import { AiSettingsPanel } from "./ai-settings";
import { McpLibraryView } from "./mcp/library";
import { AccountSettingsPanel } from "./account-settings";
import { ThemePicker } from "./theme-picker";
import { normalizeColorTheme } from "@/lib/themes";
import { applyTelemetryPreference } from "@/lib/telemetry";
import { SHAPE_API_BASE } from "@/lib/shape-auth/api";
import { Icon } from "@/components/ui/icon";
import {
    SETTINGS_CATEGORIES,
    type SettingsCategoryId,
} from "./settings-nav";
import { useRouter } from "next/navigation";
import { ShapeAccountAvatar } from "@/features/workbench/titlebar/ui/account-avatar";
import { loginShape, useShapeAuth } from "@/lib/shape-auth/store";
import { useWindowControls } from "@/features/workbench/titlebar/hooks/use-window-controls";
import type { ShapeTier } from "@/lib/shape-auth/types";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function EditorSettings({ settings }: { settings: ShapeSettings }) {
    const e = settings.editor;
    return (
        <>
            <SettingSection id="settings-editor-font" title="Font & Display">
                <SettingRow title="Font Family">
                    <FontFamilySelect
                        value={e.fontFamily}
                        presets={EDITOR_FONT_PRESETS}
                        onChange={(v) => updateSettingSection("editor", { fontFamily: v })}
                    />
                </SettingRow>
                <SettingRow title="Font Size">
                    <SettingNumberSelect
                        value={e.fontSize}
                        options={FONT_SIZE_PRESETS}
                        onChange={(v) => updateSettingSection("editor", { fontSize: v })}
                    />
                </SettingRow>
                <SettingRow title="Font Ligatures">
                    <SettingSwitch checked={e.fontLigatures} onChange={(v) => updateSettingSection("editor", { fontLigatures: v })} />
                </SettingRow>
                <SettingRow title="Minimap">
                    <SettingSwitch checked={e.minimap} onChange={(v) => updateSettingSection("editor", { minimap: v })} />
                </SettingRow>
                <SettingRow title="Line Numbers">
                    <SettingSelect
                        value={e.lineNumbers}
                        options={[
                            { value: "on", label: "On" },
                            { value: "off", label: "Off" },
                            { value: "relative", label: "Relative" },
                        ]}
                        onChange={(v) => updateSettingSection("editor", { lineNumbers: v })}
                    />
                </SettingRow>
                <SettingRow title="Render Whitespace">
                    <SettingSelect
                        value={e.renderWhitespace}
                        options={[
                            { value: "none", label: "None" },
                            { value: "selection", label: "Selection" },
                            { value: "all", label: "All" },
                        ]}
                        onChange={(v) => updateSettingSection("editor", { renderWhitespace: v })}
                    />
                </SettingRow>
                <SettingRow title="Line Highlight">
                    <SettingSelect
                        value={e.renderLineHighlight}
                        options={[
                            { value: "line", label: "Line" },
                            { value: "gutter", label: "Gutter" },
                            { value: "all", label: "All" },
                            { value: "none", label: "None" },
                        ]}
                        onChange={(v) => updateSettingSection("editor", { renderLineHighlight: v })}
                    />
                </SettingRow>
                <SettingRow title="Bracket Pair Colorization">
                    <SettingSwitch checked={e.bracketPairColorization} onChange={(v) => updateSettingSection("editor", { bracketPairColorization: v })} />
                </SettingRow>
                <SettingRow title="Indent Guides">
                    <SettingSwitch checked={e.showIndentGuides} onChange={(v) => updateSettingSection("editor", { showIndentGuides: v })} />
                </SettingRow>
                <SettingRow title="Bracket Guides">
                    <SettingSwitch checked={e.showBracketGuides} onChange={(v) => updateSettingSection("editor", { showBracketGuides: v })} />
                </SettingRow>
            </SettingSection>

            <SettingSection id="settings-editor-indent" title="Indentation">
                <SettingRow title="Tab Size">
                    <SettingNumberSelect
                        value={e.tabSize}
                        options={TAB_SIZE_PRESETS}
                        onChange={(v) => updateSettingSection("editor", { tabSize: v })}
                    />
                </SettingRow>
                <SettingRow title="Insert Spaces">
                    <SettingSwitch checked={e.insertSpaces} onChange={(v) => updateSettingSection("editor", { insertSpaces: v })} />
                </SettingRow>
                <SettingRow title="Detect Indentation">
                    <SettingSwitch checked={e.detectIndentation} onChange={(v) => updateSettingSection("editor", { detectIndentation: v })} />
                </SettingRow>
            </SettingSection>

            <SettingSection id="settings-editor-cursor" title="Text Caret & Scrolling">
                <SettingRow title="Caret Style">
                    <SettingSelect
                        value={e.cursorStyle}
                        options={[
                            { value: "line", label: "Line" },
                            { value: "block", label: "Block" },
                            { value: "underline", label: "Underline" },
                        ]}
                        onChange={(v) => updateSettingSection("editor", { cursorStyle: v })}
                    />
                </SettingRow>
                <SettingRow title="Caret Blinking">
                    <SettingSelect
                        value={e.cursorBlinking}
                        options={[
                            { value: "blink", label: "Blink" },
                            { value: "smooth", label: "Smooth" },
                            { value: "phase", label: "Phase" },
                            { value: "expand", label: "Expand" },
                            { value: "solid", label: "Solid" },
                        ]}
                        onChange={(v) => updateSettingSection("editor", { cursorBlinking: v })}
                    />
                </SettingRow>
                <SettingRow title="Word Wrap">
                    <SettingSelect
                        value={e.wordWrap}
                        options={[
                            { value: "off", label: "Off" },
                            { value: "on", label: "On" },
                            { value: "bounded", label: "Bounded" },
                        ]}
                        onChange={(v) => updateSettingSection("editor", { wordWrap: v })}
                    />
                </SettingRow>
                <SettingRow title="Smooth Scrolling">
                    <SettingSwitch checked={e.smoothScrolling} onChange={(v) => updateSettingSection("editor", { smoothScrolling: v })} />
                </SettingRow>
                <SettingRow title="Scroll Beyond Last Line">
                    <SettingSwitch checked={e.scrollBeyondLastLine} onChange={(v) => updateSettingSection("editor", { scrollBeyondLastLine: v })} />
                </SettingRow>
                <SettingRow title="Image Preview on Hover">
                    <SettingSwitch checked={e.imagePreview ?? true} onChange={(v) => updateSettingSection("editor", { imagePreview: v })} />
                </SettingRow>
                <SettingRow title="Compact Tab Bar">
                    <SettingSwitch checked={e.compactTabs} onChange={(v) => updateSettingSection("editor", { compactTabs: v })} />
                </SettingRow>
            </SettingSection>

            <SettingSection id="settings-editor-save" title="Saving">
                <SettingRow title="Format On Save">
                    <SettingSwitch checked={e.formatOnSave} onChange={(v) => updateSettingSection("editor", { formatOnSave: v })} />
                </SettingRow>
                <SettingRow title="Auto Save">
                    <SettingSelect
                        value={e.autoSave}
                        options={[
                            { value: "off", label: "Off" },
                            { value: "afterDelay", label: "After Delay" },
                            { value: "onFocusChange", label: "On Focus Change" },
                        ]}
                        onChange={(v) => updateSettingSection("editor", { autoSave: v })}
                    />
                </SettingRow>
                {e.autoSave === "afterDelay" && (
                    <SettingRow title="Auto Save Delay">
                        <SettingNumberSelect
                            value={e.autoSaveDelay}
                            options={AUTO_SAVE_DELAY_PRESETS}
                            formatLabel={(n) => `${n / 1000}s`}
                            onChange={(v) => updateSettingSection("editor", { autoSaveDelay: v })}
                        />
                    </SettingRow>
                )}
                <SettingRow title="Trim Trailing Whitespace On Save">
                    <SettingSwitch checked={e.trimTrailingWhitespace} onChange={(v) => updateSettingSection("editor", { trimTrailingWhitespace: v })} />
                </SettingRow>
                <SettingRow title="Insert Final Newline On Save">
                    <SettingSwitch checked={e.insertFinalNewline} onChange={(v) => updateSettingSection("editor", { insertFinalNewline: v })} />
                </SettingRow>
            </SettingSection>

            <SettingSection id="settings-editor-files" title="Files">
                <SettingRow title="Exclude From Search" description="Glob patterns hidden from search and file pickers" stack>
                    <ExcludePatternsSelect
                        value={settings.files.exclude}
                        onChange={(v) => updateSettingSection("files", { exclude: v })}
                    />
                </SettingRow>
                <SettingRow title="Default End of Line">
                    <SettingSelect
                        value={settings.files.defaultEol}
                        options={[
                            { value: "LF", label: "LF" },
                            { value: "CRLF", label: "CRLF" },
                        ]}
                        onChange={(v) =>
                            updateSettingSection("files", {
                                defaultEol: v as ShapeSettings["files"]["defaultEol"],
                            })
                        }
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection id="settings-editor-design" title="Design">
                <SettingRow title="Design Autocomplete">
                    <SettingSwitch
                        checked={settings.designAutocomplete.enable}
                        onChange={(v) => updateSettingSection("designAutocomplete", { enable: v })}
                    />
                </SettingRow>
                <SettingRow title="WCAG Contrast Warnings">
                    <SettingSwitch
                        checked={settings.designDiagnostics.enable}
                        onChange={(v) => updateSettingSection("designDiagnostics", { enable: v })}
                    />
                </SettingRow>
                <SettingRow title="Compliance Level">
                    <SettingSelect
                        value={settings.designDiagnostics.level}
                        options={[
                            { value: "AA", label: "AA" },
                            { value: "AAA", label: "AAA" },
                        ]}
                        onChange={(v) => updateSettingSection("designDiagnostics", { level: v as "AA" | "AAA" })}
                    />
                </SettingRow>
                <SettingRow title="Tailwind Layout Controls">
                    <SettingSwitch
                        checked={settings.tailwindControls.enable}
                        onChange={(v) => updateSettingSection("tailwindControls", { enable: v })}
                    />
                </SettingRow>
                <SettingRow title="Number Scrubbing" description="Alt-drag or scroll over underlined values">
                    <SettingSwitch
                        checked={settings.tailwindControls.numberScrubbing}
                        onChange={(v) => updateSettingSection("tailwindControls", { numberScrubbing: v })}
                    />
                </SettingRow>
                <SettingRow title="Scrub Underlines" description="Show dashed underlines on scrubbable numbers">
                    <SettingSwitch
                        checked={settings.tailwindControls.scrubDecorations}
                        onChange={(v) => updateSettingSection("tailwindControls", { scrubDecorations: v })}
                    />
                </SettingRow>
                <SettingRow title="Cursor Opens Panel" description="Rest cursor on a token to open its control panel">
                    <SettingSwitch
                        checked={settings.tailwindControls.cursorBindPanel}
                        onChange={(v) => updateSettingSection("tailwindControls", { cursorBindPanel: v })}
                    />
                </SettingRow>
                <SettingRow title="Scroll on Panel Inputs" description="Mouse wheel nudges padding/gap values like Figma">
                    <SettingSwitch
                        checked={settings.tailwindControls.wheelOnInputs}
                        onChange={(v) => updateSettingSection("tailwindControls", { wheelOnInputs: v })}
                    />
                </SettingRow>
                <SettingRow title="Design Blame Hover" description="Plain-language last-change hover on UI tokens">
                    <SettingSwitch
                        checked={settings.designBlame.enable}
                        onChange={(v) => updateSettingSection("designBlame", { enable: v })}
                    />
                </SettingRow>
                <SettingRow title="Spacing Scale Refactor" description="Right-click a scale number to replace all in file">
                    <SettingSwitch
                        checked={settings.spacingRefactor.enable}
                        onChange={(v) => updateSettingSection("spacingRefactor", { enable: v })}
                    />
                </SettingRow>
            </SettingSection>
        </>
    );
}

function TerminalSettings({ settings }: { settings: ShapeSettings }) {
    const t = settings.terminal;
    return (
        <SettingSection id="settings-terminal" title="Integrated Terminal">
            <SettingRow title="Default Shell">
                <SettingSelect
                    value={t.defaultShell}
                    options={[
                        { value: "auto", label: "Auto Detect" },
                        { value: "powershell", label: "PowerShell" },
                        { value: "cmd", label: "Command Prompt" },
                        { value: "git-bash", label: "Git Bash" },
                    ]}
                    onChange={(v) => updateSettingSection("terminal", { defaultShell: v })}
                />
            </SettingRow>
            <SettingRow title="Font Family">
                <FontFamilySelect
                    value={t.fontFamily}
                    presets={TERMINAL_FONT_PRESETS}
                    onChange={(v) => updateSettingSection("terminal", { fontFamily: v })}
                />
            </SettingRow>
            <SettingRow title="Font Size">
                <SettingNumberSelect
                    value={t.fontSize}
                    options={FONT_SIZE_PRESETS}
                    onChange={(v) => updateSettingSection("terminal", { fontSize: v })}
                />
            </SettingRow>
            <SettingRow title="Scrollback Lines">
                <SettingNumberSelect
                    value={t.scrollback}
                    options={SCROLLBACK_PRESETS}
                    formatLabel={(n) => n.toLocaleString()}
                    onChange={(v) => updateSettingSection("terminal", { scrollback: v })}
                />
            </SettingRow>
            <SettingRow title="Copy On Select">
                <SettingSwitch checked={t.copyOnSelect} onChange={(v) => updateSettingSection("terminal", { copyOnSelect: v })} />
            </SettingRow>
        </SettingSection>
    );
}

function GitSettings({ settings }: { settings: ShapeSettings }) {
    const g = settings.git;
    return (
        <SettingSection id="settings-git" title="Source Control">
            <SettingRow title="Auto Fetch">
                <SettingSwitch checked={g.autoFetch} onChange={(v) => updateSettingSection("git", { autoFetch: v })} />
            </SettingRow>
            {g.autoFetch && (
                <SettingRow title="Auto Fetch Interval">
                    <SettingNumberSelect
                        value={g.autoFetchInterval}
                        options={AUTO_FETCH_INTERVAL_PRESETS}
                        formatLabel={(n) => (n >= 60 ? `${n / 60} min` : `${n}s`)}
                        onChange={(v) => updateSettingSection("git", { autoFetchInterval: v })}
                    />
                </SettingRow>
            )}
            <SettingRow title="Confirm Before Commit">
                <SettingSwitch checked={g.confirmBeforeCommit} onChange={(v) => updateSettingSection("git", { confirmBeforeCommit: v })} />
            </SettingRow>
            <SettingRow
                title="Graph Branch Avatars"
                description="Show GitHub author avatars on multi-lane Git Graph branches"
            >
                <SettingSwitch checked={g.graphAvatars} onChange={(v) => updateSettingSection("git", { graphAvatars: v })} />
            </SettingRow>
            <SettingRow
                title="Graph Show All Branches"
                description="Include every local and remote branch in the Git Graph. Turn off to show only the current branch"
            >
                <SettingSwitch checked={g.graphShowAllBranches} onChange={(v) => updateSettingSection("git", { graphShowAllBranches: v })} />
            </SettingRow>
            <SettingRow title="Inline Git Blame" description="Show author and commit info on the current line in the editor">
                <SettingSwitch checked={g.blame.enabled} onChange={(v) => updateSettingSection("git", { blame: { enabled: v } })} />
            </SettingRow>
        </SettingSection>
    );
}

function AiSettings({
    settings,
    onOpenMcpLibrary,
}: {
    settings: ShapeSettings;
    onOpenMcpLibrary?: () => void;
}) {
    return <AiSettingsPanel settings={settings} onOpenMcpLibrary={onOpenMcpLibrary} />;
}

function LintSettings({ settings }: { settings: ShapeSettings }) {
    const eslint = settings.eslint;
    const prettier = settings.prettier;
    return (
        <>
            <SettingSection id="settings-tools-lint" title="ESLint">
                <SettingRow title="Enable ESLint">
                    <SettingSwitch checked={eslint.enable} onChange={(v) => updateSettingSection("eslint", { enable: v })} />
                </SettingRow>
                <SettingRow title="Fix On Save">
                    <SettingSwitch checked={eslint.fixOnSave} onChange={(v) => updateSettingSection("eslint", { fixOnSave: v })} />
                </SettingRow>
            </SettingSection>
            <SettingSection title="Prettier">
                <SettingRow title="Enable Prettier">
                    <SettingSwitch checked={prettier.enable} onChange={(v) => updateSettingSection("prettier", { enable: v })} />
                </SettingRow>
            </SettingSection>
        </>
    );
}

function LspSettings({ settings }: { settings: ShapeSettings }) {
    const lsp = settings.lsp;
    return (
        <>
            <SettingSection id="settings-languages" title="Language Servers">
                <SettingRow title="TypeScript / JavaScript" description="IntelliSense and diagnostics for TS, TSX, JS, and JSX">
                    <SettingSwitch checked={lsp.typescript} onChange={(v) => updateSettingSection("lsp", { typescript: v })} />
                </SettingRow>
                <SettingRow title="HTML">
                    <SettingSwitch checked={lsp.html} onChange={(v) => updateSettingSection("lsp", { html: v })} />
                </SettingRow>
                <SettingRow title="CSS / SCSS / Less">
                    <SettingSwitch checked={lsp.css} onChange={(v) => updateSettingSection("lsp", { css: v })} />
                </SettingRow>
                <SettingRow title="JSON" description="Language support for JSON and JSONC">
                    <SettingSwitch checked={lsp.json} onChange={(v) => updateSettingSection("lsp", { json: v })} />
                </SettingRow>
                <SettingRow title="Tailwind CSS" description="Class name completions in markup">
                    <SettingSwitch checked={lsp.tailwindcss} onChange={(v) => updateSettingSection("lsp", { tailwindcss: v })} />
                </SettingRow>
            </SettingSection>
            <SettingSection title="Editor Assistance">
                <SettingRow title="Emmet" description="HTML/CSS abbreviation expansion in the editor">
                    <SettingSwitch checked={lsp.emmet} onChange={(v) => updateSettingSection("lsp", { emmet: v })} />
                </SettingRow>
            </SettingSection>
        </>
    );
}

function NodeSettings({ settings }: { settings: ShapeSettings }) {
    const node = settings.node;
    const { project_path } = useProjectState();
    const [info, setInfo] = useState<PackageInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [installName, setInstallName] = useState("");

    const pm = resolvePackageManager(project_path);

    const loadPackages = useCallback(async () => {
        if (!project_path) {
            setInfo(null);
            return;
        }
        setLoading(true);
        try {
            const data = await commands.getPackageInfo(project_path, pm);
            setInfo(data);
        } catch {
            setInfo(null);
        } finally {
            setLoading(false);
        }
    }, [project_path, pm]);

    useEffect(() => {
        void loadPackages();
    }, [loadPackages]);

    const allDeps: PackageDep[] = [
        ...(info?.dependencies ?? []),
        ...(info?.dev_dependencies ?? []),
    ];

    return (
        <>
            <SettingSection id="settings-node" title="Node.js">
                <SettingRow title="Coding assistance for Node.js" description="Enable Node.js API completions and documentation">
                    <SettingSwitch
                        checked={node.codingAssistance}
                        onChange={(v) => {
                            updateSettingSection("node", { codingAssistance: v });
                            updateSettingSection("lsp", { typescript: v });
                        }}
                    />
                </SettingRow>
                <SettingRow title="Package manager" description="Used for install, update, and npm scripts">
                    <SettingSelect
                        value={node.packageManager}
                        options={[
                            { value: "auto", label: "Auto-detect" },
                            { value: "npm", label: "npm" },
                            { value: "yarn", label: "yarn" },
                            { value: "pnpm", label: "pnpm" },
                            { value: "bun", label: "bun" },
                        ]}
                        onChange={(v) => updateSettingSection("node", { packageManager: v })}
                        className="w-48"
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection title="Packages" description={project_path ? `Using ${pm} for ${info?.name ?? "project"}` : "Open a project to manage packages"}>
                {!project_path ? (
                    <div className="px-3.5 py-4 text-sm text-text-muted">Open a folder to view installed packages.</div>
                ) : (
                    <div className="overflow-hidden">
                        <div className="px-3.5 py-3 flex gap-2 items-center border-b border-border">
                            <Input
                                placeholder="Package name to install..."
                                value={installName}
                                onChange={(e) => setInstallName(e.target.value)}
                                className="h-8 text-sm flex-1 rounded-lg bg-surface-3"
                            />
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={!installName.trim() || loading}
                                onClick={async () => {
                                    try {
                                        await commands.npmInstall(project_path, installName.trim(), false, pm);
                                        notify.success("Packages", `Installed ${installName.trim()}`);
                                        setInstallName("");
                                        void loadPackages();
                                    } catch (e) {
                                        notify.error("Install failed", String(e));
                                    }
                                }}
                            >
                                Install
                            </Button>
                            <Button
                                size="sm"
                                variant="default"
                                disabled={loading}
                                onClick={async () => {
                                    try {
                                        await commands.runInstallAll(project_path, pm);
                                        notify.success("Packages", "Dependencies installed");
                                        void loadPackages();
                                    } catch (e) {
                                        notify.error("Install failed", String(e));
                                    }
                                }}
                            >
                                Run install
                            </Button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-text-muted border-b border-border-subtle">
                                        <th className="px-3.5 py-2 font-medium">Package</th>
                                        <th className="px-3 py-2 font-medium">Version</th>
                                        <th className="px-3 py-2 font-medium text-right">Latest</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading && (
                                        <tr><td colSpan={3} className="px-3.5 py-4 text-text-muted">Loading...</td></tr>
                                    )}
                                    {!loading && allDeps.length === 0 && (
                                        <tr><td colSpan={3} className="px-3.5 py-4 text-text-muted">No packages found.</td></tr>
                                    )}
                                    {!loading && allDeps.map((dep) => (
                                        <tr key={dep.name} className="border-b border-border-subtle/40 hover:bg-panel-hover/40">
                                            <td className="px-3.5 py-2 text-text-primary">{dep.name}</td>
                                            <td className="px-3 py-2 text-text-muted">{dep.installed ?? dep.version}</td>
                                            <td className="px-3 py-2 text-right text-text-muted">
                                                {dep.latest && dep.latest !== dep.installed ? dep.latest : "-"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </SettingSection>
        </>
    );
}

function DeveloperSettings({ settings }: { settings: ShapeSettings }) {
    const dev = settings.developer;

    const restartOnboarding = async () => {
        localStorage.removeItem("shape-onboarding-complete");
        if (!("__TAURI_INTERNALS__" in window)) return;
        try {
            const existing = await WebviewWindow.getByLabel("onboarding");
            if (existing) {
                await existing.show();
                await existing.setFocus();
                return;
            }
            const created = new WebviewWindow("onboarding", {
                url: appRoute("/onboarding"),
                title: "Welcome to Shape",
                width: 960,
                height: 720,
                center: true,
                decorations: false,
                resizable: true,
                visible: true,
            });
            await created.setFocus();
        } catch (error) {
            notify.error("Onboarding", error instanceof Error ? error.message : String(error));
        }
    };

    return (
        <>
            <SettingSection id="settings-developer" title="Developer">
                <SettingRow title="Developer Tools in context menu">
                    <SettingSwitch
                        checked={dev.enableDevTools}
                        onChange={(v) => updateSettingSection("developer", { enableDevTools: v })}
                    />
                </SettingRow>
            </SettingSection>
            <SettingSection title="Onboarding">
                <SettingRow title="Restart onboarding">
                    <Button size="sm" variant="secondary" onClick={() => void restartOnboarding()}>
                        Restart onboarding
                    </Button>
                </SettingRow>
            </SettingSection>
        </>
    );
}

function PrivacySettings({ settings }: { settings: ShapeSettings }) {
    const p = settings.privacy;
    const n = settings.notifications;
    const u = settings.updates;
    const websiteBase = SHAPE_API_BASE;
    return (
        <>
            <SettingSection id="settings-updates" title="Updates">
                <SettingRow
                    title="Automatic updates"
                    description="Check for updates in the background and show a prompt in the titlebar when one is ready."
                >
                    <SettingSwitch
                        checked={u.autoUpdate}
                        onChange={(v) => updateSettingSection("updates", { autoUpdate: v })}
                    />
                </SettingRow>
                <SettingRow
                    title="Update channel"
                    description="Pre-release receives newer builds first. Same app - switch anytime in settings."
                >
                    <SettingSelect
                        value={u.channel}
                        options={[
                            { value: "stable", label: "Stable" },
                            { value: "pre", label: "Pre-release" },
                        ]}
                        onChange={(v) =>
                            updateSettingSection("updates", {
                                channel: v as ShapeSettings["updates"]["channel"],
                            })
                        }
                    />
                </SettingRow>
            </SettingSection>
            <SettingSection title="Startup">
                <SettingRow
                    title="Start with Agent view"
                    description="Open the Agent window on launch. The editor stays available but hidden until you open it."
                >
                    <SettingSwitch
                        checked={p.startupWithAgentView}
                        onChange={(v) => updateSettingSection("privacy", { startupWithAgentView: v })}
                    />
                </SettingRow>
                <SettingRow
                    title="Show welcome page on startup"
                    description="Prefer the welcome screen when Shape opens with no project."
                >
                    <SettingSwitch
                        checked={p.showWelcomeOnStartup}
                        onChange={(v) => updateSettingSection("privacy", { showWelcomeOnStartup: v })}
                    />
                </SettingRow>
                <SettingRow title="Show sign-in prompt on launch">
                    <SettingSwitch
                        checked={p.showLoginPromptOnLaunch}
                        onChange={(v) => updateSettingSection("privacy", { showLoginPromptOnLaunch: v })}
                    />
                </SettingRow>
            </SettingSection>
            <SettingSection id="settings-notifications" title="Notifications">
                <SettingRow
                    title="Desktop notifications"
                    description="OS notifications when a chat turn finishes or a command needs approval. On by default."
                >
                    <SettingSwitch
                        checked={n.desktopEnabled}
                        onChange={(v) => {
                            updateSettingSection("notifications", { desktopEnabled: v });
                            if (v) {
                                void import("@/lib/desktop-notifications").then(({ ensureNotificationPermission }) =>
                                    ensureNotificationPermission(),
                                );
                            }
                        }}
                    />
                </SettingRow>
                <SettingRow title="Generation finished">
                    <SettingSwitch
                        checked={n.onGenerationComplete}
                        disabled={!n.desktopEnabled}
                        onChange={(v) => updateSettingSection("notifications", { onGenerationComplete: v })}
                    />
                </SettingRow>
                <SettingRow title="Approval required">
                    <SettingSwitch
                        checked={n.onApprovalRequired}
                        disabled={!n.desktopEnabled}
                        onChange={(v) => updateSettingSection("notifications", { onApprovalRequired: v })}
                    />
                </SettingRow>
            </SettingSection>
            <SettingSection id="settings-privacy" title="Telemetry">
                <SettingRow title="Send usage telemetry">
                    <SettingSwitch
                        checked={p.telemetryEnabled}
                        onChange={(v) => {
                            updateSettingSection("privacy", { telemetryEnabled: v });
                            void applyTelemetryPreference(v);
                        }}
                    />
                </SettingRow>
            </SettingSection>
            <SettingSection title="Legal">
                <div className="px-3.5 py-3 space-y-2 text-sm">
                    <button
                        type="button"
                        className="block text-text-muted hover:text-text-primary transition-colors"
                        onClick={() => void commands.openUrlExternal(`${websiteBase}/terms`)}
                    >
                        Terms of Service
                    </button>
                    <button
                        type="button"
                        className="block text-text-muted hover:text-text-primary transition-colors"
                        onClick={() => void commands.openUrlExternal(`${websiteBase}/privacy`)}
                    >
                        Privacy Policy
                    </button>
                </div>
            </SettingSection>
        </>
    );
}

function PythonSettings({ settings }: { settings: ShapeSettings }) {
    const { project_path } = useProjectState();
    const selected = settings.python?.interpreterPath ?? "auto";
    const [interpreters, setInterpreters] = useState<{ path: string; label: string; version?: string }[]>([]);

    useEffect(() => {
        let cancelled = false;
        void import("@/lib/python-interpreters").then(({ discoverPythonInterpreters }) =>
            discoverPythonInterpreters(project_path).then((list) => {
                if (!cancelled) setInterpreters(list);
            }),
        );
        return () => {
            cancelled = true;
        };
    }, [project_path, selected]);

    const options = [
        { value: "auto", label: "Auto detect on PATH" },
        ...interpreters.map((i) => ({
            value: i.path,
            label: i.version ? `Python ${i.version}  ${i.path}` : `${i.label || "Python"}  ${i.path}`,
        })),
    ];
    // Ensure current custom path remains selectable even if discovery missed it
    if (selected !== "auto" && !options.some((o) => o.value === selected)) {
        options.push({ value: selected, label: selected });
    }

    return (
        <SettingSection id="settings-python" title="Python">
            <SettingRow
                title="Interpreter"
                description="Used for Run and the Python language server. Change here or from the status bar."
            >
                <div className="flex items-center gap-2">
                    <SettingSelect
                        value={selected}
                        options={options}
                        onChange={(v) => updateSettingSection("python", { interpreterPath: v })}
                    />
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                            void (async () => {
                                const { open } = await import("@tauri-apps/plugin-dialog");
                                const picked = await open({
                                    multiple: false,
                                    title: "Select Python executable",
                                });
                                if (typeof picked === "string" && picked) {
                                    updateSettingSection("python", { interpreterPath: picked });
                                }
                            })();
                        }}
                    >
                        Browse…
                    </Button>
                </div>
            </SettingRow>
        </SettingSection>
    );
}

function ToolsSettings({ settings }: { settings: ShapeSettings }) {
    return (
        <>
            <LintSettings settings={settings} />
            <NodeSettings settings={settings} />
            <PythonSettings settings={settings} />
        </>
    );
}

function AppearanceSettings({ settings }: { settings: ShapeSettings }) {
    return (
        <SettingSection id="settings-appearance" title="Theme">
            <div className="px-3.5 py-3.5">
                <ThemePicker
                    value={normalizeColorTheme(settings.appearance?.colorTheme)}
                    onChange={(colorTheme) => updateSettingSection("appearance", { colorTheme })}
                    className="grid-cols-2 sm:grid-cols-4"
                />
            </div>
        </SettingSection>
    );
}

function ApplicationSettings({
    settings,
    onResetClick,
}: {
    settings: ShapeSettings;
    onResetClick: () => void;
}) {
    return (
        <>
            <PrivacySettings settings={settings} />
            <DeveloperSettings settings={settings} />
            <SettingSection id="settings-reset" title="Reset">
                <SettingRow
                    title="Reset all settings"
                    description="Restore editor, agent, and application preferences to defaults. Account and project files are not affected."
                >
                    <Button size="sm" variant="secondary" onClick={onResetClick}>
                        Reset to Defaults
                    </Button>
                </SettingRow>
            </SettingSection>
        </>
    );
}

function AdvancedSettings({ settings }: { settings: ShapeSettings }) {
    return (
        <>
            <AppearanceSettings settings={settings} />
            <DeveloperSettings settings={settings} />
            <PrivacySettings settings={settings} />
        </>
    );
}

function tierLabel(tier: ShapeTier): string {
    switch (tier) {
        case "plus":
            return "Plus";
        case "pro":
            return "Pro";
        case "max":
            return "Max";
        case "team":
            return "Team";
        default:
            return "Free";
    }
}

export function SettingsView() {
    const settings = useSettings();
    const searchParams = useSearchParams();
    const router = useRouter();
    const auth = useShapeAuth();
    const { closeWindow } = useWindowControls();
    const [query, setQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>("account");
    const [subView, setSubView] = useState<"mcp-library" | null>(null);
    const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

    const resolveCategoryFromDeepLink = useCallback(
        (category?: string | null, section?: string | null): SettingsCategoryId => {
            if (section === "rules" || section === "memories") return "agents";
            switch (category) {
                case "account":
                case "general":
                    return "account";
                case "ai":
                    return "agents";
                case "editor":
                    return "editor";
                case "terminal":
                    return "terminal";
                case "git":
                    return "git";
                case "languages":
                case "tools":
                    return "languages";
                case "advanced":
                case "appearance":
                    return category === "appearance" ? "appearance" : "application";
                default:
                    return "account";
            }
        },
        [],
    );

    const applyNavigation = useCallback(
        (category?: string | null, section?: string | null) => {
            setActiveCategory(resolveCategoryFromDeepLink(category, section));
            setSubView(null);
        },
        [resolveCategoryFromDeepLink],
    );

    useEffect(() => {
        applyNavigation(searchParams.get("category"), searchParams.get("section"));
    }, [searchParams, applyNavigation]);

    useEffect(() => {
        const handler = (event: Event) => {
            const custom = event as CustomEvent<{ category?: string; section?: string; path?: string }>;
            if (custom.detail?.path) {
                router.push(custom.detail.path);
                return;
            }
            applyNavigation(custom.detail?.category, custom.detail?.section);
        };
        window.addEventListener("shape-settings-navigate", handler as EventListener);
        let unlisten: (() => void) | null = null;
        void listen<{ category?: string; section?: string; path?: string }>(
            "shape-settings-navigate",
            (event) => {
                if (event.payload?.path) {
                    router.push(event.payload.path);
                    return;
                }
                applyNavigation(event.payload.category, event.payload.section);
            },
        )
            .then((fn) => {
                unlisten = fn;
            })
            .catch(() => undefined);
        return () => {
            window.removeEventListener("shape-settings-navigate", handler as EventListener);
            unlisten?.();
        };
    }, [applyNavigation, router]);

    const filteredCategories = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return SETTINGS_CATEGORIES;
        return SETTINGS_CATEGORIES.filter((cat) => {
            if (cat.label.toLowerCase().includes(q)) return true;
            return (cat.keywords ?? []).some((k) => k.includes(q));
        });
    }, [query]);

    useEffect(() => {
        if (!query.trim()) return;
        if (filteredCategories.length === 0) return;
        if (!filteredCategories.some((c) => c.id === activeCategory)) {
            setActiveCategory(filteredCategories[0]!.id);
        }
    }, [query, filteredCategories, activeCategory]);

    const activeMeta = SETTINGS_CATEGORIES.find((c) => c.id === activeCategory);

    const categoryContent = (() => {
        switch (activeCategory) {
            case "account":
                return <AccountSettingsPanel />;
            case "agents":
                return (
                    <AiSettings
                        settings={settings}
                        onOpenMcpLibrary={() => setSubView("mcp-library")}
                    />
                );
            case "editor":
                return <EditorSettings settings={settings} />;
            case "terminal":
                return <TerminalSettings settings={settings} />;
            case "git":
                return <GitSettings settings={settings} />;
            case "languages":
                return (
                    <>
                        <LspSettings settings={settings} />
                        <ToolsSettings settings={settings} />
                    </>
                );
            case "appearance":
                return <AppearanceSettings settings={settings} />;
            case "application":
                return (
                    <ApplicationSettings
                        settings={settings}
                        onResetClick={() => setResetConfirmOpen(true)}
                    />
                );
            default:
                return null;
        }
    })();

    if (subView === "mcp-library") {
        return <McpLibraryView onBack={() => setSubView(null)} />;
    }

    const displayName = auth.name?.trim() || auth.email?.trim() || "Account";
    const plan = tierLabel(auth.tier);

    return (
        <div className="flex h-full w-full min-w-0 overflow-hidden bg-editor select-none">
            <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-panel">
                <div className="flex shrink-0 flex-col gap-2 p-3 pt-2">
                    <button
                        type="button"
                        onClick={() => closeWindow()}
                        className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md px-2 text-sm text-text-secondary transition-colors hover:bg-panel-hover hover:text-text-primary"
                    >
                        <Icon name="arrow_back" size={16} />
                        Back
                    </button>
                    <div className="flex h-9 items-center gap-2 rounded-lg border border-border-subtle bg-surface-1 px-3">
                        <Icon name="search" size={14} className="shrink-0 text-text-muted" />
                        <Input
                            placeholder="Search settings"
                            value={query}
                            className="h-auto! bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 select-text"
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </div>
                </div>

                <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2 no-scrollbar">
                    {filteredCategories.map((cat) => {
                        const active = cat.id === activeCategory;
                        return (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => {
                                    setActiveCategory(cat.id);
                                    setSubView(null);
                                }}
                                className={cn(
                                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                                    active
                                        ? "bg-panel-active text-text-primary"
                                        : "text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                                )}
                            >
                                <Icon
                                    name={cat.icon}
                                    size={16}
                                    className={cn("shrink-0", active ? "text-text-primary" : "text-text-muted")}
                                />
                                <span className="truncate">{cat.label}</span>
                            </button>
                        );
                    })}
                </nav>

                <div className="shrink-0 border-t border-border px-2 py-2">
                    {auth.loggedIn ? (
                        <div className="flex items-center gap-2 rounded-lg px-1.5 py-1.5">
                            <ShapeAccountAvatar
                                userId={auth.userId}
                                name={auth.name}
                                email={auth.email}
                                offline={Boolean(auth.offline)}
                                size={28}
                                className="shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm text-text-primary">{displayName}</div>
                                <div className="truncate text-2xs text-text-muted">{plan} Plan</div>
                            </div>
                            <button
                                type="button"
                                aria-label="Account"
                                title="Account"
                                onClick={() => setActiveCategory("account")}
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-panel-hover hover:text-text-primary"
                            >
                                <Icon name="settings" size={16} />
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => void loginShape()}
                            className="flex w-full items-center justify-center rounded-md px-2 py-2 text-sm text-text-secondary transition-colors hover:bg-panel-hover hover:text-text-primary"
                        >
                            Sign in
                        </button>
                    )}
                </div>
            </aside>

            <section className="min-w-0 flex-1 overflow-y-auto no-scrollbar">
                <div className="mx-auto w-full max-w-3xl px-8 py-8 pb-24">
                    <h1 className="mb-6 text-2xl font-semibold tracking-tight text-text-primary">
                        {activeMeta?.label ?? "Settings"}
                    </h1>
                    <div className="space-y-2">{categoryContent}</div>
                </div>
            </section>

            <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reset all settings?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This restores editor, agent, and application preferences to their defaults. Your account and project files are not affected.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel asChild>
                            <Button variant="ghost" size="sm">
                                Cancel
                            </Button>
                        </AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <Button
                                size="sm"
                                onClick={() => {
                                    localStorage.removeItem("shape-settings-v1");
                                    updateSettings(DEFAULT_SETTINGS);
                                    setResetConfirmOpen(false);
                                }}
                            >
                                Reset
                            </Button>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

