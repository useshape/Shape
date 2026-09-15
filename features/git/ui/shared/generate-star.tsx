"use client";

import { RiAiGenerate } from "@remixicon/react";
import { Icon, ICON_SIZE_MD } from "@/components/ui/icon";
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
 * Generate-commit control inside a text field (bottom-right star).
 * Parent must be `relative`. Sit above the input hit target.
 */
export function GenerateStarButton({
    loading,
    disabled,
    onClick,
    className,
    label = "Generate commit message",
    placement = "corner",
}: {
    loading?: boolean;
    disabled?: boolean;
    onClick: () => void;
    className?: string;
    label?: string;
    placement?: "corner" | "inline";
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
                    placement === "corner"
                        ? "bottom-1 right-1"
                        : "right-1 top-1/2 -translate-y-1/2",
                    "hover:bg-panel-hover hover:text-text-primary",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
                    "disabled:pointer-events-none disabled:opacity-40",
                    "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                    loading && "text-accent",
                    className,
                )}
            >
                <Icon
                    icon={RiAiGenerate}
                    size={ICON_SIZE_MD}
                    className={cn(loading && "animate-pulse")}
                />
            </button>
        </Tooltip>
    );
}
