import React from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { tailwindColors } from "../tailwind-colors";
import type { HSVA } from "./color-utils";

interface TailwindPaletteProps {
    hsva: HSVA;
    twPrefix: string;
    twState: { family: string; shade: string | null } | null;
    onSelect: (family: string, shade: string, raw: string) => void;
}

/** Tailwind v4 default palette families from `tailwindcss/colors`. */
export const TAILWIND_FAMILIES = Object.keys(tailwindColors).filter(
    (key) => typeof (tailwindColors as Record<string, unknown>)[key] === "object",
) as string[];

export const TAILWIND_SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

export const TailwindPalette = React.memo(function TailwindPalette({ twPrefix, twState, onSelect }: TailwindPaletteProps) {
    return (
        <div className="w-full rounded-lg overflow-hidden">
            <div
                className="grid w-full"
                style={{
                    gridTemplateColumns: `repeat(${TAILWIND_SHADES.length}, 1fr)`,
                }}
            >
                {TAILWIND_FAMILIES.map((fam) =>
                    TAILWIND_SHADES.map((shade) => {
                        const raw = (tailwindColors as Record<string, Record<string, string>>)[fam]?.[shade];
                        if (!raw) return null;
                        const active = twState?.family === fam && twState?.shade === shade;
                        const label = `${twPrefix}-${fam}-${shade}`;
                        return (
                            <Tooltip key={`${fam}-${shade}`} content={label} side="top" delayDuration={150}>
                                <button
                                    type="button"
                                    className={`w-full h-4 transition-all cursor-pointer relative ${
                                        active
                                            ? "ring-2 ring-white ring-offset-1 ring-offset-black/20 z-10 scale-110 rounded-sm"
                                            : "hover:scale-110 hover:z-10 hover:rounded-sm hover:ring-1 hover:ring-white/40"
                                    }`}
                                    style={{ backgroundColor: raw }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSelect(fam, shade, raw);
                                    }}
                                />
                            </Tooltip>
                        );
                    }),
                )}
            </div>
        </div>
    );
});

// Re-export for convenience
export { rgbaToHsva, parseToRgba } from "./color-utils";
