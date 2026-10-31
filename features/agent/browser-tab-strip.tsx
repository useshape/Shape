"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { RiAddLine, RiCloseLine } from "@remixicon/react";
import { Slide } from "loading-dev";
import { FileIcon } from "@/components/ui/file-icon";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { insertionIndex } from "@/features/agent/panes/strip-model";
import { devChromeOverride, setDevChromePlatform } from "@/lib/ui/chrome-platform";
import { cn } from "@/lib/utils";

function TabTitle({ text, shimmer }: { text: string; shimmer: boolean }) {
    const ref = useRef<HTMLSpanElement>(null);
    const [fade, setFade] = useState(false);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => setFade(el.scrollWidth > el.clientWidth + 1);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [text]);

    return (
        <span
            ref={ref}
            className={cn(
                "min-w-0 overflow-hidden whitespace-nowrap",
                fade && "[mask-image:linear-gradient(to_right,black_calc(100%-12px),transparent)]",
                shimmer && "agent-progress-loading-text",
            )}
        >
            {text}
        </span>
    );
}

export type BrowserTab = {
    id: string;
    title: string;
    active: boolean;
    tool?: boolean;
    file?: boolean;
    working?: boolean;
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
    onReorder: (fromId: string, toId: string) => void;
    onSplitPair: (anchor: string, incoming: string) => void;
    onUnsplit: () => void;
    onNew: () => void;
    onCloseOthers: (id: string) => void;
    onCloseRight: (id: string) => void;
}) {
    const rowRef = useRef<HTMLDivElement>(null);

    const renderTab = (tab: BrowserTab, grouped = false) => (
        <ContextMenu key={tab.id}>
            <ContextMenuTrigger asChild>
                <div
                    data-no-drag
                    data-chat-tab={tab.id}
                    data-active={tab.active ? "true" : "false"}
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
                        const dragged = nodes[origin];
                        if (!dragged || origin < 0) return;
                        const homes = nodes.map((node) => {
                            const rect = node.getBoundingClientRect();
                            return rect.left + rect.width / 2;
                        });
                        const originBox = dragged.getBoundingClientRect();
                        const neighbor = nodes[origin + 1] ?? nodes[origin - 1];
                        const neighborBox = neighbor?.getBoundingClientRect();
                        const pitch = neighborBox
                            ? Math.abs(neighborBox.left - originBox.left)
                            : originBox.width;
                        const session: DragSession = {
                            id: tab.id,
                            pointer: event.pointerId,
                            startX: event.clientX,
                            startY: event.clientY,
                            origin,
                            target: origin,
                            moved: false,
                        };
                        const clearShift = () => {
                            row.style.overflow = "";
                            for (const node of nodes) {
                                node.style.translate = "";
                                node.style.transition = "";
                                node.classList.remove("z-20", "shadow-md");
                            }
                        };
                        const shiftTo = (target: number, splitting: boolean) => {
                            if (target === session.target && !splitting) return;
                            session.target = target;
                            for (let i = 0; i < nodes.length; i++) {
                                if (i === origin) continue;
                                let tx = 0;
                                if (!splitting && target > origin && i > origin && i <= target) tx = -pitch;
                                else if (!splitting && target < origin && i >= target && i < origin) tx = pitch;
                                const node = nodes[i];
                                node.style.transition = "translate 180ms cubic-bezier(0.2, 0, 0, 1)";
                                node.style.translate = tx ? `${tx}px` : "0px";
                            }
                        };
                        const move = (ev: PointerEvent) => {
                            if (ev.pointerId !== session.pointer) return;
                            const dx = ev.clientX - session.startX;
                            const dy = ev.clientY - session.startY;
                            if (!session.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                            session.moved = true;
                            row.style.overflow = "visible";
                            const splitting = dy > 32 && dy > Math.abs(dx);
                            dragged.classList.add("z-20", "shadow-md");
                            dragged.style.transition = "none";
                            dragged.style.translate = `${dx}px ${splitting ? `${dy}px` : "0px"}`;
                            shiftTo(splitting ? origin : insertionIndex(homes, homes[origin] + dx), splitting);
                        };
                        const up = (ev: PointerEvent) => {
                            if (ev.pointerId !== session.pointer) return;
                            window.removeEventListener("pointermove", move);
                            window.removeEventListener("pointerup", up);
                            const dy = ev.clientY - session.startY;
                            dragged.style.pointerEvents = "none";
                            const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-chat-tab]");
                            dragged.style.pointerEvents = "";
                            const over = hit?.getAttribute("data-chat-tab");
                            const overTab = tabs.find((item) => item.id === over);
                            const targetId = nodes[session.target]?.dataset.chatTab;
                            clearShift();
                            if (
                                session.moved && dy > 32 && over && over !== tab.id
                                && !tab.tool && !tab.file
                                && overTab && !overTab.tool && !overTab.file
                            ) {
                                onSplitPair(over, tab.id);
                                return;
                            }
                            if (session.moved && targetId && targetId !== tab.id) onReorder(tab.id, targetId);
                            else if (!session.moved) onActivate(tab.id);
                        };
                        window.addEventListener("pointermove", move);
                        window.addEventListener("pointerup", up);
                    }}
                    className={cn(
                        "group relative flex h-8 min-w-[170px] items-center gap-1 self-center ps-3 pe-10",
                        "text-[13px] font-light leading-none tracking-wide select-none",
                        "transition-colors duration-150 ease-[var(--ease-out)]",
                        grouped ? "max-w-[160px] shrink-0" : "max-w-[240px] shrink-0 rounded-[6px]",
                        !grouped && (tab.active
                            ? "bg-surface-4 text-text-primary"
                            : "text-text-primary/70 hover:bg-panel-hover hover:text-text-primary"),
                        grouped && (tab.active ? "text-text-primary" : "text-text-primary/70 hover:text-text-primary"),
                    )}
                >
                    {tab.file ? (
                        <FileIcon name={tab.title} className="size-4 shrink-0" />
                    ) : (
                        <span
                            className={cn(
                                "grid shrink-0 place-items-center overflow-hidden transition-[width,opacity] duration-200 ease-[var(--ease-out)]",
                                tab.working && !tab.active ? "w-2.5 opacity-100" : "w-0 opacity-0",
                            )}
                            aria-hidden={!tab.working || tab.active}
                        >
                            <Slide size={10} className="text-text-muted" />
                        </span>
                    )}
                    <TabTitle text={tab.title} shimmer={Boolean(tab.working && !tab.active)} />
                    <button
                        type="button"
                        data-close=""
                        aria-label={`Close ${tab.title}`}
                        onClick={(event) => {
                            event.stopPropagation();
                            onClose(tab.id);
                        }}
                        className="absolute end-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-md text-text-primary/70 opacity-0 transition-opacity duration-150 hover:bg-panel-active hover:text-text-primary group-hover:opacity-100"
                    >
                        <RiCloseLine size={16} />
                    </button>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="min-w-44">
                <ContextMenuItem onClick={() => onActivate(tab.id)}>Open</ContextMenuItem>
                {!tab.tool && !tab.file && !(splitIds?.includes(tab.id)) && tabs.some((item) => !item.tool && !item.file && item.id !== tab.id) ? (
                    <ContextMenuItem
                        onClick={() => {
                            const anchor = tabs.find((item) => item.active && !item.tool && !item.file && item.id !== tab.id)?.id
                                ?? tabs.find((item) => !item.tool && !item.file && item.id !== tab.id)?.id;
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
                    className={cn(
                        "flex h-8 min-w-[144px] max-w-[320px] flex-[1_1_320px] items-center self-center squircle-xl",
                        tab.active || next.active ? "bg-surface-4" : "hover:bg-panel-hover",
                    )}
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

    const slots: ReactNode[] = [];
    nodes.forEach((node, index) => {
        if (index > 0) slots.push(<span key={`sep-${index}`} className="tab-sep self-center" aria-hidden />);
        slots.push(node);
    });

    return (
        <div className="flex h-full min-w-0 flex-1 items-center">
            <div
                ref={rowRef}
                data-no-drag
                onWheel={(event) => {
                    const row = rowRef.current;
                    if (!row || row.scrollWidth <= row.clientWidth + 8) return;
                    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
                    row.scrollLeft += event.deltaY;
                }}
                className="tab-strip-scroll flex h-full w-max min-w-0 max-w-full shrink items-center gap-0.5"
            >
                {slots}
            </div>
            <button
                type="button"
                data-no-drag
                aria-label="New chat"
                onClick={onNew}
                className="ms-1 flex size-8 shrink-0 items-center justify-center self-center squircle-xl text-text-primary/70 hover:bg-panel-hover hover:text-text-primary"
            >
                <RiAddLine size={16} />
            </button>
            <div className="h-full min-w-6 flex-1 shrink-0" data-tauri-drag-region />
        </div>
    );
}
