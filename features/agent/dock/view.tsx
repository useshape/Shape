"use client";

import { lazy, Suspense, useEffect, useState, type DragEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Chat from "@/features/chat/ui/chat";
import { commands } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { getDockPrefs } from "./prefs";
import {
    dockClose,
    dockDrop,
    dockFocus,
    dockMaximize,
    dockPlace,
    dockResize,
    getDock,
    resetDock,
    useDock,
} from "./store";
import {
    chatPanel,
    groupOfPanel,
    terminalPanel,
    walkGroups,
    type DockGroup,
    type DockNode,
    type DockPanel,
    type DropZone,
} from "./tree";

const Terminal = lazy(() => import("@/features/terminal/ui/terminal"));

function zoneAt(event: DragEvent, el: HTMLElement): DropZone {
    const box = el.getBoundingClientRect();
    const x = (event.clientX - box.left) / Math.max(1, box.width);
    const y = (event.clientY - box.top) / Math.max(1, box.height);
    if (x < 0.22) return "left";
    if (x > 0.78) return "right";
    if (y < 0.22) return "top";
    if (y > 0.78) return "bottom";
    return "center";
}

function readPanel(raw: string): DockPanel | null {
    try {
        const value = JSON.parse(raw) as DockPanel;
        if (value && typeof value.id === "string" && value.kind) return value;
    } catch {
        /* ignore */
    }
    return null;
}

function GroupChrome({
    group,
    focused,
    setChatHost,
}: {
    group: DockGroup;
    focused: boolean;
    setChatHost: (node: HTMLElement | null) => void;
}) {
    const [zone, setZone] = useState<DropZone | null>(null);
    const active = group.tabs.find((tab) => tab.id === group.active) ?? group.tabs[0];
    return (
        <div
            data-dock-group={group.id}
            className={cn(
                "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-panel",
                focused ? "ring-1 ring-inset ring-white/15" : "ring-1 ring-inset ring-white/6",
            )}
            onDragOver={(event) => {
                if (!event.dataTransfer.types.includes("application/x-shape-dock")) return;
                event.preventDefault();
                setZone(zoneAt(event, event.currentTarget));
            }}
            onDragLeave={() => setZone(null)}
            onDrop={(event) => {
                const panel = readPanel(event.dataTransfer.getData("application/x-shape-dock"));
                const next = zone;
                setZone(null);
                if (!panel || !next) return;
                event.preventDefault();
                dockDrop(panel, group.id, next, true);
                if (panel.kind === "chat") {
                    window.dispatchEvent(new CustomEvent("shape-chat-load", { detail: { id: panel.id } }));
                }
            }}
        >
            <div className="flex h-8 shrink-0 items-center gap-1 border-b border-white/8 px-1">
                {group.tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        draggable
                        data-active={tab.id === active?.id ? "true" : "false"}
                        onDragStart={(event) => {
                            event.dataTransfer.setData("application/x-shape-dock", JSON.stringify(tab));
                            event.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => {
                            dockFocus(group.id, tab.id);
                            if (tab.kind === "chat") {
                                window.dispatchEvent(new CustomEvent("shape-chat-load", { detail: { id: tab.id } }));
                            }
                        }}
                        onDoubleClick={() => dockMaximize(group.id)}
                        className={cn(
                            "flex h-6 max-w-[160px] items-center rounded-full px-2 text-xs",
                            tab.id === active?.id ? "bg-surface-4 text-text-primary" : "text-text-muted hover:bg-panel-hover",
                        )}
                    >
                        <span className="truncate">{tab.title}</span>
                    </button>
                ))}
                <button
                    type="button"
                    aria-label={focused ? "Maximize group" : "Focus group"}
                    className="ms-auto rounded-full px-2 text-xs text-text-muted hover:bg-panel-hover"
                    onClick={() => dockMaximize(group.id)}
                >
                    {getDock().maximized === group.id ? "Restore" : "Max"}
                </button>
                {active && active.kind !== "terminal" ? (
                    <button
                        type="button"
                        aria-label="Close tab"
                        className="rounded-full px-2 text-xs text-text-muted hover:bg-panel-hover"
                        onClick={() => dockClose(active.id)}
                    >
                        Close
                    </button>
                ) : null}
            </div>
            <div className="relative min-h-0 flex-1">
                <GroupBody group={group} panel={active} setChatHost={setChatHost} />
                {zone ? (
                    <div
                        className={cn(
                            "pointer-events-none absolute z-10 bg-accent/25",
                            zone === "center" && "inset-2 rounded-lg",
                            zone === "left" && "inset-y-2 start-2 w-1/3 rounded-lg",
                            zone === "right" && "inset-y-2 end-2 w-1/3 rounded-lg",
                            zone === "top" && "inset-x-2 top-2 h-1/3 rounded-lg",
                            zone === "bottom" && "inset-x-2 bottom-2 h-1/3 rounded-lg",
                        )}
                    />
                ) : null}
            </div>
        </div>
    );
}

function GroupBody({
    group,
    panel,
    setChatHost,
}: {
    group: DockGroup;
    panel?: DockPanel;
    setChatHost: (node: HTMLElement | null) => void;
}) {
    const dock = useDock();
    const liveChat = panel?.kind === "chat" && dock.chatAnchor === group.id && panel.id === group.active;
    if (!panel) return <div className="h-full" />;
    if (panel.kind === "terminal") {
        return (
            <Suspense fallback={<div className="h-full bg-panel" />}>
                <Terminal terminalOnly isOpen onClose={() => dockFocus(group.id, group.tabs.find((tab) => tab.kind === "chat")?.id || panel.id)} />
            </Suspense>
        );
    }
    if (panel.kind === "chat" && liveChat) {
        return <div ref={setChatHost} className="h-full min-h-0" />;
    }
    if (panel.kind === "chat") {
        return <CompanionPeek conversationId={panel.id} />;
    }
    return <div className="grid h-full place-items-center text-sm text-text-muted">{panel.title}</div>;
}

