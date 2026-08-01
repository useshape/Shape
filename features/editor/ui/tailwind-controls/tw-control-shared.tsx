"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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
}: {
    label: string;
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <Tooltip content={label} side="top" delayDuration={400}>
            <button
                type="button"
                onClick={onClick}
                className={cn(
                    "flex items-center justify-center h-7 flex-1 rounded-lg transition-colors cursor-pointer",
                    active ? "bg-panel-active text-text-primary" : "text-text-muted hover:bg-panel-hover",
                )}
            >
                {children}
            </button>
        </Tooltip>
    );
}

/** Numeric px input with a small glyph, commits on Enter / blur. Wheel nudges like Figma. */
export function PxInput({
    glyph,
    title,
    value,
    onCommit,
}: {
    glyph: React.ReactNode;
    title: string;
    value: number | null;
    onCommit: (px: number) => void;
}) {
    const [text, setText] = useState(value === null ? "0" : String(value));
    const wrapRef = useRef<HTMLDivElement>(null);
    const textRef = useRef(text);
    const onCommitRef = useRef(onCommit);
    textRef.current = text;
    onCommitRef.current = onCommit;

    useEffect(() => {
        setText(value === null ? "0" : String(value));
    }, [value]);

    const commit = () => {
        const n = parseInt(text, 10);
        if (Number.isNaN(n)) {
            setText(value === null ? "0" : String(value));
            return;
        }
        if (n === (value ?? 0)) return;
        onCommit(Math.max(0, n));
    };

    const nudge = (delta: number) => {
        const n = parseInt(textRef.current, 10) || 0;
        const next = Math.max(0, n + delta);
        setText(String(next));
        onCommitRef.current(next);
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
        <Tooltip content={title} side="top" delayDuration={600}>
            <div
                ref={wrapRef}
                className="flex items-center gap-1 h-7 flex-1 min-w-0 rounded-lg bg-panel-hover px-1.5 focus-within:ring-1 focus-within:ring-accent/50"
            >
                <span className="text-text-muted shrink-0 flex items-center">{glyph}</span>
                <input
                    type="text"
                    inputMode="numeric"
                    value={text}
                    onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ""))}
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
                    className="w-full bg-transparent text-xs text-text-primary tabular-nums outline-none min-w-0"
                />
            </div>
        </Tooltip>
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
