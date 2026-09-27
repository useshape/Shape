"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useProjectState } from "@/lib/backend";
import { EditorViewProvider, EditorSplitProvider } from "@/core/providers/editor";
import { WorkspaceTabs } from "./tabs";
import { ChangesView } from "./changes";
import { PlanTabView } from "./plan-tab";
import { FileEditor } from "./editor";
import { FileTree } from "./tree";
import { SingleFileDiffEditor, type FileDiffTabInfo } from "./file-diff";
import Graph from "@/features/git/ui/graph/graph";
import { WindowControlsSpacer } from "@/features/agent/workbench/titlebar/ui/window-controls";
import { PullRequestsPanel } from "@/features/chat/ui/prs/view";
import { subscribePrUi, getPrUi } from "@/features/chat/ui/prs/store";
import { WorkspacePreview } from "./preview";
import { isBrowserTab } from "@/lib/window/browser-tab";
import {
    DEFAULT_TABS,
    uid,
    type TabKind,
    type WorkspaceTab,
} from "./model";

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

    const select = useCallback((id: string) => {
        activeIdRef.current = id;
        setActiveId(id);
    }, []);

    const reorder = useCallback((next: WorkspaceTab[]) => {
        tabsRef.current = next;
        setTabs(next);
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
                      ? "Browser"
                      : "Changes";
        const prev = tabsRef.current;
        const existing = prev.find((t) => t.kind === kind);
        if (existing) commitTabs(prev, existing.id);
        else commitTabs([...prev, { id: kind, kind, title }], kind);
        if (opts?.expand) onExpandRef.current();
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

    const closeTab = useCallback((id: string) => {
        const prev = tabsRef.current;
        const next = prev.filter((t) => t.id !== id);
        if (next.length === 0) {
            commitTabs(DEFAULT_TABS, "graph");
            return;
        }
        const current = activeIdRef.current;
        commitTabs(next, id === current ? next[next.length - 1]!.id : current);
    }, [commitTabs]);

    useEffect(() => {
        const onTab = (e: Event) => {
            const tabId = (e as CustomEvent<string>).detail?.toLowerCase();
            if (!tabId) return;
            if (tabId === "preview" || tabId === "browser") {
                addTab("browser", { expand: true });
            }
            if (tabId === "graph" || tabId === "git") {
                addTab("graph", { expand: true });
            }
            if (tabId === "prs" || tabId === "pulls" || tabId === "pull-requests") {
                window.dispatchEvent(new Event("shape-open-pull-requests"));
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
                addTab("browser", { expand: true });
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
        return () => {
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
            addTab("browser", { expand: true });
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
        <aside className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-panel">
            <div
                className="flex h-titlebar shrink-0 items-center overflow-hidden bg-panel"
                data-tauri-drag-region
            >
                <div className="min-w-0 flex-1 overflow-hidden" data-no-drag>
                    <WorkspaceTabs
                        tabs={tabs}
                        activeId={activeId}
                        onSelect={select}
                        onClose={closeTab}
                        onReorder={reorder}
                        fade
                        onNew={(kind) => {
                            addTab(kind, { expand: true });
                        }}
                    />
                </div>
                <div className="relative z-20 flex h-full shrink-0 items-center gap-0.5 px-1" data-no-drag>
                    <WindowControlsSpacer />
                </div>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div className="relative min-h-0 flex-1 overflow-hidden">
                    {active?.kind === "changes" ? (
                        <ChangesView projectPath={projectPath} />
                    ) : active?.kind === "graph" ? (
                        <Graph hideHeader surface="panel" active />
                    ) : active?.kind === "files" ? (
                        <FileTree
                            projectPath={projectPath}
                            activePath={active_file}
                            onOpenFile={openFile}
                        />
                    ) : active?.kind === "prs" ? (
                        <PullRequestsPanel pane="full" />
                    ) : active?.kind === "plan" && (active.path || active.markdown) ? (
                        <PlanTabView path={active.path || ""} markdown={active.markdown} />
                    ) : active?.kind === "file" && active.path ? (
                        <EditorViewProvider>
                            <EditorSplitProvider>
                                <FileEditor path={active.path} />
                            </EditorSplitProvider>
                        </EditorViewProvider>
                    ) : active?.kind === "diff" && active.diff ? (
                        <SingleFileDiffEditor tab={active.diff} />
                    ) : null}
                    <div
                        className={
                            active?.kind === "browser"
                                ? "h-full"
                                : "pointer-events-none invisible absolute inset-0 h-full"
                        }
                    >
                        <WorkspacePreview />
                    </div>
                </div>
            </div>
        </aside>
    );
}