function CompanionPeek({ conversationId }: { conversationId: string }) {
    const [title, setTitle] = useState("Chat");
    useEffect(() => {
        let cancelled = false;
        void commands.getConversation(conversationId).then((conv) => {
            if (!cancelled) setTitle(conv.title?.trim() || "Chat");
        }).catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [conversationId]);
    return (
        <button
            type="button"
            className="grid h-full w-full place-items-center px-4 text-sm text-text-muted hover:text-text-primary"
            onClick={() => {
                const owner = groupOfPanel(getDock().root, conversationId);
                if (owner) dockFocus(owner.id, conversationId);
                window.dispatchEvent(new CustomEvent("shape-chat-load", { detail: { id: conversationId } }));
            }}
        >
            {title} is running here. Click to work in this pane.
        </button>
    );
}

function SplitNode({ node, setChatHost }: { node: DockNode; setChatHost: (node: HTMLElement | null) => void }) {
    const dock = useDock();
    if (dock.maximized) {
        const group = walkGroups(node).find((item) => item.id === dock.maximized);
        if (group) return <GroupChrome group={group} focused setChatHost={setChatHost} />;
    }
    return <NodeView node={node} setChatHost={setChatHost} />;
}

function NodeView({ node, setChatHost }: { node: DockNode; setChatHost: (node: HTMLElement | null) => void }): ReactNode {
    const dock = useDock();
    if (node.type === "group") {
        return <GroupChrome group={node} focused={dock.focused === node.id} setChatHost={setChatHost} />;
    }
    return (
        <div className={cn("flex h-full min-h-0 min-w-0", node.dir === "row" ? "flex-row" : "flex-col")}>
            {node.children.map((child, index) => (
                <div key={child.id} className="flex min-h-0 min-w-0" style={{ flex: `${node.sizes[index] ?? 1} 1 0` }}>
                    <NodeView node={child} setChatHost={setChatHost} />
                </div>
            )).flatMap((cell, index) => (
                index === 0 ? [cell] : [
                    <Separator key={`sep-${node.id}-${index}`} node={node} index={index - 1} />,
                    cell,
                ]
            ))}
        </div>
    );
}

function Separator({ node, index }: { node: Extract<DockNode, { type: "split" }>; index: number }) {
    return (
        <div
            role="separator"
            aria-orientation={node.dir === "row" ? "vertical" : "horizontal"}
            aria-label="Resize split"
            className={cn(
                "z-20 shrink-0 bg-border hover:bg-accent/50",
                node.dir === "row" ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize",
            )}
            onMouseDown={(event) => {
                event.preventDefault();
                const start = node.dir === "row" ? event.clientX : event.clientY;
                const parent = event.currentTarget.parentElement;
                const span = Math.max(1, node.dir === "row" ? parent?.clientWidth ?? 1 : parent?.clientHeight ?? 1);
                const left = node.sizes[index] ?? 1;
                const right = node.sizes[index + 1] ?? 1;
                const pair = left + right;
                const move = (ev: MouseEvent) => {
                    const delta = (((node.dir === "row" ? ev.clientX : ev.clientY) - start) / span) * pair;
                    dockResize(node.id, index, left + delta, pair);
                };
                const up = () => {
                    window.removeEventListener("mousemove", move);
                    window.removeEventListener("mouseup", up);
                    window.dispatchEvent(new Event("shape-terminal-refit"));
                };
                window.addEventListener("mousemove", move);
                window.addEventListener("mouseup", up);
            }}
            onDoubleClick={() => {
                const pair = (node.sizes[index] ?? 1) + (node.sizes[index + 1] ?? 1);
                dockResize(node.id, index, pair / 2, pair);
            }}
        />
    );
}

function childId(node: DockNode) {
    return node.id;
}

export function DockSurface() {
    const dock = useDock();
    const [chatHost, setChatHost] = useState<HTMLElement | null>(null);
    useEffect(() => {
        const onOpen = (event: Event) => {
            const detail = (event as CustomEvent<{ id?: string; title?: string; place?: DockPanel["kind"]; focus?: boolean }>).detail;
            const id = detail?.id;
            if (!id) return;
            const prefs = getDockPrefs();
            if (detail.place === "terminal" || id === "terminal") {
                dockPlace(terminalPanel(), prefs.terminalPlace, detail.focus !== false);
                window.setTimeout(() => window.dispatchEvent(new Event("shape-terminal-refit")), 50);
                return;
            }
            const thread = id.startsWith("thread-");
            const focus = detail.focus ?? (thread ? prefs.threadFocus : true);
            dockPlace(
                chatPanel(id, detail.title || (thread ? "Thread" : "Chat")),
                thread ? prefs.threadPlace : prefs.chatPlace,
                focus,
            );
        };
        const onReset = () => resetDock("__new_chat__");
        window.addEventListener("shape-dock-open", onOpen as EventListener);
        window.addEventListener("shape-dock-reset", onReset);
        return () => {
            window.removeEventListener("shape-dock-open", onOpen as EventListener);
            window.removeEventListener("shape-dock-reset", onReset);
        };
    }, []);
    return (
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden p-0.5">
            <SplitNode node={dock.root} setChatHost={setChatHost} />
            {chatHost ? createPortal(<Chat className="h-full bg-transparent" showTitlebar={false} />, chatHost) : null}
        </div>
    );
}
