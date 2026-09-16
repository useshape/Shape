"use client";

import {
    RiAddLine,
    RiAlignCenter,
    RiAlignJustify,
    RiAlignLeft,
    RiAlignRight,
    RiAlignVertically,
    RiArrowDownLine,
    RiArrowDownSLine,
    RiArrowRightLine,
    RiArrowRightSLine,
    RiArrowUpDownLine,
    RiCheckboxBlankLine,
    RiCheckboxLine,
    RiCloseLine,
    RiCodeLine,
    RiContrastDropLine,
    RiDeleteBinLine,
    RiExpandDiagonalLine,
    RiExpandHeightLine,
    RiExpandWidthLine,
    RiEyeLine,
    RiEyeOffLine,
    RiFilterLine,
    RiFontFamily,
    RiFontSize,
    RiFocusLine,
    RiLayoutRowLine,
    RiLink,
    RiMoreLine,
    RiResetRightLine,
    RiSearchLine,
    RiShadowLine,
    RiSpace,
    RiSubtractLine,
    RiTextDirectionL,
    RiTextSpacing,
    RiTextWrap,
} from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";
import { useEffect, useState } from "react";
import { Button, ButtonGroup } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Icon, ICON_SIZE_MD, ICON_SIZE_SM } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll";
import { Slider } from "@/components/ui/slider";
import { SHAPE_API_BASE } from "@/lib/cloud/api";
import { useShapeAuth } from "@/lib/cloud/store";
import { useGitHubAuth } from "@/lib/github/store";
import { cn } from "@/lib/utils";
import type { DesignElementSnapshot } from "./bridge";
import {
    cssColorToHex,
    defaultFilterAmount,
    identityFilterAmount,
    parseBoxShadow,
    parseCssFunctions,
    serializeBoxShadow,
    serializeCssFunctions,
    type CssFunction,
} from "./css";

type Styles = Record<string, string>;

const FONT_FAMILIES = [
    "Arial",
    "Georgia",
    "Geist",
    "IBM Plex Mono",
    "Inter",
    "System Sans-Serif",
    "Tahoma",
    "Times New Roman",
    "Verdana",
];

const WEIGHTS = [
    ["100", "Thin"],
    ["200", "Extra Light"],
    ["300", "Light"],
    ["400", "Regular"],
    ["500", "Medium"],
    ["600", "Semibold"],
    ["700", "Bold"],
    ["800", "Heavy"],
    ["900", "Black"],
] as const;

const FILTER_OPTIONS = [
    ["blur", "Blur"],
    ["brightness", "Brightness"],
    ["contrast", "Contrast"],
    ["grayscale", "Grayscale"],
    ["hue-rotate", "Hue rotate"],
    ["invert", "Invert"],
    ["saturate", "Saturation"],
    ["sepia", "Sepia"],
] as const;

function css(style: Styles, property: string, fallback = "") {
    const value = style[property];
    return typeof value === "string" && value.length > 0 ? value : fallback;
}

function FilterStack({
    property,
    items,
    onPreview,
    onCommit,
}: {
    property: "filter" | "backdrop-filter";
    items: CssFunction[];
    onPreview: (styles: Styles) => void;
    onCommit: (styles: Styles) => void;
}) {
    const write = (next: CssFunction[], commit = true) => {
        const css = serializeCssFunctions(next);
        onPreview({ [property]: css });
        if (commit) onCommit({ [property]: css });
    };
    return (
        <>
            {items.map((item, index) => {
                const hidden = item.amount === identityFilterAmount(item.type);
                return (
                    <div key={`${property}-${index}-${item.type}`} className="flex h-6 items-stretch gap-1">
                        <SelectField
                            icon={RiFilterLine}
                            value={item.type}
                            options={[...FILTER_OPTIONS]}
                            onChange={(type) => {
                                const next = items.slice();
                                next[index] = { type, amount: defaultFilterAmount(type) };
                                write(next);
                            }}
                        />
                        <Field
                            icon={RiContrastDropLine}
                            value={item.amount}
                            property={property}
                            mapValue={(amount) =>
                                serializeCssFunctions(
                                    items.map((current, currentIndex) =>
                                        currentIndex === index ? { ...current, amount } : current,
                                    ),
                                )
                            }
                            onPreview={onPreview}
                            onCommit={onCommit}
                        />
                        <IconButton
                            label={hidden ? "Show filter" : "Hide filter"}
                            icon={hidden ? RiEyeOffLine : RiEyeLine}
                            active={!hidden}
                            onClick={() => {
                                const next = items.slice();
                                next[index] = {
                                    ...item,
                                    amount: hidden
                                        ? defaultFilterAmount(item.type)
                                        : identityFilterAmount(item.type),
                                };
                                write(next);
                            }}
                        />
                        <IconButton
                            label="Remove filter"
                            icon={RiSubtractLine}
                            onClick={() => write(items.filter((_, currentIndex) => currentIndex !== index))}
                        />
                    </div>
                );
            })}
        </>
    );
}

