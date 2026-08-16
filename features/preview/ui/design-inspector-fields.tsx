"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { ColorPickerPortal, type PickerAnchor } from "@/features/editor/ui/color-picker/portal";
import { PadGlyph, PxInput, ToggleBtn } from "@/features/editor/ui/tailwind-controls/tw-control-shared";
import { SidebarPanelActionButton } from "@/features/panels/ui/sidebar-panel-header";
import { cn } from "@/lib/utils";
import {
    colorParts,
    cssColorToHex,
    isGradient,
    isTransparentColor,
    parsePx,
    toCssColor,
} from "../design-mode/css";

export function Section({
    title,
    action,
    children,
}: {
    title: string;
    action?: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-2 border-b border-border-subtle px-3 py-3">
            <div className="flex h-6 items-center justify-between">
                <span className="text-xs font-medium text-text-primary">{title}</span>
                {action}
            </div>
            {children}
        </div>
    );
}

export function AddHeader({
    title,
    onAdd,
}: {
    title: string;
    onAdd: () => void;
}) {
    return (
        <div className="flex h-8 items-center justify-between border-b border-border-subtle px-3">
            <span className="text-xs font-medium text-text-primary">{title}</span>
            <SidebarPanelActionButton title={`Add ${title.toLowerCase()}`} onClick={onAdd}>
                <Icon name="add" size={14} />
            </SidebarPanelActionButton>
        </div>
    );
}

