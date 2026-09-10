"use client";

import { RiAddLine, RiArrowDownSLine, RiCheckboxBlankLine, RiCloseLine, RiEyeLine, RiEyeOffLine, RiMore2Line, RiSubtractLine } from "@remixicon/react";
import React from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkmark } from "@/components/ui/checkmark";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { ColorPickerPortal, type PickerAnchor } from "@/features/editor/ui/color-picker/portal";
import {
    PxInput as PxInputBase,
    RadiusGlyph,
    ToggleBtn as ToggleBtnBase,
} from "@/features/editor/ui/tailwind-controls/tw-control-shared";
import { cn } from "@/lib/utils";
import { getCachedProjectColorVariables } from "@/lib/css-variables";
import {
    colorParts,
    cssColorToHex,
    isGradient,
    isTransparentColor,
    parsePx,
    toCssColor,
} from "../../design-mode/css";
import {
    colorStylesFromVariables,
    nearestColorToken,
} from "./styles-model";

/** Inspector chrome — one input height, even gutters. */
const FIELD_SHELL =
    "h-8 gap-1.5 rounded-lg border-border-subtle bg-input-bg px-2 shadow-none focus-within:border-border-focus focus-within:ring-0 hover:border-border";
const SEGMENT_SHELL = "rounded-lg border border-border-subtle bg-input-bg p-0.5";
const DIVIDER = "border-border-subtle";
const FIELD_CONTROL =
    "flex h-8 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-border-subtle bg-input-bg px-2 text-sm text-text-primary outline-none transition-colors hover:border-border focus-visible:border-border-focus";
const ICON_QUIET =
    "text-text-muted hover:bg-panel-hover hover:text-text-primary";

export function PxInput({ className, ...props }: React.ComponentProps<typeof PxInputBase>) {
    return <PxInputBase {...props} className={cn(FIELD_SHELL, className)} />;
}

export function ToggleBtn({ className, ...props }: React.ComponentProps<typeof ToggleBtnBase>) {
    return (
        <ToggleBtnBase
            {...props}
            className={cn(
                "h-8 rounded-md",
                props.active
                    ? "bg-panel-active text-text-primary"
                    : "text-text-muted hover:bg-panel-hover hover:text-text-primary",
                className,
            )}
        />
    );
}

/** Segmented group wrapper for `ToggleBtn` rows (align, case, style). */
export function Segment({ className, children }: { className?: string; children: React.ReactNode }) {
    return <div className={cn("flex min-w-0 flex-1", SEGMENT_SHELL, className)}>{children}</div>;
}

export function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
    return (
        <div
            className="grid transition-[grid-template-rows] duration-200 ease-out"
            style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        >
            <div className="min-h-0 overflow-hidden">
                <div className="pt-1">{children}</div>
            </div>
        </div>
    );
}

export function CornerGlyph({ corner }: { corner: "TL" | "TR" | "BL" | "BR" }) {
    const radius =
        corner === "TL" ? "5px 0 0 0" : corner === "TR" ? "0 5px 0 0" : corner === "BR" ? "0 0 5px 0" : "0 0 0 5px";
    return (
        <span
            aria-hidden
            className="inline-block h-3 w-3 shrink-0 border border-current opacity-80"
            style={{ borderRadius: radius }}
        />
    );
}

/** Four-corner control — distinct from the uniform radius (Radius) icon. */
export function IndependentCornersGlyph() {
    return (
        <span aria-hidden className="grid h-3 w-3 grid-cols-2 gap-px">
            <span className="rounded-[2px_0_0_0] border border-current" />
            <span className="rounded-[0_2px_0_0] border border-current" />
            <span className="rounded-[0_0_0_2px] border border-current" />
            <span className="rounded-[0_0_2px_0] border border-current" />
        </span>
    );
}

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
        <div className={cn("flex flex-col gap-2.5 border-b px-4 py-3.5", DIVIDER)}>
            <div className="flex h-6 items-center justify-between">
                <span className="text-sm font-medium text-text-secondary">{title}</span>
                {action ? <div className="flex items-center gap-1 text-text-muted">{action}</div> : null}
            </div>
            {children}
        </div>
    );
}

