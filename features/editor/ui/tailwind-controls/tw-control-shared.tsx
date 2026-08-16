"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { getSettings } from "@/lib/settings";
import type { PaddingSides } from "./lib/spacing";

export interface TwPanelProps {
    currentClasses: string[];
    onApply: (add: string[], remove: string[]) => void;
    onClose?: () => void;
}

export function RowLabel({ children }: { children: React.ReactNode }) {
    return <span className="w-[72px] shrink-0 text-xs text-text-muted">{children}</span>;
}

export function PanelShell({
    title,
    onClose,
    children,
}: {
    title: string;
    onClose?: () => void;
    children: React.ReactNode;
}) {
    return (
        <TooltipProvider delayDuration={400}>
            <div
                className="flex flex-col gap-2 select-none rounded-xl bg-surface-3 border border-border-subtle shadow-lg text-text-primary font-sans p-3 w-[264px]"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-text-secondary">{title}</span>
                    {onClose && (
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
                            <Icon name="close" size={12} />
                        </Button>
                    )}
                </div>
                {children}
            </div>
        </TooltipProvider>
    );
}

export function ToggleBtn({
    label,
    active,
    onClick,
    children,
    className,
}: {
    label: string;
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <Tooltip content={label} side="top" delayDuration={400}>
            <Button
                type="button"
                variant={active ? "secondary" : "ghost"}
                size="icon"
                aria-label={label}
                onClick={onClick}
                className={className}
            >
                {children}
            </Button>
        </Tooltip>
    );
}

export function RadiusGlyph() {
    return (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <rect x="1.5" y="1.5" width="9" height="9" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
    );
}

/** Numeric px input with a small glyph, commits on Enter / blur. Wheel nudges like Figma. */
export function PxInput({
    glyph,
    title,
    value,
    onCommit,
    min = 0,
    max,
}: {
    glyph: React.ReactNode;
    title: string;
    value: number | null;
    onCommit: (px: number) => void;
    min?: number;
    max?: number;
}) {
    const [text, setText] = useState(value === null ? "0" : String(value));
    const wrapRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ startX: number; startVal: number } | null>(null);
    const textRef = useRef(text);
    const onCommitRef = useRef(onCommit);
    const minRef = useRef(min);
    const maxRef = useRef(max ?? Number.POSITIVE_INFINITY);
    textRef.current = text;
    onCommitRef.current = onCommit;
    minRef.current = min;
    maxRef.current = max ?? Number.POSITIVE_INFINITY;

    useEffect(() => {
        setText(value === null ? "0" : String(value));
    }, [value]);

    const commit = () => {
        const n = parseInt(text, 10);
        if (Number.isNaN(n)) {
            setText(value === null ? "0" : String(value));
            return;
        }
        const next = Math.min(maxRef.current, Math.max(min, n));
        if (next === (value ?? 0)) {
            setText(String(next));
            return;
        }
        onCommit(next);
    };

    const nudge = (delta: number) => {
        const n = parseInt(textRef.current, 10) || 0;
        const next = Math.min(maxRef.current, Math.max(minRef.current, n + delta));
        setText(String(next));
        onCommitRef.current(next);
    };

    const onGlyphPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = {
            startX: e.clientX,
            startVal: parseInt(textRef.current, 10) || 0,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.style.cursor = "ew-resize";
        document.body.style.userSelect = "none";
    };

    const onGlyphPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
        const drag = dragRef.current;
        if (!drag) return;
        const step = e.shiftKey ? 10 : 1;
        const next = Math.min(
            maxRef.current,
            Math.max(minRef.current, drag.startVal + Math.round((e.clientX - drag.startX) / 2) * step),
        );
        setText(String(next));
        onCommitRef.current(next);
    };

    const onGlyphPointerUp = (e: React.PointerEvent<HTMLSpanElement>) => {
        if (!dragRef.current) return;
        dragRef.current = null;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
    };

    // Native non-passive wheel — React's onWheel is often passive and can't preventDefault.
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (getSettings().tailwindControls?.wheelOnInputs === false) return;
            e.preventDefault();
            e.stopPropagation();
            const step = e.shiftKey ? 1 : 4;
            nudge(e.deltaY < 0 ? step : -step);
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);

    return (
        <div ref={wrapRef} className="flex min-w-0 flex-1 items-center gap-1">
            <span
                title={`${title} — drag to adjust`}
                className="flex size-6 shrink-0 cursor-ew-resize touch-none select-none items-center justify-center rounded-md bg-input-bg text-text-muted"
                onPointerDown={onGlyphPointerDown}
                onPointerMove={onGlyphPointerMove}
                onPointerUp={onGlyphPointerUp}
                onPointerCancel={onGlyphPointerUp}
            >
                {glyph}
            </span>
            <Tooltip content={title} side="top" delayDuration={600}>
                <Input
                    type="text"
                    inputMode="numeric"
                    aria-label={title}
                    value={text}
                    onChange={(e) =>
                        setText(e.target.value.replace(min < 0 ? /[^\d-]/g : /[^\d]/g, ""))
                    }
                    onBlur={commit}
                    onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") {
                            commit();
                            (e.target as HTMLInputElement).blur();
                        }
                        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                            e.preventDefault();
                            const step = e.shiftKey ? 1 : 4;
                            nudge(e.key === "ArrowUp" ? step : -step);
                        }
                    }}
                />
            </Tooltip>
        </div>
    );
}

export const GAP_X_GLYPH = <Icon name="width" size={13} />;
export const GAP_Y_GLYPH = <Icon name="height" size={13} />;

export function PadGlyph({ side }: { side: keyof PaddingSides }) {
    const rotation = { left: 0, top: 90, right: 180, bottom: 270 }[side];
    return (
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ transform: `rotate(${rotation}deg)` }}>
            <rect x="1" y="1" width="1.6" height="10" rx="0.8" fill="currentColor" />
            <rect x="5" y="3" width="5.5" height="6" rx="1" fill="currentColor" opacity="0.35" />
        </svg>
    );
}
