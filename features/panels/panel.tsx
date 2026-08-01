"use client";

import React, { useRef, useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────── Types ───────────────────────────

export interface PaneConfig {
    id: string;
    children: React.ReactNode;
    minSize?: number;
    maxSize?: number;
    preferredSize?: number;
    visible?: boolean;
    snap?: boolean;
    flexible?: boolean;
}

export interface PanelProps {
    panes: PaneConfig[];
    direction?: "horizontal" | "vertical";
    className?: string;
    onSizesChange?: (sizes: number[]) => void;
    onVisibleChange?: (index: number, visible: boolean) => void;
    storageKey?: string;
    hideSeparator?: boolean;
    /** Gap between adjacent visible panes (CSS length). */
    paneGap?: string;
    /**
     * Outer window inset when `paneGap` is set.
     * - `trailing` (default): inset only the last pane (workbench sidebars).
     * - `all`: inset first and last panes (standalone windows like Git Manager).
     */
    inset?: "trailing" | "all";
}

const STORAGE_PREFIX = "panel-";

export function Panel({
    panes,
    direction = "horizontal",
    className,
    onSizesChange,
    onVisibleChange,
    storageKey,
    hideSeparator,
    inset = "trailing",
    paneGap,
}: PanelProps) {
    const isVertical = direction === "vertical";

    // sizes tracks the active size of the pane when it is open.
    const [sizes, setSizes] = useState<number[]>(() =>
        panes.map(p => p.preferredSize || 250)
    );

    // Restore persisted sizes after mount so SSR and first client render match.
    useEffect(() => {
        if (!storageKey) return;
        const stored = localStorage.getItem(STORAGE_PREFIX + storageKey);
        if (!stored) return;
        try {
            const parsed = JSON.parse(stored) as number[];
            if (Array.isArray(parsed) && parsed.length === panes.length) {
                setSizes(parsed);
            }
        } catch { /* ignore corrupt storage */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey]);

    // Render-phase sync: adjust sizes state immediately if the panes configuration changes in length
    if (sizes.length !== panes.length) {
        const nextSizes = panes.map((pane, idx) => {
            if (idx < sizes.length && sizes[idx] !== undefined) {
                return sizes[idx];
            }
            return pane.preferredSize || 250;
        });
        setSizes(nextSizes);
    }

    const [isResizing, setIsResizing] = useState(false);
    const activeDraggingIdxRef = useRef<number | null>(null);
    const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

    const dragStateRef = useRef<{
        startMousePos: number;
        startSizeL: number;
        startSizeR: number;
        startVisibleL: boolean;
        startVisibleR: boolean;
    } | null>(null);

    const dragVisibleStateRef = useRef<{ l: boolean; r: boolean } | null>(null);

    const paneRefs = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        if (!storageKey) return;
        localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(sizes));
        onSizesChange?.(sizes);
    }, [sizes, storageKey, onSizesChange]);

    const startDrag = useCallback((idx: number, e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();

        const target = e.currentTarget;
        if (target && target.setPointerCapture) {
            target.setPointerCapture(e.pointerId);
        }

        activeDraggingIdxRef.current = idx;
        setDraggingIdx(idx);

        const lPane = paneRefs.current[idx];
        const rPane = paneRefs.current[idx + 1];

        dragStateRef.current = {
            startMousePos: isVertical ? e.clientY : e.clientX,
            startSizeL: lPane ? (isVertical ? lPane.getBoundingClientRect().height : lPane.getBoundingClientRect().width) : 0,
            startSizeR: rPane ? (isVertical ? rPane.getBoundingClientRect().height : rPane.getBoundingClientRect().width) : 0,
            startVisibleL: panes[idx].visible !== false,
            startVisibleR: panes[idx + 1].visible !== false,
        };

        dragVisibleStateRef.current = {
            l: panes[idx].visible !== false,
            r: panes[idx + 1].visible !== false,
        };

        setIsResizing(true);
        if (isVertical) {
            document.body.classList.add("resizing-vertical");
        }
        document.body.style.cursor = isVertical ? "row-resize" : "col-resize";
        document.body.style.userSelect = "none";
        document.body.setAttribute("data-resizing", "true"); // protect iframes
    }, [isVertical, panes]);

    const stopDrag = useCallback((e?: PointerEvent) => {
        if (e && e.target && (e.target as Element).releasePointerCapture) {
            try {
                (e.target as Element).releasePointerCapture(e.pointerId);
            } catch { }
        }
        setIsResizing(false);
        setDraggingIdx(null);
        activeDraggingIdxRef.current = null;
        dragStateRef.current = null;
        document.body.classList.remove("resizing-vertical");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.body.removeAttribute("data-resizing");
    }, []);

    const onPointerMove = useCallback((e: PointerEvent) => {
        if (!isResizing || activeDraggingIdxRef.current === null || !dragStateRef.current) return;

        const idx = activeDraggingIdxRef.current;
        const currentMousePos = isVertical ? e.clientY : e.clientX;
        const delta = currentMousePos - dragStateRef.current.startMousePos;

        const lPane = panes[idx];
        const rPane = panes[idx + 1];
        const state = dragStateRef.current;

        const SNAP_COLLAPSE = 50;
        const SNAP_OPEN = 20;

        setSizes(prev => {
            const next = [...prev];
            let shouldToggleL = false, lState = false;
            let shouldToggleR = false, rState = false;

            const toggleL = (visible: boolean) => {
                if (dragVisibleStateRef.current && dragVisibleStateRef.current.l !== visible) {
                    dragVisibleStateRef.current.l = visible;
                    shouldToggleL = true; lState = visible;
                }
            };
            const toggleR = (visible: boolean) => {
                if (dragVisibleStateRef.current && dragVisibleStateRef.current.r !== visible) {
                    dragVisibleStateRef.current.r = visible;
                    shouldToggleR = true; rState = visible;
                }
            };

            // 1) Left pane is fixed, Right pane is flexible (e.g. Left Sidebar | Center Editor)
            if (!lPane.flexible && rPane.flexible) {
                const newL = state.startSizeL + delta;
                const totalSizes = state.startSizeL + state.startSizeR;
                const maxAllowedL = rPane.minSize ? totalSizes - rPane.minSize : totalSizes;

                if (state.startVisibleL) {
                    if (lPane.snap && newL < SNAP_COLLAPSE) {
                        toggleL(false);
                    } else {
                        toggleL(true);
                        let targetL = Math.max(lPane.minSize || 80, newL);
                        if (lPane.maxSize) targetL = Math.min(lPane.maxSize, targetL);
                        targetL = Math.min(maxAllowedL, targetL);
                        next[idx] = targetL;
                    }
                } else {
                    if (lPane.snap && newL > SNAP_OPEN) {
                        toggleL(true);
                        let targetL = Math.max(lPane.minSize || 80, newL);
                        if (lPane.maxSize) targetL = Math.min(lPane.maxSize, targetL);
                        targetL = Math.min(maxAllowedL, targetL);
                        next[idx] = targetL;
                    } else {
                        toggleL(false);
                    }
                }
            }
            // 2) Right pane is fixed, Left pane is flexible (e.g. Center Editor | Right Sidebar)
            else if (!rPane.flexible && lPane.flexible) {
                const newR = state.startSizeR - delta;
                const totalSizes = state.startSizeL + state.startSizeR;
                const maxAllowedR = lPane.minSize ? totalSizes - lPane.minSize : totalSizes;

                if (state.startVisibleR) {
                    if (rPane.snap && newR < SNAP_COLLAPSE) {
                        toggleR(false);
                    } else {
                        toggleR(true);
                        let targetR = Math.max(rPane.minSize || 80, newR);
                        if (rPane.maxSize) targetR = Math.min(rPane.maxSize, targetR);
                        targetR = Math.min(maxAllowedR, targetR);
                        next[idx + 1] = targetR;
                    }
                } else {
                    if (rPane.snap && newR > SNAP_OPEN) {
                        toggleR(true);
                        let targetR = Math.max(rPane.minSize || 80, newR);
                        if (rPane.maxSize) targetR = Math.min(rPane.maxSize, targetR);
                        targetR = Math.min(maxAllowedR, targetR);
                        next[idx + 1] = targetR;
                    } else {
                        toggleR(false);
                    }
                }
            }
            // 3) Neither is flexible (adjusting balance between two fixed items)
            else if (!lPane.flexible && !rPane.flexible) {
                const newR = state.startSizeR - delta;
                const total = state.startSizeL + state.startSizeR;

                if (state.startVisibleR) {
                    if (newR < SNAP_COLLAPSE && rPane.snap) {
                        toggleR(false);
                    } else {
                        toggleR(true);
                        let targetR = Math.max(rPane.minSize || 80, newR);
                        if (rPane.maxSize) targetR = Math.min(rPane.maxSize, targetR);
                        if (lPane.maxSize) targetR = Math.max(targetR, total - lPane.maxSize);
                        next[idx + 1] = targetR;
                        next[idx] = Math.max(0, total - targetR);
                    }
                } else {
                    if (newR > SNAP_OPEN && rPane.snap) {
                        toggleR(true);
                        let targetR = Math.max(rPane.minSize || 80, newR);
                        if (rPane.maxSize) targetR = Math.min(rPane.maxSize, targetR);
                        if (lPane.maxSize) targetR = Math.max(targetR, total - lPane.maxSize);
                        next[idx + 1] = targetR;
                        next[idx] = Math.max(0, total - targetR);
                    } else {
                        toggleR(false);
                    }
                }
            }

            if (shouldToggleL) { setTimeout(() => onVisibleChange?.(idx, lState), 0); }
            if (shouldToggleR) { setTimeout(() => onVisibleChange?.(idx + 1, rState), 0); }

            return next;
        });

    }, [isResizing, isVertical, panes, onVisibleChange]);

    useEffect(() => {
        const onBlur = () => stopDrag();
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", stopDrag);
        window.addEventListener("pointercancel", stopDrag);
        window.addEventListener("blur", onBlur);
        return () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", stopDrag);
            window.removeEventListener("pointercancel", stopDrag);
            window.removeEventListener("blur", onBlur);
            document.body.classList.remove("resizing-vertical");
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            document.body.removeAttribute("data-resizing");
        };
    }, [onPointerMove, stopDrag]);

    const halfGap = paneGap ? `calc(${paneGap} / 2)` : undefined;

    return (
        <div className={cn("flex overflow-hidden w-full h-full relative", isVertical ? "flex-col" : "flex-row", className)}>
            {panes.map((pane, idx) => {
                const isLast = idx === panes.length - 1;
                const isVisible = pane.visible !== false;
                const renderedSize = isVisible ? sizes[idx] : 0;
                const prevVisible = idx > 0 && panes[idx - 1].visible !== false;
                const nextVisible = !isLast && panes[idx + 1].visible !== false;
                // Between-pane gap (half each side). Outer inset: trailing only (workbench)
                // or all sides (standalone windows).
                const edgeMargin = halfGap && isVisible
                    ? {
                        ...(inset === "all"
                            ? {
                                marginTop: paneGap,
                                marginBottom: paneGap,
                            }
                            : null),
                        [isVertical ? "marginTop" : "marginLeft"]:
                            idx === 0
                                ? (inset === "all" ? paneGap : undefined)
                                : (prevVisible ? halfGap : undefined),
                        [isVertical ? "marginBottom" : "marginRight"]:
                            isLast
                                ? paneGap
                                : (nextVisible ? halfGap : undefined),
                    }
                    : {};

                return (
                    <React.Fragment key={pane.id}>
                        <div
                            ref={(el) => { paneRefs.current[idx] = el; }}
                            className="relative flex min-h-0 min-w-0 shrink-0 flex-col box-border z-[1]"
                            style={{
                                [isVertical ? "height" : "width"]: isVisible ? (pane.flexible ? undefined : `${renderedSize}px`) : "0px",
                                flex: isVisible ? (pane.flexible ? "1 1 0%" : "none") : "0 0 0px",
                                display: (!isVisible && pane.flexible) ? "none" : undefined,
                                ...edgeMargin,
                            }}
                        >
                            <div className={cn("flex h-full w-full min-h-0 min-w-0 flex-col", !isVisible && "hidden")}>
                                {pane.children}
                            </div>
                        </div>

                        {!isLast && (() => {
                            const lPane = pane;
                            const rPane = panes[idx + 1];
                            const lCollapsed = lPane.visible === false;
                            const rCollapsed = rPane.visible === false;
                            const isCollapsed = lCollapsed || rCollapsed;

                            return (
                                <div
                                    onPointerDown={(e) => startDrag(idx, e)}
                                    className={cn(
                                        "flex-none z-50 group flex items-center justify-center pointer-events-auto",
                                        isVertical ? "w-full cursor-row-resize" : "h-full cursor-col-resize",
                                        isCollapsed ? "absolute bg-transparent" : "relative",
                                        isCollapsed && isVertical && lCollapsed && "top-0 h-8",
                                        isCollapsed && isVertical && rCollapsed && "bottom-0 h-8",
                                        isCollapsed && !isVertical && lCollapsed && "left-0 w-8",
                                        isCollapsed && !isVertical && rCollapsed && "right-0 w-8",
                                        !isCollapsed && (isVertical ? "h-0" : "w-0")
                                    )}
                                >
                                    {/* The Actual Line */}
                                    <div className={cn(
                                        "transition-colors duration-200 pointer-events-none",
                                        isCollapsed ? "absolute" : "",
                                        isVertical ? "w-full h-px" : "h-full w-px",
                                        isResizing && draggingIdx === idx ? "bg-accent opacity-100" : "bg-transparent group-hover:bg-accent/40",
                                        isCollapsed && isVertical && lCollapsed ? "top-0" : "",
                                        isCollapsed && isVertical && rCollapsed ? "bottom-0" : "",
                                        isCollapsed && !isVertical && lCollapsed ? "left-0" : "",
                                        isCollapsed && !isVertical && rCollapsed ? "right-0" : "",
                                        hideSeparator && "hidden"
                                    )} />

                                    {/* Hitbox */}
                                    <div className={cn("absolute", isVertical ? "inset-x-0 h-3 w-full -top-1" : "inset-y-0 w-3 h-full -left-1")} />
                                </div>
                            );
                        })()}
                    </React.Fragment>
                );
            })}

            {/* Global cursor override overlay during resize */}
            {isResizing && <div className="fixed inset-0 z-[9999]" style={{ cursor: isVertical ? "row-resize" : "col-resize" }} />}
        </div>
    );
}

export default Panel;
