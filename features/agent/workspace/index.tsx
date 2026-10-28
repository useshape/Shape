"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Branch20Regular } from "@fluentui/react-icons/headless/svg/branch";
import { BranchRequest20Regular } from "@fluentui/react-icons/headless/svg/branch-request";
import { Folder20Regular } from "@fluentui/react-icons/headless/svg/folder";
import { Icon, type IconGlyph } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useProjectState } from "@/lib/backend";
import { EditorViewProvider, EditorSplitProvider } from "@/core/providers/editor";
import { PlanTabView } from "./plan-tab";
import { FileEditor } from "./editor";
import { FileTree } from "./tree";
import { SingleFileDiffEditor, type FileDiffTabInfo } from "./file-diff";
import Graph from "@/features/git/ui/graph/graph";
import { PullRequestsPanel } from "@/features/chat/ui/prs/view";
import { subscribePrUi, getPrUi } from "@/features/chat/ui/prs/store";
import { isBrowserTab } from "@/lib/window/browser-tab";
import { WorkspaceTabs } from "./tabs";
import { FileBar } from "./file-bar";
import {
    DEFAULT_TABS,
    uid,
    type TabKind,
    type WorkspaceTab,
} from "./model";
import type { CSSProperties } from "react";

const SIDEBAR_SURFACE = {
    "--panel": "var(--sidebar)",
    "--color-panel": "var(--sidebar)",
    "--editor": "var(--sidebar)",
    "--color-editor": "var(--sidebar)",
} as CSSProperties;

function PanelIcon({
    label,
    shortcut,
    active,
    onClick,
    icon,
}: {
    label: string;
    shortcut: string;
    active: boolean;
    onClick: () => void;
    icon: IconGlyph;
}) {
    return (
        <Tooltip content={label} shortcut={shortcut} side="bottom">
            <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                onClick={onClick}
                className={cn(
                    "flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary",
                    active && "bg-panel-active text-text-primary",
                )}
            >
                <Icon icon={icon} />
            </button>
        </Tooltip>
    );
}