export function AddHeader({
    title,
    onAdd,
    expanded,
    onCollapse,
}: {
    title: string;
    onAdd?: () => void;
    expanded?: boolean;
    onCollapse?: () => void;
}) {
    const open = Boolean(expanded && onCollapse);
    return (
        <div className={cn("flex h-11 items-center justify-between border-b px-4", DIVIDER)}>
            <span className="text-sm text-text-secondary">{title}</span>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                title={`${open ? "Remove" : "Add"} ${title.toLowerCase()}`}
                className={ICON_QUIET}
                onClick={open ? onCollapse : onAdd}
            >
                <Icon icon={open ? RiSubtractLine : RiAddLine} />
            </Button>
        </div>
    );
}

export function CompactSelect({
    value,
    options,
    onChange,
    className,
    title,
}: {
    value: string;
    options: { value: string; label: string; icon?: React.ReactNode; style?: React.CSSProperties }[];
    onChange: (v: string) => void;
    className?: string;
    title?: string;
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
                <Button
                    type="button"
                    variant="ghost"
                    title={title}
                    className={cn(FIELD_CONTROL, "font-normal", className)}
                >
                    <span className="flex min-w-0 items-center gap-1.5">
                        {current?.icon}
                        <span className="truncate" style={current?.style}>{current?.label ?? value}</span>
                    </span>
                    <Icon icon={RiArrowDownSLine} className="shrink-0 opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-50">
                {opts.map((opt) => (
                    <DropdownMenuItem
                        key={opt.value}
                        onSelect={() => onChange(opt.value)}
                    >
                        <span className="flex items-center gap-2" style={opt.style}>
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
    return <span className="min-w-3 text-center text-xs font-medium text-text-muted">{children}</span>;
}

export function MicroLabel({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-xs text-text-muted">{label}</span>
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
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
    children: React.ReactNode;
}) {
    return (
        <Tooltip content={title} side="top" delayDuration={400}>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                title={title}
                onClick={onClick}
                className={cn(
                    "size-8 rounded-lg",
                    active
                        ? "bg-panel-active text-text-primary"
                        : ICON_QUIET,
                )}
            >
                {children}
            </Button>
        </Tooltip>
    );
}

export function FlyoutCard({
    title,
    anchor,
    onClose,
    trigger,
    className,
    children,
}: {
    title: string;
    anchor: DOMRect;
    onClose: () => void;
    trigger?: EventTarget | null;
    className?: string;
    children: React.ReactNode;
}) {
    const ref = React.useRef<HTMLDivElement>(null);
    const [style, setStyle] = React.useState<React.CSSProperties>(() => {
        if (typeof window === "undefined") return { top: 12, left: 12 };
        const gap = 8;
        const spaceLeft = anchor.left;
        const spaceRight = window.innerWidth - anchor.right;
        // Prefer the side with more room so right-panel triggers open over the canvas.
        if (spaceLeft >= spaceRight) {
            return { top: Math.max(12, anchor.top), right: Math.max(12, window.innerWidth - anchor.left + gap) };
        }
        return { top: Math.max(12, anchor.top), left: anchor.right + gap };
    });

    React.useLayoutEffect(() => {
        const el = ref.current;
        if (!el || typeof window === "undefined") return;
        const gap = 8;
        const w = el.offsetWidth || 288;
        const h = el.offsetHeight || 240;
        const spaceLeft = anchor.left;
        const spaceRight = window.innerWidth - anchor.right;
        const placeLeft = spaceLeft >= Math.max(spaceRight, w + gap);
        let top = anchor.top;
        if (top + h > window.innerHeight - 12) {
            top = Math.max(12, window.innerHeight - h - 12);
        }
        top = Math.max(12, Math.min(top, window.innerHeight - 48));
        if (placeLeft) {
            setStyle({ top, right: Math.max(12, window.innerWidth - anchor.left + gap) });
        } else {
            const left = Math.min(anchor.right + gap, window.innerWidth - w - 12);
            setStyle({ top, left: Math.max(12, left) });
        }
    }, [anchor]);

    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        const onDown = (e: MouseEvent) => {
            const t = e.target;
            if (!(t instanceof Element)) return;
            if (ref.current?.contains(t)) return;
            if (trigger instanceof Element && (trigger === t || trigger.contains(t))) return;
            if (t.closest("#shape-color-picker-widget, .shape-color-picker-widget, [data-radix-popper-content-wrapper], [data-shape-flyout]")) {
                return;
            }
            onClose();
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("mousedown", onDown);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("mousedown", onDown);
        };
    }, [onClose, trigger]);

    if (typeof document === "undefined") return null;
    return createPortal(
        <div
            ref={ref}
            data-shape-flyout=""
            className={cn(
                "fixed z-80 w-72 max-h-[min(480px,calc(100vh-24px))] overflow-y-auto rounded-xl border border-border-subtle bg-panel p-2.5 shadow-xl",
                className,
            )}
            style={style}
        >
            <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-text-secondary">{title}</span>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Close"
                    className={ICON_QUIET}
                    onClick={onClose}
                >
                    <Icon icon={RiCloseLine} />
                </Button>
            </div>
            <div className="flex flex-col gap-1.5">{children}</div>
        </div>,
        document.body,
    );
}

export function CheckRow({
    label,
    checked,
    onChange,
    title,
}: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    title?: string;
}) {
    return (
        <div
            title={title}
            className="flex h-8 select-none items-center gap-2.5 text-sm text-text-muted hover:text-text-primary"
        >
            <Checkmark checked={checked} onCheckedChange={(v) => onChange(v === true)} />
            <span className="cursor-pointer" onClick={() => onChange(!checked)}>{label}</span>
        </div>
    );
}

export function DimGrid({ children }: { children: React.ReactNode }) {
    return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-h-8 items-center gap-3">
            <span className="w-16 shrink-0 text-sm leading-none text-text-muted">{label}</span>
            <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
        </div>
    );
}

