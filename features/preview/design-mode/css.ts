import { parseToRgba, rgbaToHex } from "@/features/editor/ui/color-picker/ui/color-utils";
import { parseTailwindToken } from "@/features/editor/ui/color-picker/tailwind-utils";

export function parsePx(value: string | undefined): number | null {
    if (!value) return null;
    const v = value.trim().toLowerCase();
    if (
        !v ||
        v === "auto" ||
        v === "normal" ||
        v === "none" ||
        v === "medium" ||
        v === "start" ||
        v === "end"
    ) {
        return null;
    }
    const m = v.match(/^(-?[\d.]+)(px|rem)?$/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (!Number.isFinite(n)) return null;
    return Math.round(m[2] === "rem" ? n * 16 : n);
}

export function px(n: number): string {
    return `${n}px`;
}

export function firstFontFamily(stack: string | undefined): string {
    if (!stack) return "sans-serif";
    const m = stack.trim().match(/^("([^"]+)"|'([^']+)'|[^,]+)/);
    return (m?.[2] || m?.[3] || m?.[1] || stack).trim();
}

export function normalizeWeight(value: string | undefined): string {
    const v = (value || "").trim().toLowerCase();
    if (v === "normal") return "400";
    if (v === "bold") return "700";
    if (v === "lighter") return "300";
    if (v === "bolder") return "700";
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? String(n) : "400";
}

export function normalizeJustify(value: string | undefined): string {
    const x = (value || "").toLowerCase();
    if (x === "start" || x === "left" || x === "flex-start") return "flex-start";
    if (x === "end" || x === "right" || x === "flex-end") return "flex-end";
    if (x === "center" || x === "space-between" || x === "space-around" || x === "space-evenly") return x;
    return "flex-start";
}

export function normalizeAlign(value: string | undefined): string {
    const x = (value || "").toLowerCase();
    if (x === "start" || x === "flex-start") return "flex-start";
    if (x === "end" || x === "flex-end") return "flex-end";
    if (x === "center" || x === "stretch" || x === "baseline") return x;
    return "stretch";
}

export function normalizeTextAlign(value: string | undefined): string {
    const x = (value || "").toLowerCase();
    if (x === "start" || x === "left") return "left";
    if (x === "end" || x === "right") return "right";
    if (x === "center" || x === "justify") return x;
    return "left";
}

export function isFlexDisplay(display: string | undefined): boolean {
    return display === "flex" || display === "inline-flex";
}

export function isGridDisplay(display: string | undefined): boolean {
    return display === "grid" || display === "inline-grid";
}

export function opacityPercent(value: string | undefined): number {
    const n = parseFloat(value || "1");
    if (!Number.isFinite(n)) return 100;
    return Math.round(Math.max(0, Math.min(1, n)) * 100);
}

export function isGradient(value: string | undefined): boolean {
    return !!value && /gradient\(/i.test(value);
}

export function isTransparentColor(value: string | undefined): boolean {
    if (!value) return true;
    const v = value.trim().toLowerCase();
    if (v === "transparent" || v === "none") return true;
    if (isGradient(v)) return false;
    const rgba = parseToRgba(value);
    return !rgba || rgba.a === 0;
}

export function colorParts(value: string | undefined): { hex: string; alphaPct: number } {
    if (!value || isTransparentColor(value) || isGradient(value)) {
        return { hex: "000000", alphaPct: 0 };
    }
    const rgba = parseToRgba(value);
    if (!rgba) return { hex: "000000", alphaPct: 100 };
    const hex = rgbaToHex({ ...rgba, a: 1 }).replace("#", "").slice(0, 6).toUpperCase();
    return { hex, alphaPct: Math.round(Math.max(0, Math.min(1, rgba.a)) * 100) };
}

export function cssColorToHex(value: string | undefined): string {
    if (!value || isTransparentColor(value)) return "#00000000";
    const rgba = parseToRgba(value);
    return rgba ? rgbaToHex(rgba) : "#000000";
}

/** Turn a ColorPicker value (hex, rgb, gradient, Tailwind token) into inline CSS. */
export function toCssColor(pickerValue: string): string {
    const v = pickerValue.trim();
    if (!v) return "transparent";
    if (/gradient\(/i.test(v)) return v;
    const rgba = parseToRgba(v);
    if (rgba) return rgbaToHex(rgba);
    const tw = parseTailwindToken(v);
    if (tw?.rawHexOrOklch) {
        const parsed = parseToRgba(tw.rawHexOrOklch);
        if (parsed) {
            if (tw.alpha != null) parsed.a = tw.alpha;
            return rgbaToHex(parsed);
        }
        return tw.rawHexOrOklch;
    }
    return v;
}

export function shadowPresetId(value: string | undefined): string {
    const v = (value || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!v || v === "none") return "none";
    if (v.includes("20px") || v.includes("25px")) return "xl";
    if (v.includes("10px") || v.includes("15px")) return "lg";
    if (v.includes("4px") || v.includes("6px")) return "md";
    if (v.includes("1px") || v.includes("2px")) return "sm";
    return "custom";
}
