"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { AgentPanelTab } from "@/features/agent/lib/agent-layout-context";
import PreviewPanel from "@/features/preview/ui/preview-panel";
import Terminal from "@/features/terminal/ui/terminal";
import { AgentChangesPanel, type AgentChangeEdit } from "./agent-changes-panel";

const TABS: { id: AgentPanelTab; label: string }[] = [
    { id: "changes", label: "Changes" },
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
}) {
    const changeCount = edits.length;

    return (
        <>
            <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize panel"
                className="w-1 shrink-0 cursor-col-resize self-stretch hover:bg-border-strong/40"
                onMouseDown={(e) => {
                    e.preventDefault();
                    onResizeStart(e.clientX);
                }}
            />
            <aside
                className="floating-panel ml-0 flex min-h-0 shrink-0 flex-col"
                style={{ width }}
            >
                <div className="flex h-9 shrink-0 items-center gap-1 px-2">
                    <div
                        role="tablist"
                        aria-label="Agent panel"
                        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden"
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
                                        "inline-flex h-7 shrink-0 items-center rounded-md px-2.5 text-[12px] transition-colors",
                                        active
                                            ? "bg-surface-2 text-text-primary"
                                            : "text-text-muted hover:bg-panel-hover hover:text-text-secondary",
                                    )}
                                >
                                    {t.label}
                                    {t.id === "changes" && changeCount > 0 ? (
                                        <span className="ml-1.5 tabular-nums text-text-muted">{changeCount}</span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
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