/** Figma-style fill/stroke row: swatch | hex | opacity | eye | remove. Picker docks left of the swatch. */
export function ColorRow({
    cssValue,
    onChange,
    onRemove,
    hidden,
    onToggleHidden,
    /** When true (default), exact/near token matches commit as `var(--token)` instead of a raw color. */
    snapToTokens = true,
}: {
    cssValue: string;
    onChange: (cssColor: string) => void;
    onRemove?: () => void;
    hidden?: boolean;
    onToggleHidden?: () => void;
    snapToTokens?: boolean;
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

    const emitColor = (raw: string, opts?: { snap?: boolean }) => {
        const shouldSnap = opts?.snap !== false && snapToTokens;
        if (!shouldSnap || isGradient(raw) || isTransparentColor(raw)) {
            onChange(raw);
            return;
        }
        try {
            const tokens = colorStylesFromVariables(getCachedProjectColorVariables());
            const hit = nearestColorToken(raw, tokens, { maxDistance: 8 });
            if (hit) {
                onChange(`var(${hit.cssVar})`);
                return;
            }
        } catch {
            /* ignore cache misses */
        }
        onChange(raw);
    };

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
        emitColor(toCssColor(next), { snap: true });
    };

    return (
        <>
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    title="Color"
                    className="shape-swatch-design flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-input-bg outline-none transition-colors hover:border-border focus-visible:border-border-focus"
                    onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setAnchor({ x: r.left, y: r.top });
                        setLive(display);
                        setOpen(true);
                    }}
                >
                    <span
                        className="h-4 w-4 rounded-md border border-border-subtle"
                        style={
                            gradient
                                ? { backgroundImage: display, backgroundSize: "cover" }
                                : transparent
                                  ? {
                                        backgroundImage:
                                            "repeating-conic-gradient(rgba(255,255,255,0.18) 0% 25%, transparent 0% 50%)",
                                        backgroundSize: "8px 8px",
                                    }
                                  : { backgroundColor: swatch }
                        }
                    />
                </button>
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
                    className="h-8 min-w-0 flex-1 rounded-lg px-2 text-sm tabular-nums"
                />
                <div className="w-16 shrink-0">
                    <PxInput
                        glyph={<span className="text-[9px]">%</span>}
                        title="Opacity"
                        value={parts.alphaPct}
                        max={100}
                        onCommit={(n) => {
                            const a = Math.max(0, Math.min(100, n)) / 100;
                            const body = parts.hex.padStart(6, "0").slice(0, 6);
                            const aa = Math.round(a * 255).toString(16).padStart(2, "0");
                            emitColor(toCssColor(a >= 1 ? `#${body}` : `#${body}${aa}`), { snap: true });
                        }}
                    />
                </div>
                {onToggleHidden ? (
                    <IconBtn title={hidden ? "Show" : "Hide"} active={hidden} onClick={onToggleHidden}>
                        <Icon icon={hidden ? RiEyeOffLine : RiEyeLine} />
                    </IconBtn>
                ) : null}
                {onRemove ? (
                    <IconBtn title="Remove" onClick={onRemove}>
                        <Icon icon={RiSubtractLine} />
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
                        emitColor(css, { snap: false });
                    }}
                    onClose={() => {
                        if (live) emitColor(live, { snap: true });
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
        <div className="grid size-18 shrink-0 grid-cols-3 grid-rows-3 gap-0.5 rounded-lg border border-border-subtle bg-input-bg p-1.5">
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
                                    "size-2 rounded-full",
                                    active ? "bg-accent" : "bg-border",
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
            <div className="flex min-w-0 flex-1 items-start gap-2">
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                    {(["left", "top", "right", "bottom"] as const).map((side) => (
                        <PxInput
                            key={side}
                            glyph={<Glyph>{side[0]!.toUpperCase()}</Glyph>}
                            title={`Padding ${side}`}
                            value={parsePx(values[side])}
                            onCommit={(n) => onSide((side[0]!.toUpperCase() + side.slice(1)) as "Top" | "Right" | "Bottom" | "Left", n)}
                        />
                    ))}
                </div>
                <IconBtn title="Uniform padding" active onClick={onToggleIndependent}>
                    <Icon icon={RiCheckboxBlankLine} />
                </IconBtn>
            </div>
        );
    }
    return (
        <div className="flex min-w-0 flex-1 items-center gap-2">
            <PxInput
                glyph={<Glyph>X</Glyph>}
                title="Horizontal padding"
                value={x}
                onCommit={(n) => onChange("x", n)}
            />
            <PxInput
                glyph={<Glyph>Y</Glyph>}
                title="Vertical padding"
                value={y}
                onCommit={(n) => onChange("y", n)}
            />
            <IconBtn title="Independent padding" onClick={onToggleIndependent}>
                <Icon icon={RiCheckboxBlankLine} />
            </IconBtn>
        </div>
    );
}