function ExportBlock({
    onExport,
}: {
    onExport: (scale: number, format: string) => Promise<void>;
}) {
    const [scale, setScale] = useState("2");
    const [format, setFormat] = useState("webp");
    const [busy, setBusy] = useState(false);
    return (
        <PanelSection title="Export">
            <div className="flex h-6 items-stretch gap-1">
                <SelectField
                    value={`${scale}x`}
                    options={["1x", "2x", "3x"]}
                    onChange={(value) => setScale(value.replace("x", ""))}
                />
                <SelectField
                    value={format}
                    options={[
                        ["png", "PNG"],
                        ["jpg", "JPG"],
                        ["avif", "AVIF"],
                        ["webp", "WebP"],
                        ["pdf", "PDF"],
                    ]}
                    onChange={setFormat}
                />
            </div>
            <Button
                variant="secondary"
                size="xs"
                loading={busy}
                className={cn(CONTROL, "w-full")}
                onClick={() => {
                    setBusy(true);
                    void onExport(Number(scale) || 2, format).finally(() => setBusy(false));
                }}
            >
                Export
            </Button>
        </PanelSection>
    );
}

function UserAvatar() {
    const auth = useShapeAuth();
    const github = useGitHubAuth();
    const [failed, setFailed] = useState(false);
    if (!auth.loggedIn || auth.offline || failed) return null;
    const src =
        (github.loggedIn && github.avatarUrl ? github.avatarUrl : null)
        ?? (auth.userId ? `${SHAPE_API_BASE}/api/avatar/${auth.userId}` : null);
    if (!src) return null;
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt=""
            className="size-5.5 rounded-full object-cover"
            onError={() => setFailed(true)}
        />
    );
}

/** Inspector control height — keep in sync with panel rows; do not shrink. */
const CONTROL = "h-8 min-h-8 text-sm leading-none";

function Field({
    label,
    icon,
    value,
    property,
    onPreview,
    onCommit,
    className,
    mapValue = (next) => next,
}: {
    label?: string;
    icon?: RemixiconComponentType;
    value?: string;
    property: string;
    onPreview: (styles: Styles) => void;
    onCommit: (styles: Styles) => void;
    className?: string;
    mapValue?: (value: string) => string;
}) {
    const [draft, setDraft] = useState(value ?? "");
    useEffect(() => {
        setDraft(value ?? "");
    }, [value]);
    const hasPrefix = Boolean(label || icon);
    const scrub = (event: React.PointerEvent<HTMLDivElement>) => {
        const match = (draft ?? "").trim().match(/^(-?\d*\.?\d+)(.*)$/);
        if (!match) return;
        event.preventDefault();
        event.stopPropagation();
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        const startX = event.clientX;
        const startValue = Number.parseFloat(match[1] ?? "0");
        const inferredLength =
            /^(left|right|top|bottom|width|height|gap|column-gap|row-gap|padding|font-size|line-height|letter-spacing|border|text-underline|filter|rotate|blur)/.test(
                property,
            );
        const unit = match[2] || (inferredLength ? "px" : "");
        const precision = event.shiftKey ? 0.1 : 1;
        let latest = draft;
        const move = (pointer: PointerEvent) => {
            const next = Math.round((startValue + (pointer.clientX - startX) * precision) * 10) / 10;
            latest = `${next}${unit}`;
            setDraft(latest);
            onPreview({ [property]: mapValue(latest) });
        };
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            onCommit({ [property]: mapValue(latest) });
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up, { once: true });
    };
    // shadcn Input Group pattern: flex row + inline-start addon (not absolute).
    // https://ui.shadcn.com/docs/components/base/input-group
    return (
        <div
            role="group"
            className={cn(
                "relative flex min-w-0 flex-1 items-center overflow-hidden rounded-md border border-border bg-panel-hover",
                CONTROL,
                className,
            )}
        >
            {hasPrefix ? (
                <div
                    role="presentation"
                    data-align="inline-start"
                    onPointerDown={scrub}
                    className="order-first flex h-full shrink-0 cursor-ew-resize items-center justify-center pl-2 text-text-muted"
                >
                    {icon ? (
                        <Icon icon={icon} size={ICON_SIZE_MD} />
                    ) : (
                        <span className="text-sm font-medium leading-none">{label}</span>
                    )}
                </div>
            ) : null}
            <Input
                value={draft}
                onChange={(event) => {
                    setDraft(event.target.value);
                    onPreview({ [property]: mapValue(event.target.value) });
                }}
                onBlur={() => {
                    if (draft !== value) onCommit({ [property]: mapValue(draft) });
                }}
                onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                }}
                className={cn(
                    "h-full min-h-0 flex-1 rounded-none border-0 bg-transparent py-0 text-xs font-normal tabular-nums shadow-none ring-0 focus-visible:border-transparent focus-visible:ring-0",
                    hasPrefix ? "pl-1.5 pr-5" : "pl-2 pr-5",
                )}
                spellCheck={false}
                aria-label={property}
            />
            <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-5 rounded-r-md bg-linear-to-r from-transparent to-panel-hover"
            />
        </div>
    );
}

