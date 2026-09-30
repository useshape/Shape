"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
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
import { resolvePackageManager } from "@/lib/workspace/package-manager";
import { notify } from "@/features/notifications";
import { appRoute } from "@/lib/window/app-route";
import { listen, WebviewWindow } from "@/lib/tauri/client-api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchInput } from "@/components/ui/search";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    SettingRow,
    SettingSection,
    SettingCard,
    SettingSelect,
    SettingSwitch,
    SettingNumberSelect,
    FontFamilySelect,
    ExcludePatternsSelect,
    TERMINAL_FONT_PRESETS,
    FONT_SIZE_PRESETS,
    SCROLLBACK_PRESETS,
    AUTO_FETCH_INTERVAL_PRESETS,
} from "./shared/controls";
import { AiSettingsPanel } from "./sections/ai";
import { MicrophoneSettings } from "./sections/microphone";
import { AccountSettingsPanel } from "./sections/account";
import { applyTelemetryPreference } from "@/lib/telemetry";
import { clearRepoHistory } from "@/lib/workspace/repo-history";
import { SHAPE_API_BASE } from "@/lib/cloud/api";
import { HostedSidebarBack } from "@/features/agent/sidebar/hosted-nav";
import { ThemePicker } from "./theme/picker";
import { normalizeColorTheme } from "@/lib/settings/themes";
import { Icon } from "@/components/ui/icon";
import { ShapeLogo } from "@/components/ui/shape-logo";
import { SETTINGS_NAV, allSettingsLeaves, type SettingsNavLeaf } from "./shared/nav";
import { KeyboardShortcutsView } from "./sections/shortcuts";
import { PluginsSettingsView } from "./sections/plugins";
import { SkillsSettings } from "./sections/skills";
import { Skeleton } from "@/features/git/ui/shared/skeletons";
import { useRouter } from "next/navigation";
import { useShapeAuth } from "@/lib/cloud/store";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogBody,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function EditorSettings({ settings }: { settings: ShapeSettings }) {
    const e = settings.editor;
    const f = settings.files;
    return (
        <>
        <SettingSection id="settings-editor-font" title="Tabs">
            <SettingRow title="Compact tab bar" description="Shorter tabs in the editor.">
                <SettingSwitch
                    checked={e.compactTabs}
                    onChange={(v) => updateSettingSection("editor", { compactTabs: v })}
                />
            </SettingRow>
        </SettingSection>
        <SettingSection title="Text">
            <SettingCard>
            <SettingRow title="Font size">
                <SettingNumberSelect
                    value={e.fontSize}
                    options={FONT_SIZE_PRESETS}
                    onChange={(v) => updateSettingSection("editor", { fontSize: v })}
                />
            </SettingRow>
            <SettingRow title="Font ligatures">
                <SettingSwitch
                    checked={e.fontLigatures}
                    onChange={(v) => updateSettingSection("editor", { fontLigatures: v })}
                />
            </SettingRow>
            <SettingRow title="Word wrap">
                <SettingSelect
                    value={e.wordWrap}
                    options={[
                        { value: "off", label: "Off" },
                        { value: "on", label: "On" },
                        { value: "bounded", label: "Bounded" },
                    ]}
                    onChange={(v) =>
                        updateSettingSection("editor", { wordWrap: v as ShapeSettings["editor"]["wordWrap"] })
                    }
                />
            </SettingRow>
            <SettingRow title="Line numbers">
                <SettingSelect
                    value={e.lineNumbers}
                    options={[
                        { value: "on", label: "On" },
                        { value: "off", label: "Off" },
                        { value: "relative", label: "Relative" },
                    ]}
                    onChange={(v) =>
                        updateSettingSection("editor", {
                            lineNumbers: v as ShapeSettings["editor"]["lineNumbers"],
                        })
                    }
                />
            </SettingRow>
            <SettingRow title="Minimap">
                <SettingSwitch
                    checked={e.minimap}
                    onChange={(v) => updateSettingSection("editor", { minimap: v })}
                />
            </SettingRow>
            </SettingCard>
        </SettingSection>
        <SettingSection title="Indentation">
            <SettingCard>
            <SettingRow title="Tab size">
                <SettingNumberSelect
                    value={e.tabSize}
                    options={[2, 4, 8]}
                    onChange={(v) => updateSettingSection("editor", { tabSize: v })}
                />
            </SettingRow>
            <SettingRow title="Insert spaces" description="Use spaces instead of tab characters.">
                <SettingSwitch
                    checked={e.insertSpaces}
                    onChange={(v) => updateSettingSection("editor", { insertSpaces: v })}
                />
            </SettingRow>
            <SettingRow title="Detect indentation" description="Match the indent already used in the file.">
                <SettingSwitch
                    checked={e.detectIndentation}
                    onChange={(v) => updateSettingSection("editor", { detectIndentation: v })}
                />
            </SettingRow>
            </SettingCard>
        </SettingSection>
        <SettingSection title="Saving">
            <SettingCard>
            <SettingRow title="Format on save">
                <SettingSwitch
                    checked={e.formatOnSave}
                    onChange={(v) => updateSettingSection("editor", { formatOnSave: v })}
                />
            </SettingRow>
            <SettingRow title="Auto save">
                <SettingSelect
                    value={e.autoSave}
                    options={[
                        { value: "off", label: "Off" },
                        { value: "afterDelay", label: "After delay" },
                        { value: "onFocusChange", label: "On focus change" },
                    ]}
                    onChange={(v) =>
                        updateSettingSection("editor", { autoSave: v as ShapeSettings["editor"]["autoSave"] })
                    }
                />
            </SettingRow>
            <SettingRow title="Trim trailing whitespace">
                <SettingSwitch
                    checked={e.trimTrailingWhitespace}
                    onChange={(v) => updateSettingSection("editor", { trimTrailingWhitespace: v })}
                />
            </SettingRow>
            <SettingRow title="Insert final newline">
                <SettingSwitch
                    checked={e.insertFinalNewline}
                    onChange={(v) => updateSettingSection("editor", { insertFinalNewline: v })}
                />
            </SettingRow>
            </SettingCard>
        </SettingSection>
        <SettingSection title="Caret">
            <SettingCard>
            <SettingRow title="Cursor style">
                <SettingSelect
                    value={e.cursorStyle}
                    options={[
                        { value: "line", label: "Line" },
                        { value: "block", label: "Block" },
                        { value: "underline", label: "Underline" },
                    ]}
                    onChange={(v) =>
                        updateSettingSection("editor", { cursorStyle: v as ShapeSettings["editor"]["cursorStyle"] })
                    }
                />
            </SettingRow>
            <SettingRow title="Smooth scrolling">
                <SettingSwitch
                    checked={e.smoothScrolling}
                    onChange={(v) => updateSettingSection("editor", { smoothScrolling: v })}
                />
            </SettingRow>
            <SettingRow title="Bracket colors">
                <SettingSwitch
                    checked={e.bracketPairColorization}
                    onChange={(v) => updateSettingSection("editor", { bracketPairColorization: v })}
                />
            </SettingRow>
            <SettingRow title="Indent guides">
                <SettingSwitch
                    checked={e.showIndentGuides}
                    onChange={(v) => updateSettingSection("editor", { showIndentGuides: v })}
                />
            </SettingRow>
            </SettingCard>
        </SettingSection>
        <SettingSection id="settings-files" title="Files">
            <SettingCard>
            <SettingRow title="Image preview">
                <SettingSwitch
                    checked={e.imagePreview}
                    onChange={(v) => updateSettingSection("editor", { imagePreview: v })}
                />
            </SettingRow>
            <SettingRow title="Line endings">
                <SettingSelect
                    value={f.defaultEol}
                    options={[
                        { value: "LF", label: "LF" },
                        { value: "CRLF", label: "CRLF" },
                    ]}
                    onChange={(v) =>
                        updateSettingSection("files", { defaultEol: v as ShapeSettings["files"]["defaultEol"] })
                    }
                />
            </SettingRow>
            <SettingRow title="Exclude" description="Folders left out of search.">
                <ExcludePatternsSelect
                    value={f.exclude}
                    onChange={(v) => updateSettingSection("files", { exclude: v })}
                />
            </SettingRow>
            </SettingCard>
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
            <SettingRow title="Graph Branch Avatars">
                <SettingSwitch checked={g.graphAvatars} onChange={(v) => updateSettingSection("git", { graphAvatars: v })} />
            </SettingRow>
            <SettingRow title="Graph Show All Branches">
                <SettingSwitch checked={g.graphShowAllBranches} onChange={(v) => updateSettingSection("git", { graphShowAllBranches: v })} />
            </SettingRow>
            <SettingRow title="Inline Git Blame">
                <SettingSwitch checked={g.blame.enabled} onChange={(v) => updateSettingSection("git", { blame: { enabled: v } })} />
            </SettingRow>
        </SettingSection>
    );
}

