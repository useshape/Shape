"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { WorkspaceTabs } from "./tabs";
import { ChangesView } from "./changes";
import { ToolBtn } from "./tool";
import {
    DEFAULT_TABS,
    uid,
    type TabKind,
    type WorkspaceTab,
} from "./model";

const Terminal = lazy(() => import("@/features/terminal/ui/terminal"));

export function AgentWorkspace({
    projectPath,
    expanded,
    onExpand,
}: {
    projectPath: string;
    expanded: boolean;
    onExpand: () => void;
}) {
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
        if (kind === "changes") {
            const existing = tabs.find((t) => t.kind === "changes");
            if (existing) {
                select(existing.id);
                return;
            }
        }
        if (kind === "terminal") {
            const existing = tabs.find((t) => t.kind === "terminal");
            if (existing) {
                select(existing.id);
                onExpand();
                return;
            }
        }
        const tab: WorkspaceTab = {
            id: uid(kind),
            kind,
            title: kind === "terminal" ? "Terminal" : "Changes",
        };
        setTabs((p) => [...p, tab]);
        setActiveId(tab.id);
    }, [onExpand, select, tabs]);

    const openKind = useCallback((kind: TabKind) => {
        addTab(kind);
        onExpand();
    }, [addTab, onExpand]);

    const closeTab = useCallback((id: string) => {
        setTabs((prev) => {
            if (prev.length <= 1) return prev;
            const next = prev.filter((t) => t.id !== id);
            if (id === activeId) setActiveId(next[next.length - 1]!.id);
            return next;
        });
    }, [activeId]);

    const openFilePicker = useCallback(() => {
        window.dispatchEvent(
            new CustomEvent("shape-layout-toggle", { detail: { id: "files-mode", value: true } }),
        );
        window.dispatchEvent(
            new CustomEvent("shape-command-palette", {
                detail: { mode: "files", placeholder: "Open any file, URL, …" },
            }),
        );
    }, []);

    useEffect(() => {
        const onTab = (e: Event) => {
            const tabId = (e as CustomEvent<string>).detail?.toLowerCase();
            if (!tabId) return;
            if (tabId === "changes" || tabId === "source") {
                addTab("changes");
                onExpand();
            }
            if (tabId === "terminal") {
                openKind("terminal");
            }
            if (tabId === "files" || tabId === "explorer") {
                window.dispatchEvent(
                    new CustomEvent("shape-layout-toggle", { detail: { id: "files-mode", value: true } }),
                );
            }
        };
        const onOpenTerminal = () => {
            openKind("terminal");
        };
        window.addEventListener("shape-set-active-tab", onTab as EventListener);
        window.addEventListener("shape-open-workspace-terminal", onOpenTerminal);
        return () => {
            window.removeEventListener("shape-set-active-tab", onTab as EventListener);
            window.removeEventListener("shape-open-workspace-terminal", onOpenTerminal);
        };
    }, [addTab, onExpand, openKind]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (t?.closest("textarea, input, [contenteditable='true']")) return;
            if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
            if (e.key.toLowerCase() === "g" && !e.shiftKey) {
                e.preventDefault();
                window.dispatchEvent(
                    new CustomEvent("shape-layout-toggle", { detail: { id: "files-mode", value: true } }),
                );
            }
            if (e.key.toLowerCase() === "j" && !e.shiftKey) {
                e.preventDefault();
                openKind("terminal");
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [openKind]);

    const go = (dir: -1 | 1) => {
        const next = navIndex + dir;
        const id = nav[next];
        if (!id) return;
        setNavIndex(next);
        setActiveId(id);
    };

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
                        <Icon name="chevron_left" size={18} />
                    </button>
                </Tooltip>
            </aside>
        );
    }

    return (
        <aside className="flex h-full w-full min-w-0 overflow-hidden border-l border-border-subtle bg-panel">
            <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
                <WorkspaceTabs
                    tabs={tabs}
                    activeId={activeId}
                    onSelect={select}
                    onClose={closeTab}
                    onReorder={setTabs}
                    onNew={(kind) => {
                        if (kind === "file") openFilePicker();
                        else addTab(kind);
                    }}
                />

                {active?.kind === "changes" ? null : (
                    <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border-subtle px-1">
                        <ToolBtn label="Back" disabled={navIndex <= 0} onClick={() => go(-1)}>
                            <Icon name="arrow_back" size={ICON_SIZE_SM} />
                        </ToolBtn>
                        <ToolBtn
                            label="Forward"
                            disabled={navIndex >= nav.length - 1}
                            onClick={() => go(1)}
                        >
                            <Icon name="arrow_forward" size={ICON_SIZE_SM} />
                        </ToolBtn>
                        <span className="flex-1" />
                        <ToolBtn
                            label="More"
                            onClick={() =>
                                window.dispatchEvent(new CustomEvent("shape-command-palette"))
                            }
                        >
                            <Icon name="more_horiz" size={ICON_SIZE_SM} />
                        </ToolBtn>
                    </div>
                )}

                <div className="min-h-0 flex-1 overflow-hidden">
                    {active?.kind === "changes" ? (
                        <ChangesView projectPath={projectPath} />
                    ) : active?.kind === "terminal" ? (
                        <Suspense fallback={<div className="h-full w-full bg-panel" />}>
                            <Terminal terminalOnly isOpen />
                        </Suspense>
                    ) : null}
                </div>
            </div>
        </aside>
    );
}
