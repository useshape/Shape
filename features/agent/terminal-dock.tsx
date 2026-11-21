"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useProjectState } from "@/lib/backend/project-state";
import { registerBoundTerminalTab } from "@/features/terminal/session";
import { readTerminalPreview } from "@/features/terminal/ui/terminal";
import { cn } from "@/lib/utils";

const Terminal = lazy(() => import("@/features/terminal/ui/terminal"));

const MIN_H = 140;
const LINE_H = 38;
const SNAP_H = 88;
const DEFAULT_H = 220;
const HEIGHT_KEY = "shape-agent-terminal-height";
const OPEN_KEY = "shape-agent-terminal-open";

function clearBodyResize() {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.body.classList.remove("resizing-vertical");
}

export function TerminalDock() {
    const { project_path } = useProjectState();
    const cwdRef = useRef(project_path);
    cwdRef.current = project_path;
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [height, setHeight] = useState(DEFAULT_H);
    const [resizing, setResizing] = useState(false);
    const [lineMode, setLineMode] = useState(false);
    const [tabNear, setTabNear] = useState(false);
    const [preview, setPreview] = useState({ title: "Terminal", line: "" });
    const heightRef = useRef(DEFAULT_H);
    const dragging = useRef(false);
    const lineRef = useRef(false);
    const dockRef = useRef<HTMLDivElement>(null);
    const tabRef = useRef<HTMLButtonElement>(null);

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
        let unlisten: (() => void) | undefined;
        let cancelled = false;
        void import("@tauri-apps/api/event").then(({ listen }) =>
            listen<{ type: string; command?: string; sessionId?: number }>(
                "shape-terminal-ai-action",
                (event) => {
                    if (cancelled) return;
                    if (event.payload.type !== "start" || event.payload.sessionId == null) return;
                    const cwd = cwdRef.current || "global";
                    const title =
                        (event.payload.command || "Agent").replace(/\s+/g, " ").trim().slice(0, 48) ||
                        "Agent";
                    registerBoundTerminalTab({
                        title,
                        cwd,
                        shell: "ai",
                        boundPtyId: event.payload.sessionId,
                    });
                    window.dispatchEvent(
                        new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }),
                    );
                    persistOpen(true);
                },
            ).then((fn) => {
                if (cancelled) fn();
                else unlisten = fn;
            }),
        );
        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, [persistOpen]);

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
        const paint = (px: number) => {
            const dock = dockRef.current;
            if (!dock) return;
            dock.style.transition = "none";
            dock.style.height = `${px}px`;
        };
        const onMove = (e: MouseEvent) => {
            if (!dragging.current) return;
            const max = Math.floor(window.innerHeight * 0.72);
            const pointer = Math.max(LINE_H, Math.min(max, window.innerHeight - e.clientY - 8));
            const tab = tabRef.current;
            if (tab) {
                const lean = Math.max(-4, Math.min(4, (tab.getBoundingClientRect().top - e.clientY) * 0.12));
                tab.style.transform = `translate(-50%, calc(-50% + ${lean}px))`;
            }
            if (lineRef.current && pointer < SNAP_H + 28) {
                heightRef.current = LINE_H;
                paint(LINE_H);
                return;
            }
            if (lineRef.current && pointer >= SNAP_H + 28) {
                lineRef.current = false;
                setLineMode(false);
            }
            heightRef.current = pointer;
            paint(pointer);
        };
        const onUp = () => {
            if (!dragging.current) return;
            dragging.current = false;
            setResizing(false);
            if (heightRef.current <= SNAP_H) {
                heightRef.current = LINE_H;
                lineRef.current = true;
                setLineMode(true);
            } else if (heightRef.current < MIN_H) {
                heightRef.current = MIN_H;
                lineRef.current = false;
                setLineMode(false);
            } else {
                lineRef.current = false;
                setLineMode(false);
            }
            setHeight(heightRef.current);
            if (tabRef.current) tabRef.current.style.transform = "translate(-50%, -50%)";
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

    useEffect(() => {
        if (!open || !lineMode || !project_path) return;
        const read = () => setPreview(readTerminalPreview(project_path));
        read();
        const timer = window.setInterval(read, 400);
        return () => window.clearInterval(timer);
    }, [open, lineMode, project_path]);

    if (!mounted) return null;

    const full = open && !lineMode;

    return (
        <div
            ref={dockRef}
            className={cn(
                "z-20 shrink-0 overflow-hidden",
                full ? "absolute inset-x-0 bottom-0" : "relative",
                "transition-[height,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                open ? "m-3" : "pointer-events-none m-0",
                resizing && "transition-none",
            )}
            style={{ height: open ? (lineMode ? LINE_H : height) : 0 }}
            aria-hidden={!open}
            onMouseMove={(e) => {
                const bounds = e.currentTarget.getBoundingClientRect();
                const dist = Math.hypot(e.clientX - (bounds.left + bounds.width / 2), e.clientY - bounds.top);
                const near = dist < 72;
                setTabNear((prev) => (prev === near ? prev : near));
            }}
            onMouseLeave={() => {
                if (!dragging.current) setTabNear(false);
            }}
        >
            <div
                className={cn(
                    "relative flex h-full flex-col overflow-hidden squircle-2xl border border-border bg-panel",
                    lineMode ? "justify-center px-3" : "rounded-xl px-2 pb-2",
                )}
            >
                {open ? (
                    <button
                        ref={tabRef}
                        type="button"
                        aria-label="Resize terminal"
                        className={cn(
                            "absolute top-0 left-1/2 z-40 flex h-4 w-11 -translate-x-1/2 cursor-row-resize items-center justify-center",
                            "transition-opacity duration-150",
                            tabNear || resizing ? "opacity-100" : "opacity-0",
                        )}
                        style={{ transform: "translate(-50%, -50%)" }}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            dragging.current = true;
                            setResizing(true);
                            setTabNear(true);
                            document.body.style.cursor = "row-resize";
                            document.body.style.userSelect = "none";
                            document.body.classList.add("resizing-vertical");
                        }}
                    >
                        <span
                            className={cn(
                                "block h-[3px] rounded-full bg-text-muted/55 shadow-[0_1px_1px_rgba(0,0,0,0.45)]",
                                "transition-[width,background-color] duration-150",
                                resizing ? "w-9 bg-text-primary/80" : "w-7",
                            )}
                        />
                    </button>
                ) : null}
                {lineMode ? (
                    <div className="flex h-9 min-w-0 items-center gap-3">
                        <span className="max-w-[38%] shrink-0 truncate text-sm text-text-primary">{preview.title}</span>
                        <span className="min-w-0 flex-1 truncate text-right font-mono text-xs text-text-muted">
                            {preview.line || "No output yet"}
                        </span>
                    </div>
                ) : null}
                <div className={cn("min-h-0 flex-1 overflow-hidden", (resizing || lineMode) && "pointer-events-none", lineMode && "hidden")}>
                    <Suspense fallback={<div className="h-full w-full bg-panel" />}>
                        <Terminal terminalOnly isOpen={open} onClose={() => persistOpen(false)} />
                    </Suspense>
                </div>
            </div>
        </div>
    );
}