function AiSettings({
    settings,
    page,
}: {
    settings: ShapeSettings;
    page: "models" | "rules" | "workflows" | "context";
}) {
    return <AiSettingsPanel settings={settings} page={page} />;
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
            <SettingSection id="settings-languages" title="Language servers">
                <SettingCard>
                <SettingRow title="TypeScript / JavaScript">
                    <SettingSwitch checked={lsp.typescript} onChange={(v) => updateSettingSection("lsp", { typescript: v })} />
                </SettingRow>
                <SettingRow title="HTML">
                    <SettingSwitch checked={lsp.html} onChange={(v) => updateSettingSection("lsp", { html: v })} />
                </SettingRow>
                <SettingRow title="CSS / SCSS / Less">
                    <SettingSwitch checked={lsp.css} onChange={(v) => updateSettingSection("lsp", { css: v })} />
                </SettingRow>
                <SettingRow title="JSON">
                    <SettingSwitch checked={lsp.json} onChange={(v) => updateSettingSection("lsp", { json: v })} />
                </SettingRow>
                <SettingRow title="Tailwind CSS">
                    <SettingSwitch checked={lsp.tailwindcss} onChange={(v) => updateSettingSection("lsp", { tailwindcss: v })} />
                </SettingRow>
                </SettingCard>
            </SettingSection>
            <SettingSection title="Editor Assistance">
                <SettingRow title="Emmet">
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
    const [loading, setLoading] = useState(() => Boolean(project_path));
    const [installName, setInstallName] = useState("");

    const pm = resolvePackageManager(project_path);

    const loadPackages = useCallback(async () => {
        if (!project_path) {
            setInfo(null);
            setLoading(false);
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
                <SettingRow title="Coding assistance for Node.js">
                    <SettingSwitch
                        checked={node.codingAssistance}
                        onChange={(v) => {
                            updateSettingSection("node", { codingAssistance: v });
                            updateSettingSection("lsp", { typescript: v });
                        }}
                    />
                </SettingRow>
                <SettingRow title="Package manager">
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

            <SettingSection title="Packages" description={project_path ? `Using ${pm} for ${info?.name ?? "project"}` : undefined}>
                <SettingCard>
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
                                    {loading &&
                                        Array.from({ length: 6 }, (_, i) => (
                                            <tr key={i} aria-hidden>
                                                <td className="px-3.5 py-2">
                                                    <Skeleton className="h-4 w-36" />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Skeleton className="h-4 w-14" />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Skeleton className="ml-auto h-4 w-12" />
                                                </td>
                                            </tr>
                                        ))}
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
                </SettingCard>
            </SettingSection>
        </>
    );
}

function DeveloperSettings({ settings }: { settings: ShapeSettings }) {
    const dev = settings.developer;

    const restartOnboarding = () => {
        localStorage.removeItem("shape-onboarding-complete");
        window.dispatchEvent(new CustomEvent("shape-onboarding-restart"));
        window.dispatchEvent(new CustomEvent("shape-agent-overlay", { detail: null }));
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
                    <Button size="sm" variant="secondary" onClick={restartOnboarding}>
                        Restart onboarding
                    </Button>
                </SettingRow>
            </SettingSection>
        </>
    );
}

function UpdatesSettings({ settings }: { settings: ShapeSettings }) {
    const u = settings.updates;
    const [version, setVersion] = useState("0.0.1");
    const [iconSrc, setIconSrc] = useState("/app-icon.png");

    useEffect(() => {
        void import("@tauri-apps/api/app")
            .then(({ getVersion }) => getVersion())
            .then(setVersion)
            .catch(() => {});
    }, []);

    return (
        <SettingSection id="settings-updates" title="Updates">
            <SettingCard>
            <div className="flex items-center gap-3 px-3.5 py-3">
                <img
                    src={iconSrc}
                    alt=""
                    width={40}
                    height={40}
                    className="size-10 shrink-0 rounded-lg object-cover"
                    onError={() => setIconSrc("/logos/logo.svg")}
                />
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-text-primary">Shape</div>
                    <div className="text-xs text-text-muted">Desktop app</div>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-text-muted">{version}</span>
            </div>
            </SettingCard>
            <SettingRow title="Automatic updates">
                <SettingSwitch
                    checked={u.autoUpdate}
                    onChange={(v) => updateSettingSection("updates", { autoUpdate: v })}
                />
            </SettingRow>
            <SettingRow title="Update channel">
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
    );
}

function PrivacySettings({ settings, part }: { settings: ShapeSettings; part: "notifications" | "privacy" }) {
    const p = settings.privacy;
    const websiteBase = SHAPE_API_BASE;
    if (part === "notifications") {
        const n = settings.notifications;
        return (
            <SettingSection id="settings-notifications" title="Notifications">
                <SettingRow title="Desktop notifications" description="Alerts while Shape is in the background.">
                    <SettingSwitch
                        checked={n.desktopEnabled}
                        onChange={(v) => {
                            updateSettingSection("notifications", { desktopEnabled: v });
                            if (v) {
                                void import("@/lib/notifications/desktop").then(({ ensureNotificationPermission }) =>
                                    ensureNotificationPermission(),
                                );
                            }
                        }}
                    />
                </SettingRow>
                <SettingCard>
                <SettingRow title="Generation finished" description="When a reply is ready.">
                    <SettingSwitch
                        checked={n.onGenerationComplete}
                        disabled={!n.desktopEnabled}
                        onChange={(v) => updateSettingSection("notifications", { onGenerationComplete: v })}
                    />
                </SettingRow>
                <SettingRow title="Approval required" description="When the agent is waiting on you.">
                    <SettingSwitch
                        checked={n.onApprovalRequired}
                        disabled={!n.desktopEnabled}
                        onChange={(v) => updateSettingSection("notifications", { onApprovalRequired: v })}
                    />
                </SettingRow>
                </SettingCard>
            </SettingSection>
        );
    }
    return (
        <>
            <SettingSection title="Startup">
                <SettingRow title="Show welcome page on startup">
                    <SettingSwitch
                        checked={p.showWelcomeOnStartup}
                        onChange={(v) => updateSettingSection("privacy", { showWelcomeOnStartup: v })}
                    />
                </SettingRow>
            </SettingSection>
            <SettingSection id="settings-privacy" title="Data Control">
                <SettingRow title="Usage telemetry">
                    <SettingSwitch
                        checked={p.telemetryEnabled}
                        onChange={(v) => {
                            updateSettingSection("privacy", { telemetryEnabled: v });
                            void applyTelemetryPreference(v);
                        }}
                    />
                </SettingRow>
                <SettingRow title="Clear recent folders">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            clearRepoHistory();
                            window.dispatchEvent(new Event("shape-repo-history-changed"));
                        }}
                    >
                        Clear
                    </Button>
                </SettingRow>
                <SettingRow title="Clear current chat">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            void commands.clearChatHistory().then(() => {
                                window.dispatchEvent(new CustomEvent("shape-chat-refresh"));
                            });
                        }}
                    >
                        Clear
                    </Button>
                </SettingRow>
                <SettingRow title="Skip checkpoint restore confirm">
                    <SettingSwitch
                        checked={p.skipCheckpointRestoreConfirm}
                        onChange={(v) => updateSettingSection("privacy", { skipCheckpointRestoreConfirm: v })}
                    />
                </SettingRow>
            </SettingSection>
            <FeedbackSection />
            <SettingSection title="Legal">
                <SettingCard>
                <div className="px-3.5 py-2 text-sm">
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
                </SettingCard>
            </SettingSection>
        </>
    );
}

