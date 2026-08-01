"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { COLOR_THEMES, COLOR_THEME_ORDER, type ColorThemeId } from "@/lib/themes";
import { ThemeWorkbenchPreview } from "./theme-workbench-preview";

/** Accessible radiogroup of theme cards with a live mini workbench preview. */
export function ThemePicker({
    value,
    onChange,
    className,
    ariaLabel = "Color theme",
}: {
    value: ColorThemeId;
    onChange: (id: ColorThemeId) => void;
    className?: string;
    ariaLabel?: string;
}) {
    const groupRef = useRef<HTMLDivElement>(null);

    const moveFocus = (fromIndex: number, delta: number) => {
        const next = (fromIndex + delta + COLOR_THEME_ORDER.length) % COLOR_THEME_ORDER.length;
        const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
        buttons?.[next]?.focus();
        onChange(COLOR_THEME_ORDER[next]);
    };

    return (
        <div
            ref={groupRef}
            role="radiogroup"
            aria-label={ariaLabel}
            className={cn("grid grid-cols-2 gap-3", className)}
        >
            {COLOR_THEME_ORDER.map((id, index) => {
                const theme = COLOR_THEMES[id];
                const selected = value === id;
                return (
                    <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => onChange(id)}
                        onKeyDown={(e) => {
                            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                                e.preventDefault();
                                moveFocus(index, 1);
                            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                                e.preventDefault();
                                moveFocus(index, -1);
                            }
                        }}
                        className={cn(
                            "flex min-w-0 flex-col gap-2 rounded-xl border pb-3 pt-0.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                            selected
                                ? "border-accent bg-panel"
                                : "border-border-subtle hover:border-border hover:bg-panel/40",
                        )}
                    >
                        <ThemeWorkbenchPreview theme={id} />
                        <div className="flex items-center justify-between gap-2 px-3">
                            <span className="truncate text-sm font-medium text-text-primary">
                                {theme.label}
                            </span>
                            <span
                                aria-hidden
                                className={cn(
                                    "flex size-4 shrink-0 items-center justify-center rounded-full border",
                                    selected
                                        ? "border-accent bg-accent text-accent-fg"
                                        : "border-text-muted/40",
                                )}
                            >
                                {selected ? <Icon name="check" size={10} /> : null}
                            </span>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
