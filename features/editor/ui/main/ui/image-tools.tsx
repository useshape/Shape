"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { LabeledSlider, Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export type ImageSessionActions = {
    undo: () => void;
    redo: () => void;
    save: () => Promise<void>;
    discard: () => void;
    isDirty: boolean;
    canUndo: boolean;
    canRedo: boolean;
};

export interface ImageAdjustments {
    brightness: number;
    contrast: number;
    saturation: number;
    temperature: number;
    tint: number;
    exposure: number;
    highlights: number;
    shadows: number;
    sharpen: number;
    vignette: number;
}

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    temperature: 0,
    tint: 0,
    exposure: 0,
    highlights: 0,
    shadows: 0,
    sharpen: 0,
    vignette: 0,
};

interface ImageToolsCardProps {
    adjustments: ImageAdjustments;
    session: ImageSessionActions;
    onPreview: (adjustments: ImageAdjustments) => void;
    onCommit: (adjustments: ImageAdjustments) => void;
    onSave: () => void;
    className?: string;
}

export function ImageAdjustmentsPanel({
    open,
    children,
}: {
    open: boolean;
    children: React.ReactNode;
}) {
    const [mounted, setMounted] = useState(open);
    const [state, setState] = useState<"open" | "closed">(open ? "open" : "closed");

    useEffect(() => {
        if (open) {
            setMounted(true);
            const frame = requestAnimationFrame(() => setState("open"));
            return () => cancelAnimationFrame(frame);
        }

        setState("closed");
        const timer = window.setTimeout(() => setMounted(false), 75);
        return () => window.clearTimeout(timer);
    }, [open]);

    if (!open && !mounted) return null;
    if (!mounted) return null;

    return (
        <div
            data-state={state}
            className="image-adjustments-panel shape-popover-content shape-popover-content--from-right pointer-events-auto absolute top-2 right-2 z-30 flex max-h-[calc(100%-1rem)] w-[280px] flex-col overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
        >
            {children}
        </div>
    );
}

function CollapsibleSection({
    title,
    icon,
    defaultOpen = true,
    children,
}: {
    title: string;
    icon: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className="rounded-xl bg-surface-3 overflow-hidden">
            <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-2 text-left"
                onClick={() => setOpen((v) => !v)}
            >
                <Icon name={icon} size={14} className="text-text-secondary shrink-0" />
                <span className="flex-1 text-sm text-text-primary">{title}</span>
                <Icon name={open ? "expand_less" : "chevron_right"} size={14} className="text-text-muted" />
            </button>
            {open ? (
                <div className="space-y-3 px-2.5 pb-3">
                    {children}
                </div>
            ) : null}
        </div>
    );
}

function EffectSlider({
    label,
    value,
    onPreview,
    onCommit,
}: {
    label: string;
    value: number;
    onPreview: (value: number) => void;
    onCommit: (value: number) => void;
}) {
    return (
        <div className="rounded-md bg-surface-3 px-2.5 py-3">
            <div className="mb-2 flex items-center justify-between px-1 text-sm">
                <span className="text-text-secondary">{label}</span>
                <span className="tabular-nums text-text-primary">{value.toFixed(2)}</span>
            </div>
            <Slider
                min={0}
                max={1}
                step={0.01}
                value={[value]}
                onValueChange={(v) => onPreview(v[0] ?? value)}
                onValueCommit={(v) => onCommit(v[0] ?? value)}
            />
        </div>
    );
}