/** Paper-style blending row: opacity % + blend mode dropdown (no ruler / no opacity slider). */
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
        <div className="flex items-center gap-2">
            <PxInput
                glyph={<span className="text-[9px]">%</span>}
                title="Opacity"
                value={percent}
                max={100}
                onCommit={(n) => onOpacity(String(Math.max(0, Math.min(100, n)) / 100))}
                className="min-w-0 flex-1"
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
                className="min-w-0 flex-1"
            />
        </div>
    );
}

export { RadiusGlyph };

export type DesignEffectKind =
    | "drop-shadow"
    | "inner-shadow"
    | "layer-blur"
    | "background-blur";

export type DesignEffect = {
    id: string;
    kind: DesignEffectKind;
    hidden?: boolean;
    blur: number;
    startBlur?: number;
    x?: number;
    y?: number;
    spread?: number;
    opacity?: number;
    color?: string;
    progressive?: boolean;
    progressiveAngle?: number;
};

const EFFECT_META: { kind: DesignEffectKind; label: string }[] = [
    { kind: "inner-shadow", label: "Inner shadow" },
    { kind: "drop-shadow", label: "Drop shadow" },
    { kind: "layer-blur", label: "Layer blur" },
    { kind: "background-blur", label: "Background blur" },
];

function withOpacity(color: string, opacity: number) {
    const a = Math.max(0, Math.min(1, opacity));
    if (/\/\s*[\d.]+\s*\)/.test(color)) return color.replace(/\/\s*[\d.]+\s*\)/, `/ ${a})`);
    if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
        const hex = Math.round(a * 255).toString(16).padStart(2, "0");
        return `${color}${hex}`;
    }
    return `color-mix(in srgb, ${color} ${Math.round(a * 100)}%, transparent)`;
}

