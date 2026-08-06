"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { AgentPanelTab } from "@/features/agent/lib/agent-layout-context";
import PreviewPanel from "@/features/preview/ui/preview-panel";
import Terminal from "@/features/terminal/ui/terminal";
import { AgentChangesPanel, type AgentChangeEdit } from "./agent-changes-panel";

const TABS: { id: AgentPanelTab; label: string; countKey?: "changes" }[] = [
    { id: "changes", label: "Changes", countKey: "changes" },
    { id: "preview", label: "Preview" },
    { id: "terminal", label: "Terminal" },
];

export function AgentRightRail({
    width,
    tab,
    onTabChange,
    onClose,
    onResizeStart,
    edits,
    onAcceptAll,
    onRejectAll,
    onAcceptEdit,
    onRejectEdit,
    windowControls,
}: {
    width: number;
    tab: AgentPanelTab;
    onTabChange: (tab: AgentPanelTab) => void;
    onClose: () => void;
    onResizeStart: (clientX: number) => void;
    edits: AgentChangeEdit[];
    onAcceptAll: () => void;
    onRejectAll: () => void;
    onAcceptEdit: (id: string) => void;
    onRejectEdit: (id: string) => void;
    windowControls?: ReactNode;
}) {
    const changeCount = edits.length;

    return (
        <>
            <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize panel"
                className="w-px shrink-0 cursor-col-resize self-stretch bg-transparent hover:bg-border-strong/50"
                onMouseDown={(e) => {
                    e.preventDefault();
                    onResizeStart(e.clientX);
                }}
            />
            <aside
                className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-border bg-panel"
                style={{ width }}
            >
                <div className="relative z-20 flex h-titlebar shrink-0 items-stretch border-b border-border">
                    <div className="titlebar-drag-region absolute inset-0 z-0" data-tauri-drag-region />
                    <div
                        role="tablist"
                        aria-label="Agent panel"
                        className="relative z-10 flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden pl-2"
                    >
                        {TABS.map((t) => {
                            const active = tab === t.id;
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => onTabChange(t.id)}
                                    className={cn(
                                        "relative inline-flex h-full shrink-0 items-center px-2.5 text-xs transition-colors",
                                        active
                                            ? "text-text-primary"
                                            : "text-text-muted hover:text-text-secondary",
                                    )}
                                >
                                    {t.label}
                                    {t.countKey === "changes" && changeCount > 0 ? (
                                        <span className="ml-1.5 tabular-nums text-text-muted">
                                            ({changeCount})
                                        </span>
                                    ) : null}
                                    {active ? (
                                        <span
                                            aria-hidden
                                            className="absolute inset-x-1.5 bottom-0 h-px bg-text-primary/70"
                                        />
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                    <div className="relative z-10 flex shrink-0 items-stretch">
                        <div className="flex items-center pr-0.5">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 text-text-muted hover:text-text-primary"
                                title="Close panel"
                                onClick={onClose}
                            >
                                <Icon name="close" size={14} />
                            </Button>
                        </div>
                        {windowControls}
                    </div>
                </div>

                <div className="relative min-h-0 flex-1 overflow-hidden">
                    <div
                        className={cn("absolute inset-0", tab !== "changes" && "invisible pointer-events-none")}
                        aria-hidden={tab !== "changes"}
                    >
                        <AgentChangesPanel
                            edits={edits}
                            onAcceptAll={onAcceptAll}
                            onRejectAll={onRejectAll}
                            onAccept={onAcceptEdit}
                            onReject={onRejectEdit}
                        />
                    </div>
                    <div
                        className={cn("absolute inset-0", tab !== "preview" && "invisible pointer-events-none")}
                        aria-hidden={tab !== "preview"}
                    >
                        <PreviewPanel />
                    </div>
                    <div
                        className={cn("absolute inset-0", tab !== "terminal" && "invisible pointer-events-none")}
                        aria-hidden={tab !== "terminal"}
                    >
                        <AgentTerminalMount active={tab === "terminal"} />
                    </div>
                </div>
            </aside>
        </>
    );
}

function AgentTerminalMount({ active }: { active: boolean }) {
    const everOpened = useRef(false);
    if (active) everOpened.current = true;
    if (!everOpened.current) return null;
    return (
        <div className={cn("h-full w-full", !active && "invisible pointer-events-none")}>
            <Terminal isOpen={active} terminalOnly />
        </div>
    );
}