export function CompactSelect({
    value,
    options,
    onChange,
    className,
}: {
    value: string;
    options: { value: string; label: string; icon?: React.ReactNode }[];
    onChange: (v: string) => void;
    className?: string;
}) {
    const opts = options.some((o) => o.value === value)
        ? options
        : value
          ? [{ value, label: value }, ...options]
          : options;
    const current = opts.find((o) => o.value === value);
    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button type="button" variant="secondary" size="xs" className={cn("w-full justify-between", className)}>
                    <span className="flex min-w-0 items-center gap-1.5">
                        {current?.icon}
                        <span className="truncate">{current?.label ?? value}</span>
                    </span>
                    <Icon name="expand_more" size={12} className="shrink-0 text-text-muted" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[200px]">
                {opts.map((opt) => (
                    <DropdownMenuItem
                        key={opt.value}
                        onSelect={() => onChange(opt.value)}
                    >
                        <span className="flex items-center gap-2">
                            {opt.icon}
                            {opt.label}
                        </span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function Glyph({ children }: { children: string }) {
    return <span className="min-w-3 text-center text-[10px] font-medium text-text-muted">{children}</span>;
}

export function MicroLabel({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[10px] text-text-muted">{label}</span>
            {children}
        </div>
    );
}

export function IconBtn({
    title,
    active,
    onClick,
    children,
}: {
    title: string;
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <Button
            type="button"
            title={title}
            variant={active ? "secondary" : "ghost"}
            size="icon"
            onClick={onClick}
        >
            {children}
        </Button>
    );
}

/** Figma-style fill/stroke row: swatch | hex | opacity | eye | remove. Picker docks left of the swatch. */
export function ColorRow({
    cssValue,
    onChange,
    onRemove,
    hidden,
    onToggleHidden,
}: {
    cssValue: string;
    onChange: (cssColor: string) => void;
    onRemove?: () => void;
    hidden?: boolean;
    onToggleHidden?: () => void;
}) {
    const [open, setOpen] = React.useState(false);
    const [anchor, setAnchor] = React.useState<PickerAnchor>({ x: 0, y: 0 });
    const [live, setLive] = React.useState<string | null>(null);
    const [hexDraft, setHexDraft] = React.useState<string | null>(null);
    const display = live ?? cssValue;
    const gradient = isGradient(display);
    const transparent = !gradient && isTransparentColor(display);
    const hex = cssColorToHex(display);
    const parts = colorParts(display);
    const swatch = transparent || gradient ? undefined : hex.length > 7 ? hex.slice(0, 7) : hex;

    const commitHex = (raw: string) => {
        const cleaned = raw.replace(/[^0-9a-fA-F]/g, "").slice(0, 8);
        if (cleaned.length !== 3 && cleaned.length !== 6 && cleaned.length !== 8) {
            setHexDraft(null);
            return;
        }
        const full =
            cleaned.length === 3
                ? cleaned.split("").map((c) => c + c).join("")
                : cleaned;
        const next = `#${full.toUpperCase()}`;
        setHexDraft(null);
        onChange(toCssColor(next));
    };

    return (
        <>
            <div className="flex items-center gap-1">
                <Button
                    type="button"
                    title="Color"
                    variant="secondary"
                    size="icon"
                    onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setAnchor({ x: r.left, y: r.top });
                        setLive(display);
                        setOpen(true);
                    }}
                >
                    <span
                        className="size-3.5 rounded-md border border-border-subtle"
                        style={
                            gradient
                                ? { backgroundImage: display, backgroundSize: "cover" }
                                : transparent
                                  ? {
                                        backgroundImage:
                                            "repeating-conic-gradient(var(--border-subtle) 0% 25%, transparent 0% 50%)",
                                        backgroundSize: "8px 8px",
                                    }
                                  : { backgroundColor: swatch }
                        }
                    />
                </Button>
                <Input
                    type="text"
                    spellCheck={false}
                    aria-label="Hex"
                    value={hexDraft ?? (gradient ? "Gradient" : parts.hex)}
                    onChange={(e) => setHexDraft(e.target.value.toUpperCase())}
                    onBlur={() => {
                        if (hexDraft != null) commitHex(hexDraft);
                    }}
                    onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    disabled={gradient}
                />
                <div className="w-[68px] shrink-0">
                    <PxInput
                        glyph={<span>%</span>}
                        title="Opacity"
                        value={parts.alphaPct}
                        max={100}
                        onCommit={(n) => {
                            const a = Math.max(0, Math.min(100, n)) / 100;
                            const body = parts.hex.padStart(6, "0").slice(0, 6);
                            const aa = Math.round(a * 255).toString(16).padStart(2, "0");
                            onChange(toCssColor(a >= 1 ? `#${body}` : `#${body}${aa}`));
                        }}
                    />
                </div>
                {onToggleHidden ? (
                    <IconBtn title={hidden ? "Show" : "Hide"} active={hidden} onClick={onToggleHidden}>
                        <Icon name={hidden ? "visibility_off" : "visibility"} size={16} />
                    </IconBtn>
                ) : null}
                {onRemove ? (
                    <IconBtn title="Remove" onClick={onRemove}>
                        <Icon name="remove" size={13} />
                    </IconBtn>
                ) : null}
            </div>
            {open ? (
                <ColorPickerPortal
                    anchor={anchor}
                    color={transparent ? "#000000" : hex}
                    layoutWidth={360}
                    placement="left"
                    onChange={(c) => {
                        const css = toCssColor(c);
                        setLive(css);
                        onChange(css);
                    }}
                    onClose={() => {
                        setOpen(false);
                        setLive(null);
                    }}
                />
            ) : null}
        </>
    );
}

export function AlignMatrix({
    justify,
    align,
    onChange,
}: {
    justify: string;
    align: string;
    onChange: (justify: string, align: string) => void;
}) {
    const cols = ["flex-start", "center", "flex-end"] as const;
    const rows = ["flex-start", "center", "flex-end"] as const;
    return (
        <div className="grid h-[52px] w-[52px] shrink-0 grid-cols-3 grid-rows-3 gap-px rounded-md bg-panel-hover p-1">
            {rows.flatMap((a) =>
                cols.map((j) => {
                    const active = j === justify && a === align;
                    return (
                        <button
                            key={`${j}-${a}`}
                            type="button"
                            title={`${j} / ${a}`}
                            onClick={() => onChange(j, a)}
                            className="flex items-center justify-center"
                        >
                            <span
                                className={cn(
                                    "h-1.5 w-1.5 rounded-full",
                    active ? "bg-accent-text" : "bg-text-muted opacity-40",
                                )}
                            />
                        </button>
                    );
                }),
            )}
        </div>
    );
}

export function PadXY({
    x,
    y,
    onChange,
    independent,
    onToggleIndependent,
    values,
    onSide,
}: {
    x: number | null;
    y: number | null;
    onChange: (axis: "x" | "y", n: number) => void;
    independent: boolean;
    onToggleIndependent: () => void;
    values: { top: string; right: string; bottom: string; left: string };
    onSide: (side: "Top" | "Right" | "Bottom" | "Left", n: number) => void;
}) {
    if (independent) {
        return (
            <div className="flex min-w-0 flex-1 items-start gap-1">
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-1">
                    {(["left", "top", "right", "bottom"] as const).map((side) => (
                        <PxInput
                            key={side}
                            glyph={<PadGlyph side={side} />}
                            title={`Padding ${side}`}
                            value={parsePx(values[side])}
                            onCommit={(n) => onSide((side[0]!.toUpperCase() + side.slice(1)) as "Top" | "Right" | "Bottom" | "Left", n)}
                        />
                    ))}
                </div>
                <IconBtn title="Uniform padding" active onClick={onToggleIndependent}>
                    <Icon name="crop_square" size={13} />
                </IconBtn>
            </div>
        );
    }
    return (
        <div className="flex min-w-0 flex-1 items-center gap-1">
            <PxInput
                glyph={<PadGlyph side="left" />}
                title="Horizontal padding"
                value={x}
                onCommit={(n) => onChange("x", n)}
            />
            <PxInput
                glyph={<PadGlyph side="top" />}
                title="Vertical padding"
                value={y}
                onCommit={(n) => onChange("y", n)}
            />
            <IconBtn title="Independent padding" onClick={onToggleIndependent}>
                <Icon name="crop_square" size={13} />
            </IconBtn>
        </div>
    );
}

export function OpacityBlendRow({
    opacity,
    blend,
    onOpacity,
    onBlend,
}: {
    opacity: string;
    blend: string;
    onOpacity: (v: string) => void;
    onBlend: (v: string) => void;
}) {
    const percent = (() => {
        const n = parseFloat(opacity || "1");
        if (!Number.isFinite(n)) return 100;
        return n > 1 ? Math.round(n) : Math.round(n * 100);
    })();
    return (
        <div className="flex items-center gap-1">
            <div className="w-[72px] shrink-0">
                <PxInput
                    glyph={<span className="text-[9px]">%</span>}
                    title="Opacity"
                    value={percent}
                    onCommit={(n) => onOpacity(String(Math.max(0, Math.min(100, n)) / 100))}
                />
            </div>
            <Slider
                min={0}
                max={100}
                step={1}
                value={[percent]}
                onValueChange={(v) => onOpacity(String((v[0] ?? percent) / 100))}
                className="flex-1"
            />
            <CompactSelect
                value={blend || "normal"}
                options={[
                    { value: "normal", label: "Normal" },
                    { value: "multiply", label: "Multiply" },
                    { value: "screen", label: "Screen" },
                    { value: "overlay", label: "Overlay" },
                    { value: "darken", label: "Darken" },
                    { value: "lighten", label: "Lighten" },
                ]}
                onChange={onBlend}
                className="max-w-[96px] flex-none"
            />
        </div>
    );
}

export function RadiusSlider({
    value,
    onChange,
}: {
    value: string;
    onChange: (pxValue: string) => void;
}) {
    const current = Math.min(64, Math.max(0, parsePx(value) ?? 0));
    return (
        <div className="flex items-center gap-1.5">
            <Slider
                min={0}
                max={64}
                step={1}
                value={[current]}
                onValueChange={(v) => onChange(`${v[0] ?? current}px`)}
                className="flex-1"
            />
            <div className="w-14 shrink-0">
                <PxInput
                    glyph={<span className="text-[9px]">px</span>}
                    title="Radius"
                    value={current}
                    onCommit={(n) => onChange(`${n}px`)}
                />
            </div>
        </div>
    );
}

export { ToggleBtn, PxInput };

export type DesignEffectKind =
    | "drop-shadow"
    | "inner-shadow"
    | "layer-blur"
    | "background-blur"
    | "glass"
    | "noise"
    | "texture";

export type DesignEffect = {
    id: string;
    kind: DesignEffectKind;
    hidden?: boolean;
    blur: number;
    x?: number;
    y?: number;
    spread?: number;
    opacity?: number;
    color?: string;
};

const EFFECT_META: { kind: DesignEffectKind; label: string }[] = [
    { kind: "inner-shadow", label: "Inner shadow" },
    { kind: "drop-shadow", label: "Drop shadow" },
    { kind: "layer-blur", label: "Layer blur" },
    { kind: "background-blur", label: "Background blur" },
    { kind: "glass", label: "Glass" },
    { kind: "noise", label: "Noise" },
    { kind: "texture", label: "Texture" },
];

function EffectIcon({ kind }: { kind: DesignEffectKind }) {
    if (kind === "inner-shadow") {
        return (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <rect x="2.5" y="2.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4 4h6v1.4H5.4V10H4V4Z" fill="currentColor" opacity="0.45" />
            </svg>
        );
    }
    if (kind === "drop-shadow") {
        return (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <rect x="2" y="2" width="8" height="8" rx="1.2" fill="currentColor" opacity="0.28" />
                <rect x="4" y="4" width="8" height="8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
        );
    }
    if (kind === "layer-blur") {
        return (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                {[3, 7, 11].map((x) =>
                    [3, 7, 11].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.05" fill="currentColor" />),
                )}
            </svg>
        );
    }
    if (kind === "background-blur") {
        return (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                {[3, 5.5, 8, 10.5].flatMap((x) =>
                    [3, 5.5, 8, 10.5].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.85" fill="currentColor" />),
                )}
            </svg>
        );
    }
    if (kind === "glass") {
        return (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <rect x="2.5" y="2.5" width="9" height="9" rx="1.5" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4 8.5 8.5 4" stroke="currentColor" strokeWidth="1.1" opacity="0.7" />
            </svg>
        );
    }
    if (kind === "noise") {
        return (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                {Array.from({ length: 18 }, (_, i) => (
                    <circle key={i} cx={2 + ((i * 7) % 11)} cy={2 + ((i * 5) % 11)} r="0.7" fill="currentColor" />
                ))}
            </svg>
        );
    }
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            {Array.from({ length: 9 }, (_, i) => (
                <circle key={i} cx={3 + (i % 3) * 4} cy={3 + Math.floor(i / 3) * 4} r="1.2" fill="currentColor" opacity="0.7" />
            ))}
        </svg>
    );
}

function withOpacity(color: string, opacity: number) {
    const a = Math.max(0, Math.min(1, opacity));
    if (/\/\s*[\d.]+\s*\)/.test(color)) return color.replace(/\/\s*[\d.]+\s*\)/, `/ ${a})`);
    if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
        const hex = Math.round(a * 255).toString(16).padStart(2, "0");
        return `${color}${hex}`;
    }
    return `color-mix(in srgb, ${color} ${Math.round(a * 100)}%, transparent)`;
}

