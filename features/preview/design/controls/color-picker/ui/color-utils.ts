export type RGBA = { r: number; g: number; b: number; a: number };
export type HSVA = { h: number; s: number; v: number; a: number };

// ── RGB ↔ OKLCH ─────────────────────────────────────────────

export function rgbToOklch(r: number, g: number, b: number): { L: number; C: number; H: number } {
    const r_ = r / 255;
    const g_ = g / 255;
    const b_ = b / 255;

    const rL = r_ > 0.04045 ? Math.pow((r_ + 0.055) / 1.055, 2.4) : r_ / 12.92;
    const gL = g_ > 0.04045 ? Math.pow((g_ + 0.055) / 1.055, 2.4) : g_ / 12.92;
    const bL = b_ > 0.04045 ? Math.pow((b_ + 0.055) / 1.055, 2.4) : b_ / 12.92;

    const l = 0.4122214708 * rL + 0.5363325363 * gL + 0.0514459929 * bL;
    const m = 0.2119034982 * rL + 0.6806995451 * gL + 0.1073969566 * bL;
    const s = 0.0883024619 * rL + 0.2817188376 * gL + 0.6299787005 * bL;

    const l_ = Math.cbrt(l);
    const m_ = Math.cbrt(m);
    const s_ = Math.cbrt(s);

    const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
    const labA = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
    const labB = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

    const C = Math.sqrt(labA * labA + labB * labB);
    let H = (Math.atan2(labB, labA) * 180) / Math.PI;
    if (H < 0) H += 360;

    return { L, C, H };
}

export function oklchToRgb(L: number, C: number, H: number): { r: number; g: number; b: number } {
    const Hrad = (H * Math.PI) / 180;
    const a = C * Math.cos(Hrad);
    const b = C * Math.sin(Hrad);

    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;

    const rL = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const gL = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const bL = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

    const toSrgb = (c: number) => {
        const val = c > 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c;
        return Math.max(0, Math.min(255, Math.round(val * 255)));
    };

    return { r: toSrgb(rL), g: toSrgb(gL), b: toSrgb(bL) };
}

// ── RGB ↔ HSL ───────────────────────────────────────────────

export function rgbaToHsla(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }

    return {
        h: h * 360,
        s: s * 100,
        l: l * 100,
    };
}

export function hslaToRgba(h: number, s: number, l: number, a: number): RGBA {
    h /= 360;
    s /= 100;
    l /= 100;
    let r = l;
    let g = l;
    let b = l;

    if (s !== 0) {
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
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255),
        a,
    };
}

// ── Parsing ─────────────────────────────────────────────────

export function parseToRgba(str: string): RGBA | null {
    str = str.trim();
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

    m = /^rgba?\s*\(\s*([\d.]+%?)[,\s]+([\d.]+%?)[,\s]+([\d.]+%?)(?:[,\s/]+([\d.]+%?))?\s*\)$/i.exec(str);
    if (m) {
        const channel = (s: string) =>
            Math.max(0, Math.min(255, Math.round(s.endsWith("%") ? parseFloat(s) * 2.55 : parseFloat(s))));
        let a = 1;
        if (m[4]) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        return { r: channel(m[1]), g: channel(m[2]), b: channel(m[3]), a };
    }

    m = /^hsla?\s*\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%?[,\s]+([\d.]+)%?(?:[,\s/]+([\d.]+%?))?\s*\)$/i.exec(str);
    if (m) {
        const { r, g, b } = hslaToRgba(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), 1);
        let a = 1;
        if (m[4]) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        return { r, g, b, a };
    }

    m = /^oklch\s*\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)$/i.exec(str);
    if (m) {
        const L = m[2] === "%" ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
        const C = parseFloat(m[3]);
        const H = parseFloat(m[4]);
        const { r, g, b } = oklchToRgb(L, C, H);
        let a = 1;
        if (m[5]) a = m[5].endsWith('%') ? parseFloat(m[5]) / 100 : parseFloat(m[5]);
        return { r, g, b, a };
    }

    return null;
}

// ── HSV ↔ RGB ───────────────────────────────────────────────

export function rgbaToHsva(r: number, g: number, b: number, a: number): HSVA {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (d !== 0) {
        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                h = ((b - r) / d + 2) / 6;
                break;
            default:
                h = ((r - g) / d + 4) / 6;
        }
    }
    return { h: h * 360, s: s * 100, v: v * 100, a };
}

export function hsvaToRgba(h: number, s: number, v: number, a: number): RGBA {
    s /= 100;
    v /= 100;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;

    if (h < 60)       { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else              { r = c; b = x; }

    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255),
        a,
    };
}

// ── Hex ─────────────────────────────────────────────────────

export function rgbaToHex(rgba: RGBA): string {
    const { r, g, b, a } = rgba;
    const toHexStr = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0");
    if (a < 1) {
        return `#${toHexStr(r)}${toHexStr(g)}${toHexStr(b)}${toHexStr(a * 255)}`;
    }
    return `#${toHexStr(r)}${toHexStr(g)}${toHexStr(b)}`;
}
