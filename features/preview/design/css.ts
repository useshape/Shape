export type CssFunction = { type: string; amount: string };

export type BoxShadowValue = {
    x: string;
    y: string;
    blur: string;
    spread: string;
    color: string;
    inset: boolean;
};

const COLOR_FN = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;

export function defaultFilterAmount(type: string) {
    if (type === "blur") return "4px";
    if (type === "hue-rotate") return "0deg";
    return "100%";
}

export function identityFilterAmount(type: string) {
    if (type === "blur") return "0px";
    if (type === "hue-rotate") return "0deg";
    if (type === "invert" || type === "grayscale" || type === "sepia") return "0";
    return "100%";
}

export function parseCssFunctions(value?: string | null): CssFunction[] {
    if (!value || value === "none") return [];
    const out: CssFunction[] = [];
    const re = /([a-z-]+)\(([^()]*)\)/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(value))) {
        const type = match[1] ?? "blur";
        out.push({ type, amount: match[2] || defaultFilterAmount(type) });
    }
    return out;
}

export function serializeCssFunctions(items: CssFunction[]) {
    return items.length ? items.map((item) => `${item.type}(${item.amount})`).join(" ") : "none";
}

function splitCommaRespectingParens(value: string): string[] {
    const out: string[] = [];
    let start = 0;
    let depth = 0;
    for (let index = 0; index < value.length; index++) {
        const ch = value[index];
        if (ch === "(") depth += 1;
        else if (ch === ")") depth = Math.max(0, depth - 1);
        else if (ch === "," && depth === 0) {
            out.push(value.slice(start, index).trim());
            start = index + 1;
        }
    }
    out.push(value.slice(start).trim());
    return out.filter(Boolean);
}

function matchingParen(input: string, openAt: number): number {
    let depth = 0;
    for (let index = openAt; index < input.length; index++) {
        if (input[index] === "(") depth += 1;
        else if (input[index] === ")") {
            depth -= 1;
            if (depth === 0) return index;
        }
    }
    return -1;
}