export function effectsToStyles(effects: DesignEffect[]): Partial<Record<"boxShadow" | "filter" | "backdropFilter", string>> {
    const visible = effects.filter((e) => !e.hidden);
    const shadows = visible
        .filter((e) => e.kind === "drop-shadow" || e.kind === "inner-shadow")
        .map((e) => {
            const inset = e.kind === "inner-shadow" ? "inset " : "";
            const color = withOpacity(e.color || "rgb(0 0 0 / 0.25)", e.opacity ?? 0.25);
            return `${inset}${e.x ?? 0}px ${e.y ?? 4}px ${e.blur}px ${e.spread ?? 0}px ${color}`;
        });
    const layerBlur = visible.find((e) => e.kind === "layer-blur");
    const noise = visible.find((e) => e.kind === "noise" || e.kind === "texture");
    const bgBlur = visible.find((e) => e.kind === "background-blur");
    const glass = visible.find((e) => e.kind === "glass");
    const filters: string[] = [];
    if (layerBlur) filters.push(`blur(${layerBlur.blur}px)`);
    if (noise) filters.push(`url(#shape-noise)`);
    if (noise && !layerBlur) filters.push(`contrast(1.05)`);
    const backdrop: string[] = [];
    if (bgBlur) backdrop.push(`blur(${bgBlur.blur}px)`);
    if (glass) {
        backdrop.push(`blur(${glass.blur}px)`);
        backdrop.push("saturate(180%)");
        backdrop.push("brightness(1.08)");
    }
    return {
        boxShadow: shadows.length ? shadows.join(", ") : "none",
        filter: filters.length ? filters.join(" ") : "none",
        backdropFilter: backdrop.length ? backdrop.join(" ") : "none",
    };
}

