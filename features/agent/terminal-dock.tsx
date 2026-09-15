"use client";

import { RiCloseLine, RiTerminalBoxLine } from "@remixicon/react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const Terminal = lazy(() => import("@/features/terminal/ui/terminal"));

const MIN_H = 140;
const DEFAULT_H = 220;
const HEIGHT_KEY = "shape-agent-terminal-height";
const OPEN_KEY = "shape-agent-terminal-open";

export function TerminalDock() {
    const [open, setOpen] = useState(false);
    const [height, setHeight] = useState(DEFAULT_H);
    const [resizing, setResizing] = useState(false);
    const heightRef = useRef(DEFAULT_H);
    const dragging = useRef(false);

    useEffect(() => {
        try {
            const h = Number(localStorage.getItem(HEIGHT_KEY));
            if (h >= MIN_H && h <= 800) {
                setHeight(h);
                heightRef.current = h;
            }
            setOpen(localStorage.getItem(OPEN_KEY) === "true");
        } catch {
            /* ignore */
        }
    }, []);

    const persistOpen = useCallback((next: boolean) => {
        setOpen(next);
        try {
            localStorage.setItem(OPEN_KEY, String(next));
        } catch {
            /* ignore */
        }
        window.dispatchEvent(new CustomEvent("shape-terminal-open", { detail: { open: next } }));
    }, []);

    useEffect(() => {
        const onToggle = (e: Event) => {
            const detail = (e as CustomEvent<{ id?: string; value?: boolean }>).detail;
            const id = detail?.id;
            if (id !== "panel" && id !== "terminal") return;
            if (detail?.value === false) persistOpen(false);
            else if (detail?.value === true) persistOpen(true);
            else persistOpen(!open);
        };
        const onOpen = () => persistOpen(true);
        const onShortcut = (e: Event) => {
            const action = (e as CustomEvent<{ action?: string }>).detail?.action;
            if (action === "open" || action === "toggle" || !action) persistOpen(true);
        };
        const onTab = (e: Event) => {
            const tabId = (e as CustomEvent<string>).detail?.toLowerCase();
            if (tabId === "terminal") persistOpen(true);
        };
        window.addEventListener("shape-layout-toggle", onToggle as EventListener);
        window.addEventListener("shape-open-workspace-terminal", onOpen);
        window.addEventListener("shape-terminal-shortcut", onShortcut as EventListener);
        window.addEventListener("shape-set-active-tab", onTab as EventListener);
        return () => {
            window.removeEventListener("shape-layout-toggle", onToggle as EventListener);
            window.removeEventListener("shape-open-workspace-terminal", onOpen);
            window.removeEventListener("shape-terminal-shortcut", onShortcut as EventListener);
            window.removeEventListener("shape-set-active-tab", onTab as EventListener);
        };
    }, [open, persistOpen]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (t?.closest("textarea, input, [contenteditable='true']")) return;
            if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
            if (e.key.toLowerCase() !== "j") return;
            e.preventDefault();
            persistOpen(!open);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, persistOpen]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragging.current) return;
            const max = Math.floor(window.innerHeight * 0.55);
            const next = Math.min(max, Math.max(MIN_H, window.innerHeight - e.clientY - 8));
            heightRef.current = next;
            setHeight(next);
        };
        const onUp = () => {
            if (!dragging.current) return;
            dragging.current = false;
            setResizing(false);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            try {
                localStorage.setItem(HEIGHT_KEY, String(heightRef.current));
            } catch {
                /* ignore */
            }
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, []);

    if (!open) return null;

    return (
        <div className="relative z-20 flex shrink-0 flex-col border-t border-border-subtle bg-panel" style={{ height }}>
            <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize terminal"
                className="group absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize"
                onMouseDown={(e) => {
                    e.preventDefault();
                    dragging.current = true;
                    setResizing(true);
                    document.body.style.cursor = "row-resize";
                    document.body.style.userSelect = "none";
                    document.body.classList.add("resizing-vertical");
                }}
                onMouseUp={() => document.body.classList.remove("resizing-vertical")}
            >
                <div className="pointer-events-none absolute inset-x-0 top-1 h-px bg-border-subtle transition-colors group-hover:bg-border-secondary" />
            </div>
            <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border-subtle px-2">
                <Icon icon={RiTerminalBoxLine} className="text-text-muted" />
                <span className="text-sm text-text-secondary">Terminal</span>
                <span className="flex-1" />
                <Tooltip content="Close terminal">
                    <button
                        type="button"
                        aria-label="Close terminal"
                        onClick={() => persistOpen(false)}
                        className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
                    >
                        <Icon icon={RiCloseLine} />
                    </button>
                </Tooltip>
            </div>
            <div className={cn("min-h-0 flex-1 overflow-hidden", resizing && "pointer-events-none")}>
                <Suspense fallback={<div className="h-full w-full bg-panel" />}>
                    <Terminal terminalOnly isOpen />
                </Suspense>
            </div>
        </div>
    );
}
