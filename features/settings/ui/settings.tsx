"use client";

import { RiArrowRightSLine, RiUserLine } from "@remixicon/react";
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
import { resolvePackageManager } from "@/lib/package-manager";
import { notify } from "@/features/notifications";
import { appRoute } from "@/lib/app-route";
import { listen, WebviewWindow } from "@/lib/tauri/client-api";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    SettingRow,
    SettingSection,
    SettingSelect,
    SettingSwitch,
    SettingNumberSelect,
    FontFamilySelect,
    TERMINAL_FONT_PRESETS,
    FONT_SIZE_PRESETS,
    SCROLLBACK_PRESETS,
    AUTO_FETCH_INTERVAL_PRESETS,
    MAX_CONTEXT_PRESETS,
} from "./setting-controls";
import { AiSettingsPanel } from "./ai-settings";
import { AccountSettingsPanel } from "./account-settings";
import { applyTelemetryPreference } from "@/lib/telemetry";
import { SHAPE_API_BASE, dashboardUrl } from "@/lib/shape-auth/api";
import { Icon } from "@/components/ui/icon";
import { HostedSidebarBack } from "@/features/agent/sidebar/hosted-nav";
import { CollapsibleNavGroup, NavLeafButton } from "@/components/ui/collapsible-nav";
import { ThemePicker } from "./theme-picker";
import { normalizeColorTheme } from "@/lib/themes";
import { SETTINGS_NAV, allSettingsLeaves, type SettingsNavLeaf } from "./settings-nav";
import { KeyboardShortcutsView } from "./keyboard-shortcuts";
import { useRouter } from "next/navigation";
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
        <SettingSection id="settings-editor-font" title="Editor">
            <SettingRow title="Compact Tab Bar">
                <SettingSwitch
                    checked={e.compactTabs}
                    onChange={(v) => updateSettingSection("editor", { compactTabs: v })}
                />
            </SettingRow>
        </SettingSection>
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
}: {
    settings: ShapeSettings;
}) {
    return <AiSettingsPanel settings={settings} />;
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

    const restartOnboarding = () => {
        localStorage.removeItem("shape-onboarding-complete");
        window.dispatchEvent(new CustomEvent("shape-onboarding-restart"));
        // Close settings overlay if open in agent shell.
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

function PrivacySettings({ settings }: { settings: ShapeSettings }) {
    const p = settings.privacy;
    const n = settings.notifications;
    const u = settings.updates;
    const websiteBase = SHAPE_API_BASE;
    return (
        <>
            <SettingSection id="settings-updates" title="Updates">
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
            <SettingSection title="Startup">
                <SettingRow title="Show welcome page on startup">
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
                <SettingRow title="Desktop notifications">
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

function AdvancedSettings({ settings }: { settings: ShapeSettings }) {
    return (
        <>
            <SettingSection id="settings-appearance" title="Appearance">
                <SettingRow title="Theme">
                    <ThemePicker
                        value={normalizeColorTheme(settings.appearance.colorTheme)}
                        onChange={(id) => updateSettingSection("appearance", { colorTheme: id })}
                    />
                </SettingRow>
            </SettingSection>
            <DeveloperSettings settings={settings} />
            <PrivacySettings settings={settings} />
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
    const searchParams = useSearchParams();
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [activeLeafId, setActiveLeafId] = useState("account-profile");
    const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
        () => new Set(SETTINGS_NAV.map((g) => g.id)),
    );
    const scrollingToRef = React.useRef<string | null>(null);

    const resolveTargetFromDeepLink = useCallback((category?: string | null, section?: string | null): string | null => {
        if (section === "plugins") return "settings-ai-plugins";
        if (section === "mcp" || section === "integrations") return "settings-ai-mcp";
        if (section === "rules") return "settings-ai-rules";
        // Legacy deep link: "memories" (System Instructions) merged into Rules.
        if (section === "memories") return "settings-ai-rules";
        switch (category) {
            case "account":
            case "general":
                return "settings-account";
            case "ai":
            case "agents":
                return "settings-ai-models";
            case "integrations":
                return "settings-ai-mcp";
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
            case "keyboard":
            case "keybindings":
            case "shortcuts":
                return "settings-keyboard-shortcuts";
            default:
                return null;
        }
    }, []);

    const scrollToTarget = useCallback((targetId: string) => {
        const el = document.getElementById(targetId);
        if (!el) return;
        scrollingToRef.current = targetId;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        const leaf = allSettingsLeaves().find((l) => l.targetId === targetId);
        if (leaf) setActiveLeafId(leaf.id);
        window.setTimeout(() => {
            if (scrollingToRef.current === targetId) scrollingToRef.current = null;
        }, 600);
    }, []);

    const applyNavigation = useCallback(
        (category?: string | null, section?: string | null) => {
            const target = resolveTargetFromDeepLink(category, section);
            if (!target) return;
            window.setTimeout(() => scrollToTarget(target), 80);
        },
        [resolveTargetFromDeepLink, scrollToTarget],
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

    useEffect(() => {
        const targets = allSettingsLeaves()
            .map((l) => l.targetId)
            .filter((id): id is string => !!id);
        const elements = targets
            .map((id) => document.getElementById(id))
            .filter((el): el is HTMLElement => !!el);
        if (elements.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (scrollingToRef.current) return;
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                const first = visible[0];
                if (!first?.target.id) return;
                const leaf = allSettingsLeaves().find((l) => l.targetId === first.target.id);
                if (leaf) setActiveLeafId(leaf.id);
            },
            { root: null, rootMargin: "-20% 0px -65% 0px", threshold: 0 },
        );
        for (const el of elements) observer.observe(el);
        return () => observer.disconnect();
    }, [settings]);

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

    useEffect(() => {
        if (!query.trim()) return;
        setExpandedGroups(new Set(filteredNav.map((g) => g.id)));
    }, [query, filteredNav]);

    const toggleGroup = (groupId: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    const onLeafClick = (leaf: SettingsNavLeaf) => {
        if (leaf.href) {
            router.push(leaf.href);
            return;
        }
        if (leaf.targetId) {
            setActiveLeafId(leaf.id);
            if (leaf.id === "keyboard-shortcuts") return;
            // Keyboard shortcuts is its own page.
            window.setTimeout(() => scrollToTarget(leaf.targetId!), 40);
        }
    };

    return (
        <div
            className={cn(
                "flex h-full w-full min-w-0 overflow-hidden select-none",
                navPortalTarget ? "bg-panel" : "bg-background",
            )}
        >
            {(() => {
                const collapsed = Boolean(navPortalTarget) && !sidebarExpanded;
                const nav = (
                    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
                        {onBack ? (
                            <HostedSidebarBack
                                label="Back to app"
                                onBack={onBack}
                                collapsed={collapsed}
                            />
                        ) : null}
                        {collapsed ? null : (
                            <>
                                <nav className="no-scrollbar flex-1 space-y-1 overflow-y-auto px-2 pb-2">
                                    {filteredNav.map((group) => {
                                        const open = expandedGroups.has(group.id) || !!query.trim();
                                        return (
                                            <CollapsibleNavGroup
                                                key={group.id}
                                                label={group.label}
                                                open={open}
                                                onToggle={() => toggleGroup(group.id)}
                                            >
                                                {group.children.map((leaf) => (
                                                    <NavLeafButton
                                                        key={leaf.id}
                                                        active={activeLeafId === leaf.id}
                                                        onClick={() => onLeafClick(leaf)}
                                                    >
                                                        <Icon icon={leaf.icon} className="shrink-0 text-text-muted" />
                                                        <span className="min-w-0 flex-1 truncate text-left">{leaf.label}</span>
                                                        {leaf.href ? (
                                                            <Icon icon={RiArrowRightSLine} className="shrink-0 text-text-muted" />
                                                        ) : null}
                                                    </NavLeafButton>
                                                ))}
                                            </CollapsibleNavGroup>
                                        );
                                    })}
                                </nav>
                                <div className="shrink-0 px-2 pb-2">
                                    <NavLeafButton
                                        onClick={() => void commands.openUrlExternal(dashboardUrl())}
                                    >
                                        <Icon icon={RiUserLine} className="shrink-0 text-text-muted" />
                                        <span className="min-w-0 flex-1 truncate text-left">Account</span>
                                        <Icon icon={RiArrowRightSLine} className="shrink-0 text-text-muted" />
                                    </NavLeafButton>
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
            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
                    {activeLeafId === "keyboard-shortcuts" ? (
                        <div id="settings-keyboard-shortcuts" className="flex h-full min-h-0 flex-col">
                            <KeyboardShortcutsView />
                        </div>
                    ) : (
                        <>
                            <div className="sticky top-0 z-10 shrink-0 px-6 pt-4 pb-3">
                                <SearchInput
                                    placeholder="Search settings"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    className="mx-auto h-12 max-w-full rounded-lg border text-text-muted! font-medium border-border bg-transparent px-3"
                                />
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 pb-6 no-scrollbar lg:p-8">
                                <div className="mx-auto w-full max-w-5xl space-y-2">
                                    <AccountSettingsPanel />
                                    <AiSettings settings={settings} />
                                    <EditorSettings settings={settings} />
                                    <TerminalSettings settings={settings} />
                                    <GitSettings settings={settings} />
                                    <AdvancedSettings settings={settings} />
                                </div>
                            </div>
                        </>
                    )}
                </div>
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
