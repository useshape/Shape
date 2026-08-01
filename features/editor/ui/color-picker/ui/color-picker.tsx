"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { parseTailwindToken, classifyTailwindColorToken } from "../tailwind-utils";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { commands } from "@/lib/backend";

import type { RGBA, HSVA } from "./color-utils";
import {
    rgbToOklch,
    oklchToRgb,
    rgbaToHsla,
    hslaToRgba,
    parseToRgba,
    rgbaToHsva,
    hsvaToRgba,
    rgbaToHex,
} from "./color-utils";
import { ColorCanvas } from "./color-canvas";
import { SegmentedInput } from "./segmented-input";
import { TailwindPalette } from "./tailwind-palette";
import { GradientBar } from "./gradient-bar";
import { parseGradient, stringifyGradient } from "./gradient-utils";
import type { ParsedGradient } from "./gradient-utils";

// ── Types ───────────────────────────────────────────────────

type TabType = "HEX" | "RGB" | "HSL" | "Oklch" | "Tailwind";

interface ColorPickerProps {
    color: string;
    onChange: (color: string) => void;
    onClose?: () => void;
    /** Width of the host editor panel — used to decide compact vs horizontal layout. */
    layoutWidth?: number;
}

const BASE_TABS: TabType[] = ["HEX", "RGB", "HSL", "Oklch", "Tailwind"];

// ── Main Component ──────────────────────────────────────────

const COMPACT_BREAKPOINT = 440;
const PICKER_WIDTH = 480;

