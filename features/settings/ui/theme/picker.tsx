"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { COLOR_THEMES, COLOR_THEME_ORDER, type ColorThemeId } from "@/lib/themes";
import { ThemeWorkbenchPreview } from "./workbench-preview";

/** Theme cards, side by side. */
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
        onChange(COLOR_THEME_ORDER[next]!);
    };

    return (
        <div
            ref={groupRef}
            role="radiogroup"
            aria-label={ariaLabel}
            className={cn("flex flex-row flex-nowrap items-start justify-end gap-3", className)}
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
                        aria-label={theme.label}
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
                            "overflow-hidden rounded-xl border border-border-subtle transition-colors hover:ring-2 hover:ring-border-focus bg-panel-hover text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        )}
                    >
                        <ThemeWorkbenchPreview theme={id} />
                        <div className="px-2.5 py-2">
                            <span className="text-sm font-medium text-text-primary">
                                {theme.label}
                            </span>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
