"use client";

import { Add20Regular } from "@fluentui/react-icons/headless/svg/add";
import { Dismiss20Regular } from "@fluentui/react-icons/headless/svg/dismiss";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { insertionIndex } from "@/features/agent/panes/strip-model";
import { devChromeOverride, setDevChromePlatform } from "@/lib/ui/chrome-platform";
import { providerIcon } from "@/lib/ui/provider-icon";
import { cn } from "@/lib/utils";

export type BrowserTab = {
    id: string;
    title: string;
    active: boolean;
    tool?: boolean;
    /** Chat with no messages. Shows the Shape mark. */
    empty?: boolean;
    /** Latest model used in the chat. */
    modelId?: string | null;
};

type DragSession = {
    id: string;
    pointer: number;
    startX: number;
    startY: number;
    origin: number;
    target: number;
    moved: boolean;
};

export function BrowserTabStrip({
    tabs,
    splitIds,
    onActivate,
    onClose,
    onReorder,
    onSplitPair,
    onUnsplit,
    onNew,
    onCloseOthers,
    onCloseRight,
}: {
    tabs: BrowserTab[];
    splitIds: [string, string] | null;
    onActivate: (id: string) => void;
    onClose: (id: string) => void;
    onReorder: (from: number, to: number) => void;
    onSplitPair: (anchor: string, incoming: string) => void;
    onUnsplit: () => void;
    onNew: () => void;
    onCloseOthers: (id: string) => void;
    onCloseRight: (id: string) => void;
}) {
    const rowRef = useRef<HTMLDivElement>(null);
    const booted = useRef(false);
    const [plate, setPlate] = useState({ left: 0, width: 0, ready: false, instant: true });
    const signature = tabs.map((tab) => `${tab.id}:${tab.active ? 1 : 0}`).join("|");

    const readActive = useCallback(() => {
        const row = rowRef.current;
        const active = row?.querySelector<HTMLElement>('[data-plate="true"]');
        if (!row || !active) return null;
        const rowBox = row.getBoundingClientRect();
        const box = active.getBoundingClientRect();
        return { left: box.left - rowBox.left, width: box.width };
    }, []);

    const placePlate = useCallback((instant: boolean) => {
        const next = readActive();
        if (!next) return;
        setPlate((prev) => ({ ...prev, ...next, ready: true, instant }));
    }, [readActive]);

    useLayoutEffect(() => {
        const next = readActive();
        if (!next) return;
        if (!booted.current) {
            booted.current = true;
            setPlate({ ...next, ready: true, instant: true });
            return;
        }
        setPlate((prev) => ({ ...prev, instant: false }));
        const frame = requestAnimationFrame(() => {
            setPlate((prev) => ({ ...prev, ...next, ready: true, instant: false }));
        });
        return () => cancelAnimationFrame(frame);
    }, [signature, readActive]);

    useLayoutEffect(() => {
        const row = rowRef.current;
        if (!row) return;
        const observer = new ResizeObserver(() => placePlate(true));
        observer.observe(row);
        return () => observer.disconnect();
    }, [placePlate]);

    const renderTab = (tab: BrowserTab, grouped = false) => (
        <ContextMenu key={tab.id}>
            <ContextMenuTrigger asChild>
                <div
                    data-chat-tab={tab.id}
                    data-active={tab.active ? "true" : "false"}
                    data-plate={!grouped && tab.active ? "true" : undefined}
                    onAuxClick={(event) => {
                        if (event.button !== 1) return;
                        event.preventDefault();
                        onClose(tab.id);
                    }}
                    onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        if ((event.target as HTMLElement).closest("[data-close]")) return;
                        const row = rowRef.current;
                        if (!row) return;
                        const nodes = [...row.querySelectorAll<HTMLElement>("[data-chat-tab]")];
                        const origin = nodes.findIndex((node) => node.dataset.chatTab === tab.id);
                        const session: DragSession = {
                            id: tab.id,
                            pointer: event.pointerId,
                            startX: event.clientX,
                            startY: event.clientY,
                            origin,
                            target: origin,
                            moved: false,
                        };
                        const homes = nodes.map((node) => {
                            const rect = node.getBoundingClientRect();
                            return rect.left + rect.width / 2;
                        });
                        const dragged = nodes[origin];
                        const move = (ev: PointerEvent) => {
                            if (ev.pointerId !== session.pointer || !dragged) return;
                            const dx = ev.clientX - session.startX;
                            const dy = ev.clientY - session.startY;
                            if (Math.abs(dx) > 6 || Math.abs(dy) > 6) session.moved = true;
                            if (!session.moved) return;
                            dragged.classList.add("z-10");
                            dragged.style.translate = `${dx}px`;
                            session.target = insertionIndex(homes, homes[origin] + dx);
                            if (tab.active) placePlate(true);
                        };
                        const up = (ev: PointerEvent) => {
                            if (ev.pointerId !== session.pointer) return;
                            window.removeEventListener("pointermove", move);
                            window.removeEventListener("pointerup", up);
                            if (dragged) {
                                dragged.style.translate = "";
                                dragged.classList.remove("z-10");
                            }
                            const dy = ev.clientY - session.startY;
                            const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-chat-tab]");
                            const over = hit?.getAttribute("data-chat-tab");
                            if (session.moved && dy > 28 && over && over !== tab.id && !tab.tool) {
                                onSplitPair(over, tab.id);
                                return;
                            }
                            if (session.moved && session.target !== session.origin) {
                                onReorder(session.origin, session.target);
                                return;
                            }
                            if (session.moved && tab.active) {
                                setPlate((prev) => ({ ...prev, instant: false }));
                                requestAnimationFrame(() => {
                                    const next = readActive();
                                    if (!next) return;
                                    setPlate((prev) => ({ ...prev, ...next, ready: true, instant: false }));
                                });
                            }
                            if (!session.moved) onActivate(tab.id);
                        };
                        window.addEventListener("pointermove", move);
                        window.addEventListener("pointerup", up);
                    }}
                    className={cn(
                        "group relative z-[2] flex h-[34px] items-center gap-1.5 self-end px-4",
                        grouped ? "min-w-0 max-w-[220px] flex-1" : "min-w-[108px] max-w-[220px]",
                        "text-[14px] font-light leading-none transition-transform duration-100 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        tab.active ? "text-text-primary" : "text-text-secondary hover:text-text-primary",
                    )}
                >
                    <span
                        className={cn(
                            "pointer-events-none absolute inset-x-1.5 top-1 bottom-1.5 squircle-2xl transition-colors duration-200",
                            tab.active ? "bg-transparent" : "group-hover:bg-white/8",
                        )}
                        aria-hidden
                    />
                    {tab.tool ? null : (
                        <span className="relative flex size-5 mr-0.5 shrink-0 items-center justify-center">
                            {tab.empty || !tab.modelId ? (
                                <img
                                    src="/logos/chat-empty.svg"
                                    alt=""
                                    width={50}
                                    height={50}
                                    draggable={false}
                                    className="size-5 block"
                                />
                            ) : (
                                providerIcon(tab.modelId, 15)
                            )}
                        </span>
                    )}
                    <span className="relative min-w-0 flex-1 truncate">{tab.title}</span>
                    <button
                        type="button"
                        data-close=""
                        aria-label={`Close ${tab.title}`}
                        onClick={(event) => {
                            event.stopPropagation();
                            onClose(tab.id);
                        }}
                        className={cn(
                            "relative flex size-5 shrink-0 items-center justify-center squircle-lg text-text-muted hover:text-text-primary",
                            tab.active ? "opacity-0" : "opacity-0 group-hover:opacity-100",
                        )}
                    >
                        <Icon icon={Dismiss20Regular} className="[--icon-size:15px]" />
                    </button>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="min-w-44">
                <ContextMenuItem onClick={() => onActivate(tab.id)}>Open</ContextMenuItem>
                {!tab.tool && !(splitIds?.includes(tab.id)) && tabs.some((item) => !item.tool && item.id !== tab.id) ? (
                    <ContextMenuItem
                        onClick={() => {
                            const anchor = tabs.find((item) => item.active && !item.tool && item.id !== tab.id)?.id
                                ?? tabs.find((item) => !item.tool && item.id !== tab.id)?.id;
                            if (anchor) onSplitPair(anchor, tab.id);
                        }}
                    >
                        Open as split
                    </ContextMenuItem>
                ) : null}
                {splitIds?.includes(tab.id) ? <ContextMenuItem onClick={onUnsplit}>Exit split</ContextMenuItem> : null}
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => onClose(tab.id)}>Close</ContextMenuItem>
                <ContextMenuItem onClick={() => onCloseOthers(tab.id)}>Close others</ContextMenuItem>
                <ContextMenuItem onClick={() => onCloseRight(tab.id)}>Close tabs to the right</ContextMenuItem>
                {process.env.NODE_ENV !== "production" ? (
                    <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                            onClick={() => setDevChromePlatform(devChromeOverride() === "macos" ? "windows" : "macos")}
                        >
                            {devChromeOverride() === "macos" ? "Preview Windows controls" : "Preview macOS controls"}
                        </ContextMenuItem>
                    </>
                ) : null}
            </ContextMenuContent>
        </ContextMenu>
    );

    const grouped = new Set(splitIds ?? []);
    const nodes: ReactNode[] = [];
    for (let index = 0; index < tabs.length; index++) {
        const tab = tabs[index];
        const next = tabs[index + 1];
        const pair = splitIds
            && ((tab.id === splitIds[0] && next?.id === splitIds[1]) || (tab.id === splitIds[1] && next?.id === splitIds[0]));
        if (pair && next) {
            nodes.push(
                <div
                    key={`split-${tab.id}`}
                    data-plate={tab.active || next.active ? "true" : undefined}
                    className="relative z-[2] flex h-[32px] min-w-[200px] max-w-[440px] items-stretch self-end"
                >
                    {renderTab(tab, true)}
                    {renderTab(next, true)}
                </div>,
            );
            index += 1;
            continue;
        }
        if (grouped.has(tab.id)) {
            nodes.push(renderTab(tab));
            continue;
        }
        nodes.push(renderTab(tab));
    }

    return (
        <div className="flex h-full min-w-0 flex-1 items-end gap-0.5" data-no-drag>
            <div ref={rowRef} className="relative flex h-full min-w-0 items-end">
                <div
                    className="shape-chrome-plate"
                    data-instant={plate.instant ? "true" : "false"}
                    style={{
                        left: plate.left,
                        width: plate.width,
                        opacity: plate.ready ? 1 : 0,
                    }}
                />
                <div className="w-4 shrink-0 self-end" aria-hidden />
                {nodes}
            </div>
            <button
                type="button"
                aria-label="New chat"
                onClick={onNew}
                className="mb-1 flex size-8 ml-1 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors duration-200 hover:bg-white/10 hover:text-text-primary"
            >
                <Icon icon={Add20Regular} className="[--icon-size:16px]" />
            </button>
            <div className="h-full min-w-4 flex-1" data-tauri-drag-region />
        </div>
    );
}
