"use client";

import React, { useCallback, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DesignPreviewItem } from "./gallery";

function isHtmlPreview(item: DesignPreviewItem): boolean {
    if (item.kind === "html") return true;
    if (item.kind === "png") return false;
    return /\.html?$/i.test(item.path);
}

export function DesignPreviewCarousel({
    items,
    activeIndex,
    onActiveIndexChange,
    selectedId = "",
    locked = false,
    onSelect,
    compact = false,
}: {
    items: DesignPreviewItem[];
    activeIndex: number;
    onActiveIndexChange: (index: number) => void;
    selectedId?: string;
    /** When true, selection is final  -  no further picks. */
    locked?: boolean;
    onSelect?: (item: DesignPreviewItem) => void;
    /** Tighter layout for chat (vs full editor pane). */
    compact?: boolean;
}) {
    const count = items.length;
    const item = items[activeIndex];
    const [slideDir, setSlideDir] = useState<"up" | "down">("up");
    const [animKey, setAnimKey] = useState(0);

    const go = useCallback(
        (delta: number) => {
            if (count < 2) return;
            setSlideDir(delta > 0 ? "up" : "down");
            setAnimKey((k) => k + 1);
            onActiveIndexChange((activeIndex + delta + count) % count);
        },
        [count, activeIndex, onActiveIndexChange],
    );

    useEffect(() => {
        if (compact) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                e.preventDefault();
                go(-1);
            } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                e.preventDefault();
                go(1);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [go, compact]);

    if (!item) return null;

    const src = convertFileSrc(item.path);
    const html = isHtmlPreview(item);
    const isSelected = selectedId === item.id;
    const canSelect = !!onSelect && !locked;

    return (
        <div className={cn("flex min-h-0 w-full flex-col", compact ? "gap-2" : "h-full")}>
            <style>{`
                @keyframes designPreviewSlideUp {
                    from { opacity: 0; transform: translateY(14px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes designPreviewSlideDown {
                    from { opacity: 0; transform: translateY(-14px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            <div className="flex shrink-0 items-start justify-between gap-2 px-0.5">
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{item.name}</p>
                    <p className="truncate text-xs text-text-muted">{item.style}</p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-text-muted">
                    {activeIndex + 1}/{count}
                </span>
            </div>

            <div
                className={cn(
                    "relative min-h-0 overflow-hidden rounded-md border border-border-subtle bg-white",
                    compact ? "aspect-16/10" : "flex-1",
                )}
            >
                <div
                    key={animKey}
                    className="absolute inset-0"
                    style={{
                        animation: `${
                            slideDir === "up" ? "designPreviewSlideUp" : "designPreviewSlideDown"
                        } 260ms ease-out`,
                    }}
                >
                    {html ? (
                        <iframe
                            title={item.name}
                            src={src}
                            className="h-full w-full border-0"
                            style={
                                compact
                                    ? {
                                          width: item.width,
                                          height: item.height,
                                          transform: `scale(${Math.min(1, 480 / Math.max(item.width, 1))})`,
                                          transformOrigin: "top left",
                                      }
                                    : undefined
                            }
                            sandbox="allow-scripts"
                        />
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={src}
                            alt={item.name}
                            className="h-full w-full object-contain object-top"
                            draggable={false}
                        />
                    )}
                </div>
            </div>

            <div className="flex shrink-0 flex-col items-center gap-2">
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={count < 2}
                        onClick={() => go(-1)}
                        aria-label="Previous concept"
                    >
                        <Icon name="expand_less" size={18} />
                    </Button>
                    <p className="min-w-0 max-w-[200px] truncate text-center text-xs text-text-secondary">
                        {item.name}
                    </p>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={count < 2}
                        onClick={() => go(1)}
                        aria-label="Next concept"
                    >
                        <Icon name="expand_more" size={18} />
                    </Button>
                </div>

                {count > 1 ? (
                    <div className="flex flex-wrap justify-center gap-1">
                        {items.map((preview, index) => (
                            <button
                                key={preview.id}
                                type="button"
                                title={preview.name}
                                className={cn(
                                    "h-1.5 w-1.5 rounded-full transition-colors",
                                    index === activeIndex
                                        ? "bg-text-primary"
                                        : "bg-text-disabled hover:bg-text-muted",
                                )}
                                onClick={() => {
                                    if (index === activeIndex) return;
                                    setSlideDir(index > activeIndex ? "up" : "down");
                                    setAnimKey((k) => k + 1);
                                    onActiveIndexChange(index);
                                }}
                            />
                        ))}
                    </div>
                ) : null}

                {onSelect ? (
                    <div className="flex w-full justify-end">
                        <Button
                            size="sm"
                            disabled={!canSelect || (locked && isSelected)}
                            onClick={() => onSelect(item)}
                        >
                            {locked || isSelected ? "Selected" : "Select this design"}
                        </Button>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
