/**
 * Monaco ColorMap only accepts `#RRGGBB` / `#RRGGBBAA` (optional leading `#`).
 * CSS minifiers often shorten `#111111` → `#111`, which throws:
 * `Illegal value for token color: #111`.
 */
export function toMonacoColor(value: string, fallback: string): string {
    const raw = (value || "").trim();
    if (!raw) return normalizeSixDigit(fallback);

    const hex3 = raw.match(/^#([0-9a-fA-F]{3})$/);
    if (hex3) {
        const [r, g, b] = hex3[1];
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }

    const hex4 = raw.match(/^#([0-9a-fA-F]{4})$/);
    if (hex4) {
        const [r, g, b, a] = hex4[1];
        return `#${r}${r}${g}${g}${b}${b}${a}${a}`.toLowerCase();
    }

    const hex6or8 = raw.match(/^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
    if (hex6or8) {
        return `#${hex6or8[1]}${hex6or8[2] ?? ""}`.toLowerCase();
    }

    const rgb = raw.match(
        /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
    );
    if (rgb) {
        const byte = (n: string) =>
            Math.max(0, Math.min(255, Math.round(Number(n))))
                .toString(16)
                .padStart(2, "0");
        let out = `#${byte(rgb[1])}${byte(rgb[2])}${byte(rgb[3])}`;
        if (rgb[4] !== undefined) {
            const a = Math.max(0, Math.min(1, Number(rgb[4])));
            out += Math.round(a * 255)
                .toString(16)
                .padStart(2, "0");
        }
        return out.toLowerCase();
    }

    return normalizeSixDigit(fallback);
}

/** Opaque #RRGGBB — required for editor.foreground / editor.background (ColorMap). */
export function toMonacoOpaqueColor(value: string, fallback: string): string {
    return `#${toMonacoColor(value, fallback).replace(/^#/, "").slice(0, 6)}`;
}

/** Token rule foregrounds: 6 hex digits, no `#`. */
export function toMonacoTokenForeground(value: string, fallback: string): string {
    return toMonacoOpaqueColor(value, fallback).replace(/^#/, "");
}

function normalizeSixDigit(fallback: string): string {
    const m = fallback.trim().match(/^#?([0-9a-fA-F]{6})/);
    return m ? `#${m[1].toLowerCase()}` : "#141414";
}