function extractColor(input: string): { color: string; rest: string } {
    const trimmed = input.trim();
    if (trimmed.toLowerCase().startsWith("var(")) {
        const end = matchingParen(trimmed, 3);
        if (end > 0) {
            return { color: trimmed.slice(0, end + 1), rest: trimmed.slice(end + 1).trim() };
        }
    }
    const startFn = trimmed.match(COLOR_FN);
    if (startFn) {
        const end = matchingParen(trimmed, (startFn[0].length || 1) - 1);
        if (end > 0) {
            return { color: trimmed.slice(0, end + 1), rest: trimmed.slice(end + 1).trim() };
        }
    }
    const startHash = trimmed.match(/^#[0-9a-f]{3,8}/i);
    if (startHash) {
        return { color: startHash[0], rest: trimmed.slice(startHash[0].length).trim() };
    }
    const endFn = trimmed.match(/(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)\s*$/i);
    if (endFn?.index != null) {
        return { color: endFn[0].trim(), rest: trimmed.slice(0, endFn.index).trim() };
    }
    const endHash = trimmed.match(/#[0-9a-f]{3,8}\s*$/i);
    if (endHash?.index != null) {
        return { color: endHash[0].trim(), rest: trimmed.slice(0, endHash.index).trim() };
    }
    const namedEnd = trimmed.match(/\b([a-z]+)$/i);
    if (namedEnd?.[1] && namedEnd[1].toLowerCase() !== "inset") {
        return { color: namedEnd[1], rest: trimmed.slice(0, namedEnd.index).trim() };
    }
    return { color: "#000000", rest: trimmed };
}

export function parseBoxShadow(value?: string | null): BoxShadowValue | null {
    if (!value || value === "none") return null;
    const first = splitCommaRespectingParens(value)[0] ?? value;
    const inset = /\binset\b/i.test(first);
    const extracted = extractColor(first.replace(/\binset\b/gi, " "));
    const lengths = extracted.rest.match(/-?\d*\.?\d+(?:px|em|rem|%|vw|vh|pt)?/g) ?? [];
    return {
        x: lengths[0] ?? "0px",
        y: lengths[1] ?? "0px",
        blur: lengths[2] ?? "0px",
        spread: lengths[3] ?? "0px",
        color: extracted.color || "#000000",
        inset,
    };
}

export function serializeBoxShadow(shadow: BoxShadowValue, part?: keyof BoxShadowValue, value?: string) {
    const next = part && value != null ? { ...shadow, [part]: value } : shadow;
    return [next.inset ? "inset" : null, next.x, next.y, next.blur, next.spread, next.color]
        .filter(Boolean)
        .join(" ");
}

export type CssGradientKind = "linear" | "radial" | "conic";
export type CssGradientStop = { color: string; at: number };
export type CssGradient = {
    kind: CssGradientKind;
    angle: number;
    stops: CssGradientStop[];
};

function parseGradientAngle(raw: string): number {
    const value = raw.trim().toLowerCase();
    if (value.includes("to top")) return 0;
    if (value.includes("to right")) return 90;
    if (value.includes("to bottom")) return 180;
    if (value.includes("to left")) return 270;
    const deg = value.match(/(-?\d*\.?\d+)\s*deg/);
    if (deg) return Number(deg[1]);
    const turn = value.match(/(-?\d*\.?\d+)\s*turn/);
    if (turn) return Number(turn[1]) * 360;
    return 180;
}

function looksLikeGradientHint(part: string) {
    return /^(to\s|from\s|circle|ellipse|at\s|-?\d)/i.test(part.trim()) && !/^#|^rgb|^hsl|^oklch|^var\(/i.test(part.trim());
}

export function parseCssGradient(value?: string | null): CssGradient | null {
    const raw = (value ?? "").trim();
    const kindMatch = raw.match(/^(?:repeating-)?(linear|radial|conic)-gradient\(/i);
    if (!kindMatch?.[1]) return null;
    const kind = kindMatch[1].toLowerCase() as CssGradientKind;
    const open = raw.indexOf("(");
    const close = matchingParen(raw, open);
    if (close < 0) return null;
    const parts = splitCommaRespectingParens(raw.slice(open + 1, close));
    let angle = kind === "linear" ? 180 : 0;
    let start = 0;
    if (parts[0] && looksLikeGradientHint(parts[0])) {
        if (kind === "linear" || kind === "conic") angle = parseGradientAngle(parts[0].replace(/^from\s+/i, ""));
        start = 1;
    }
    const colorParts = parts.slice(start);
    const stops = colorParts.map((part, index) => {
        const extracted = extractColor(part);
        const pct = extracted.rest.match(/(-?\d*\.?\d+)\s*%/);
        const at =
            pct != null
                ? Number(pct[1])
                : colorParts.length <= 1
                  ? 0
                  : (index / (colorParts.length - 1)) * 100;
        return { color: extracted.color, at: Math.max(0, Math.min(100, at)) };
    }).filter((stop) => stop.color);
    if (!stops.length) return null;
    return { kind, angle, stops };
}

export function serializeCssGradient(gradient: CssGradient) {
    const stops = [...gradient.stops]
        .sort((a, b) => a.at - b.at)
        .map((stop) => `${stop.color} ${Math.round(stop.at)}%`)
        .join(", ");
    if (gradient.kind === "linear") return `linear-gradient(${Math.round(gradient.angle)}deg, ${stops})`;
    if (gradient.kind === "conic") return `conic-gradient(from ${Math.round(gradient.angle)}deg, ${stops})`;
    return `radial-gradient(circle at 50% 50%, ${stops})`;
}

export function defaultCssGradient(color = "#DDDDDD"): CssGradient {
    return {
        kind: "linear",
        angle: 90,
        stops: [
            { color, at: 0 },
            { color: "#A4A4A4", at: 100 },
        ],
    };
}

export function cssVarName(value?: string | null): string | null {
    const match = (value ?? "").trim().match(/^var\(\s*(--[A-Za-z0-9-_]+)/);
    return match?.[1] ?? null;
}

export function cssColorToHex(value?: string | null): { hex: string; alpha: number } {
    const raw = (value ?? "").trim();
    if (!raw || raw === "transparent") return { hex: "FFFFFF", alpha: 0 };
    if (/^#[0-9a-f]{3}$/i.test(raw)) {
        const [, r, g, b] = raw;
        return { hex: `${r}${r}${g}${g}${b}${b}`.toUpperCase(), alpha: 100 };
    }
    if (/^#[0-9a-f]{6}$/i.test(raw)) return { hex: raw.slice(1).toUpperCase(), alpha: 100 };
    if (/^#[0-9a-f]{8}$/i.test(raw)) {
        return {
            hex: raw.slice(1, 7).toUpperCase(),
            alpha: Math.round((Number.parseInt(raw.slice(7, 9), 16) / 255) * 100),
        };
    }
    const rgb = raw.match(/^rgba?\(([^)]+)\)$/i);
    if (rgb?.[1]) {
        const parts = rgb[1].split(",").map((part) => Number.parseFloat(part.trim()));
        if (parts.length >= 3 && parts.every((part) => Number.isFinite(part))) {
            const hex = parts
                .slice(0, 3)
                .map((part) => Math.max(0, Math.min(255, Math.round(part))).toString(16).padStart(2, "0"))
                .join("")
                .toUpperCase();
            const alpha = parts[3] == null ? 100 : Math.round(parts[3] * (parts[3] <= 1 ? 100 : 1));
            return { hex, alpha: Math.max(0, Math.min(100, alpha)) };
        }
    }
    if (typeof document === "undefined") return { hex: "FFFFFF", alpha: 100 };
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { hex: "FFFFFF", alpha: 100 };
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000000";
    ctx.fillStyle = raw;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return {
        hex: [r, g, b].map((part) => part.toString(16).padStart(2, "0")).join("").toUpperCase(),
        alpha: Math.round((a / 255) * 100),
    };
}