export function effectsToStyles(effects: DesignEffect[]): Record<string, string> {
    const visible = effects.filter((e) => !e.hidden);
    const shadows = visible
        .filter((e) => e.kind === "drop-shadow" || e.kind === "inner-shadow")
        .map((e) => {
            const inset = e.kind === "inner-shadow" ? "inset " : "";
            const color = withOpacity(e.color || "rgb(0 0 0 / 0.25)", e.opacity ?? 0.25);
            return `${inset}${e.x ?? 0}px ${e.y ?? 4}px ${e.blur}px ${e.spread ?? 0}px ${color}`;
        });
    const layerBlur = visible.find((e) => e.kind === "layer-blur");
    const bgBlur = visible.find((e) => e.kind === "background-blur");
    const progressive = [layerBlur, bgBlur].find((e) => e?.progressive);
    const filters: string[] = [];
    if (layerBlur && !layerBlur.progressive) filters.push(`blur(${layerBlur.blur}px)`);
    const backdrop: string[] = [];
    if (bgBlur && !bgBlur.progressive) backdrop.push(`blur(${bgBlur.blur}px)`);
    const out: Record<string, string> = {
        boxShadow: shadows.length ? shadows.join(", ") : "none",
        filter: filters.length ? filters.join(" ") : "none",
        backdropFilter: backdrop.length ? backdrop.join(" ") : "none",
        maskImage: "none",
        WebkitMaskImage: "none",
        "--shape-prog-start": progressive ? `${progressive.startBlur ?? 0}px` : "",
        "--shape-prog-blur": progressive ? `${progressive.blur}px` : "",
        "--shape-prog-angle": progressive ? `${progressive.progressiveAngle ?? 180}deg` : "",
        "--shape-prog-mode": progressive ? (progressive.kind === "background-blur" ? "backdrop" : "layer") : "",
    };
    return out;
}

