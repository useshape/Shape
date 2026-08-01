"use client";

export const BEZIER_PRESETS: Record<string, [number, number, number, number]> = {
    "linear": [0, 0, 1, 1],
    "ease": [0.25, 0.1, 0.25, 1],
    "ease-in": [0.42, 0, 1, 1],
    "ease-out": [0, 0, 0.58, 1],
    "ease-in-out": [0.42, 0, 0.58, 1],
    "ease-in-sine": [0.12, 0, 0.39, 0],
    "ease-out-sine": [0.61, 1, 0.88, 1],
    "ease-in-out-sine": [0.37, 0, 0.63, 1],
    "ease-in-quad": [0.11, 0, 0.5, 0],
    "ease-out-quad": [0.5, 1, 0.89, 1],
    "ease-in-out-quad": [0.45, 0, 0.55, 1],
    "ease-in-cubic": [0.32, 0, 0.67, 0],
    "ease-out-cubic": [0.33, 1, 0.68, 1],
    "ease-in-out-cubic": [0.65, 0, 0.35, 1],
    "ease-in-quart": [0.5, 0, 0.75, 0],
    "ease-out-quart": [0.25, 1, 0.5, 1],
    "ease-in-out-quart": [0.76, 0, 0.24, 1],
    "ease-in-quint": [0.64, 0, 0.78, 0],
    "ease-out-quint": [0.22, 1, 0.36, 1],
    "ease-in-out-quint": [0.83, 0, 0.17, 1],
    "ease-in-expo": [0.7, 0, 0.84, 0],
    "ease-out-expo": [0.16, 1, 0.3, 1],
    "ease-in-out-expo": [0.87, 0, 0.13, 1],
    "ease-in-circ": [0.55, 0, 1, 0.45],
    "ease-out-circ": [0, 0.55, 0.45, 1],
    "ease-in-out-circ": [0.85, 0, 0.15, 1],
    "ease-in-back": [0.36, 0, 0.66, -0.56],
    "ease-out-back": [0.34, 1.56, 0.64, 1],
    "ease-in-out-back": [0.68, -0.6, 0.32, 1.6],
};

export interface ParsedBezier {
    points: [number, number, number, number];
    format: "cubic-bezier" | "array" | "preset";
    presetName?: string;
}

export function parseBezier(str: string): ParsedBezier | null {
    const s = str.trim().toLowerCase();
    
    // Check if it's a preset name
    if (BEZIER_PRESETS[s]) {
        return {
            points: [...BEZIER_PRESETS[s]],
            format: "preset",
            presetName: s,
        };
    }
    
    // Check cubic-bezier(...)
    const cbMatch = s.match(/cubic-bezier\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)/);
    if (cbMatch) {
        const points: [number, number, number, number] = [
            parseFloat(cbMatch[1]),
            parseFloat(cbMatch[2]),
            parseFloat(cbMatch[3]),
            parseFloat(cbMatch[4]),
        ];
        return {
            points,
            format: "cubic-bezier",
        };
    }
    
    // Check array [x1, y1, x2, y2]
    const arrayMatch = s.match(/\[\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\]/);
    if (arrayMatch) {
        const points: [number, number, number, number] = [
            parseFloat(arrayMatch[1]),
            parseFloat(arrayMatch[2]),
            parseFloat(arrayMatch[3]),
            parseFloat(arrayMatch[4]),
        ];
        return {
            points,
            format: "array",
        };
    }
    
    return null;
}

export function stringifyBezier(points: [number, number, number, number], format: "cubic-bezier" | "array" | "preset"): string {
    const f = (n: number) => {
        const s = n.toFixed(2);
        if (s.endsWith(".00")) return n.toString();
        if (s.match(/\.\d0$/)) return n.toFixed(1);
        return s;
    };
    
    if (format === "preset") {
        // Find if it matches a preset exactly
        const match = Object.entries(BEZIER_PRESETS).find(([, pts]) => 
            Math.abs(pts[0] - points[0]) < 0.001 &&
            Math.abs(pts[1] - points[1]) < 0.001 &&
            Math.abs(pts[2] - points[2]) < 0.001 &&
            Math.abs(pts[3] - points[3]) < 0.001
        );
        if (match) return match[0];
        format = "cubic-bezier";
    }
    
    if (format === "array") {
        return `[${f(points[0])}, ${f(points[1])}, ${f(points[2])}, ${f(points[3])}]`;
    }
    
    return `cubic-bezier(${f(points[0])}, ${f(points[1])}, ${f(points[2])}, ${f(points[3])})`;
}

export const BEZIER_REGEX = /\bcubic-bezier\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)|\[\s*(0|1|0?\.\d+|\.\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(0|1|0?\.\d+|\.\d+)\s*,\s*(-?\d*\.?\d+)\s*\]|\b(ease-in-out|ease-in|ease-out|ease|linear)\b(?!\s*-gradient)(?!\s*['"]?\s*[:=])(?:(?!\s*\()|$)/gi;

