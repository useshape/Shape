"use client";

import {
    RiCloseLine,
    RiEyeLine,
    RiEyeOffLine,
    RiShapesLine,
    RiSubtractLine,
} from "@remixicon/react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search";
import { cn } from "@/lib/utils";
import { cssColorToHex } from "../css";
import { CONTROL, IconButton, Segment, SelectField } from "./field";
import { css, type Styles, type ThemeToken } from "./types";
import { sidebarEdgeOffset } from "./edge";

type Hsv = { h: number; s: number; v: number };

function hexToRgb(hex: string): [number, number, number] {
    const normalized = hex.replace(/^#/, "").padEnd(6, "0").slice(0, 6);
    return [
        Number.parseInt(normalized.slice(0, 2), 16) || 0,
        Number.parseInt(normalized.slice(2, 4), 16) || 0,
        Number.parseInt(normalized.slice(4, 6), 16) || 0,
    ];
}

function rgbToHex(r: number, g: number, b: number) {
    return [r, g, b]
        .map((part) => Math.max(0, Math.min(255, Math.round(part))).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === rn) h = ((gn - bn) / d) % 6;
        else if (max === gn) h = (bn - rn) / d + 2;
        else h = (rn - gn) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function hueCss(h: number) {
    const [r, g, b] = hsvToRgb(h, 1, 1);
    return `#${rgbToHex(r, g, b)}`;
}

const CHECKER =
    "linear-gradient(45deg,#c8c8c8 25%,transparent 25%),linear-gradient(-45deg,#c8c8c8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#c8c8c8 75%),linear-gradient(-45deg,transparent 75%,#c8c8c8 75%)";

function parseBackgroundImageUrl(value?: string): string | null {
    const match = (value ?? "").match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
    return match?.[1] ?? null;
}

function parseGradientStartColor(value?: string): string | null {
    const raw = (value ?? "").trim();
    if (!/gradient\(/i.test(raw)) return null;
    // linear-gradient(135deg, #RRGGBBAA, transparent) or rgb(...)
    const afterArgs = raw.replace(/^(?:repeating-)?(?:linear|radial|conic)-gradient\(\s*/i, "");
    const skipAngle = afterArgs.replace(/^(?:to\s+[\w\s]+|-?\d*\.?\d+(?:deg|rad|turn|grad)?)\s*,\s*/i, "");
    const extracted = skipAngle.match(
        /^(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-z]+)/i,
    );
    return extracted?.[1] ?? null;
}

function gradientFromColor(color?: string) {
    const { hex, alpha } = cssColorToHex(color);
    const start =
        alpha >= 100
            ? `#${hex}`
            : `#${hex}${Math.round((alpha / 100) * 255)
                  .toString(16)
                  .padStart(2, "0")
                  .toUpperCase()}`;
    return `linear-gradient(135deg, ${start}, transparent)`;
}

export function ColorField({
    value,
    property,
    onPreview,
    onCommit,
    mapValue = (next) => next,
    swatchStyle,
    themeTokens = [],
}: {
    value?: string;
    property: string;
    onPreview: (styles: Styles) => void;
    onCommit: (styles: Styles) => void;
    mapValue?: (value: string) => string;
    /** Optional overlay for the trigger swatch (e.g. fill gradient). */
    swatchStyle?: React.CSSProperties;
    themeTokens?: ThemeToken[];
}) {
    const colorValue = value ?? "";
    const parsedColor = cssColorToHex(colorValue);
    const [draft, setDraft] = useState(parsedColor.hex);
    const [alpha, setAlpha] = useState(parsedColor.alpha);
    const [hsv, setHsv] = useState<Hsv>(() => {
        const [r, g, b] = hexToRgb(parsedColor.hex);
        return rgbToHsv(r, g, b);
    });
    const [visible, setVisible] = useState(colorValue !== "transparent");
    const [open, setOpen] = useState(false);
    const [tokenQuery, setTokenQuery] = useState("");
    const [tokenEdge, setTokenEdge] = useState(12);
    const tokenTriggerRef = useRef<HTMLButtonElement>(null);
    const svRef = useRef<HTMLDivElement>(null);
    const hueRef = useRef<HTMLDivElement>(null);
    const alphaRef = useRef<HTMLDivElement>(null);
    const hsvRef = useRef(hsv);
    const alphaLiveRef = useRef(alpha);
    hsvRef.current = hsv;
    alphaLiveRef.current = alpha;

    useEffect(() => {
        const next = cssColorToHex(colorValue);
        setDraft(next.hex);
        setAlpha(next.alpha);
        setVisible(colorValue !== "transparent");
        const [r, g, b] = hexToRgb(next.hex);
        setHsv(rgbToHsv(r, g, b));
    }, [colorValue]);

    const normalizedHex = draft.replace(/^#/, "").slice(0, 6).toUpperCase();
    const color = /^[0-9A-F]{6}$/.test(normalizedHex) ? `#${normalizedHex}` : "#FFFFFF";

    const cssColor = (hex: string, opacity = alpha) => {
        if (!/^[0-9A-F]{6}$/.test(hex)) return `#${hex}`;
        if (opacity >= 100) return `#${hex}`;
        const alphaHex = Math.round((Math.max(0, opacity) / 100) * 255)
            .toString(16)
            .padStart(2, "0")
            .toUpperCase();
        return `#${hex}${alphaHex}`;
    };

    const emit = (hex: string, opacity: number, commit: boolean) => {
        const cssValue = cssColor(hex, opacity);
        onPreview({ [property]: mapValue(cssValue) });
        if (commit) onCommit({ [property]: mapValue(cssValue) });
    };

    const applyHsv = (next: Hsv, commit = false) => {
        setHsv(next);
        const [r, g, b] = hsvToRgb(next.h, next.s, next.v);
        const hex = rgbToHex(r, g, b);
        setDraft(hex);
        emit(hex, alpha, commit);
    };

    const updateColor = (next: string, commit = false) => {
        const hex = next.replace(/^#/, "").slice(0, 6).toUpperCase();
        setDraft(hex);
        if (/^[0-9A-F]{6}$/.test(hex)) {
            const [r, g, b] = hexToRgb(hex);
            setHsv(rgbToHsv(r, g, b));
            emit(hex, alpha, commit);
            return;
        }
        onPreview({ [property]: mapValue(next) });
        if (commit) onCommit({ [property]: mapValue(next) });
    };

    const updateAlpha = (next: number, commit = false) => {
        const opacity = Math.max(0, Math.min(100, next || 0));
        setAlpha(opacity);
        emit(normalizedHex, opacity, commit);
    };

    const scrub = (
        ref: React.RefObject<HTMLDivElement | null>,
        onMove: (x: number, y: number, rect: DOMRect) => void,
        onEnd: () => void,
    ) =>
        (event: React.PointerEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.stopPropagation();
            const el = ref.current;
            if (!el) return;
            el.setPointerCapture(event.pointerId);
            const move = (pointer: PointerEvent) => {
                const rect = el.getBoundingClientRect();
                onMove(
                    Math.min(1, Math.max(0, (pointer.clientX - rect.left) / rect.width)),
                    Math.min(1, Math.max(0, (pointer.clientY - rect.top) / rect.height)),
                    rect,
                );
            };
            const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
                onEnd();
            };
            move(event.nativeEvent);
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up, { once: true });
        };

    return (
        <div className="flex items-center gap-1">
            <div
                className={cn(
                    CONTROL,
                    "flex min-w-0 flex-1 items-center overflow-hidden rounded-md border border-border bg-panel-hover",
                    "focus-within:border-border-focus focus-within:ring-1 focus-within:ring-border-focus",
                )}
            >
                <DropdownMenu open={open} onOpenChange={setOpen}>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="ml-1.5 size-4 shrink-0 overflow-hidden rounded-[3px] border border-border"
                            style={{
                                backgroundImage: CHECKER,
                                backgroundSize: "6px 6px",
                                backgroundPosition: "0 0,0 3px,3px -3px,-3px 0",
                            }}
                            aria-label={`${property} color`}
                        >
                            <span
                                className="block size-full"
                                style={
                                    swatchStyle ?? {
                                        backgroundColor: cssColor(normalizedHex),
                                    }
                                }
                            />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        side="left"
                        align="start"
                        sideOffset={12}
                        className="w-60 rounded-xl border border-border bg-surface-4 p-3"
                    >
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-medium text-text-primary">Custom</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Close color picker"
                                className="size-6"
                                onClick={() => setOpen(false)}
                            >
                                <Icon icon={RiCloseLine} size={ICON_SIZE_SM} />
                            </Button>
                        </div>
                        <div
                            ref={svRef}
                            className="relative mb-2 h-36 w-full cursor-crosshair overflow-hidden rounded-md"
                            style={{
                                backgroundColor: hueCss(hsv.h),
                                backgroundImage:
                                    "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
                            }}
                            onPointerDown={scrub(
                                svRef,
                                (x, y) => applyHsv({ ...hsvRef.current, s: x, v: 1 - y }),
                                () => applyHsv(hsvRef.current, true),
                            )}
                        >
                            <span
                                className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                                style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: color }}
                            />
                        </div>
                        <div
                            ref={hueRef}
                            className="relative mb-2 h-3 w-full cursor-ew-resize rounded-full"
                            style={{
                                background:
                                    "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
                            }}
                            onPointerDown={scrub(
                                hueRef,
                                (x) => applyHsv({ ...hsvRef.current, h: x * 360 }),
                                () => applyHsv(hsvRef.current, true),
                            )}
                        >
                            <span
                                className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                                style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: hueCss(hsv.h) }}
                            />
                        </div>
                        <div
                            ref={alphaRef}
                            className="relative mb-3 h-3 w-full cursor-ew-resize overflow-hidden rounded-full"
                            style={{
                                backgroundImage: CHECKER,
                                backgroundSize: "8px 8px",
                                backgroundPosition: "0 0,0 4px,4px -4px,-4px 0",
                            }}
                            onPointerDown={scrub(
                                alphaRef,
                                (x) => updateAlpha(Math.round(x * 100)),
                                () => updateAlpha(alphaLiveRef.current, true),
                            )}
                        >
                            <div
                                className="absolute inset-0 rounded-full"
                                style={{
                                    background: `linear-gradient(to right, transparent, ${color})`,
                                }}
                            />
                            <span
                                className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                                style={{ left: `${alpha}%`, backgroundColor: cssColor(normalizedHex) }}
                            />
                        </div>
                        <div className="flex h-8 items-stretch overflow-hidden rounded-md border border-border bg-panel-hover focus-within:border-border-focus focus-within:ring-1 focus-within:ring-border-focus">
                            <span className="flex items-center border-r border-border px-2 text-xs font-medium text-text-muted">
                                Hex
                            </span>
                            <Input
                                value={normalizedHex}
                                onChange={(event) => updateColor(event.target.value)}
                                onBlur={() => updateColor(draft, true)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") event.currentTarget.blur();
                                    event.stopPropagation();
                                }}
                                className="h-full min-h-0 flex-1 rounded-none border-0 bg-transparent px-2 text-xs font-normal shadow-none ring-0 focus-visible:border-transparent focus-visible:ring-0"
                                spellCheck={false}
                            />
                            <div className="flex h-full w-16 items-center border-l border-border">
                                <Input
                                    value={alpha}
                                    onChange={(event) =>
                                        updateAlpha(Number.parseInt(event.target.value, 10) || 0)
                                    }
                                    onBlur={() => updateAlpha(alpha, true)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") event.currentTarget.blur();
                                        event.stopPropagation();
                                    }}
                                    className="h-full min-h-0 min-w-0 flex-1 rounded-none border-0 bg-transparent px-1 text-right text-xs font-normal shadow-none ring-0 focus-visible:border-transparent focus-visible:ring-0"
                                    aria-label={`${property} opacity`}
                                />
                                <span className="pr-2 text-xs font-medium text-text-muted">%</span>
                            </div>
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>
                <Input
                    value={draft}
                    onChange={(event) => updateColor(event.target.value)}
                    onBlur={() => updateColor(draft, true)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    className="h-full min-h-0 flex-1 rounded-none border-0 bg-transparent px-1.5 py-0 text-xs font-normal shadow-none ring-0 focus-visible:border-transparent focus-visible:ring-0"
                    spellCheck={false}
                />
                <Input
                    value={alpha}
                    onChange={(event) => updateAlpha(Number.parseInt(event.target.value, 10))}
                    onBlur={() => updateAlpha(alpha, true)}
                    className="h-full min-h-0 w-10 shrink-0 rounded-none border-0 bg-transparent px-0.5 text-right text-xs font-normal text-text-secondary shadow-none ring-0 focus-visible:border-transparent focus-visible:ring-0"
                    aria-label={`${property} opacity`}
                />
                <span className="pr-2 text-xs font-medium text-text-muted">%</span>
            </div>
            <DropdownMenu
                modal={false}
                onOpenChange={(next) => {
                    if (next) setTokenEdge(sidebarEdgeOffset(tokenTriggerRef.current));
                }}
            >
                <DropdownMenuTrigger asChild>
                    <Button
                        ref={tokenTriggerRef}
                        type="button"
                        variant="ghost"
                        size="icon"
                        icon={RiShapesLine}
                        aria-label="Theme tokens"
                        title="Theme tokens"
                        onPointerDown={() => setTokenEdge(sidebarEdgeOffset(tokenTriggerRef.current))}
                    />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    side="left"
                    sideOffset={tokenEdge}
                    avoidCollisions={false}
                    collisionPadding={0}
                    className="!p-0 z-9999 w-64 overflow-hidden rounded-xl border border-border bg-surface-4"
                >
                    {themeTokens.length ? (
                        <>
                            <div className="border-b border-border p-2">
                                <SearchInput
                                    value={tokenQuery}
                                    onChange={(event) => setTokenQuery(event.target.value)}
                                    onKeyDown={(event) => event.stopPropagation()}
                                    placeholder="Search variables"
                                    className="h-8"
                                />
                            </div>
                            <div className="max-h-64 overflow-y-auto p-1">
                                {themeTokens
                                    .filter((token) =>
                                        token.name
                                            .toLowerCase()
                                            .includes(tokenQuery.trim().toLowerCase()),
                                    )
                                    .map((token) => (
                                        <DropdownMenuItem
                                            key={token.name}
                                            onClick={() => {
                                                onPreview({
                                                    [property]: mapValue(`var(${token.name})`),
                                                });
                                                onCommit({
                                                    [property]: mapValue(`var(${token.name})`),
                                                });
                                            }}
                                            className="gap-2"
                                        >
                                            <span
                                                className="size-3.5 shrink-0 rounded-[3px] border border-border"
                                                style={{ background: token.value }}
                                            />
                                            <span className="min-w-0 flex-1 truncate font-mono text-xs">
                                                {token.name}
                                            </span>
                                        </DropdownMenuItem>
                                    ))}
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                            <Icon icon={RiShapesLine} className="text-text-muted" />
                            <p className="text-sm font-medium text-text-primary">Theme tokens</p>
                            <p className="text-xs text-text-muted">
                                No CSS variables found on this page.
                            </p>
                        </div>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
            <IconButton
                label="Toggle visibility"
                icon={visible ? RiEyeLine : RiEyeOffLine}
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

function ImageFillField({
    image,
    size,
    onPreview,
    onCommit,
}: {
    image?: string;
    size?: string;
    onPreview: (styles: Styles) => void;
    onCommit: (styles: Styles) => void;
}) {
    const url = parseBackgroundImageUrl(image);
    const fit =
        size === "contain"
            ? "contain"
            : size === "100% 100%" || size === "fill"
              ? "fill"
              : "cover";

    const write = (styles: Styles, commit = true) => {
        onPreview(styles);
        if (commit) onCommit(styles);
    };

    const pickImage = async () => {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selectedPath = await open({
            multiple: false,
            filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"] }],
        });
        if (typeof selectedPath !== "string") return;
        const src = convertFileSrc(selectedPath);
        write({
            "background-image": `url("${src}")`,
            "background-size": fit === "fill" ? "100% 100%" : fit,
            "background-position": "center",
            "background-repeat": "no-repeat",
        });
    };

    return (
        <div className="space-y-2">
            <div
                className="relative flex h-24 items-center justify-center overflow-hidden rounded-md border border-border"
                style={{
                    backgroundImage: CHECKER,
                    backgroundSize: "12px 12px",
                    backgroundPosition: "0 0,0 6px,6px -6px,-6px 0",
                }}
            >
                {url ? (
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `url("${url}")`,
                            backgroundSize: fit === "fill" ? "100% 100%" : fit,
                            backgroundPosition: "center",
                            backgroundRepeat: "no-repeat",
                        }}
                    />
                ) : (
                    <span className="text-xs text-text-muted">No image</span>
                )}
            </div>
            <div className="flex gap-1">
                <Button
                    variant="secondary"
                    size="xs"
                    className={cn(CONTROL, "min-w-0 flex-1 justify-start border border-border bg-panel-hover px-2")}
                    onClick={() => void pickImage()}
                >
                    Upload from computer
                </Button>
                <IconButton
                    label="Clear image"
                    icon={RiSubtractLine}
                    onClick={() =>
                        write({
                            "background-image": "none",
                            "background-size": "auto",
                        })
                    }
                />
            </div>
            <SelectField
                value={fit}
                options={[
                    ["cover", "Cover"],
                    ["contain", "Contain"],
                    ["fill", "Fill"],
                ]}
                onChange={(value) => {
                    const backgroundSize = value === "fill" ? "100% 100%" : value;
                    write({ "background-size": backgroundSize });
                }}
            />
        </div>
    );
}

function fillModeFromStyle(style: Styles): "solid" | "gradient" | "image" {
    const image = css(style, "background-image", "none");
    if (image.includes("gradient")) return "gradient";
    if (parseBackgroundImageUrl(image)) return "image";
    return "solid";
}

export function FillControls({
    style,
    setStyle,
    onPreview,
    onCommit,
    themeTokens = [],
}: {
    style: Styles;
    setStyle: (property: string, value: string) => void;
    onPreview: (styles: Styles) => void;
    onCommit: (styles: Styles) => void;
    themeTokens?: ThemeToken[];
}) {
    const derived = fillModeFromStyle(style);
    const [imageIntent, setImageIntent] = useState(false);
    useEffect(() => {
        if (derived === "image") setImageIntent(true);
        if (derived === "gradient") setImageIntent(false);
    }, [derived]);
    const mode: "solid" | "gradient" | "image" =
        imageIntent && derived !== "gradient" ? "image" : derived;

    const gradientImage = css(style, "background-image", "none");
    const gradientColor =
        parseGradientStartColor(gradientImage) ?? style["background-color"] ?? "#FFFFFF";

    const writeGradientColor = (color: string, commit: boolean) => {
        const gradient = gradientFromColor(color);
        const styles = {
            "background-color": color,
            "background-image": gradient,
        };
        onPreview(styles);
        if (commit) onCommit(styles);
    };

    return (
        <>
            <Segment
                value={mode}
                onChange={(value) => {
                    const next = value as "solid" | "gradient" | "image";
                    if (next === "solid") {
                        setImageIntent(false);
                        setStyle("background-image", "none");
                        return;
                    }
                    if (next === "gradient") {
                        setImageIntent(false);
                        const color =
                            parseGradientStartColor(gradientImage)
                            ?? style["background-color"]
                            ?? "#FFFFFF";
                        onPreview({
                            "background-color": color,
                            "background-image": gradientFromColor(color),
                        });
                        onCommit({
                            "background-color": color,
                            "background-image": gradientFromColor(color),
                        });
                        return;
                    }
                    setImageIntent(true);
                }}
                items={[
                    { value: "solid", label: "Solid", title: "Solid fill" },
                    { value: "gradient", label: "Gradient", title: "Gradient fill" },
                    { value: "image", label: "Image", title: "Image fill" },
                ]}
            />
            {mode === "image" ? (
                <ImageFillField
                    image={style["background-image"]}
                    size={style["background-size"]}
                    onPreview={onPreview}
                    onCommit={onCommit}
                />
            ) : mode === "gradient" ? (
                <ColorField
                    value={gradientColor}
                    property="background-color"
                    themeTokens={themeTokens}
                    swatchStyle={{
                        backgroundImage: gradientFromColor(gradientColor),
                    }}
                    onPreview={(styles) => {
                        const color = styles["background-color"];
                        if (color) writeGradientColor(color, false);
                        else onPreview(styles);
                    }}
                    onCommit={(styles) => {
                        const color = styles["background-color"];
                        if (color) writeGradientColor(color, true);
                        else onCommit(styles);
                    }}
                />
            ) : (
                <ColorField
                    value={style["background-color"]}
                    property="background-color"
                    themeTokens={themeTokens}
                    onPreview={onPreview}
                    onCommit={onCommit}
                />
            )}
        </>
    );
}