function FeedbackSection() {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState("");

    const close = (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen) setMessage("");
    };

    return (
        <>
            <SettingSection title="Feedback">
                <SettingRow title="Send feedback" description="What’s working and what isn’t.">
                    <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                        Feedback
                    </Button>
                </SettingRow>
            </SettingSection>
            <AlertDialog open={open} onOpenChange={close}>
                <AlertDialogContent
                    sizeClassName="max-w-md"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <AlertDialogHeader>
                        <AlertDialogTitle>Feedback</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tell us what to keep or change.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogBody>
                        <Textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Your feedback…"
                            className="min-h-32"
                            autoFocus
                        />
                    </AlertDialogBody>
                    <AlertDialogFooter>
                        <AlertDialogCancel asChild>
                            <Button type="button" variant="ghost" size="sm">
                                Cancel
                            </Button>
                        </AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <Button
                                type="button"
                                size="sm"
                                disabled={!message.trim()}
                                onClick={() => close(false)}
                            >
                                Send
                            </Button>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

function PythonSettings({ settings }: { settings: ShapeSettings }) {
    const { project_path } = useProjectState();
    const selected = settings.python?.interpreterPath ?? "auto";
    const [interpreters, setInterpreters] = useState<{ path: string; label: string; version?: string }[]>([]);

    useEffect(() => {
        let cancelled = false;
        void import("@/lib/editor/python-interpreters").then(({ discoverPythonInterpreters }) =>
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
    if (selected !== "auto" && !options.some((o) => o.value === selected)) {
        options.push({ value: selected, label: selected });
    }

    return (
        <SettingSection id="settings-python" title="Python">
            <SettingRow title="Interpreter">
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

export function SettingsView({
    navPortalTarget,
    sidebarExpanded = true,
    onBack,
}: {
    /** When set, the settings nav is rendered into this element (agent sidebar). */
    navPortalTarget?: HTMLElement | null;
    /** Agent sidebar expanded. When false, only Back stays in the rail. */
    sidebarExpanded?: boolean;
    onBack?: () => void;
} = {}) {
    const settings = useSettings();
    const auth = useShapeAuth();
    const pluginsNavDisabled = !auth.loggedIn || Boolean(auth.offline);
    const searchParams = useSearchParams();
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [activeLeafId, setActiveLeafId] = useState("account-profile");
    const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

    const resolveTargetFromDeepLink = useCallback((category?: string | null, section?: string | null): string | null => {
        if (section === "plugins") return "settings-ai-plugins";
        if (section === "mcp" || section === "integrations") return null;
        if (section === "rules") return "settings-ai-rules";
        if (section === "workflows") return "settings-ai-workflows";
        // Legacy deep link: "memories" (System Instructions) merged into Rules.
        if (section === "memories") return "settings-ai-rules";
        switch (category) {
            case "account":
            case "general":
                return "settings-account";
            case "ai":
            case "agents":
                return "settings-ai-models";
            case "editor":
                return "settings-editor-font";
            case "terminal":
                return "settings-terminal";
            case "git":
                return "settings-git";
            case "appearance":
                return "settings-appearance";
            case "advanced":
            case "application":
                return "settings-updates";
            case "keyboard-shortcuts":
            case "keybindings":
            case "shortcuts":
                return "settings-keyboard-shortcuts";
            default:
                return null;
        }
    }, []);

    const applyNavigation = useCallback(
        (category?: string | null, section?: string | null) => {
            const target = resolveTargetFromDeepLink(category, section);
            if (!target) return;
            const leaf = allSettingsLeaves().find((l) => l.targetId === target);
            if (leaf) setActiveLeafId(leaf.id);
        },
        [resolveTargetFromDeepLink],
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

    const filteredNav = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return SETTINGS_NAV;
        return SETTINGS_NAV.map((group) => ({
            ...group,
            children: group.children.filter(
                (leaf) =>
                    leaf.label.toLowerCase().includes(q) ||
                    group.label.toLowerCase().includes(q),
            ),
        })).filter((group) => group.children.length > 0);
    }, [query]);

    const onLeafClick = (leaf: SettingsNavLeaf) => {
        if (leaf.href) {
            router.push(leaf.href);
            return;
        }
        setActiveLeafId(leaf.id);
    };

    return (
        <div
            className={cn(
                "flex h-full min-h-0 w-full min-w-0 overflow-hidden",
                navPortalTarget ? "bg-panel" : "bg-background",
            )}
        >
            {(() => {
                const collapsed = Boolean(navPortalTarget) && !sidebarExpanded;
                const nav = (
                    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
                        {onBack ? (
                            <HostedSidebarBack
                                label="Chat"
                                onBack={onBack}
                                collapsed={collapsed}
                            />
                        ) : null}
                        {collapsed ? null : (
                            <>
                                <div className="shrink-0 px-2 pb-2 mt-1">
                                    <SearchInput
                                        placeholder="Search..."
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        className="w-full bg-transparent!"
                                    />
                                </div>
                                <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                                    {filteredNav.map((group) => (
                                        <div key={group.id}>
                                            <div className="px-1.5 pb-1 text-sm text-text-muted/50">{group.label}</div>
                                            <div className="space-y-0.5">
                                                {group.children.map((leaf) => {
                                                    const active = activeLeafId === leaf.id;
                                                    const disabled = leaf.id === "plugins" && pluginsNavDisabled;
                                                    return (
                                                        <button
                                                            key={leaf.id}
                                                            type="button"
                                                            disabled={disabled}
                                                            onClick={() => onLeafClick(leaf)}
                                                            className={cn(
                                                                "flex h-9 w-full items-center gap-1.5 rounded-lg px-2 text-left text-sm",
                                                                active
                                                                    ? "bg-panel-hover text-text-primary"
                                                                    : "text-text-secondary hover:bg-panel-hover/50 hover:text-text-primary",
                                                                disabled && "pointer-events-none opacity-40",
                                                            )}
                                                        >
                                                            <Icon icon={leaf.icon} className="icon-md"/>
                                                            <span className="min-w-0 flex-1 truncate">{leaf.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </nav>
                                <div className="shrink-0 px-2 pb-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="mt-0.5 h-8 w-full justify-start px-1.5! text-sm"
                                        onClick={() => setResetConfirmOpen(true)}
                                    >
                                        Reset to Defaults
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                );
                if (navPortalTarget) return createPortal(nav, navPortalTarget);
                return (
                    <aside className="flex w-64 shrink-0 flex-col overflow-hidden bg-background">
                        {nav}
                    </aside>
                );
            })()}
            <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-panel">
                {activeLeafId === "keyboard-shortcuts" ? (
                    <div className="absolute inset-0 min-h-0">
                        <KeyboardShortcutsView />
                    </div>
                ) : activeLeafId === "plugins" ? (
                    <div className="absolute inset-0 min-h-0">
                        <PluginsSettingsView />
                    </div>
                ) : (
                    <div className="absolute inset-0 overflow-y-auto px-8 py-8">
                        <div className="mx-auto w-full max-w-4xl">
                            <h1 className="mb-6 text-2xl font-medium text-text-primary">
                                {allSettingsLeaves().find((leaf) => leaf.id === activeLeafId)?.label}
                            </h1>
                            {activeLeafId === "account-profile" ? <AccountSettingsPanel /> : null}
                            {activeLeafId === "ai-models" ? <AiSettings settings={settings} page="models" /> : null}
                            {activeLeafId === "ai-rules" ? <AiSettings settings={settings} page="rules" /> : null}
                            {activeLeafId === "ai-workflows" ? <AiSettings settings={settings} page="workflows" /> : null}
                            {activeLeafId === "ai-skills" ? <SkillsSettings /> : null}
                            {activeLeafId === "ai-context" ? <AiSettings settings={settings} page="context" /> : null}
                            {activeLeafId === "editor-font" ? <EditorSettings settings={settings} /> : null}
                            {activeLeafId === "appearance" ? (
                                <SettingSection id="settings-appearance" title="Appearance">
                                    <SettingRow title="Theme">
                                        <ThemePicker
                                            value={normalizeColorTheme(settings.appearance.colorTheme)}
                                            onChange={(id) => updateSettingSection("appearance", { colorTheme: id })}
                                        />
                                    </SettingRow>
                                </SettingSection>
                            ) : null}
                            {activeLeafId === "terminal" ? <TerminalSettings settings={settings} /> : null}
                            {activeLeafId === "microphone" ? <MicrophoneSettings /> : null}
                            {activeLeafId === "git" ? <GitSettings settings={settings} /> : null}
                            {activeLeafId === "updates" ? <UpdatesSettings settings={settings} /> : null}
                            {activeLeafId === "notifications" ? <PrivacySettings settings={settings} part="notifications" /> : null}
                            {activeLeafId === "privacy" ? <PrivacySettings settings={settings} part="privacy" /> : null}
                            {activeLeafId === "developer" ? <DeveloperSettings settings={settings} /> : null}
                        </div>
                    </div>
                )}
            </section>

            <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reset all settings?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Account and files stay.
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
