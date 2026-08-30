"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { Icon } from "@/components/ui/icon";

const POP =
    "origin-center animate-in fade-in zoom-in-95 duration-200 ease-[var(--ease-out)]";

const SHELL =
    "flex h-9 items-center gap-2 rounded-full bg-surface-2 px-3 shadow-sm";

/** Ruler / tick dial — no labels. Blue dot marks the selected tick. */
export function TickDial({
    value,
    min = 0,
    max = 32,
    step = 1,
    majorEvery = 4,
    onChange,
    tooltip = (n) => `${n}px`,
    className,
}: {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    majorEvery?: number;
    onChange: (n: number) => void;
    tooltip?: (n: number) => string;
    className?: string;
}) {
    const trackRef = useRef<HTMLDivElement>(null);
    const ticks = Math.floor((max - min) / step) + 1;
    const index = Math.round((Math.min(max, Math.max(min, value)) - min) / step);

    const setFromClientX = useCallback(
        (clientX: number) => {
            const el = trackRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
            const i = Math.round(t * (ticks - 1));
            onChange(min + i * step);
        },
        [min, onChange, step, ticks],
    );

    return (
        <div className={cn(SHELL, POP, "relative min-w-[160px] flex-1", className)}>
            <div
                ref={trackRef}
                role="slider"
                tabIndex={0}
                aria-valuemin={min}
                aria-valuemax={max}
                aria-valuenow={value}
                className="relative flex h-6 w-full cursor-ew-resize items-end justify-between px-0.5"
                onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setFromClientX(e.clientX);
                }}
                onPointerMove={(e) => {
                    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                    setFromClientX(e.clientX);
                }}
                onKeyDown={(e) => {
                    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                        e.preventDefault();
                        onChange(Math.max(min, value - step));
                    }
                    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                        e.preventDefault();
                        onChange(Math.min(max, value + step));
                    }
                }}
            >
                {Array.from({ length: ticks }, (_, i) => {
                    const major = i % majorEvery === 0;
                    const active = i === index;
                    const n = min + i * step;
                    return (
                        <Tooltip key={i} content={tooltip(n)} delayDuration={200}>
                            <span
                                className={cn(
                                    "relative flex w-px flex-col items-center",
                                    major ? "h-3.5" : "h-2.5",
                                )}
                            >
                                {active ? (
                                    <span className="absolute -top-1.5 size-1.5 rounded-full bg-accent" />
                                ) : null}
                                <span
                                    className={cn(
                                        "w-px flex-1 rounded-full",
                                        active
                                            ? "bg-text-primary"
                                            : major
                                              ? "bg-text-muted"
                                              : "bg-text-muted/35",
                                    )}
                                />
                            </span>
                        </Tooltip>
                    );
                })}
            </div>
        </div>
    );
}

/** Icon segment row (flex / layout). Dividers, tooltips only. */
export function IconSegment<T extends string>({
    value,
    options,
    onChange,
    className,
}: {
    value: T;
    options: { id: T; icon: string; label: string }[];
    onChange: (id: T) => void;
    className?: string;
}) {
    return (
        <div className={cn(SHELL, POP, "gap-0 px-1", className)}>
            {options.map((opt, i) => {
                const active = opt.id === value;
                return (
                    <div key={opt.id} className="flex items-center">
                        {i > 0 ? <span className="mx-0.5 h-4 w-px bg-border-subtle" /> : null}
                        <Tooltip content={opt.label} delayDuration={120}>
                            <button
                                type="button"
                                aria-label={opt.label}
                                aria-pressed={active}
                                onClick={() => onChange(opt.id)}
                                className={cn(
                                    "flex size-7 items-center justify-center rounded-md text-text-secondary transition-colors",
                                    active
                                        ? "bg-panel-hover text-text-primary ring-1 ring-border"
                                        : "hover:text-text-primary",
                                )}
                            >
                                <Icon name={opt.icon} size={15} />
                            </button>
                        </Tooltip>
                    </div>
                );
            })}
        </div>
    );
}

/** Discrete stop dots + optional reset. */
export function DotStops({
    value,
    stops,
    onChange,
    onReset,
    labels,
    className,
}: {
    value: number;
    stops: number[];
    onChange: (n: number) => void;
    onReset?: () => void;
    labels?: string[];
    className?: string;
}) {
    const idx = Math.max(
        0,
        stops.findIndex((s) => s === value) >= 0
            ? stops.findIndex((s) => s === value)
            : stops.reduce(
                  (best, s, i) =>
                      Math.abs(s - value) < Math.abs(stops[best]! - value) ? i : best,
                  0,
              ),
    );

    return (
        <div className={cn(SHELL, POP, "min-w-[140px] flex-1 justify-between", className)}>
            <div className="relative mx-1 flex h-5 flex-1 items-center">
                <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-border" />
                <div className="relative z-[1] flex w-full items-center justify-between">
                    {stops.map((s, i) => {
                        const active = i === idx;
                        return (
                            <Tooltip key={s} content={labels?.[i] ?? `${s}`} delayDuration={120}>
                                <button
                                    type="button"
                                    aria-label={labels?.[i] ?? String(s)}
                                    onClick={() => onChange(s)}
                                    className={cn(
                                        "rounded-full transition-transform duration-150",
                                        active
                                            ? "size-3 scale-100 bg-text-primary"
                                            : "size-1.5 bg-text-primary/80 hover:scale-125",
                                    )}
                                />
                            </Tooltip>
                        );
                    })}
                </div>
            </div>
            {onReset ? (
                <Tooltip content="Reset" delayDuration={120}>
                    <button
                        type="button"
                        aria-label="Reset"
                        onClick={onReset}
                        className="flex size-7 shrink-0 items-center justify-center rounded-full text-text-muted hover:text-text-primary"
                    >
                        <Icon name="refresh" size={14} />
                    </button>
                </Tooltip>
            ) : null}
        </div>
    );
}

