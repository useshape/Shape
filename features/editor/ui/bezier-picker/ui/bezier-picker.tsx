"use client";

import React, { useState, useMemo, useCallback, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown";
import { parseBezier, stringifyBezier, BEZIER_PRESETS } from "./bezier-utils";

// ── Types ───────────────────────────────────────────────────

interface BezierPickerProps {
    value: string;
    onChange: (value: string) => void;
    onClose?: () => void;
}

const MAIN_PRESETS = ["ease", "linear", "ease-in", "ease-out", "ease-in-out"];

// ── Main Component ──────────────────────────────────────────

export function BezierPicker({ value, onChange, onClose }: BezierPickerProps) {
    // Parse initial value
    const parsed = useMemo(() => {
        return parseBezier(value) ?? { points: [0.25, 0.1, 0.25, 1] as [number, number, number, number], format: "cubic-bezier" as const };
    }, [value]);

    const [points, setPoints] = useState<[number, number, number, number]>(parsed.points);
    const [format, setFormat] = useState<"cubic-bezier" | "array" | "preset">(parsed.format);

    // History States
    const [history, setHistory] = useState<[number, number, number, number][]>([parsed.points]);
    const [historyIndex, setHistoryIndex] = useState(0);

    const [bottomInputVal, setBottomInputVal] = useState(value);

    // Sync state when external value changes (during render to satisfy React ESLint)
    const [prevValue, setPrevValue] = useState(value);
    if (value !== prevValue) {
        setPrevValue(value);
        const nextParsed = parseBezier(value);
        if (nextParsed) {
            setPoints(nextParsed.points);
            setFormat(nextParsed.format);
            setBottomInputVal(value);
        }
    }

    const bottomInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Emit changes helper
    const emit = useCallback((newPoints: [number, number, number, number], newFormat = format) => {
        setPoints(newPoints);
        const str = stringifyBezier(newPoints, newFormat);
        setBottomInputVal(str);
        onChange(str);
    }, [format, onChange]);

    // Push new state to history
    const pushToHistory = useCallback((newPoints: [number, number, number, number]) => {
        const nextHistory = history.slice(0, historyIndex + 1);
        nextHistory.push(newPoints);
        setHistory(nextHistory);
        setHistoryIndex(nextHistory.length - 1);
    }, [history, historyIndex]);

    // Handle Drag Points
    const [x1, y1, x2, y2] = points;

    const handleMouseDown = (pointIndex: 1 | 2) => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const mouseX = moveEvent.clientX - rect.left;
            const mouseY = moveEvent.clientY - rect.top;

            // X goes from 0 to 1, mapped directly
            let x = mouseX / rect.width;
            // Y goes from -0.5 to 1.5, mapped such that 25% from top is 1.0, 75% is 0.0
            let y = 1.5 - (mouseY / rect.height) * 2;

            // Constraints
            x = Math.max(0, Math.min(1, x));
            y = Math.max(-0.5, Math.min(1.5, y));

            const nextPoints: [number, number, number, number] = pointIndex === 1 
                ? [x, y, points[2], points[3]]
                : [points[0], points[1], x, y];

            emit(nextPoints);
        };

        const handleMouseUp = () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            pushToHistory(points);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    };

    // Undo / Redo Handlers
    const handleUndo = () => {
        if (historyIndex > 0) {
            const nextIndex = historyIndex - 1;
            setHistoryIndex(nextIndex);
            const prevPoints = history[nextIndex];
            emit(prevPoints);
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const nextIndex = historyIndex + 1;
            setHistoryIndex(nextIndex);
            const nextPoints = history[nextIndex];
            emit(nextPoints);
        }
    };

    // Format Cycled
    const cycleFormat = () => {
        let nextFormat: typeof format = "cubic-bezier";
        if (format === "cubic-bezier") nextFormat = "array";
        else if (format === "array") nextFormat = "preset";
        else nextFormat = "cubic-bezier";

        setFormat(nextFormat);
        emit(points, nextFormat);
    };

    const handlePresetSelect = (presetName: string) => {
        const newPoints = BEZIER_PRESETS[presetName];
        if (newPoints) {
            emit([...newPoints], "preset");
            pushToHistory([...newPoints]);
        }
    };

    const handleBottomSubmit = (val: string) => {
        const parsedBezier = parseBezier(val);
        if (parsedBezier) {
            emit(parsedBezier.points, parsedBezier.format);
            pushToHistory(parsedBezier.points);
        }
    };

    // Math coords coordinates to SVG percentage coordinates
    const mapX = (xVal: number) => xVal * 100;
    const mapY = (yVal: number) => ((1.5 - yVal) / 2) * 100;

    const stop = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

    // Active preset name detection
    const activePresetName = useMemo(() => {
        const match = Object.entries(BEZIER_PRESETS).find(([, pts]) => 
            Math.abs(pts[0] - x1) < 0.001 &&
            Math.abs(pts[1] - y1) < 0.001 &&
            Math.abs(pts[2] - x2) < 0.001 &&
            Math.abs(pts[3] - y2) < 0.001
        );
        return match ? match[0] : null;
    }, [x1, y1, x2, y2]);

    const prevPointsValue = historyIndex > 0 ? history[historyIndex - 1] : null;
    const nextPointsValue = historyIndex < history.length - 1 ? history[historyIndex + 1] : null;

    return (
        <div
            className="flex flex-col select-none z-50 rounded-lg bg-editor-secondary border border-border shadow-sm text-text-primary relative font-sans"
            style={{ width: 530 }}
            onMouseDown={stop}
            onClick={stop}
        >
            {/* Tooltip Arrow */}
            <svg
                width="14"
                height="7"
                viewBox="0 0 14 7"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="absolute -top-[7px] left-4 fill-editor-secondary filter-none"
            >
                <path d="M7 0L14 7H0L7 0Z" />
            </svg>

            {/* Tab/Preset Bar */}
            <div className="flex items-center justify-between px-1.5 h-8">
                <div className="flex items-center gap-1">
                    {/* Undo / Redo Navigation */}
                    <div className="flex items-center gap-0.5 mr-1">
                        <Tooltip
                            content={
                                prevPointsValue ? (
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-sm">{stringifyBezier(prevPointsValue, format)}</span>
                                    </div>
                                ) : (
                                    "No undo history"
                                )
                            }
                        >
                            <button
                                type="button"
                                disabled={!prevPointsValue}
                                onClick={handleUndo}
                                className={`p-0.5 rounded hover:bg-panel-hover transition-colors ${
                                    prevPointsValue ? "text-text-primary cursor-pointer" : "text-text-muted cursor-not-allowed opacity-50"
                                }`}
                            >
                                <Icon name="arrow_back" size={16} />
                            </button>
                        </Tooltip>

                        <Tooltip
                            content={
                                nextPointsValue ? (
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-sm">{stringifyBezier(nextPointsValue, format)}</span>
                                    </div>
                                ) : (
                                    "No redo history"
                                )
                            }
                        >
                            <button
                                type="button"
                                disabled={!nextPointsValue}
                                onClick={handleRedo}
                                className={`p-0.5 rounded hover:bg-panel-hover transition-colors ${
                                    nextPointsValue ? "text-text-primary cursor-pointer" : "text-text-muted cursor-not-allowed opacity-50"
                                }`}
                            >
                                <Icon name="arrow_forward" size={16} />
                            </button>
                        </Tooltip>
                    </div>

                    {/* Main Presets as Tabs */}
                    {MAIN_PRESETS.map((preset) => (
                        <button
                            key={preset}
                            onClick={() => handlePresetSelect(preset)}
                            className={`px-2 py-0.5 text-sm font-medium rounded-lg transition-colors cursor-pointer capitalize ${
                                activePresetName === preset
                                    ? "text-text-primary bg-panel-active"
                                    : "text-text-muted hover:text-text-secondary"
                            }`}
                        >
                            {preset === "ease-in-out" ? "In Out" : preset === "ease-in" ? "In" : preset === "ease-out" ? "Out" : preset}
                        </button>
                    ))}

                    {/* More Presets Dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                className={`px-2 py-0.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                                    activePresetName && !MAIN_PRESETS.includes(activePresetName)
                                        ? "text-text-primary bg-panel-active"
                                        : "text-text-muted hover:text-text-secondary"
                                }`}
                            >
                                More...
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="max-h-64 overflow-y-auto min-w-[200px] bg-panel-secondary/80 backdrop-blur-lg rounded-xl border border-border p-1 custom-scrollbar" align="start">
                            <div className="grid grid-cols-2 gap-1">
                                {Object.keys(BEZIER_PRESETS)
                                    .filter((name) => !MAIN_PRESETS.includes(name))
                                    .map((name) => (
                                        <DropdownMenuItem
                                            key={name}
                                            onSelect={() => handlePresetSelect(name)}
                                            className={`px-1.5 py-1 text-sm text-left truncate rounded-lg hover:bg-panel-hover transition-colors text-text-secondary hover:text-text-primary cursor-pointer ${
                                                activePresetName === name ? "bg-panel-active font-medium text-text-primary" : ""
                                            }`}
                                            title={name}
                                        >
                                            {name.replace("ease-", "")}
                                        </DropdownMenuItem>
                                    ))}
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="flex items-center text-text-muted">
                    {onClose && (
                        <button
                            title="Close"
                            onClick={onClose}
                            className="p-1 hover:bg-panel-hover hover:text-text-primary rounded transition-colors cursor-pointer"
                        >
                            <Icon name="close" size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Curve Editor Grid Area */}
            <div className="py-2">
                <div
                    ref={containerRef}
                    className="relative w-full h-[200px] overflow-hidden cursor-crosshair"
                >
                    {/* SVG Grid and Curve */}
                    <svg
                        className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                    >
                        {/* Grid Lines */}
                        {/* Y = 1 line (top dashed line) */}
                        <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
                        {/* Y = 0 line (bottom dashed line) */}
                        <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
                        {/* X = 0.5 center guide */}
                        <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />

                        {/* Control Handle Lines (purple Blender style) */}
                        <line
                            x1="0"
                            y1="75"
                            x2={mapX(x1)}
                            y2={mapY(y1)}
                            stroke="#c084fc"
                            strokeWidth="1.5"
                            vectorEffect="non-scaling-stroke"
                        />
                        <line
                            x1="100"
                            y1="25"
                            x2={mapX(x2)}
                            y2={mapY(y2)}
                            stroke="#c084fc"
                            strokeWidth="1.5"
                            vectorEffect="non-scaling-stroke"
                        />

                        {/* Bezier Easing Curve Path (vibrant red Blender style) */}
                        <path
                            d={`M 0 75 C ${mapX(x1)} ${mapY(y1)}, ${mapX(x2)} ${mapY(y2)}, 100 25`}
                            fill="none"
                            stroke="#ef4444"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>

                    {/* Static Keyframe Dots (HTML elements to prevent stretching) */}
                    <div
                        className="absolute w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#18181b] border-[1.5px] border-white pointer-events-none z-10"
                        style={{ left: "0%", top: "75%" }}
                    />
                    <div
                        className="absolute w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#18181b] border-[1.5px] border-white pointer-events-none z-10"
                        style={{ left: "100%", top: "25%" }}
                    />

                    {/* Interactive Handles (HTML elements for precise grabbing) */}
                    {/* Handle 1 (P1) */}
                    <div
                        className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-grab active:cursor-grabbing z-20 group"
                        style={{ left: `${x1 * 100}%`, top: `${mapY(y1)}%` }}
                        onMouseDown={handleMouseDown(1)}
                    >
                        <div className="w-2.5 h-2.5 rounded-full bg-[#c084fc] border border-white group-hover:scale-125 transition-transform shadow-md" />
                    </div>

                    {/* Handle 2 (P2) */}
                    <div
                        className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-grab active:cursor-grabbing z-20 group"
                        style={{ left: `${x2 * 100}%`, top: `${mapY(y2)}%` }}
                        onMouseDown={handleMouseDown(2)}
                    >
                        <div className="w-2.5 h-2.5 rounded-full bg-[#c084fc] border border-white group-hover:scale-125 transition-transform shadow-md" />
                    </div>

                    {/* Grid Corner Labels */}
                    <div className="absolute top-2 left-2 text-sm text-text-secondary pointer-events-none">Progression</div>
                    <div className="absolute bottom-2 right-2 text-sm text-text-secondary pointer-events-none">Time</div>
                </div>
            </div>

            {/* Animation Easing Preview Bar */}
            <div className="px-1.5 pb-2">
                <style>{`
                    @keyframes bezier-preview-loop {
                        0% { left: 0%; }
                        80% { left: calc(100% - 14px); }
                        100% { left: calc(100% - 14px); }
                    }
                `}</style>
                <div className="relative w-full h-5 flex items-center overflow-hidden border border-border">
                    {/* Animation Track */}
                    <div className="relative flex-1 h-6 rounded-lg overflow-hidden">
                        {/* Easing Dot */}
                        <div
                            key={`${x1}-${y1}-${x2}-${y2}`} // Re-mount or reset animation on change
                            className="absolute top-0.5 w-1 h-10 bg-white/50"
                            style={{
                                animation: `bezier-preview-loop 1.8s cubic-bezier(${x1.toFixed(3)}, ${y1.toFixed(3)}, ${x2.toFixed(3)}, ${y2.toFixed(3)}) infinite`
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Bottom Format & Input Controls */}
            <div className="flex items-center px-1.5 pb-1.5 gap-1.5">
                <input
                    ref={bottomInputRef}
                    type="text"
                    value={bottomInputVal}
                    onChange={(e) => setBottomInputVal(e.target.value)}
                    onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") {
                            handleBottomSubmit(bottomInputVal);
                            bottomInputRef.current?.blur();
                        }
                    }}
                    onBlur={() => handleBottomSubmit(bottomInputVal)}
                    className="border border-border rounded-lg flex-1 h-7 px-3 text-sm text-text-primary outline-none focus:border-border select-text font-mono"
                />
                
                {/* Format Toggle button */}
                <button
                    title="Cycle format"
                    onClick={cycleFormat}
                    className="flex items-center justify-center w-7 h-7 rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-panel-secondary transition-colors cursor-pointer shrink-0"
                >
                    <Icon name="unfold_more" size={16} />
                </button>
            </div>
        </div>
    );
}