export function EffectsSection({
    effects,
    onChange,
}: {
    effects: DesignEffect[];
    onChange: (next: DesignEffect[]) => void;
}) {
    const [menu, setMenu] = React.useState(false);
    const [openId, setOpenId] = React.useState<string | null>(null);
    const [anchor, setAnchor] = React.useState<DOMRect | null>(null);
    const triggerRef = React.useRef<HTMLElement | null>(null);
    const add = (kind: DesignEffectKind) => {
        const shadow = kind.includes("shadow");
        const id = `${kind}-${Date.now().toString(36)}`;
        onChange([
            ...effects,
            {
                id,
                kind,
                blur: kind.includes("blur") ? 8 : 16,
                startBlur: 0,
                x: 0,
                y: shadow ? 4 : 0,
                spread: 0,
                opacity: shadow ? 0.25 : 1,
                color: "rgb(0 0 0 / 0.25)",
            },
        ]);
        setMenu(false);
    };
    const patch = (id: string, next: Partial<DesignEffect>) =>
        onChange(effects.map((e) => (e.id === id ? { ...e, ...next } : e)));
    const dragId = React.useRef<string | null>(null);
    const move = (fromId: string, toId: string) => {
        if (fromId === toId) return;
        const from = effects.findIndex((e) => e.id === fromId);
        const to = effects.findIndex((e) => e.id === toId);
        if (from < 0 || to < 0) return;
        const next = effects.slice();
        const [item] = next.splice(from, 1);
        if (!item) return;
        next.splice(to, 0, item);
        onChange(next);
    };
    const openFx = effects.find((e) => e.id === openId);
    const shadow = openFx && (openFx.kind === "drop-shadow" || openFx.kind === "inner-shadow");
    const blurKind = openFx && (openFx.kind === "layer-blur" || openFx.kind === "background-blur");
    return (
        <div className={cn("border-b", DIVIDER)}>
            <div className={cn("flex h-11 items-center justify-between px-4", effects.length > 0 && `border-b ${DIVIDER}`)}>
                <span className="text-sm text-text-secondary">Effects</span>
                <DropdownMenu modal={false} open={menu} onOpenChange={setMenu}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Add effect"
                            className={ICON_QUIET}
                        >
                            <Icon icon={RiAddLine} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-50">
                        {EFFECT_META.map((item) => (
                            <DropdownMenuItem key={item.kind} onSelect={() => add(item.kind)}>
                                <span className="text-xs">{item.label}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {effects.map((fx) => (
                <div
                    key={fx.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 first:pt-2 last:pb-2"
                    draggable
                    onDragStart={() => {
                        dragId.current = fx.id;
                    }}
                    onDragOver={(e) => {
                        e.preventDefault();
                    }}
                    onDrop={(e) => {
                        e.preventDefault();
                        if (dragId.current) move(dragId.current, fx.id);
                        dragId.current = null;
                    }}
                >
                    <span className="cursor-grab text-text-muted hover:text-text-secondary" title="Drag to reorder">
                        <Icon icon={RiMore2Line} />
                    </span>
                    <button
                        type="button"
                        className={cn(
                            "flex h-8 min-w-0 flex-1 items-center rounded-lg border px-2 text-left text-sm text-text-primary transition-colors",
                            openId === fx.id
                                ? "border-border bg-panel-active"
                                : "border-border-subtle bg-input-bg hover:border-border",
                        )}
                        onClick={(e) => {
                            triggerRef.current = e.currentTarget;
                            setAnchor(e.currentTarget.getBoundingClientRect());
                            setOpenId(fx.id);
                        }}
                    >
                        {EFFECT_META.find((m) => m.kind === fx.kind)?.label}
                    </button>
                    <IconBtn
                        title={fx.hidden ? "Show" : "Hide"}
                        active={fx.hidden}
                        onClick={() => patch(fx.id, { hidden: !fx.hidden })}
                    >
                        <Icon icon={fx.hidden ? RiEyeOffLine : RiEyeLine} />
                    </IconBtn>
                    <IconBtn
                        title="Remove"
                        onClick={() => {
                            if (openId === fx.id) setOpenId(null);
                            onChange(effects.filter((e) => e.id !== fx.id));
                        }}
                    >
                        <Icon icon={RiSubtractLine} />
                    </IconBtn>
                </div>
            ))}
            {openFx && anchor ? (
                <FlyoutCard
                    title={EFFECT_META.find((m) => m.kind === openFx.kind)?.label ?? "Effect"}
                    anchor={anchor}
                    trigger={triggerRef.current}
                    onClose={() => setOpenId(null)}
                >
                    {shadow ? (
                        <FieldRow label="Position">
                            <PxInput glyph={<Glyph>X</Glyph>} title="X" value={openFx.x ?? 0} onCommit={(n) => patch(openFx.id, { x: n })} />
                            <PxInput glyph={<Glyph>Y</Glyph>} title="Y" value={openFx.y ?? 0} onCommit={(n) => patch(openFx.id, { y: n })} />
                        </FieldRow>
                    ) : null}
                    {blurKind && openFx.progressive ? (
                        <>
                            <FieldRow label="Start">
                                <PxInput
                                    glyph={<Glyph>S</Glyph>}
                                    title="Start blur"
                                    value={openFx.startBlur ?? 0}
                                    onCommit={(n) => patch(openFx.id, { startBlur: n })}
                                />
                            </FieldRow>
                            <FieldRow label="End">
                                <PxInput glyph={<Glyph>E</Glyph>} title="End blur" value={openFx.blur} onCommit={(n) => patch(openFx.id, { blur: n })} />
                            </FieldRow>
                        </>
                    ) : (
                        <FieldRow label="Blur">
                            <PxInput glyph={<Glyph>B</Glyph>} title="Blur" value={openFx.blur} onCommit={(n) => patch(openFx.id, { blur: n })} />
                        </FieldRow>
                    )}
                    {shadow ? (
                        <FieldRow label="Spread">
                            <PxInput
                                glyph={<Glyph>S</Glyph>}
                                title="Spread"
                                value={openFx.spread ?? 0}
                                onCommit={(n) => patch(openFx.id, { spread: n })}
                            />
                        </FieldRow>
                    ) : (
                        <FieldRow label="Opacity">
                            <PxInput
                                glyph={<Glyph>%</Glyph>}
                                title="Opacity"
                                value={Math.round((openFx.opacity ?? 1) * 100)}
                                onCommit={(n) => patch(openFx.id, { opacity: Math.max(0, Math.min(100, n)) / 100 })}
                            />
                        </FieldRow>
                    )}
                    {shadow ? (
                        <FieldRow label="Color">
                            <ColorRow cssValue={openFx.color || "rgb(0 0 0 / 0.25)"} onChange={(c) => patch(openFx.id, { color: c })} />
                        </FieldRow>
                    ) : null}
                    {blurKind ? (
                        <CheckRow
                            label="Progressive blur"
                            checked={!!openFx.progressive}
                            onChange={(v) => patch(openFx.id, { progressive: v })}
                        />
                    ) : null}
                    {blurKind && openFx.progressive ? (
                        <FieldRow label="Direction">
                            <PxInput
                                glyph={<Glyph>°</Glyph>}
                                title="Blur falloff angle"
                                value={openFx.progressiveAngle ?? 180}
                                min={0}
                                max={360}
                                onCommit={(n) => patch(openFx.id, { progressiveAngle: n })}
                            />
                        </FieldRow>
                    ) : null}
                </FlyoutCard>
            ) : null}
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
    if (colors.length === 0) return null;
    const counts = new Map<string, { css: string; count: number }>();
    for (const c of colors) {
        const key = cssColorToHex(c).toUpperCase();
        const prev = counts.get(key);
        if (prev) prev.count += 1;
        else counts.set(key, { css: c, count: 1 });
    }
    const rows = [...counts.values()].slice(0, 8);
    if (rows.length === 0) return null;
    return (
        <Section title="Selection colors">
            <div className="flex flex-col gap-1">
                {rows.map(({ css, count }) => {
                    const parts = colorParts(css);
                    return (
                        <button
                            key={parts.hex}
                            type="button"
                            className="flex h-8 items-center gap-2 rounded-lg border border-border-subtle bg-input-bg px-2 text-left transition-colors hover:border-border"
                            onClick={() => onPick(css)}
                        >
                            <span
                                className="size-4 shrink-0 rounded-md border border-border-subtle"
                                style={{ backgroundColor: css }}
                            />
                            <span className="min-w-0 flex-1 text-sm tabular-nums text-text-primary">
                                {parts.hex}
                            </span>
                            <span className="text-sm tabular-nums text-text-muted">{parts.alphaPct}%</span>
                            <span className="text-xs tabular-nums text-text-muted">{count}</span>
                        </button>
                    );
                })}
            </div>
        </Section>
    );
}