export function ImageToolsCard({
    adjustments: adj,
    session,
    onPreview,
    onCommit,
    onSave,
    className,
}: ImageToolsCardProps) {
    const preview = useCallback(
        (patch: Partial<ImageAdjustments>) => {
            onPreview({ ...adj, ...patch });
        },
        [adj, onPreview],
    );

    const commit = useCallback(
        (patch: Partial<ImageAdjustments>) => {
            onCommit({ ...adj, ...patch });
        },
        [adj, onCommit],
    );

    const resetAdjustments = () => {
        commit({ ...DEFAULT_ADJUSTMENTS });
    };

    return (
        <aside
            className={cn(
                "image-tools-card flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-border-subtle bg-panel text-text-primary font-sans select-none shadow-md",
                className,
            )}
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
        >
            <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5">
                <span className="text-sm font-regular">Adjustments</span>
                <div className="flex items-center gap-0.5">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={resetAdjustments}
                        title="Reset adjustments"
                    >
                        <Icon name="refresh" size={16} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={!session.canUndo}
                        onClick={() => session.undo()}
                        title="Undo"
                    >
                        <Icon name="undo" size={16} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={!session.canRedo}
                        onClick={() => session.redo()}
                        title="Redo"
                    >
                        <Icon name="redo" size={16} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={!session.isDirty}
                        onClick={() => session.discard()}
                        title="Discard changes"
                    >
                        <Icon name="close" size={16} />
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2.5"
                        disabled={!session.isDirty}
                        onClick={onSave}
                    >
                        Save
                    </Button>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-3 py-3 space-y-2">
                <CollapsibleSection title="White Balance" icon="light_mode">
                    <LabeledSlider
                        label="Temperature"
                        value={adj.temperature}
                        min={-100}
                        max={100}
                        trackClassName="bg-[linear-gradient(to_right,#4f86ff,#ffffff,#ffd166)]"
                        onChange={(temperature) => preview({ temperature })}
                        onCommit={(temperature) => commit({ temperature })}
                    />
                    <LabeledSlider
                        label="Tint"
                        value={adj.tint}
                        min={-100}
                        max={100}
                        trackClassName="bg-[linear-gradient(to_right,#4ade80,#d946ef)]"
                        onChange={(tint) => preview({ tint })}
                        onCommit={(tint) => commit({ tint })}
                    />
                </CollapsibleSection>

                <CollapsibleSection title="Tone" icon="zap">
                    <LabeledSlider label="Exposure" value={adj.exposure} min={-100} max={100} onChange={(exposure) => preview({ exposure })} onCommit={(exposure) => commit({ exposure })} />
                    <LabeledSlider label="Contrast" value={adj.contrast - 100} min={-100} max={100} onChange={(v) => preview({ contrast: v + 100 })} onCommit={(v) => commit({ contrast: v + 100 })} />
                    <LabeledSlider label="Highlight" value={adj.highlights} min={-100} max={100} onChange={(highlights) => preview({ highlights })} onCommit={(highlights) => commit({ highlights })} />
                    <LabeledSlider label="Shadows" value={adj.shadows} min={-100} max={100} onChange={(shadows) => preview({ shadows })} onCommit={(shadows) => commit({ shadows })} />
                    <LabeledSlider label="Saturation" value={adj.saturation - 100} min={-100} max={100} onChange={(v) => preview({ saturation: v + 100 })} onCommit={(v) => commit({ saturation: v + 100 })} />
                </CollapsibleSection>

                <CollapsibleSection title="Sharpen" icon="filter">
                    <EffectSlider
                        label="Intensity"
                        value={adj.sharpen}
                        onPreview={(sharpen) => preview({ sharpen })}
                        onCommit={(sharpen) => commit({ sharpen })}
                    />
                </CollapsibleSection>

                <CollapsibleSection title="Vignette" icon="radio_button_unchecked">
                    <EffectSlider
                        label="Strength"
                        value={adj.vignette}
                        onPreview={(vignette) => preview({ vignette })}
                        onCommit={(vignette) => commit({ vignette })}
                    />
                </CollapsibleSection>
            </div>
        </aside>
    );
}

export function buildImageFilter(adj: ImageAdjustments): string {
    const exposureBoost = 100 + adj.exposure * 0.5;
    const brightness = adj.brightness * (exposureBoost / 100);
    const contrast = adj.contrast + adj.highlights * 0.1 - adj.shadows * 0.05;
    const saturate = adj.saturation;
    const temp = adj.temperature;
    const tint = adj.tint;
    const hue = temp * 0.15 + tint * 0.25;
    const sepia = Math.max(0, temp * 0.08);
    return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) hue-rotate(${hue}deg) sepia(${sepia}%)`;
}