export function EffectsSection({
    effects,
    onChange,
}: {
    effects: DesignEffect[];
    onChange: (next: DesignEffect[]) => void;
}) {
    const [menu, setMenu] = React.useState(false);
    const add = (kind: DesignEffectKind) => {
        const shadow = kind.includes("shadow");
        onChange([
            ...effects,
            {
                id: `${kind}-${Date.now().toString(36)}`,
                kind,
                blur: kind === "glass" ? 20 : kind.includes("blur") ? 8 : 16,
                x: 0,
                y: shadow ? 4 : 0,
                spread: 0,
                opacity: shadow ? 0.25 : kind === "glass" ? 0.7 : 1,
                color: "rgb(0 0 0 / 0.25)",
            },
        ]);
        setMenu(false);
    };
    const patch = (id: string, next: Partial<DesignEffect>) =>
        onChange(effects.map((e) => (e.id === id ? { ...e, ...next } : e)));
    return (
        <div className="border-b border-border-subtle">
            <div className="flex h-8 items-center justify-between px-3">
                <span className="text-xs font-medium text-text-primary">Effects</span>
                <DropdownMenu modal={false} open={menu} onOpenChange={setMenu}>
                    <DropdownMenuTrigger asChild>
                        <SidebarPanelActionButton title="Add effect">
                            <Icon name="add" size={14} />
                        </SidebarPanelActionButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[200px]">
                        {EFFECT_META.map((item) => (
                            <DropdownMenuItem key={item.kind} onSelect={() => add(item.kind)}>
                                <span className="flex items-center gap-2 text-xs">
                                    <span className="text-text-muted">
                                        <EffectIcon kind={item.kind} />
                                    </span>
                                    {item.label}
                                </span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {effects.map((fx) => {
                const shadow = fx.kind === "drop-shadow" || fx.kind === "inner-shadow";
                return (
                    <div key={fx.id} className="flex flex-col gap-1.5 px-3 pb-3">
                        <div className="flex items-center gap-1.5">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-panel-hover text-text-muted">
                                <EffectIcon kind={fx.kind} />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                                {EFFECT_META.find((m) => m.kind === fx.kind)?.label}
                            </span>
                            <IconBtn
                                title={fx.hidden ? "Show" : "Hide"}
                                active={fx.hidden}
                                onClick={() => patch(fx.id, { hidden: !fx.hidden })}
                            >
                                <Icon name={fx.hidden ? "visibility_off" : "visibility"} size={13} />
                            </IconBtn>
                            <IconBtn title="Remove" onClick={() => onChange(effects.filter((e) => e.id !== fx.id))}>
                                <Icon name="remove" size={13} />
                            </IconBtn>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                            {shadow ? (
                                <>
                                    <PxInput
                                        glyph={<span className="text-[9px]">X</span>}
                                        title="X"
                                        value={fx.x ?? 0}
                                        onCommit={(n) => patch(fx.id, { x: n })}
                                    />
                                    <PxInput
                                        glyph={<span className="text-[9px]">Y</span>}
                                        title="Y"
                                        value={fx.y ?? 0}
                                        onCommit={(n) => patch(fx.id, { y: n })}
                                    />
                                </>
                            ) : null}
                            <PxInput
                                glyph={<span className="text-[9px]">Bl</span>}
                                title="Blur"
                                value={fx.blur}
                                onCommit={(n) => patch(fx.id, { blur: n })}
                            />
                            {shadow ? (
                                <PxInput
                                    glyph={<span className="text-[9px]">Sp</span>}
                                    title="Spread"
                                    value={fx.spread ?? 0}
                                    onCommit={(n) => patch(fx.id, { spread: n })}
                                />
                            ) : (
                                <PxInput
                                    glyph={<span className="text-[9px]">%</span>}
                                    title="Opacity"
                                    value={Math.round((fx.opacity ?? 1) * 100)}
                                    onCommit={(n) => patch(fx.id, { opacity: Math.max(0, Math.min(100, n)) / 100 })}
                                />
                            )}
                        </div>
                        {shadow ? (
                            <div className="flex items-center gap-1">
                                <div className="min-w-0 flex-1">
                                    <ColorRow
                                        cssValue={fx.color || "rgb(0 0 0 / 0.25)"}
                                        onChange={(c) => patch(fx.id, { color: c })}
                                    />
                                </div>
                                <div className="w-[64px]">
                                    <PxInput
                                        glyph={<span className="text-[9px]">%</span>}
                                        title="Opacity"
                                        value={Math.round((fx.opacity ?? 0.25) * 100)}
                                        onCommit={(n) => patch(fx.id, { opacity: Math.max(0, Math.min(100, n)) / 100 })}
                                    />
                                </div>
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}

export function SelectionColors({
    colors,
    onPick,
}: {
    colors: string[];
    onPick: (css: string) => void;
}) {
    if (colors.length < 2) return null;
    return (
        <Section title="Selection colors">
            <div className="flex flex-col gap-1">
                {colors.slice(0, 8).map((c, i) => {
                    const parts = colorParts(c);
                    return (
                        <Button
                            key={`${c}-${i}`}
                            type="button"
                            variant="secondary"
                            size="xs"
                            className="w-full justify-start"
                            onClick={() => onPick(c)}
                        >
                            <span
                                className="size-3.5 shrink-0 rounded-md border border-border"
                                style={{ backgroundColor: c }}
                            />
                            <span className="tabular-nums">{parts.hex}</span>
                        </Button>
                    );
                })}
            </div>
        </Section>
    );
}
