"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const Terminal = lazy(() => import("@/features/terminal/ui/terminal"));

const MIN_H = 140;
const DEFAULT_H = 220;
const HEIGHT_KEY = "shape-agent-terminal-height";
const OPEN_KEY = "shape-agent-terminal-open";

function clearBodyResize() {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.body.classList.remove("resizing-vertical");
}

export function TerminalDock() {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [height, setHeight] = useState(DEFAULT_H);
    const [resizing, setResizing] = useState(false);
    const heightRef = useRef(DEFAULT_H);
    const dragging = useRef(false);

    useEffect(() => {
        clearBodyResize();
        try {
            const h = Number(localStorage.getItem(HEIGHT_KEY));
            if (h >= MIN_H && h <= 800) {
                setHeight(h);
                heightRef.current = h;
            }
            const wasOpen = localStorage.getItem(OPEN_KEY) === "true";
            setOpen(wasOpen);
            if (wasOpen) setMounted(true);
        } catch {
            /* ignore */
        }
    }, []);

    const persistOpen = useCallback((next: boolean) => {
        if (!next) {
            dragging.current = false;
            setResizing(false);
            clearBodyResize();
            setOpen(false);
        } else {
            setMounted(true);
            requestAnimationFrame(() => setOpen(true));
        }
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
            dragging.current = false;
            setResizing(false);
            clearBodyResize();
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
            clearBodyResize();
        };
    }, []);

    useEffect(() => {
        if (!open) return;
        const t = window.setTimeout(() => {
            void import("@/features/terminal/ui/terminal").then((m) => {
                void m.refitAllTerminals();
            }).catch(() => {
                /* ignore */
            });
        }, 40);
        return () => window.clearTimeout(t);
    }, [open, height]);

    if (!mounted) return null;

    return (
        <div
            className={cn(
                "relative z-20 flex shrink-0 flex-col overflow-hidden bg-panel",
                "transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                resizing && "transition-none",
                open ? "border-t border-border-subtle" : "pointer-events-none border-0",
            )}
            style={{ height: open ? height : 0 }}
            aria-hidden={!open}
        >
            {open ? (
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
                >
                    <div className="pointer-events-none absolute inset-x-0 top-1 h-px bg-border-subtle transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] group-hover:bg-border-secondary" />
                </div>
            ) : null}
            <div className={cn("min-h-0 flex-1 overflow-hidden", resizing && "pointer-events-none")}>
                <Suspense fallback={<div className="h-full w-full bg-panel" />}>
                    <Terminal terminalOnly isOpen={open} onClose={() => persistOpen(false)} />
                </Suspense>
            </div>
        </div>
    );
}
