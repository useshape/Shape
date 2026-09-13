"use client";

import { RiSparkling2Line } from "@remixicon/react";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Reveal text into a field with a short stream-in feel (backend is one-shot). */
export async function streamTextInto(
    text: string,
    onChunk: (partial: string) => void,
    opts?: { msPerChar?: number },
): Promise<void> {
    const full = text.trim();
    if (!full) {
        onChunk("");
        return;
    }
    const ms = opts?.msPerChar ?? 8;
    let i = 0;
    const step = Math.max(1, Math.ceil(full.length / 48));
    while (i < full.length) {
        i = Math.min(full.length, i + step);
        onChunk(full.slice(0, i));
        if (i < full.length) {
            await new Promise((r) => setTimeout(r, ms * step));
        }
    }
}

/**
 * GitKraken-style sparkle on a text field.
 * Must sit above the input hit target (`z-10` + `pointer-events-auto`).
 */
export function GenerateStarButton({
    loading,
    disabled,
    onClick,
    className,
    label = "Generate",
}: {
    loading?: boolean;
    disabled?: boolean;
    onClick: () => void;
    className?: string;
    label?: string;
}) {
    return (
        <Tooltip content={label}>
            <button
                type="button"
                disabled={disabled || loading}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (disabled || loading) return;
                    onClick();
                }}
                onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                aria-label={label}
                aria-busy={loading || undefined}
                className={cn(
                    "absolute z-10 inline-flex size-7 shrink-0 items-center justify-center rounded-md",
                    "pointer-events-auto text-text-muted",
                    "hover:bg-panel-hover hover:text-text-primary",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
                    "disabled:pointer-events-none disabled:opacity-40",
                    loading && "text-accent",
                    className,
                )}
            >
                <Icon
                    icon={RiSparkling2Line}
                    className={cn("size-3.5", loading && "animate-spin")}
                />
            </button>
        </Tooltip>
    );
}
