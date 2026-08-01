"use client";

import { COLOR_REGEX, parseTailwindToken } from "./tailwind-utils";

/**
 * Registers Monaco color providers for inline color swatches (like native Monaco/VS Code).
 * Supports hex, rgb, rgba, hsl, hsla, oklch, transparent, and tailwind prefixes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerEditorColorProvider(monaco: any) {
    const COLOR_LANGUAGES = ["css", "scss", "less", "html", "typescript", "javascript", "typescriptreact", "javascriptreact"];
    const colorProvider = createColorProvider(monaco);

    return COLOR_LANGUAGES.map((lang) => monaco.languages.registerColorProvider(lang, colorProvider));
}

function parseColorToRgba(str: string): { r: number; g: number; b: number; a: number } | null {
    str = str.trim();
    
    // Check if it's a tailwind token
    const tw = parseTailwindToken(str);
    if (tw && tw.rawHexOrOklch) {
        str = tw.rawHexOrOklch;
    }
    
    if (str.toLowerCase() === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    let m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(str);
    if (m) {
        const hex = m[1];
        const r = hex.length <= 4 ? parseInt(hex[0] + hex[0], 16) : parseInt(hex.slice(0, 2), 16);
        const g = hex.length <= 4 ? parseInt(hex[1] + hex[1], 16) : parseInt(hex.slice(2, 4), 16);
        const b = hex.length <= 4 ? parseInt(hex[2] + hex[2], 16) : parseInt(hex.slice(4, 6), 16);
        const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
        return { r, g, b, a };
    }
    m = /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/.exec(str);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: 1 };
    m = /^hsla?\s*\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?(?:\s*,\s*[\d.]+)?\s*\)$/.exec(str);
    if (m) {
        const { r, g, b } = hslToRgb(+m[1] / 360, +m[2] / 100, +m[3] / 100);
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255), a: 1 };
    }
    m = /^oklch\s*\(\s*([\d.]+)%?\s*(\s+[\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/i.exec(str) ||
        /^oklch\s*\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/i.exec(str);
    if (m) {
        try {
            const L = m[1].includes("%") ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
            const C = parseFloat(m[2]);
            const H = parseFloat(m[3]);
            const rgb = oklchToRgb(L, C, H);
            if (rgb) return { ...rgb, a: m[4] != null ? parseFloat(m[4]) : 1 };
        } catch { /* fallthrough */ }
    }
    return null;
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    if (s === 0) return { r: l, g: l, b: l };
    const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
        r: hue2rgb(p, q, h + 1 / 3),
        g: hue2rgb(p, q, h),
        b: hue2rgb(p, q, h - 1 / 3),
    };
}

function oklchToRgb(L: number, C: number, H: number): { r: number; g: number; b: number } | null {
    try {
        const Hrad = (H * Math.PI) / 180;
        const a = C * Math.cos(Hrad);
        const b = C * Math.sin(Hrad);
        const L_ = L + 0.3963377774 * a + 0.2158037573 * b;
        const M_ = L - 0.1055613458 * a - 0.0638541728 * b;
        const S_ = L - 0.0894841775 * a - 1.291485548 * b;
        const l_ = Math.cbrt(L_);
        const m_ = Math.cbrt(M_);
        const s_ = Math.cbrt(S_);
        const labL = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
        const labA = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
        const labB = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
        let y = (labL + 16) / 116;
        let x = labA / 500 + y;
        let z = y - labB / 200;
        x = 0.95047 * (x * x * x > 0.008856 ? x * x * x : (x - 16 / 116) / 7.787);
        y = 1.0 * (y * y * y > 0.008856 ? y * y * y : (y - 16 / 116) / 7.787);
        z = 1.08883 * (z * z * z > 0.008856 ? z * z * z : (z - 16 / 116) / 7.787);
        let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
        let g = x * -0.9689 + y * 1.8758 + z * 0.0415;
        let bl = x * 0.0557 + y * -0.204 + z * 1.057;
        r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r;
        g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g;
        bl = bl > 0.0031308 ? 1.055 * Math.pow(bl, 1 / 2.4) - 0.055 : 12.92 * bl;
        return {
            r: Math.round(Math.max(0, Math.min(255, r * 255))),
            g: Math.round(Math.max(0, Math.min(255, g * 255))),
            b: Math.round(Math.max(0, Math.min(255, bl * 255))),
        };
    } catch {
        return null;
    }
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createColorProvider(_monaco: any) {
    return {
        provideDocumentColors(model: {
            getValue: () => string;
            getPositionAt: (offset: number) => { lineNumber: number; column: number };
        }) {
            const text = model.getValue();
            const result: {
                color: { red: number; green: number; blue: number; alpha: number };
                range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
            }[] = [];
            let match;
            COLOR_REGEX.lastIndex = 0;
            while ((match = COLOR_REGEX.exec(text)) !== null) {
                const colorStr = match[0];
                const rgba = parseColorToRgba(colorStr);
                if (!rgba) continue;
                const start = model.getPositionAt(match.index);
                const end = model.getPositionAt(match.index + colorStr.length);
                if (end.column <= start.column) continue;
                result.push({
                    color: { red: rgba.r / 255, green: rgba.g / 255, blue: rgba.b / 255, alpha: rgba.a },
                    range: {
                        startLineNumber: start.lineNumber,
                        startColumn: start.column,
                        endLineNumber: end.lineNumber,
                        endColumn: end.column,
                    },
                });
            }
            return result;
        },
        provideColorPresentations(
            _model: unknown,
            colorInfo: {
                color: { red: number; green: number; blue: number; alpha: number };
                range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
            }
        ) {
            const c = colorInfo.color;
            const r = Math.round(c.red * 255);
            const g = Math.round(c.green * 255);
            const b = Math.round(c.blue * 255);
            const hex = "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("");
            return [{ label: hex }];
        },
    };
}
