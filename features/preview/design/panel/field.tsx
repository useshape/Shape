"use client";

import { RiArrowDownSLine } from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Icon, ICON_SIZE_MD, ICON_SIZE_SM } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { Styles } from "./types";

/** Inspector control height — keep in sync with panel rows; do not shrink. */
export const CONTROL = "h-8 min-h-8 text-sm leading-none";

export function Field({
    label,
    icon,
    value,
    property,
    onPreview,
    onCommit,
    className,
    suffix,
    mapValue = (next) => next,
}: {
    label?: string;
    icon?: RemixiconComponentType;
    value?: string;
    property: string;
    onPreview: (styles: Styles) => void;
    onCommit: (styles: Styles) => void;
    className?: string;
    suffix?: string;
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
    // Overflow fade: mask the value (inputs clip glyphs internally — overlays can't fade clipped text).
    return (
        <div
            role="group"
            className={cn(
                "relative flex min-w-0 flex-1 items-center overflow-hidden rounded-md border border-border bg-panel-hover",
                "focus-within:border-border-focus focus-within:ring-1 focus-within:ring-border-focus",
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
                    hasPrefix ? "pl-1.5" : "pl-2",
                    suffix ? "pr-1" : "pr-2",
                    !suffix
                        && "[mask-image:linear-gradient(to_right,black_calc(100%-1.25rem),transparent)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-1.25rem),transparent)]",
                )}
                spellCheck={false}
                aria-label={property}
            />
            {suffix ? (
                <span className="flex h-full shrink-0 items-center pr-2 text-xs font-medium text-text-muted">
                    {suffix}
                </span>
            ) : null}
        </div>
    );
}

export function SelectField({
    value,
    options,
    onChange,
    className,
    label,
    icon,
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
    const hasPrefix = Boolean(label || icon);
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="secondary"
                    size="xs"
                    className={cn(
                        CONTROL,
                        "min-w-0 flex-1 justify-start gap-0 border border-border bg-panel-hover px-0 text-text-primary hover:bg-panel-hover",
                        className,
                    )}
                >
                    {hasPrefix ? (
                        <span className="flex h-full shrink-0 items-center justify-center pl-2 text-text-muted">
                            {icon ? (
                                <Icon icon={icon} size={ICON_SIZE_MD} />
                            ) : (
                                <span className="text-sm font-medium leading-none">{label}</span>
                            )}
                        </span>
                    ) : null}
                    <span
                        className={cn(
                            "min-w-0 flex-1 truncate text-left text-xs font-normal",
                            hasPrefix ? "pl-1.5" : "pl-2",
                        )}
                    >
                        {Array.isArray(display) ? display[1] : display || value || "Auto"}
                    </span>
                    <Icon
                        icon={RiArrowDownSLine}
                        size={ICON_SIZE_SM}
                        className="mr-1.5 shrink-0 text-text-muted"
                    />
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

export function IconButton({
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

export function Segment({
    items,
    value,
    onChange,
}: {
    items: Array<{ value: string; label?: string; icon?: RemixiconComponentType; title: string }>;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <div
            role="group"
            className={cn(
                CONTROL,
                "flex min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-panel-hover",
            )}
        >
            {items.map((item, index) => {
                const active = value === item.value;
                return (
                    <button
                        key={item.value}
                        type="button"
                        title={item.title}
                        aria-label={item.title}
                        aria-pressed={active}
                        onClick={() => onChange(item.value)}
                        className={cn(
                            "flex h-full min-w-0 flex-1 items-center justify-center gap-1 px-1.5 text-xs font-medium text-text-secondary transition-colors",
                            index > 0 && "border-l border-border",
                            active
                                ? "bg-panel-active text-text-primary"
                                : "hover:bg-panel-active/60 hover:text-text-primary",
                            !item.label && "px-0",
                        )}
                    >
                        {item.icon ? <Icon icon={item.icon} size={ICON_SIZE_SM} /> : null}
                        {item.label ? <span className="truncate">{item.label}</span> : null}
                    </button>
                );
            })}
        </div>
    );
}

export function RangeField({
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