export function ColorPicker({ color, onChange, onClose, layoutWidth }: ColorPickerProps) {
    // Gradient state
    const initGradient = useMemo(() => parseGradient(color), [color]);
    const [gradient, setGradient] = useState<ParsedGradient | null>(initGradient);
    const [selectedStop, setSelectedStop] = useState(0);

    // Color History States
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Fetch color history on mount
    useEffect(() => {
        commands.getColorHistory()
            .then((list) => {
                setHistory(list);
                setHistoryIndex(list.length);
            })
            .catch((err) => console.error("Error getting color history:", err));
    }, []);

    // Save final selected color on unmount if it changed
    const finalColorRef = useRef(color);
    useEffect(() => {
        finalColorRef.current = color;
    }, [color]);

    useEffect(() => {
        const initial = color;
        return () => {
            const final = finalColorRef.current;
            if (final && final !== initial) {
                commands.saveColorToHistory(final).catch((err) => console.error("Error saving color history:", err));
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const prevColor = historyIndex > 0 ? history[historyIndex - 1] : null;
    const nextColor = historyIndex < history.length - 1 ? history[historyIndex + 1] : null;

    const handleGoBack = () => {
        if (historyIndex > 0) {
            const nextIdx = historyIndex - 1;
            setHistoryIndex(nextIdx);
            const prevColorStr = history[nextIdx];
            if (prevColorStr) {
                const grad = parseGradient(prevColorStr);
                if (grad) {
                    setGradient(grad);
                    setTwState(null);
                    const stopColor = grad.stops[0]?.color || "#ffffff";
                    const parsed = parseToRgba(stopColor);
                    if (parsed) {
                        setHsva(rgbaToHsva(parsed.r, parsed.g, parsed.b, parsed.a));
                    }
                } else {
                    setGradient(null);
                    const tw = parseTailwindToken(prevColorStr);
                    if (tw) {
                        setTwState(tw);
                        setTwPrefix(tw.prefix);
                        const next = parseToRgba(tw.rawHexOrOklch || "#fff") ?? { r: 255, g: 255, b: 255, a: tw.alpha ?? 1 };
                        setHsva(rgbaToHsva(next.r, next.g, next.b, next.a));
                    } else {
                        setTwState(null);
                        const parsed = parseToRgba(prevColorStr);
                        if (parsed) {
                            setHsva(rgbaToHsva(parsed.r, parsed.g, parsed.b, parsed.a));
                        }
                    }
                }
                onChange(prevColorStr);
            }
        }
    };

    const handleGoForward = () => {
        if (historyIndex < history.length - 1) {
            const nextIdx = historyIndex + 1;
            setHistoryIndex(nextIdx);
            const nextColorStr = history[nextIdx];
            if (nextColorStr) {
                const grad = parseGradient(nextColorStr);
                if (grad) {
                    setGradient(grad);
                    setTwState(null);
                    const stopColor = grad.stops[0]?.color || "#ffffff";
                    const parsed = parseToRgba(stopColor);
                    if (parsed) {
                        setHsva(rgbaToHsva(parsed.r, parsed.g, parsed.b, parsed.a));
                    }
                } else {
                    setGradient(null);
                    const tw = parseTailwindToken(nextColorStr);
                    if (tw) {
                        setTwState(tw);
                        setTwPrefix(tw.prefix);
                        const next = parseToRgba(tw.rawHexOrOklch || "#fff") ?? { r: 255, g: 255, b: 255, a: tw.alpha ?? 1 };
                        setHsva(rgbaToHsva(next.r, next.g, next.b, next.a));
                    } else {
                        setTwState(null);
                        const parsed = parseToRgba(nextColorStr);
                        if (parsed) {
                            setHsva(rgbaToHsva(parsed.r, parsed.g, parsed.b, parsed.a));
                        }
                    }
                }
                onChange(nextColorStr);
            }
        }
    };

    // Core color state — for gradients, represents the selected stop's color
    const initColor = useMemo(() => {
        if (initGradient) return initGradient.stops[0]?.color || "#ffffff";
        return color;
    }, [color, initGradient]);
    const initRgba = useMemo(() => parseToRgba(initColor) ?? { r: 255, g: 255, b: 255, a: 1 }, [initColor]);
    const initHsva = useMemo(() => rgbaToHsva(initRgba.r, initRgba.g, initRgba.b, initRgba.a), [initRgba]);
    const [hsva, setHsva] = useState<HSVA>(initHsva);
    const rgba = useMemo(() => hsvaToRgba(hsva.h, hsva.s, hsva.v, hsva.a), [hsva]);

    const isDraggingRef = useRef(false);

    // Tailwind state
    const initialTw = useMemo(() => parseTailwindToken(color), [color]);
    const [twState, setTwState] = useState(initialTw);
    const [twPrefix, setTwPrefix] = useState(initialTw?.prefix || "bg");

    const initialTab = useMemo<TabType>(() => {
        const kind = classifyTailwindColorToken(color);
        if (initialTw && !gradient && kind !== "project-semantic") return "Tailwind";
        const t = color.trim().toLowerCase();
        if (t.startsWith("rgb")) return "RGB";
        if (t.startsWith("hsl")) return "HSL";
        if (t.startsWith("oklch")) return "Oklch";
        return "HEX";
    }, [color, initialTw, gradient]);
    const [activeTab, setActiveTab] = useState<TabType>(initialTab);

    const isPaletteTab = activeTab === "Tailwind";
    const isCompact = (layoutWidth ?? PICKER_WIDTH) < COMPACT_BREAKPOINT;

    const visibleTabs = useMemo(() => {
        if (gradient) return BASE_TABS.filter((t) => t !== "Tailwind");
        return BASE_TABS;
    }, [gradient]);

    useEffect(() => {
        if (gradient && activeTab === "Tailwind") {
            setActiveTab("HEX");
        }
    }, [gradient, activeTab]);

    // Segmented input states
    const [inputL, setInputL] = useState("");
    const [inputC, setInputC] = useState("");
    const [inputH, setInputH] = useState("");
    const [inputHs, setInputHs] = useState("");
    const [inputSs, setInputSs] = useState("");
    const [inputLs, setInputLs] = useState("");
    const [inputR, setInputR] = useState("");
    const [inputG, setInputG] = useState("");
    const [inputB, setInputB] = useState("");
    const [bottomInputVal, setBottomInputVal] = useState("");
    const [copiedRow, setCopiedRow] = useState<string | null>(null);

    // ── Formatting ──────────────────────────────────────────

    const getFormattedColor = useCallback((r: RGBA, tab: TabType, tw: typeof twState) => {
        switch (tab) {
            case "HEX": {
                return rgbaToHex(r).toUpperCase();
            }
            case "RGB":
                return r.a < 1
                    ? `rgba(${r.r}, ${r.g}, ${r.b}, ${r.a.toFixed(2)})`
                    : `rgb(${r.r}, ${r.g}, ${r.b})`;
            case "HSL": {
                const h = rgbaToHsla(r.r, r.g, r.b);
                return r.a < 1
                    ? `hsla(${Math.round(h.h)}, ${Math.round(h.s)}%, ${Math.round(h.l)}%, ${r.a.toFixed(2)})`
                    : `hsl(${Math.round(h.h)}, ${Math.round(h.s)}%, ${Math.round(h.l)}%)`;
            }
            case "Oklch": {
                const o = rgbToOklch(r.r, r.g, r.b);
                return r.a < 1
                    ? `oklch(${(o.L * 100).toFixed(1)}% ${o.C.toFixed(3)} ${o.H.toFixed(1)} / ${r.a.toFixed(2)})`
                    : `oklch(${(o.L * 100).toFixed(1)}% ${o.C.toFixed(3)} ${o.H.toFixed(1)})`;
            }
            case "Tailwind": {
                if (tw) {
                    const aStr = r.a < 1 ? `/${Math.round(r.a * 100)}` : "";
                    return tw.shade
                        ? `${tw.prefix}-${tw.family}-${tw.shade}${aStr}`
                        : `${tw.prefix}-${tw.family}${aStr}`;
                }
                return `${twPrefix}-[${rgbaToHex(r)}]`;
            }
            default:
                return rgbaToHex(r);
        }
    }, [twPrefix]);

    // ── Emit ────────────────────────────────────────────────

    const emit = useCallback(
        (nextHsva: HSVA, overrideTab?: TabType, overrideTw?: typeof twState) => {
            setHsva(nextHsva);
            const tab = overrideTab ?? activeTab;
            const tw = overrideTw !== undefined ? overrideTw : twState;
            const nextRgba = hsvaToRgba(nextHsva.h, nextHsva.s, nextHsva.v, nextHsva.a);

            if (gradient) {
                // Keep alpha on stops when present.
                const hex = rgbaToHex(nextRgba);
                const newStops = gradient.stops.map((s, i) =>
                    i === selectedStop ? { ...s, color: hex } : s
                );
                const newGrad = { ...gradient, stops: newStops };
                setGradient(newGrad);
                const gradStr = stringifyGradient(newGrad);
                setBottomInputVal(gradStr);
                onChange(gradStr);
            } else {
                const formatted = getFormattedColor(nextRgba, tab, tw);
                setBottomInputVal(formatted);
                onChange(formatted);
            }
        },
        [onChange, activeTab, twState, getFormattedColor, gradient, selectedStop],
    );

    // ── Sync inputs from color state ────────────────────────
 
    useEffect(() => {
        if (document.activeElement?.closest(".segmented-input-group")) return;

        const o = rgbToOklch(rgba.r, rgba.g, rgba.b);
        const h = rgbaToHsla(rgba.r, rgba.g, rgba.b);
        const nextBottom = getFormattedColor(rgba, activeTab, twState);

        const activeEl = document.activeElement;
        const isBottomFocused = activeEl && activeEl.tagName === "INPUT" && !activeEl.closest(".segmented-input-group");

        const frame = requestAnimationFrame(() => {
            setInputL((o.L * 100).toFixed(1));
            setInputC(o.C.toFixed(3));
            setInputH(o.H.toFixed(1));
            setInputHs(h.h.toFixed(1));
            setInputSs(Math.round(h.s).toString());
            setInputLs(h.l.toFixed(1));
            setInputR(rgba.r.toString());
            setInputG(rgba.g.toString());
            setInputB(rgba.b.toString());
            if (!isDraggingRef.current && !isBottomFocused) {
                if (gradient) {
                    setBottomInputVal(stringifyGradient(gradient));
                } else {
                    setBottomInputVal(nextBottom);
                }
            }
        });

        return () => cancelAnimationFrame(frame);
    }, [rgba, activeTab, twState, getFormattedColor, gradient]);

    // Sync from external prop changes
    useEffect(() => {
        if (isDraggingRef.current) return;
        const grad = parseGradient(color);
        if (grad) {
            setGradient(grad);
            setTwState(null);
            if (activeTab === "Tailwind") {
                setActiveTab("HEX");
            }
            const stopIndex = selectedStop < grad.stops.length ? selectedStop : 0;
            if (stopIndex !== selectedStop) {
                setSelectedStop(stopIndex);
            }
            const stopColor = grad.stops[stopIndex]?.color || "#ffffff";
            const next = parseToRgba(stopColor) ?? { r: 255, g: 255, b: 255, a: 1 };
            const nextHsva = rgbaToHsva(next.r, next.g, next.b, next.a);
            queueMicrotask(() => {
                setHsva((prev) => ({ ...nextHsva, h: nextHsva.s > 0 ? nextHsva.h : prev.h }));
            });
        } else {
            setGradient(null);
            const tw = parseTailwindToken(color);
            if (tw) {
                const next = parseToRgba(tw.rawHexOrOklch || "#fff") ?? { r: 255, g: 255, b: 255, a: tw.alpha ?? 1 };
                const nextHsva = rgbaToHsva(next.r, next.g, next.b, next.a);
                queueMicrotask(() => {
                    setTwState(tw);
                    setTwPrefix(tw.prefix);
                    setHsva((prev) => ({ ...nextHsva, h: nextHsva.s > 0 ? nextHsva.h : prev.h }));
                });
            } else {
                const next = parseToRgba(color) ?? { r: 255, g: 255, b: 255, a: 1 };
                const nextHsva = rgbaToHsva(next.r, next.g, next.b, next.a);
                queueMicrotask(() => {
                    setTwState(null);
                    setHsva((prev) => ({ ...nextHsva, h: nextHsva.s > 0 ? nextHsva.h : prev.h }));
                });
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [color]);

    // ── Input Handlers ──────────────────────────────────────

    const handleOklchInput = (index: number, val: string) => {
        const setters = [setInputL, setInputC, setInputH];
        setters[index](val);
        const n = parseFloat(val);
        if (isNaN(n)) return;
        const o = rgbToOklch(rgba.r, rgba.g, rgba.b);
        let L = o.L, C = o.C, H = o.H;
        if (index === 0) L = n / 100;
        if (index === 1) C = n;
        if (index === 2) H = n;
        L = Math.max(0, Math.min(1, L));
        C = Math.max(0, Math.min(0.4, C));
        H = (H + 360) % 360;
        const rgb = oklchToRgb(L, C, H);
        emit(rgbaToHsva(rgb.r, rgb.g, rgb.b, hsva.a));
    };

    const handleHslInput = (index: number, val: string) => {
        const setters = [setInputHs, setInputSs, setInputLs];
        setters[index](val);
        const n = parseFloat(val);
        if (isNaN(n)) return;
        const hVal = rgbaToHsla(rgba.r, rgba.g, rgba.b);
        let h = hVal.h, s = hVal.s, l = hVal.l;
        if (index === 0) h = n;
        if (index === 1) s = n;
        if (index === 2) l = n;
        h = (h + 360) % 360;
        s = Math.max(0, Math.min(100, s));
        l = Math.max(0, Math.min(100, l));
        const rgb = hslaToRgba(h, s, l, hsva.a);
        emit(rgbaToHsva(rgb.r, rgb.g, rgb.b, hsva.a));
    };

    const handleRgbInput = (index: number, val: string) => {
        const setters = [setInputR, setInputG, setInputB];
        setters[index](val);
        const n = parseInt(val, 10);
        if (isNaN(n)) return;
        const channels = [rgba.r, rgba.g, rgba.b];
        channels[index] = Math.max(0, Math.min(255, n));
        emit(rgbaToHsva(channels[0], channels[1], channels[2], hsva.a));
    };

    const handleBottomSubmit = (val: string) => {
        const tw = parseTailwindToken(val);
        if (tw) {
            const next = parseToRgba(tw.rawHexOrOklch || "#fff") ?? { r: 255, g: 255, b: 255, a: tw.alpha ?? 1 };
            setTwState(tw);
            setTwPrefix(tw.prefix);
            emit(rgbaToHsva(next.r, next.g, next.b, next.a), "Tailwind", tw);
        } else {
            const parsed = parseToRgba(val);
            if (parsed) {
                setTwState(null);
                emit(rgbaToHsva(parsed.r, parsed.g, parsed.b, parsed.a));
            }
        }
    };

    const handleCopy = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopiedRow(key);
        setTimeout(() => setCopiedRow(null), 1000);
    };

    const handleEyeDropper = async () => {
        if (typeof window !== "undefined" && "EyeDropper" in window) {
            try {
                const eyeDropper = new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper();
                const result = await eyeDropper.open();
                const parsed = parseToRgba(result.sRGBHex);
                if (parsed) {
                    const next = rgbaToHsva(parsed.r, parsed.g, parsed.b, parsed.a);
                    setHsva((prev) => ({ ...next, a: prev.a }));
                    emit({ ...next, a: hsva.a });
                }
            } catch { /* user cancel */ }
        }
    };

    const handleTabChange = (newTab: TabType) => {
        setActiveTab(newTab);
        let nextTw = twState;
        if (newTab === "Tailwind" && !twState) {
            nextTw = { prefix: twPrefix, family: "blue", shade: "500", rawHexOrOklch: "#3b82f6", alpha: hsva.a };
            setTwState(nextTw);
            const parsed = parseToRgba("#3b82f6") ?? { r: 59, g: 130, b: 246, a: 1 };
            emit({ ...rgbaToHsva(parsed.r, parsed.g, parsed.b, hsva.a) }, "Tailwind", nextTw);
        } else {
            emit(hsva, newTab, nextTw);
        }
    };

    const cycleFormat = () => {
        const idx = visibleTabs.indexOf(activeTab);
        handleTabChange(visibleTabs[(idx + 1) % visibleTabs.length]);
    };

    // ── Derived values ──────────────────────────────────────

    const hueColor = `hsl(${hsva.h}, 100%, 50%)`;
    const sPct = Math.max(0, Math.min(100, hsva.s));
    const vPct = Math.max(0, Math.min(100, hsva.v));

    const stop = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

    const handleTailwindSelect = useCallback(
        (fam: string, shade: string, raw: string) => {
            const newTw = { prefix: twPrefix, family: fam, shade, rawHexOrOklch: raw, alpha: hsva.a };
            setTwState(newTw);
            const parsed = parseToRgba(raw);
            if (parsed) {
                emit({ ...rgbaToHsva(parsed.r, parsed.g, parsed.b, hsva.a) }, "Tailwind", newTw);
            }
        },
        [twPrefix, hsva.a, emit],
    );

    // ── Render ──────────────────────────────────────────────

    return (
        <div
            className={cn(
                "flex flex-col select-none rounded-xl border border-border-subtle bg-panel-secondary shadow-md text-text-primary font-sans overflow-hidden pb-2",
                isCompact ? "w-full max-w-[480px]" : "w-[480px]",
            )}
            onMouseDown={stop}
            onClick={stop}
        >
            {/* Header */}
            <div className="flex items-center gap-1 p-0.5">
                <div className="flex items-center gap-0.5 shrink-0">
                    <Tooltip content="Previous color">
                        <button type="button" disabled={!prevColor} onClick={handleGoBack} className={cn("p-1 rounded-md hover:bg-panel-hover", !prevColor && "opacity-50")}>
                            <Icon name="arrow_back" size={15} />
                        </button>
                    </Tooltip>
                    <Tooltip content="Next color">
                        <button type="button" disabled={!nextColor} onClick={handleGoForward} className={cn("p-1 rounded-md hover:bg-panel-hover", !nextColor && "opacity-50")}>
                            <Icon name="arrow_forward" size={15} />
                        </button>
                    </Tooltip>
                </div>
                <div className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-0.5 min-w-0">
                    {visibleTabs.map((tab) => (
                        <Button key={tab} type="button" variant="ghost" size="xs" onClick={() => handleTabChange(tab)}
                            className={cn("h-7 px-2.5 text-xs font-medium shrink-0", activeTab === tab ? "bg-panel-active text-text-primary" : "text-text-muted")}>
                            {tab}
                        </Button>
                    ))}
                </div>
                <div className="flex items-center shrink-0 text-text-muted">
                    <button type="button" title="Eyedropper" onClick={handleEyeDropper} className="p-1 hover:bg-panel-hover rounded-md"><Icon name="colorize" size={16} /></button>
                    {onClose && <button type="button" title="Close" onClick={onClose} className="p-1 hover:bg-panel-hover rounded-md"><Icon name="close" size={16} /></button>}
                </div>
            </div>

            {/* Tailwind Prefix Tabs */}
            <div
                className="overflow-hidden transition-all duration-200 ease-in-out"
                style={{ maxHeight: activeTab === "Tailwind" ? 32 : 0 }}
            >
                <div className="flex items-center px-1 h-8">
                    <div className="flex items-center">
                        {["bg", "text", "border", "ring"].map((p) => (
                            <button
                                key={p}
                                onClick={() => {
                                    setTwPrefix(p);
                                    if (twState) {
                                        const newTw = { ...twState, prefix: p };
                                        setTwState(newTw);
                                        emit(hsva, "Tailwind", newTw);
                                    }
                                }}
                                className={`px-2 py-0.5 text-sm capitalize font-medium rounded-lg transition-colors cursor-pointer ${
                                    twPrefix === p
                                        ? "text-text-primary bg-panel-active"
                                        : "text-text-muted hover:text-text-secondary"
                                }`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Area */}
            <div
                className={cn(
                    "flex gap-3 p-1.5",
                    isPaletteTab ? "flex-col" : isCompact ? "flex-col" : "flex-row items-stretch",
                    isPaletteTab ? "min-h-0" : isCompact ? "min-h-0" : "h-[200px]",
                )}
            >
                {/* Left: Canvas or Palette */}
                <div
                    className={cn(
                        "min-w-0 flex",
                        isPaletteTab ? "w-full" : "h-full min-h-[160px] flex-1",
                    )}
                >
                    {activeTab === "Tailwind" ? (
                        <TailwindPalette
                            hsva={hsva}
                            twPrefix={twPrefix}
                            twState={twState}
                            onSelect={handleTailwindSelect}
                        />
                    ) : (
                        <ColorCanvas
                            hsva={hsva}
                            hueColor={hueColor}
                            sPct={sPct}
                            vPct={vPct}
                            onDrag={(next) => {
                                isDraggingRef.current = true;
                                emit(next);
                                requestAnimationFrame(() => { isDraggingRef.current = false; });
                            }}
                        />
                    )}
                </div>

                {/* Right: Inputs — hidden on palette tabs, stacks below when compact */}
                {!isPaletteTab && (
                <div className={cn("shrink-0 flex flex-col gap-2 justify-center", isCompact ? "w-full" : "w-[200px]")}>
                    <SegmentedInput
                        values={[inputL, inputC, inputH]}
                        labels={["L", "C", "H"]}
                        titles={["Lightness", "Chroma", "Hue"]}
                        onChange={handleOklchInput}
                        copyValue={`oklch(${inputL}% ${inputC} ${inputH})`}
                        copyKey="oklch"
                        copiedRow={copiedRow}
                        onCopy={handleCopy}
                    />
                    <SegmentedInput
                        values={[inputHs, inputSs, inputLs]}
                        labels={["H", "S", "L"]}
                        titles={["Hue", "Saturation", "Lightness"]}
                        onChange={handleHslInput}
                        copyValue={`hsl(${inputHs}, ${inputSs}%, ${inputLs}%)`}
                        copyKey="hsl"
                        copiedRow={copiedRow}
                        onCopy={handleCopy}
                    />
                    <SegmentedInput
                        values={[inputR, inputG, inputB]}
                        labels={["R", "G", "B"]}
                        titles={["Red", "Green", "Blue"]}
                        onChange={handleRgbInput}
                        copyValue={`rgb(${inputR}, ${inputG}, ${inputB})`}
                        copyKey="rgb"
                        copiedRow={copiedRow}
                        onCopy={handleCopy}
                    />
                    {/* Format string + cycle — lives in the right column */}
                    <div className="flex items-center gap-1">
                        <input
                            type="text"
                            value={bottomInputVal}
                            onChange={(e) => setBottomInputVal(e.target.value)}
                            onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Enter") {
                                    handleBottomSubmit(bottomInputVal);
                                    (e.target as HTMLInputElement).blur();
                                }
                            }}
                            onBlur={() => handleBottomSubmit(bottomInputVal)}
                            className="bg-panel-hover rounded-lg flex-1 h-8 text-center text-xs text-text-primary outline-none focus:border-border select-text"
                        />
                        <button
                            type="button"
                            title="Cycle format"
                            onClick={cycleFormat}
                            className="flex items-center justify-center w-8 h-8 rounded-lg bg-panel-hover text-text-muted hover:text-text-primary transition-colors cursor-pointer shrink-0"
                        >
                            <Icon name="unfold_more" size={16} />
                        </button>
                    </div>
                </div>
                )}

                {/* Palette tabs — format row sits below the palette */}
                {isPaletteTab && (
                <div className="w-full flex flex-col gap-2 justify-end pb-2">
                    <div className="flex items-center gap-1">
                        <input
                            type="text"
                            value={bottomInputVal}
                            onChange={(e) => setBottomInputVal(e.target.value)}
                            onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Enter") {
                                    handleBottomSubmit(bottomInputVal);
                                    (e.target as HTMLInputElement).blur();
                                }
                            }}
                            onBlur={() => handleBottomSubmit(bottomInputVal)}
                            className="bg-panel-hover rounded-lg flex-1 h-8 text-center text-xs text-text-primary outline-none focus:border-border select-text"
                        />
                        <button
                            type="button"
                            title="Cycle format"
                            onClick={cycleFormat}
                            className="flex items-center justify-center w-8 h-8 rounded-lg bg-panel-hover text-text-muted hover:text-text-primary transition-colors cursor-pointer shrink-0"
                        >
                            <Icon name="unfold_more" size={16} />
                        </button>
                    </div>
                </div>
                )}
            </div>

            {/* Gradient Bar */}
            {gradient && (
                <GradientBar
                    gradient={gradient}
                    selectedStop={selectedStop}
                    onSelectStop={(idx) => {
                        setSelectedStop(idx);
                        const stopColor = gradient.stops[idx]?.color;
                        if (stopColor) {
                            const parsed = parseToRgba(stopColor);
                            if (parsed) {
                                setHsva(rgbaToHsva(parsed.r, parsed.g, parsed.b, parsed.a));
                            }
                        }
                    }}
                    onStopPositionChange={(idx, pos) => {
                        const newStops = gradient.stops.map((s, i) =>
                            i === idx ? { ...s, position: pos } : s
                        );
                        const newGrad = { ...gradient, stops: newStops };
                        setGradient(newGrad);
                        const gradStr = stringifyGradient(newGrad);
                        setBottomInputVal(gradStr);
                        onChange(gradStr);
                    }}
                    onAddStop={(pos, clr) => {
                        const newStops = [...gradient.stops, { color: clr, position: pos }]
                            .sort((a, b) => a.position - b.position);
                        const newGrad = { ...gradient, stops: newStops };
                        setGradient(newGrad);
                        const idx = newStops.findIndex(s => s.position === pos && s.color === clr);
                        setSelectedStop(idx >= 0 ? idx : newStops.length - 1);
                        const gradStr = stringifyGradient(newGrad);
                        setBottomInputVal(gradStr);
                        onChange(gradStr);
                    }}
                    onRemoveStop={(idx) => {
                        if (gradient.stops.length <= 2) return;
                        const newStops = gradient.stops.filter((_, i) => i !== idx);
                        const newGrad = { ...gradient, stops: newStops };
                        setGradient(newGrad);
                        setSelectedStop(Math.min(selectedStop, newStops.length - 1));
                        const gradStr = stringifyGradient(newGrad);
                        setBottomInputVal(gradStr);
                        onChange(gradStr);
                    }}
                    onGradientMetaChange={(patch) => {
                        const newGrad = { ...gradient, ...patch };
                        setGradient(newGrad);
                        const gradStr = stringifyGradient(newGrad);
                        setBottomInputVal(gradStr);
                        onChange(gradStr);
                    }}
                />
            )}
        </div>
    );
}