export function AgentWorkspace({
    projectPath,
    expanded,
    onExpand,
}: {
    projectPath: string;
    expanded: boolean;
    onExpand: () => void;
}) {
    const { active_file } = useProjectState();
    const [tabs, setTabs] = useState<WorkspaceTab[]>(DEFAULT_TABS);
    const [activeId, setActiveId] = useState("graph");

    // Tab mutations read the latest list synchronously so a new tab and its
    // active id always agree (state updaters run twice in dev and must be pure).
    const tabsRef = useRef(tabs);
    const activeIdRef = useRef(activeId);
    const onExpandRef = useRef(onExpand);
    useEffect(() => {
        onExpandRef.current = onExpand;
    }, [onExpand]);

    const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

    const commitTabs = useCallback((next: WorkspaceTab[], activate: string) => {
        tabsRef.current = next;
        activeIdRef.current = activate;
        setTabs(next);
        setActiveId(activate);
    }, []);

    const addTab = useCallback((kind: TabKind, opts?: { expand?: boolean }) => {
        if (kind === "plan" || kind === "file" || kind === "diff" || kind === "agents") return;
        const title =
            kind === "files"
                ? "Files"
                : kind === "graph"
                  ? "Graph"
                  : kind === "prs"
                    ? "Pull requests"
                    : kind === "browser"
                      ? "New tab"
                      : kind;
        const prev = tabsRef.current;
        const existing = prev.find((t) => t.kind === kind);
        if (existing) commitTabs(prev, existing.id);
        else commitTabs([...prev, { id: kind, kind, title }], kind);
        if (opts?.expand) onExpandRef.current();
    }, [commitTabs]);

    const closeTab = useCallback((id: string) => {
        const prev = tabsRef.current;
        if (prev.length <= 1) return;
        const next = prev.filter((tab) => tab.id !== id);
        const activate = activeIdRef.current === id ? next[next.length - 1].id : activeIdRef.current;
        commitTabs(next, activate);
    }, [commitTabs]);

    const openFile = useCallback(
        (path: string) => {
            onExpandRef.current();
            const prev = tabsRef.current;
            const existing = prev.find((t) => t.kind === "file" && t.path === path);
            if (existing) {
                commitTabs(prev, existing.id);
                return;
            }
            const tab: WorkspaceTab = {
                id: uid("file"),
                kind: "file",
                title: path.split(/[\\/]/).pop() || path,
                path,
            };
            commitTabs([...prev, tab], tab.id);
        },
        [commitTabs],
    );

    const openDiff = useCallback(
        (info: FileDiffTabInfo) => {
            onExpandRef.current();
            const prev = tabsRef.current;
            const existing = prev.find((t) => t.kind === "diff" && t.id === info.id);
            if (existing) {
                commitTabs(
                    prev.map((t) => (t.id === existing.id ? { ...t, diff: info } : t)),
                    existing.id,
                );
                return;
            }
            const tab: WorkspaceTab = {
                id: info.id,
                kind: "diff",
                title: info.path.split(/[\\/]/).pop() || info.path,
                path: info.path,
                diff: info,
            };
            commitTabs([...prev, tab], tab.id);
        },
        [commitTabs],
    );

    const openPlan = useCallback(
        (path: string, title: string, markdown?: string) => {
            onExpandRef.current();
            const prev = tabsRef.current;
            const existing = prev.find((t) => t.kind === "plan" && t.path === path);
            if (existing) {
                commitTabs(
                    prev.map((t) =>
                        t.id === existing.id ? { ...t, markdown: markdown ?? t.markdown } : t,
                    ),
                    existing.id,
                );
                return;
            }
            const tab: WorkspaceTab = {
                id: uid("plan"),
                kind: "plan",
                title: title || "Plan",
                path,
                markdown,
            };
            commitTabs([...prev, tab], tab.id);
        },
        [commitTabs],
    );

    useEffect(() => {
        const onTab = (e: Event) => {
            const tabId = (e as CustomEvent<string>).detail?.toLowerCase();
            if (!tabId) return;
            if (tabId === "preview" || tabId === "browser") {
                addTab("files", { expand: true });
            }
            if (tabId === "graph" || tabId === "git") {
                addTab("graph", { expand: true });
            }
            if (tabId === "prs" || tabId === "pulls" || tabId === "pull-requests") {
                addTab("prs", { expand: true });
            }
            if (tabId === "files" || tabId === "explorer") {
                addTab("files", { expand: true });
            }
        };
        const onOpenPlan = (e: Event) => {
            const detail = (e as CustomEvent<{ path?: string; title?: string; markdown?: string }>).detail;
            if (!detail?.path && !detail?.markdown) return;
            openPlan(
                detail.path || "plan.md",
                detail.title || detail.path?.split(/[\\/]/).pop() || "Plan",
                detail.markdown,
            );
        };
        const onOpenFile = (e: Event) => {
            const path = (e as CustomEvent<{ path?: string }>).detail?.path;
            if (!path) return;
            if (isBrowserTab(path)) {
                addTab("files", { expand: true });
                return;
            }
            openFile(path);
        };
        const onOpenDiff = (e: Event) => {
            const tab = (e as CustomEvent<FileDiffTabInfo>).detail;
            if (!tab?.id || !tab.path) return;
            openDiff(tab);
        };
        window.addEventListener("shape-set-active-tab", onTab as EventListener);
        window.addEventListener("shape-open-workspace-plan", onOpenPlan as EventListener);
        window.addEventListener("shape-open-workspace-file", onOpenFile as EventListener);
        window.addEventListener("shape-open-file-diff", onOpenDiff as EventListener);
        let stopRustTab: (() => void) | undefined;
        void import("@tauri-apps/api/event").then(({ listen }) =>
            listen<string>("shape-set-active-tab", (event) => {
                window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: event.payload }));
            }).then((stop) => {
                stopRustTab = stop;
            }),
        );
        return () => {
            stopRustTab?.();
            window.removeEventListener("shape-set-active-tab", onTab as EventListener);
            window.removeEventListener("shape-open-workspace-plan", onOpenPlan as EventListener);
            window.removeEventListener("shape-open-workspace-file", onOpenFile as EventListener);
            window.removeEventListener("shape-open-file-diff", onOpenDiff as EventListener);
        };
    }, [addTab, openDiff, openFile, openPlan]);

    // Only react to the backend changing the active file, never to re-renders,
    // otherwise a freshly opened plan gets replaced by the previous file.
    useEffect(() => {
        if (!active_file) return;
        if (isBrowserTab(active_file)) {
            addTab("files", { expand: true });
            return;
        }
        if (active_file.startsWith("shape://")) return;
        openFile(active_file);
    }, [active_file, addTab, openFile]);

    useEffect(() => {
        const openDetail = () => {
            if (!getPrUi().selectedId) return;
            addTab("prs", { expand: true });
        };
        openDetail();
        return subscribePrUi(openDetail);
    }, [addTab]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (t?.closest("textarea, input, [contenteditable='true']")) return;
            if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
            if (e.key.toLowerCase() === "g" && !e.shiftKey) {
                e.preventDefault();
                addTab("files", { expand: true });
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [addTab]);

    if (!expanded) {
        return null;
    }

    return (
        <aside className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-sidebar">
            <div className="flex h-titlebar shrink-0 items-center gap-0.5 px-1.5">
                <PanelIcon
                    label="Graph"
                    shortcut="Ctrl+Alt+G"
                    active={active?.kind === "graph"}
                    onClick={() => addTab("graph", { expand: true })}
                    icon={Branch20Regular}
                />
                <PanelIcon
                    label="Files"
                    shortcut="Ctrl+Shift+E"
                    active={active?.kind === "files"}
                    onClick={() => addTab("files", { expand: true })}
                    icon={Folder20Regular}
                />
                <PanelIcon
                    label="Pull requests"
                    shortcut="Ctrl+Alt+R"
                    active={active?.kind === "prs"}
                    onClick={() => addTab("prs", { expand: true })}
                    icon={BranchRequest20Regular}
                />
            </div>
            {tabs.some((tab) => tab.kind === "file" || tab.kind === "diff" || tab.kind === "plan") ? (
            <div className="flex h-8 shrink-0 items-stretch">
                <WorkspaceTabs
                    className="min-w-0 flex-1 bg-transparent"
                    tabs={tabs.filter((tab) => tab.kind === "file" || tab.kind === "diff" || tab.kind === "plan")}
                    activeId={active?.id ?? ""}
                    onSelect={(id) => {
                        activeIdRef.current = id;
                        setActiveId(id);
                    }}
                    onClose={closeTab}
                    onNew={(kind) => addTab(kind, { expand: true })}
                    onReorder={(next) => commitTabs(next, activeIdRef.current)}
                />
            </div>
            ) : null}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div className="relative min-h-0 flex-1 overflow-hidden">
                    {active?.kind === "graph" ? (
                        <Graph hideHeader surface="panel" active />
                    ) : active?.kind === "files" ? (
                        <FileTree
                            projectPath={projectPath}
                            activePath={active_file}
                            onOpenFile={openFile}
                        />
                    ) : active?.kind === "prs" ? (
                        <div className="h-full min-h-0 bg-sidebar" style={SIDEBAR_SURFACE}>
                            <PullRequestsPanel pane="full" />
                        </div>
                    ) : active?.kind === "plan" && (active.path || active.markdown) ? (
                        <div className="h-full min-h-0 bg-sidebar" style={SIDEBAR_SURFACE}>
                            <PlanTabView path={active.path || ""} markdown={active.markdown} />
                        </div>
                    ) : active?.kind === "file" && active.path ? (
                        <EditorViewProvider>
                            <EditorSplitProvider>
                                <div className="flex h-full min-h-0 flex-col">
                                    <FileBar path={active.path} />
                                    <div className="flex min-h-0 flex-1">
                                        <div className="min-h-0 min-w-0 flex-1 bg-sidebar" style={SIDEBAR_SURFACE}>
                                            <FileEditor path={active.path} />
                                        </div>
                                        <div className="w-64 shrink-0">
                                            <FileTree
                                                projectPath={projectPath}
                                                activePath={active.path}
                                                onOpenFile={openFile}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </EditorSplitProvider>
                        </EditorViewProvider>
                    ) : active?.kind === "diff" && active.diff ? (
                        <div className="h-full min-h-0 bg-sidebar" style={SIDEBAR_SURFACE}>
                            <SingleFileDiffEditor tab={active.diff} />
                        </div>
                    ) : null}
                </div>
            </div>
        </aside>
    );
}
