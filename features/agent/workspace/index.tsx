"use client";

import { useCallback, useEffect, useState } from "react";
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
    const [activeId, setActiveId] = useState("changes");
    const [nav, setNav] = useState<string[]>(["changes"]);
    const [navIndex, setNavIndex] = useState(0);

    const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

    const select = useCallback((id: string) => {
        setActiveId(id);
        setNav((prev) => {
            const last = prev[navIndex];
            if (last === id) return prev;
            const next = prev.slice(0, navIndex + 1);
            next.push(id);
            setNavIndex(next.length - 1);
            return next;
        });
    }, [navIndex]);

    const addTab = useCallback((kind: TabKind, opts?: { expand?: boolean }) => {
        if (kind === "plan" || kind === "file" || kind === "diff" || kind === "agents") return;
        const expand = Boolean(opts?.expand);
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
        const tabId = kind;
        setTabs((prev) => {
            const existing = prev.find((t) => t.kind === kind);
            if (existing) {
                setActiveId(existing.id);
                return prev;
            }
            setActiveId(tabId);
            return [...prev, { id: tabId, kind, title }];
        });
        if (expand) onExpand();
    }, [onExpand]);

    const openFile = useCallback(
        (path: string) => {
            onExpand();
            const name = path.split(/[\\/]/).pop() || path;
            setTabs((prev) => {
                const existing = prev.find((t) => t.kind === "file" && t.path === path);
                if (existing) {
                    setActiveId(existing.id);
                    return prev;
                }
                const tab: WorkspaceTab = {
                    id: uid("file"),
                    kind: "file",
                    title: name,
                    path,
                };
                setActiveId(tab.id);
                return [...prev, tab];
            });
        },
        [onExpand],
    );

    const openDiff = useCallback(
        (info: FileDiffTabInfo) => {
            onExpand();
            const name = info.path.split(/[\\/]/).pop() || info.path;
            setTabs((prev) => {
                const existing = prev.find((t) => t.kind === "diff" && t.id === info.id);
                if (existing) {
                    setActiveId(existing.id);
                    return prev.map((t) => (t.id === existing.id ? { ...t, diff: info } : t));
                }
                const tab: WorkspaceTab = {
                    id: info.id,
                    kind: "diff",
                    title: name,
                    path: info.path,
                    diff: info,
                };
                setActiveId(tab.id);
                return [...prev, tab];
            });
        },
        [onExpand],
    );

    const openPlan = useCallback(
        (path: string, title: string, markdown?: string) => {
            onExpand();
            setTabs((prev) => {
                const existing = prev.find((t) => t.kind === "plan" && t.path === path);
                if (existing) {
                    setActiveId(existing.id);
                    return prev.map((t) =>
                        t.id === existing.id ? { ...t, markdown: markdown ?? t.markdown } : t,
                    );
                }
                const tab: WorkspaceTab = {
                    id: uid("plan"),
                    kind: "plan",
                    title: title || "Plan",
                    path,
                    markdown,
                };
                setActiveId(tab.id);
                return [...prev, tab];
            });
        },
        [onExpand],
    );

    const closeTab = useCallback((id: string) => {
        setTabs((prev) => {
            const next = prev.filter((t) => t.id !== id);
            if (next.length === 0) {
                setActiveId("changes");
                return DEFAULT_TABS;
            }
            if (id === activeId) setActiveId(next[next.length - 1]!.id);
            return next;
        });
    }, [activeId]);

    useEffect(() => {
        const onTab = (e: Event) => {
            const tabId = (e as CustomEvent<string>).detail?.toLowerCase();
            if (!tabId) return;
            if (tabId === "preview" || tabId === "browser") {
                addTab("browser", { expand: true });
            }
            if (tabId === "changes" || tabId === "source") {
                addTab("changes", { expand: true });
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
        const onOpenPrs = () => {
            addTab("prs", { expand: true });
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
        window.addEventListener("shape-open-pull-requests", onOpenPrs);
        window.addEventListener("shape-open-workspace-plan", onOpenPlan as EventListener);
        window.addEventListener("shape-open-workspace-file", onOpenFile as EventListener);
        window.addEventListener("shape-open-file-diff", onOpenDiff as EventListener);
        return () => {
            window.removeEventListener("shape-set-active-tab", onTab as EventListener);
            window.removeEventListener("shape-open-pull-requests", onOpenPrs);
            window.removeEventListener("shape-open-workspace-plan", onOpenPlan as EventListener);
            window.removeEventListener("shape-open-workspace-file", onOpenFile as EventListener);
            window.removeEventListener("shape-open-file-diff", onOpenDiff as EventListener);
        };
    }, [addTab, onExpand, openDiff, openFile, openPlan]);

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
    }, [addTab, onExpand]);

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
                        onReorder={setTabs}
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
                <div className="min-h-0 flex-1 overflow-hidden">
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
                    ) : active?.kind === "browser" ? (
                        <WorkspacePreview />
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
                </div>
            </div>
        </aside>
    );
}
