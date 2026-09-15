"use client";

import { RiLayoutRight2Line, RiMoreLine } from "@remixicon/react";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { useProjectState } from "@/lib/backend";
import { EditorViewProvider, EditorSplitProvider } from "@/core/providers/editor";
import { WorkspaceTabs } from "./tabs";
import { ChangesView } from "./changes";
import { PlanTabView } from "./plan-tab";
import { FileEditor } from "./editor";
import { FileTree } from "./tree";
import { SingleFileDiffEditor, type FileDiffTabInfo } from "./file-diff";
import Graph from "@/features/git/ui/graph/graph";
import { ToolBtn } from "./tool";
import { SubagentCards } from "@/features/agent/subagents/cards";
import { getSubagents, subscribeSubagents } from "@/features/agent/subagents/store";
import { WindowControlsSpacer } from "@/features/workbench/titlebar/ui/window-controls";
import { PullRequestsPanel } from "@/features/chat/ui/prs/view";
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
    onToggleRight,
}: {
    projectPath: string;
    expanded: boolean;
    onExpand: () => void;
    onToggleRight?: () => void;
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

    const addTab = useCallback((kind: TabKind) => {
        if (kind === "plan" || kind === "file" || kind === "diff") return;
        if (kind === "changes" || kind === "files" || kind === "agents" || kind === "graph" || kind === "prs") {
            const existing = tabs.find((t) => t.kind === kind);
            if (existing) {
                select(existing.id);
                if (kind === "files" || kind === "agents" || kind === "graph" || kind === "prs") onExpand();
                return;
            }
        }
        const title =
            kind === "agents"
                ? "Agents"
                : kind === "files"
                  ? "Files"
                  : kind === "graph"
                    ? "Graph"
                    : kind === "prs"
                      ? "Pull requests"
                      : "Changes";
        const tab: WorkspaceTab = {
            id: kind === "graph" ? "graph" : kind === "prs" ? "prs" : uid(kind),
            kind,
            title,
        };
        setTabs((p) => [...p, tab]);
        setActiveId(tab.id);
        if (kind === "files" || kind === "agents" || kind === "graph" || kind === "prs") onExpand();
    }, [onExpand, select, tabs]);

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

    const openKind = useCallback((kind: TabKind) => {
        addTab(kind);
        onExpand();
    }, [addTab, onExpand]);

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
            if (tabId === "changes" || tabId === "source") {
                addTab("changes");
                onExpand();
            }
            if (tabId === "graph" || tabId === "git") {
                addTab("graph");
                onExpand();
            }
            if (tabId === "agents") {
                openKind("agents");
            }
            if (tabId === "prs" || tabId === "pulls" || tabId === "pull-requests") {
                addTab("prs");
                onExpand();
            }
            if (tabId === "files" || tabId === "explorer") {
                addTab("files");
                onExpand();
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
            openFile(path);
        };
        const onOpenDiff = (e: Event) => {
            const tab = (e as CustomEvent<FileDiffTabInfo>).detail;
            if (!tab?.id || !tab.path) return;
            openDiff(tab);
        };
        const onPrs = () => {
            addTab("prs");
            onExpand();
        };
        window.addEventListener("shape-set-active-tab", onTab as EventListener);
        window.addEventListener("shape-open-workspace-plan", onOpenPlan as EventListener);
        window.addEventListener("shape-open-workspace-file", onOpenFile as EventListener);
        window.addEventListener("shape-open-file-diff", onOpenDiff as EventListener);
        window.addEventListener("shape-open-pull-requests", onPrs);
        return () => {
            window.removeEventListener("shape-set-active-tab", onTab as EventListener);
            window.removeEventListener("shape-open-workspace-plan", onOpenPlan as EventListener);
            window.removeEventListener("shape-open-workspace-file", onOpenFile as EventListener);
            window.removeEventListener("shape-open-file-diff", onOpenDiff as EventListener);
            window.removeEventListener("shape-open-pull-requests", onPrs);
        };
    }, [addTab, onExpand, openDiff, openFile, openKind, openPlan]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (t?.closest("textarea, input, [contenteditable='true']")) return;
            if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
            if (e.key.toLowerCase() === "g" && !e.shiftKey) {
                e.preventDefault();
                addTab("files");
                onExpand();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [addTab, onExpand]);

    useEffect(() => {
        let seen = getSubagents().length > 0;
        if (seen) {
            addTab("agents");
            onExpand();
        }
        return subscribeSubagents(() => {
            const n = getSubagents().length;
            if (!seen && n > 0) {
                addTab("agents");
                onExpand();
            }
            seen = n > 0;
        });
    }, [addTab, onExpand]);

    if (!expanded) {
        return (
            <aside className="flex h-full w-full flex-col items-center gap-1 bg-panel px-1 pt-2">
                <Tooltip content="Open panel" side="left" delayDuration={80}>
                    <button
                        type="button"
                        aria-label="Open panel"
                        onClick={onExpand}
                        className="flex size-9 items-center justify-center rounded-md text-text-muted transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary"
                    >
                        <Icon icon={RiLayoutRight2Line} />
                    </button>
                </Tooltip>
            </aside>
        );
    }

    return (
        <aside className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-panel">
            <div
                className="flex h-titlebar shrink-0 items-center bg-panel"
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
                            addTab(kind);
                        }}
                    />
                </div>
                <div className="relative z-20 flex h-full shrink-0 items-center gap-0.5 px-1" data-no-drag>
                    <ToolBtn
                        label="More"
                        onClick={() =>
                            window.dispatchEvent(new CustomEvent("shape-command-palette"))
                        }
                    >
                        <Icon icon={RiMoreLine} />
                    </ToolBtn>
                    {onToggleRight ? (
                        <ToolBtn label="Hide panel" onClick={onToggleRight}>
                            <Icon icon={RiLayoutRight2Line} />
                        </ToolBtn>
                    ) : null}
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
                    ) : active?.kind === "agents" ? (
                        <SubagentCards className="h-full" />
                    ) : active?.kind === "prs" ? (
                        <PullRequestsPanel />
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