function SelectField({
    value,
    options,
    onChange,
    className,
}: {
    label?: string;
    icon?: RemixiconComponentType;
    value: string;
    options: Array<string | readonly [string, string]>;
    onChange: (value: string) => void;
    className?: string;
}) {
    const display =
        options.find((option) => (Array.isArray(option) ? option[0] === value : option === value));
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="secondary"
                    size="xs"
                    className={cn(
                        CONTROL,
                        "min-w-0 flex-1 justify-start border border-input-border bg-surface-3 px-2 text-text-primary",
                        className,
                    )}
                >
                    <span className="min-w-0 flex-1 truncate text-left font-medium">
                        {Array.isArray(display) ? display[1] : display || value || "Auto"}
                    </span>
                    <Icon icon={RiArrowDownSLine} size={ICON_SIZE_SM} className="shrink-0 text-text-muted" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-44">
                {options.map((option) => {
                    const optionValue = Array.isArray(option) ? option[0] : option;
                    const optionLabel = Array.isArray(option) ? option[1] : option;
                    return (
                        <DropdownMenuItem key={optionValue} onClick={() => onChange(optionValue)}>
                            {optionLabel}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function FontField({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) {
    const [query, setQuery] = useState("");
    const visible = FONT_FAMILIES.filter((font) =>
        font.toLowerCase().includes(query.trim().toLowerCase()),
    );
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="secondary"
                    size="xs"
                    className={cn(CONTROL, "w-full justify-start border border-input-border bg-surface-3 px-1.5 text-text-primary")}
                >
                    <span className="min-w-0 flex-1 truncate text-left font-medium">{value}</span>
                    <Icon icon={RiArrowDownSLine} size={ICON_SIZE_SM} className="text-text-muted" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                side="left"
                align="start"
                sideOffset={10}
                className="w-72 overflow-hidden rounded-lg bg-surface-4 border border-border p-0"
            >
                <div className="p-2">
                    <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-6 items-center justify-center text-text-muted">
                            <Icon icon={RiSearchLine} size={ICON_SIZE_SM} />
                        </span>
                        <Input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={(event) => event.stopPropagation()}
                            placeholder="Search fonts"
                            className={cn(CONTROL, "border-border bg-surface-3 pl-6 pr-2")}
                            autoFocus
                        />
                    </div>
                </div>
                <div className="max-h-96 overflow-y-auto p-1">
                    {visible.map((font) => (
                        <DropdownMenuItem
                            key={font}
                            onClick={() => onChange(font)}
                            className={cn(
                                "h-9 text-base",
                                font === value && "bg-panel-active",
                            )}
                            style={{
                                fontFamily:
                                    font === "System Sans-Serif"
                                        ? "system-ui, sans-serif"
                                        : font,
                            }}
                        >
                            {font}
                        </DropdownMenuItem>
                    ))}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function IconButton({
    label,
    active,
    onClick,
    icon,
}: {
    label: string;
    active?: boolean;
    onClick?: () => void;
    icon: RemixiconComponentType;
}) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            icon={icon}
            aria-label={label}
            title={label}
            onClick={onClick}
            selected={active}
        />
    );
}

function Segment({
    items,
    value,
    onChange,
}: {
    items: Array<{ value: string; label?: string; icon?: RemixiconComponentType; title: string }>;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <ButtonGroup className={cn(CONTROL, "min-w-0 flex-1")}>
            {items.map((item) => (
                <Button
                    key={item.value}
                    variant="secondary"
                    size={item.label ? "xs" : "icon"}
                    icon={item.icon}
                    title={item.title}
                    onClick={() => onChange(item.value)}
                    selected={value === item.value}
                    className={cn(
                        CONTROL,
                        "min-w-0 flex-1 border border-border px-1.5",
                        !item.label && "px-0",
                    )}
                >
                    {item.label}
                </Button>
            ))}
        </ButtonGroup>
    );
}

const FLEX_POINTS = [
    ["flex-start", "flex-start"],
    ["center", "flex-start"],
    ["flex-end", "flex-start"],
    ["flex-start", "center"],
    ["center", "center"],
    ["flex-end", "center"],
    ["flex-start", "flex-end"],
    ["center", "flex-end"],
    ["flex-end", "flex-end"],
] as const;

function FlexAlignmentGrid({
    justify,
    align,
    direction,
    onChange,
}: {
    justify: string;
    align: string;
    direction: string;
    onChange: (justify: string, align: string) => void;
}) {
    const column = direction === "column" || direction === "column-reverse";
    return (
        <div className="grid size-22 shrink-0 grid-cols-3 grid-rows-3 overflow-hidden rounded-md bg-surface-4 border border-border p-1 text-text-muted">
            {FLEX_POINTS.map(([nextJustify, nextAlign]) => {
                const selected = justify === nextJustify && align === nextAlign;
                return (
                    <button
                        key={`${nextJustify}-${nextAlign}`}
                        type="button"
                        aria-label={`Align ${nextJustify} ${nextAlign}`}
                        onClick={() => onChange(nextJustify, nextAlign)}
                        className="flex size-full min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-sm hover:bg-current/10"
                    >
                        {selected ? (
                            <span
                                className={cn(
                                    "flex max-h-full max-w-full gap-px text-accent",
                                    column ? "flex-col" : "flex-row",
                                    nextJustify === "center" && (column ? "items-center" : "justify-center"),
                                    nextJustify === "flex-end" && (column ? "items-end" : "justify-end"),
                                    nextJustify === "flex-start" && (column ? "items-start" : "justify-start"),
                                    nextAlign === "center" && (column ? "justify-center" : "items-center"),
                                    nextAlign === "flex-end" && (column ? "justify-end" : "items-end"),
                                    nextAlign === "flex-start" && (column ? "justify-start" : "items-start"),
                                )}
                            >
                                <span className={cn("rounded-[1px] bg-current", column ? "h-px w-1.5" : "h-1.5 w-px")} />
                                <span className={cn("rounded-[1px] bg-current", column ? "h-px w-2.5" : "h-2.5 w-px")} />
                                <span className={cn("rounded-[1px] bg-current", column ? "h-px w-1.5" : "h-1.5 w-px")} />
                            </span>
                        ) : (
                            <span className="size-1 shrink-0 rounded-full bg-current/50" />
                        )}
                    </button>
                );
            })}
        </div>
    );
}

function PanelSection({
    title,
    children,
    defaultOpen = true,
    add,
    action,
    onAdd,
}: {
    title: string;
    children?: React.ReactNode;
    defaultOpen?: boolean;
    add?: boolean;
    action?: React.ReactNode;
    onAdd?: () => void;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <section className="border-t border-border">
            <div className="flex h-10 items-center px-3">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpen((current) => !current)}
                    className="-ml-2 min-w-0 flex-1 justify-start px-2 text-xs font-medium text-text-primary hover:bg-transparent"
                >
                    {title}
                </Button>
                {action}
                {add ? (
                    <IconButton
                        label={`Add ${title}`}
                        icon={RiAddLine}
                        onClick={() => {
                            setOpen(true);
                            onAdd?.();
                        }}
                    />
                ) : null}
            </div>
            {open ? <div className="space-y-1.5 px-3 pb-2.5">{children}</div> : null}
        </section>
    );
}

function ColorField({
    value,
    property,
    onPreview,
    onCommit,
    mapValue = (next) => next,
}: {
    value?: string;
    property: string;
    onPreview: (styles: Styles) => void;
    onCommit: (styles: Styles) => void;
    mapValue?: (value: string) => string;
}) {
    const colorValue = value ?? "";
    const parsedColor = cssColorToHex(colorValue);
    const [draft, setDraft] = useState(parsedColor.hex);
    const [alpha, setAlpha] = useState(parsedColor.alpha);
    const [visible, setVisible] = useState(colorValue !== "transparent");
    useEffect(() => {
        const next = cssColorToHex(colorValue);
        setDraft(next.hex);
        setAlpha(next.alpha);
        setVisible(colorValue !== "transparent");
    }, [colorValue]);
    const normalizedHex = draft.replace(/^#/, "").slice(0, 6).toUpperCase();
    const color = /^[0-9A-F]{6}$/.test(normalizedHex) ? `#${normalizedHex}` : "#FFFFFF";
    const rgb = [0, 2, 4].map((offset) => Number.parseInt(color.slice(offset + 1, offset + 3), 16));
    const cssColor = (hex: string, opacity = alpha) => {
        if (!/^[0-9A-F]{6}$/.test(hex)) return `#${hex}`;
        if (opacity >= 100) return `#${hex}`;
        const alphaHex = Math.round((Math.max(0, opacity) / 100) * 255)
            .toString(16)
            .padStart(2, "0")
            .toUpperCase();
        return `#${hex}${alphaHex}`;
    };
    const updateColor = (next: string, commit = false) => {
        const hex = next.replace(/^#/, "").slice(0, 6).toUpperCase();
        setDraft(hex);
        const css = /^[0-9A-F]{6}$/.test(hex) ? cssColor(hex) : next;
        onPreview({ [property]: mapValue(css) });
        if (commit) onCommit({ [property]: mapValue(css) });
    };
    const updateAlpha = (next: number, commit = false) => {
        const opacity = Math.max(0, Math.min(100, next || 0));
        setAlpha(opacity);
        const css = cssColor(normalizedHex, opacity);
        onPreview({ [property]: mapValue(css) });
        if (commit) onCommit({ [property]: mapValue(css) });
    };

    return (
        <div className="flex items-center gap-1">
            <div className={cn("flex min-w-0 flex-1 items-center gap-1", CONTROL)}>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="secondary"
                            size="icon"
                            className={cn(CONTROL, "size-6 min-w-6 border border-input-border")}
                            style={{ backgroundColor: color }}
                            aria-label={`${property} color`}
                        />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        side="left"
                        align="center"
                        sideOffset={12}
                        className="w-135 rounded-xl bg-surface-3 p-2"
                    >
                        <div className="mb-2 flex h-6 items-center border-b border-border px-1 text-xs">
                            <span className="rounded-t-md border border-b-0 border-border-secondary px-2 py-1 font-semibold">
                                sRGB
                            </span>
                            <span className="px-2 text-text-muted">Display P3</span>
                            <span className="ml-auto flex items-center gap-2 text-text-muted">
                                <Icon icon={RiLink} size={ICON_SIZE_SM} />
                                <Icon icon={RiMoreLine} size={ICON_SIZE_SM} />
                                <Icon icon={RiCloseLine} size={ICON_SIZE_SM} />
                            </span>
                        </div>
                        <div className="grid grid-cols-[240px_16px_minmax(0,1fr)] gap-2">
                            <label
                                className="relative h-64 overflow-hidden rounded-md"
                                style={{
                                    background:
                                        `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${color})`,
                                }}
                            >
                                <span className="absolute left-1/2 top-1/3 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" />
                                <input
                                    type="color"
                                    value={color}
                                    onChange={(event) => {
                                        updateColor(event.target.value);
                                    }}
                                    onBlur={(event) => updateColor(event.target.value, true)}
                                    className="absolute inset-0 size-full cursor-crosshair opacity-0"
                                />
                            </label>
                            <div className="h-64 rounded-sm bg-[linear-gradient(to_bottom,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)]" />
                            <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="h-14 rounded-md bg-white" />
                                    <div className="h-14 rounded-md" style={{ backgroundColor: color }} />
                                    <span className="text-center text-sm font-semibold text-text-muted">Previous</span>
                                    <span className="text-center text-sm font-semibold text-text-muted">New</span>
                                </div>
                                {[
                                    ["L", "100", "C", "0", "H", "0"],
                                    ["H", "0", "S", "0", "L", "100"],
                                    ["R", rgb?.[0] ?? 255, "G", rgb?.[1] ?? 255, "B", rgb?.[2] ?? 255],
                                ].map((row, index) => (
                                    <div key={index} className="grid grid-cols-3 overflow-hidden rounded-md bg-input-bg">
                                        {[0, 2, 4].map((offset) => (
                                            <div key={offset} className="border-r border-border px-2 py-1 text-center text-sm last:border-r-0">
                                                <div className="font-semibold text-text-primary">{row[offset + 1]}</div>
                                                <div className="text-sm text-text-muted">{row[offset]}</div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                                <div className="relative">
                                    <Input
                                        value={draft}
                                        onChange={(event) => {
                                            updateColor(event.target.value);
                                        }}
                                        onBlur={() => updateColor(draft, true)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") event.currentTarget.blur();
                                        }}
                                        className="h-6 pr-14 text-center text-xs font-semibold"
                                    />
                                    <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-text-secondary">
                                        / {alpha}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>
                <Input
                    value={draft}
                    onChange={(event) => {
                        updateColor(event.target.value);
                    }}
                    onBlur={() => {
                        updateColor(draft, true);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    className={cn(CONTROL, "min-w-0 flex-1 px-1.5 font-medium")}
                    spellCheck={false}
                />
                <Input
                    value={alpha}
                    onChange={(event) => updateAlpha(Number.parseInt(event.target.value, 10))}
                    onBlur={() => updateAlpha(alpha, true)}
                    className={cn(CONTROL, "w-12 px-1 text-right text-text-secondary")}
                    aria-label={`${property} opacity`}
                />
                <span className="text-sm text-text-secondary">%</span>
            </div>
            <IconButton
                label="Toggle visibility"
                icon={RiEyeLine}
                active={visible}
                onClick={() => {
                    const next = visible ? "transparent" : cssColor(normalizedHex);
                    setVisible(!visible);
                    onPreview({ [property]: mapValue(next) });
                    onCommit({ [property]: mapValue(next) });
                }}
            />
            <IconButton
                label="Remove"
                icon={RiSubtractLine}
                onClick={() => {
                    setVisible(false);
                    onPreview({ [property]: mapValue("transparent") });
                    onCommit({ [property]: mapValue("transparent") });
                }}
            />
        </div>
    );
}

function RangeField({
    value,
    property,
    onPreview,
    onCommit,
    max = 100,
}: {
    value?: string;
    property: string;
    onPreview: (styles: Styles) => void;
    onCommit: (styles: Styles) => void;
    max?: number;
}) {
    const numeric = Number.parseFloat(value ?? "") || 0;
    return (
        <div className="flex h-6 items-center gap-1">
            <Slider
                min={0}
                max={max}
                step={1}
                value={[Math.min(max, numeric)]}
                onValueChange={(next) => onPreview({ [property]: `${next[0] ?? numeric}px` })}
                onValueCommit={(next) => onCommit({ [property]: `${next[0] ?? numeric}px` })}
                className="min-w-0 flex-1"
                aria-label={property}
            />
            <Field
                value={value}
                property={property}
                onPreview={onPreview}
                onCommit={onCommit}
                className="max-w-20"
            />
        </div>
    );
}

export function DesignStylePanel({
    element,
    source,
    previewUrl,
    zoom,
    onZoomChange,
    onPreview,
    onCommit,
    onOpenSource,
    onAlign,
    onDuplicate,
    onDelete,
    onExport,
}: {
    element: DesignElementSnapshot | null;
    source: { file: string; line: number } | null;
    previewUrl: string | null;
    zoom: number;
    onZoomChange: (zoom: number) => void;
    onPreview: (styles: Styles) => void;
    onCommit: (styles: Styles) => void;
    onOpenSource: () => void;
    onAlign: (alignment: "center" | "center-x" | "center-y") => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onExport: (scale: number, format: string) => Promise<void>;
}) {
    const style = element?.styles ?? {};
    const setStyle = (property: string, value: string) => {
        onPreview({ [property]: value });
        onCommit({ [property]: value });
    };
    const textual = Boolean(
        element
        && (/^(a|button|h1|h2|h3|h4|h5|h6|label|li|p|span|strong|em)$/i.test(element.tag)
            || element.text.trim()),
    );
    const filterFunctions = parseCssFunctions(css(style, "filter", "none"));
    const backdropFunctions = parseCssFunctions(css(style, "backdrop-filter", "none"));
    const boxShadow = parseBoxShadow(css(style, "box-shadow", "none"));
    const hasShadow = boxShadow != null;
    const composeShadow = (part: "x" | "y" | "blur" | "color", value: string) =>
        serializeBoxShadow(
            boxShadow ?? { x: "0px", y: "2px", blur: "3px", spread: "0px", color: "#00000033", inset: false },
            part,
            value,
        );
    const writeFilters = (property: "filter" | "backdrop-filter", items: CssFunction[]) => {
        const next = serializeCssFunctions(items);
        onPreview({ [property]: next });
        onCommit({ [property]: next });
    };

    if (!element) {
        return (
            <aside className="flex h-full w-70 shrink-0 flex-col border-l border-border bg-panel">
                <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                    <div className="mb-3 flex size-9 items-center justify-center rounded-full bg-surface-3 text-sm text-text-muted">
                        –
                    </div>
                    <p className="text-sm font-medium text-text-primary">Nothing selected</p>
                    <p className="mt-1 text-sm leading-relaxed text-text-muted">
                        Select an element on the canvas or in Layers.
                    </p>
                </div>
            </aside>
        );
    }

    return (
        <aside className="flex h-full w-100 shrink-0 flex-col border-l border-border bg-surface-3">
            <div className="shrink-0 px-3 pb-2.5 pt-2.5">
                <div className="mb-1.5 flex h-6 items-center">
                    <UserAvatar />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="xs"
                                className="ml-auto px-2 text-sm font-semibold tabular-nums"
                            >
                                {zoom}%
                                <Icon icon={RiArrowDownSLine} size={ICON_SIZE_SM} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-24">
                            {[50, 67, 75, 80, 90, 100, 125, 150].map((value) => (
                                <DropdownMenuItem key={value} onClick={() => onZoomChange(value)}>
                                    {value}%
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" icon={RiMoreLine} aria-label="Selection menu" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={onDuplicate}>Duplicate element</DropdownMenuItem>
                            <DropdownMenuItem onClick={onOpenSource}>Open source</DropdownMenuItem>
                            <DropdownMenuItem onClick={onDelete} className="text-error">
                                Delete element
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        if (previewUrl) void navigator.clipboard.writeText(previewUrl);
                    }}
                    className={cn(CONTROL, "w-full bg-panel-hover text-text-primary")}
                >
                    Copy link
                    <span className="ml-1.5 font-medium text-sm text-text-muted">Ctrl + L</span>
                </Button>
            </div>

            <ScrollArea className="min-h-0 flex-1" fadeFrom="from-panel">
                <div className="pb-40">
                    <PanelSection
                        title="Layout"
                        action={
                            <IconButton label="Fit view" icon={RiExpandDiagonalLine} />
                        }
                    >
                        <div className="flex h-6 items-stretch gap-2 mb-4">
                            <Field label="X" value={`${Math.round(element.rect.x)}`} property="left" onPreview={onPreview} onCommit={onCommit} />
                            <Field label="Y" value={`${Math.round(element.rect.y)}`} property="top" onPreview={onPreview} onCommit={onCommit} />
                            <Field icon={RiResetRightLine} value="0deg" property="rotate" onPreview={onPreview} onCommit={onCommit} />
                        </div>
                        <div className="flex h-6 items-stretch gap-2">
                            <Field label="W" value={style.width} property="width" onPreview={onPreview} onCommit={onCommit} />
                            <Field label="H" value={style.height} property="height" onPreview={onPreview} onCommit={onCommit} />
                            <ButtonGroup className={cn(CONTROL, "min-w-0 flex-1")}>
                                <Button variant="secondary" size="icon" icon={RiFocusLine} aria-label="Center in parent" onClick={() => onAlign("center")} className={cn(CONTROL, "min-w-0 flex-1 border border-border bg-panel-hover")} />
                                <Button variant="secondary" size="icon" icon={RiAlignCenter} aria-label="Center horizontally" onClick={() => onAlign("center-x")} className={cn(CONTROL, "min-w-0 flex-1 border border-border bg-panel-hover")} />
                                <Button variant="secondary" size="icon" icon={RiAlignVertically} aria-label="Center vertically" onClick={() => onAlign("center-y")} className={cn(CONTROL, "min-w-0 flex-1 border border-border bg-panel-hover")} />
                            </ButtonGroup>
                        </div>
                        {style.display !== "flex" ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setStyle("display", "flex")}
                                className={cn(CONTROL, "w-full mt-4 bg-panel-hover text-text-primary")}
                            >
                                Wrap in flex
                                <span className="ml-1.5 font-medium text-sm text-text-muted">Shift + A</span>
                            </Button>
                        ) : (
                            <>
                                <div className="flex h-8 items-center mt-4">
                                    <span className="text-xs font-medium text-text-primary">Flex</span>
                                    <span className="ml-auto">
                                        <IconButton
                                            label="Remove flex"
                                            icon={RiSubtractLine}
                                            onClick={() => setStyle("display", "block")}
                                        />
                                    </span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <FlexAlignmentGrid
                                        justify={style["justify-content"]}
                                        align={style["align-items"]}
                                        direction={style["flex-direction"]}
                                        onChange={(justify, align) => {
                                            onPreview({
                                                "justify-content": justify,
                                                "align-items": align,
                                            });
                                            onCommit({
                                                "justify-content": justify,
                                                "align-items": align,
                                            });
                                        }}
                                    />
                                    <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_28px] items-center gap-1">
                                        <Segment
                                            value={
                                                style["flex-direction"] === "column"
                                                    ? "column"
                                                    : "row"
                                            }
                                            onChange={(value) => setStyle("flex-direction", value)}
                                            items={[
                                                { value: "column", icon: RiArrowDownLine, title: "Column" },
                                                { value: "row", icon: RiArrowRightLine, title: "Row" },
                                            ]}
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            icon={RiTextWrap}
                                            aria-label="Wrap"
                                            selected={style["flex-wrap"] !== "nowrap"}
                                            onClick={() =>
                                                setStyle(
                                                    "flex-wrap",
                                                    style["flex-wrap"] === "nowrap" ? "wrap" : "nowrap",
                                                )
                                            }
                                        />
                                        <Field
                                            icon={RiSpace}
                                            value={style.gap}
                                            property="gap"
                                            onPreview={onPreview}
                                            onCommit={onCommit}
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            icon={RiAlignJustify}
                                            aria-label="Space between"
                                            selected={style["justify-content"] === "space-between"}
                                            onClick={() =>
                                                setStyle(
                                                    "justify-content",
                                                    style["justify-content"] === "space-between"
                                                        ? "flex-start"
                                                        : "space-between",
                                                )
                                            }
                                        />
                                    </div>
                                </div>
                                <div className="flex h-6 items-stretch gap-1">
                                    <Field
                                        icon={RiExpandWidthLine}
                                        value={style["padding-left"] || style["padding-right"] || "0px"}
                                        property="padding-left"
                                        mapValue={(value) => value}
                                        onPreview={(styles) => {
                                            onPreview({
                                                "padding-left": styles["padding-left"] ?? "0px",
                                                "padding-right": styles["padding-left"] ?? "0px",
                                            });
                                        }}
                                        onCommit={(styles) => {
                                            onCommit({
                                                "padding-left": styles["padding-left"] ?? "0px",
                                                "padding-right": styles["padding-left"] ?? "0px",
                                            });
                                        }}
                                    />
                                    <Field
                                        icon={RiExpandHeightLine}
                                        value={style["padding-top"] || style["padding-bottom"] || "0px"}
                                        property="padding-top"
                                        onPreview={(styles) => {
                                            onPreview({
                                                "padding-top": styles["padding-top"] ?? "0px",
                                                "padding-bottom": styles["padding-top"] ?? "0px",
                                            });
                                        }}
                                        onCommit={(styles) => {
                                            onCommit({
                                                "padding-top": styles["padding-top"] ?? "0px",
                                                "padding-bottom": styles["padding-top"] ?? "0px",
                                            });
                                        }}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        icon={RiExpandDiagonalLine}
                                        aria-label="Equal padding"
                                        onClick={() => {
                                            const next = style["padding-left"] || "0px";
                                            onPreview({
                                                "padding-top": next,
                                                "padding-right": next,
                                                "padding-bottom": next,
                                                "padding-left": next,
                                            });
                                            onCommit({
                                                "padding-top": next,
                                                "padding-right": next,
                                                "padding-bottom": next,
                                                "padding-left": next,
                                            });
                                        }}
                                    />
                                </div>
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    icon={style.overflow === "hidden" ? RiCheckboxLine : RiCheckboxBlankLine}
                                    onClick={() =>
                                        setStyle(
                                            "overflow",
                                            style.overflow === "hidden" ? "visible" : "hidden",
                                        )
                                    }
                                    selected={style.overflow === "hidden"}
                                    className="h-6 justify-start px-0 text-xs"
                                >
                                    Clip content
                                    <span className="ml-auto font-normal text-text-muted">Alt + C</span>
                                </Button>
                            </>
                        )}
                    </PanelSection>

                    <PanelSection title="Radius">
                        <RangeField value={style["border-radius"]} property="border-radius" onPreview={onPreview} onCommit={onCommit} max={100} />
                    </PanelSection>

                    <PanelSection
                        title="Blending"
                        action={
                            <IconButton label="Toggle visibility" icon={RiEyeLine} />
                        }
                    >
                        <div className="flex gap-2">
                            <Field icon={RiContrastDropLine} value={`${Math.round((Number.parseFloat(style.opacity) || 1) * 100)}%`} property="opacity" onPreview={onPreview} onCommit={onCommit} />
                            <SelectField icon={RiContrastDropLine} value={style["mix-blend-mode"]} options={["normal", "multiply", "screen", "overlay", "darken", "lighten", "difference"]} onChange={(value) => setStyle("mix-blend-mode", value)} />
                        </div>
                    </PanelSection>

                    <PanelSection title="Fill" add>
                        <Segment
                            value={
                                css(style, "background-image", "none").includes("gradient")
                                    ? "gradient"
                                    : css(style, "background-image", "none") !== "none"
                                      ? "image"
                                      : "solid"
                            }
                            onChange={(value) => {
                                if (value === "solid") setStyle("background-image", "none");
                                if (value === "gradient") {
                                    setStyle("background-image", "linear-gradient(135deg, currentColor, transparent)");
                                }
                            }}
                            items={[
                                { value: "solid", label: "Solid", title: "Solid fill" },
                                { value: "gradient", label: "Gradient", title: "Gradient fill" },
                                { value: "image", label: "Image", title: "Image fill" },
                            ]}
                        />
                        <ColorField value={style["background-color"]} property="background-color" onPreview={onPreview} onCommit={onCommit} />
                    </PanelSection>

                    {textual ? (
                        <PanelSection title="Text">
                            <FontField
                                value={css(style, "font-family").split(",")[0]?.replace(/['"]/g, "") || "System Sans-Serif"}
                                onChange={(value) => setStyle("font-family", value === "System Sans-Serif" ? "system-ui, sans-serif" : value)}
                            />
                            <SelectField
                                icon={RiTextSpacing}
                                value={style["font-weight"]}
                                options={[...WEIGHTS]}
                                onChange={(value) => setStyle("font-weight", value)}
                            />
                            <div className="flex gap-2">
                                <Field icon={RiFontSize} value={style["font-size"]} property="font-size" onPreview={onPreview} onCommit={onCommit} />
                                <Field icon={RiArrowUpDownLine} value={style["line-height"]} property="line-height" onPreview={onPreview} onCommit={onCommit} />
                                <Field icon={RiTextSpacing} value={style["letter-spacing"]} property="letter-spacing" onPreview={onPreview} onCommit={onCommit} />
                            </div>
                            <div className="flex gap-2">
                                <Segment
                                    value={style["text-align"]}
                                    onChange={(value) => setStyle("text-align", value)}
                                    items={[
                                        { value: "left", icon: RiAlignLeft, title: "Align left" },
                                        { value: "center", icon: RiAlignCenter, title: "Align center" },
                                        { value: "right", icon: RiAlignRight, title: "Align right" },
                                        { value: "justify", icon: RiAlignJustify, title: "Justify" },
                                    ]}
                                />
                                <SelectField icon={RiTextDirectionL} value={style["text-transform"]} options={["none", "uppercase", "lowercase", "capitalize"]} onChange={(value) => setStyle("text-transform", value)} className="max-w-24" />
                            </div>
                            <ColorField value={style.color} property="color" onPreview={onPreview} onCommit={onCommit} />
                        </PanelSection>
                    ) : null}

                    {textual ? (
                        <PanelSection title="Underline" add defaultOpen={style["text-decoration-line"] === "underline"}>
                            <div className="flex gap-2">
                                <Field icon={RiSubtractLine} value="1px" property="text-decoration-thickness" onPreview={onPreview} onCommit={onCommit} />
                                <Field icon={RiArrowDownLine} value="auto" property="text-underline-offset" onPreview={onPreview} onCommit={onCommit} />
                            </div>
                            <ColorField value={style.color} property="text-decoration-color" onPreview={onPreview} onCommit={onCommit} />
                        </PanelSection>
                    ) : null}

                    <PanelSection title="Stroke" add>
                        <div className="flex gap-2">
                            <Field icon={RiSubtractLine} value={style["border-top-width"]} property="border-width" onPreview={onPreview} onCommit={onCommit} />
                            <SelectField icon={RiLayoutRowLine} value={style["border-style"]} options={["none", "solid", "dashed", "dotted", "double"]} onChange={(value) => setStyle("border-style", value)} />
                        </div>
                        <ColorField value={style["border-color"]} property="border-color" onPreview={onPreview} onCommit={onCommit} />
                    </PanelSection>

                    <PanelSection
                        title="Shadow"
                        add
                        defaultOpen={hasShadow}
                        onAdd={() => {
                            if (!hasShadow) setStyle("box-shadow", "0px 2px 3px 0px #00000033");
                        }}
                    >
                        {hasShadow ? (
                            <>
                                <div className="flex h-6 items-stretch gap-1">
                                    <Field label="X" value={boxShadow?.x} property="box-shadow" mapValue={(value) => composeShadow("x", value)} onPreview={onPreview} onCommit={onCommit} />
                                    <Field label="Y" value={boxShadow?.y} property="box-shadow" mapValue={(value) => composeShadow("y", value)} onPreview={onPreview} onCommit={onCommit} />
                                    <Field icon={RiShadowLine} value={boxShadow?.blur} property="box-shadow" mapValue={(value) => composeShadow("blur", value)} onPreview={onPreview} onCommit={onCommit} />
                                    <IconButton
                                        label="Remove shadow"
                                        icon={RiSubtractLine}
                                        onClick={() => setStyle("box-shadow", "none")}
                                    />
                                </div>
                                <ColorField
                                    value={boxShadow?.color}
                                    property="box-shadow"
                                    mapValue={(value) => composeShadow("color", value)}
                                    onPreview={onPreview}
                                    onCommit={onCommit}
                                />
                            </>
                        ) : (
                            <p className="text-xs text-text-muted">Add a drop shadow with X, Y, and blur.</p>
                        )}
                    </PanelSection>

                    <PanelSection
                        title="Filters"
                        add
                        defaultOpen={filterFunctions.length > 0 || backdropFunctions.length > 0}
                        onAdd={() => writeFilters("filter", [...filterFunctions, { type: "blur", amount: "4px" }])}
                    >
                        {filterFunctions.length ? (
                            <FilterStack
                                property="filter"
                                items={filterFunctions}
                                onPreview={onPreview}
                                onCommit={onCommit}
                            />
                        ) : (
                            <p className="text-xs text-text-muted">Layer filters like blur and contrast.</p>
                        )}
                        <div className="pt-1 text-xs font-medium text-text-muted">Backdrop</div>
                        {backdropFunctions.length ? (
                            <FilterStack
                                property="backdrop-filter"
                                items={backdropFunctions}
                                onPreview={onPreview}
                                onCommit={onCommit}
                            />
                        ) : (
                            <Button
                                variant="ghost"
                                size="xs"
                                icon={RiAddLine}
                                className="h-6 justify-start px-0 text-xs"
                                onClick={() =>
                                    writeFilters("backdrop-filter", [{ type: "blur", amount: "8px" }])
                                }
                            >
                                Add backdrop blur
                            </Button>
                        )}
                    </PanelSection>

                    <ExportBlock onExport={onExport} />

                    <PanelSection title="Element" defaultOpen={false}>
                        <div className="grid grid-cols-[58px_minmax(0,1fr)] gap-y-2 text-xs">
                            <span className="text-text-muted">Tag</span>
                            <span className="truncate text-text-primary">{element.tag}</span>
                            <span className="text-text-muted">ID</span>
                            <span className="truncate text-text-primary">{element.id || "None"}</span>
                            <span className="text-text-muted">Class</span>
                            <span className="truncate text-text-primary">{element.classes.join(" ") || "None"}</span>
                            <span className="text-text-muted">Source</span>
                            <span className="truncate text-text-primary">
                                {source ? `${source.file}:${source.line}` : "Resolving"}
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" size="xs" icon={RiCodeLine} className={cn(CONTROL, "flex-1")} onClick={onOpenSource}>
                                Open source
                            </Button>
                            <Button variant="ghost" size="icon" icon={RiDeleteBinLine} aria-label="Delete element" onClick={onDelete} />
                        </div>
                    </PanelSection>
                </div>
            </ScrollArea>
        </aside>
    );
}
