// ── Gradient Parsing & Serialization ────────────────────────

export interface GradientStop {
    color: string;
    position: number; // percentage 0-100
}

export interface ParsedGradient {
    type: "linear" | "radial" | "conic";
    repeating: boolean;
    direction: string;
    stops: GradientStop[];
}

/** Check if a string looks like a CSS gradient */
export function isGradient(str: string): boolean {
    return /(?:linear|radial|conic)-gradient\s*\(/i.test(str.trim());
}

/** Parse a CSS gradient string into structured data */
export function parseGradient(str: string): ParsedGradient | null {
    str = str.trim();
    const m = /^(repeating-)?(linear|radial|conic)-gradient\s*\(([\s\S]+)\)$/i.exec(str);
    if (!m) return null;

    const repeating = !!m[1];
    const type = m[2].toLowerCase() as ParsedGradient["type"];
    const inner = m[3];

    const parts = splitTopLevel(inner);
    let direction = "";
    let stopParts = parts;

    const first = parts[0]?.trim() || "";
    if (type === "linear") {
        if (/^\d+(\.\d+)?\s*(deg|rad|grad|turn)$/i.test(first) || /^to\s/i.test(first)) {
            direction = first;
            stopParts = parts.slice(1);
        }
    } else if (type === "radial") {
        if (/^(circle|ellipse|closest|farthest|at\s)/i.test(first) && !isColorLike(first)) {
            direction = first;
            stopParts = parts.slice(1);
        }
    } else if (type === "conic") {
        if (/^(from\s|at\s)/i.test(first)) {
            direction = first;
            stopParts = parts.slice(1);
        }
    }

    const stops: GradientStop[] = [];
    for (let i = 0; i < stopParts.length; i++) {
        const part = stopParts[i].trim();
        const posMatch = /\s+([\d.]+)\s*%\s*$/.exec(part);
        if (posMatch) {
            stops.push({
                color: part.slice(0, -posMatch[0].length).trim(),
                position: parseFloat(posMatch[1]),
            });
        } else {
            const pos = stopParts.length > 1 ? (i / (stopParts.length - 1)) * 100 : 0;
            stops.push({ color: part, position: Math.round(pos) });
        }
    }

    if (stops.length < 2) return null;
    return { type, repeating, direction, stops };
}

/** Serialize a ParsedGradient back to a CSS string */
export function stringifyGradient(g: ParsedGradient): string {
    const prefix = g.repeating ? "repeating-" : "";
    const parts: string[] = [];
    if (g.direction) parts.push(g.direction);
    for (const stop of g.stops) {
        parts.push(`${stop.color} ${stop.position}%`);
    }
    return `${prefix}${g.type}-gradient(${parts.join(", ")})`;
}

// ── Helpers ─────────────────────────────────────────────────

function splitTopLevel(str: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const char of str) {
        if (char === "(") depth++;
        else if (char === ")") depth--;
        if (char === "," && depth === 0) {
            parts.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
}

function isColorLike(str: string): boolean {
    return /^(#|rgba?\s*\(|hsla?\s*\(|oklch\s*\(|oklab\s*\(|transparent|white|black)/i.test(str.trim());
}