function parseColor(css: string): { hex: string; hue: number; sat: number; lit: number } {
    const hexMatch = css.match(/#([0-9a-fA-F]{3,8})/);
    let hex = hexMatch ? `#${hexMatch[1]}` : "#3b82f6";
    if (hex.length === 4) {
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    hex = hex.slice(0, 7);
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lit = (max + min) / 2;
    let sat = 0;
    let hue = 210;
    if (max !== min) {
        const d = max - min;
        sat = lit > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
                break;
            case g:
                hue = ((b - r) / d + 2) * 60;
                break;
            default:
                hue = ((r - g) / d + 4) * 60;
        }
    }
    return { hex, hue, sat: sat * 100, lit: lit * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
    const sat = s / 100;
    const lit = l / 100;
    const a = sat * Math.min(lit, 1 - lit);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const c = lit - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * c)
            .toString(16)
            .padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

type ColorFmt = "hex" | "hsl" | "oklch";

/** Saturation/lightness capsule + color wheel that expands format/hue. */
export function ColorCapsule({
    cssValue,
    onChange,
    className,
}: {
    cssValue: string;
    onChange: (css: string) => void;
    className?: string;
}) {
    const parsed = parseColor(cssValue);
    const [expanded, setExpanded] = useState(false);
    const [fmt, setFmt] = useState<ColorFmt>("hex");
    const [hue, setHue] = useState(parsed.hue);
    const trackRef = useRef<HTMLDivElement>(null);

    const gradient = `linear-gradient(90deg, hsl(${hue} 20% 92%), hsl(${hue} 85% 48%))`;

    const setFromX = (clientX: number) => {
        const el = trackRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        const sat = 15 + t * 85;
        const lit = 88 - t * 40;
        onChange(hslToHex(hue, sat, lit));
    };

    const formats: { id: ColorFmt; label: string }[] = [
        { id: "hex", label: "HEX" },
        { id: "hsl", label: "HSL" },
        { id: "oklch", label: "OKLCH" },
    ];

    const display =
        fmt === "hex"
            ? parsed.hex.toUpperCase()
            : fmt === "hsl"
              ? `${Math.round(parsed.hue)} ${Math.round(parsed.sat)}% ${Math.round(parsed.lit)}%`
              : `oklch(${(parsed.lit / 100).toFixed(2)} ${(parsed.sat / 100).toFixed(2)} ${Math.round(parsed.hue)})`;

    return (
        <div className={cn("flex flex-col gap-1.5", className)}>
            <div className={cn(SHELL, POP, "gap-2.5")}>
                <div
                    ref={trackRef}
                    role="slider"
                    aria-label="Color intensity"
                    tabIndex={0}
                    className="relative h-4 min-w-0 flex-1 cursor-ew-resize rounded-full"
                    style={{ background: gradient }}
                    onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        setFromX(e.clientX);
                    }}
                    onPointerMove={(e) => {
                        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                        setFromX(e.clientX);
                    }}
                >
                    <span
                        className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm"
                        style={{
                            left: `${Math.min(100, Math.max(0, ((parsed.sat - 15) / 85) * 100))}%`,
                            background: parsed.hex,
                        }}
                    />
                </div>
                <Tooltip content="Color options" delayDuration={120}>
                    <button
                        type="button"
                        aria-label="Color options"
                        aria-expanded={expanded}
                        onClick={() => setExpanded((v) => !v)}
                        className="size-5 shrink-0 rounded-full"
                        style={{
                            background:
                                "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)",
                        }}
                    />
                </Tooltip>
            </div>
            {expanded ? (
                <div
                    className={cn(
                        SHELL,
                        "h-auto flex-wrap gap-2 py-2 animate-in fade-in slide-in-from-top-1 duration-200",
                    )}
                >
                    <input
                        type="range"
                        min={0}
                        max={360}
                        value={Math.round(hue)}
                        aria-label="Hue"
                        className="h-1.5 min-w-[100px] flex-1 accent-accent"
                        onChange={(e) => {
                            const h = Number(e.target.value);
                            setHue(h);
                            onChange(hslToHex(h, parsed.sat || 70, parsed.lit || 55));
                        }}
                    />
                    <div className="flex items-center gap-0.5">
                        {formats.map((f) => (
                            <Tooltip key={f.id} content={f.label} delayDuration={80}>
                                <button
                                    type="button"
                                    aria-label={f.label}
                                    aria-pressed={fmt === f.id}
                                    onClick={() => setFmt(f.id)}
                                    className={cn(
                                        "rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
                                        fmt === f.id
                                            ? "bg-panel-hover text-text-primary"
                                            : "text-text-muted hover:text-text-secondary",
                                    )}
                                >
                                    {f.id === "hex" ? "#" : f.id === "hsl" ? "HSL" : "OKL"}
                                </button>
                            </Tooltip>
                        ))}
                    </div>
                    <Tooltip content={display} delayDuration={80}>
                        <span className="max-w-[88px] truncate font-mono text-[10px] text-text-muted">
                            {display}
                        </span>
                    </Tooltip>
                </div>
            ) : null}
        </div>
    );
}
