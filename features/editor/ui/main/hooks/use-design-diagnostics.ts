"use client";

/**
 * WCAG / contrast diagnostics hook.
 *
 * Scans the active model for Tailwind text-* / bg-* color utility pairs on the
 * same line, resolves them to sRGB, computes the WCAG 2.1 contrast ratio and
 * emits Monaco warning markers when a pair fails the selected compliance level.
 *
 * Mirrors use-eslint.ts pattern: debounced effect, setModelMarkers, source owner.
 */

import { useEffect, useRef } from "react";
import { getSettings } from "@/lib/settings";
import { oklchToRgb } from "@/features/editor/ui/color-picker/ui/color-utils";

const OWNER = "wcag";
const DEBOUNCE_MS = 800;

// ── Language filter ───────────────────────────────────────────────────────────

const DESIGN_LANGUAGES = new Set(["typescriptreact", "javascriptreact", "html"]);

// ── Color resolution ──────────────────────────────────────────────────────────

interface RGB { r: number; g: number; b: number }

/** Parse a hex color string (#rgb, #rrggbb) to linear sRGB components */
function hexToRgb(hex: string): RGB | null {
    const cleaned = hex.replace("#", "");
    if (cleaned.length === 3) {
        return {
            r: parseInt(cleaned[0] + cleaned[0], 16),
            g: parseInt(cleaned[1] + cleaned[1], 16),
            b: parseInt(cleaned[2] + cleaned[2], 16),
        };
    }
    if (cleaned.length === 6) {
        return {
            r: parseInt(cleaned.slice(0, 2), 16),
            g: parseInt(cleaned.slice(2, 4), 16),
            b: parseInt(cleaned.slice(4, 6), 16),
        };
    }
    return null;
}

/** Parse oklch(L C H) → RGB */
function parseOklch(value: string): RGB | null {
    const m = value.match(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+(?:deg)?)/i);
    if (!m) return null;
    let L = parseFloat(m[1]);
    const C = parseFloat(m[2]);
    const H = parseFloat(m[3]);
    if (m[1].endsWith("%")) L /= 100;
    return oklchToRgb(L, C, H);
}

/** Parse rgb(r g b) or rgb(r, g, b) */
function parseRgb(value: string): RGB | null {
    const m = value.match(/rgb\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (!m) return null;
    return { r: parseFloat(m[1]), g: parseFloat(m[2]), b: parseFloat(m[3]) };
}

/** Read a CSS custom property from the document root */
function readCssVar(name: string): string {
    if (typeof window === "undefined" || typeof document === "undefined") return "";
    try {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    } catch {
        return "";
    }
}

/**
 * Resolve a Tailwind color class (text-* or bg-*) to an RGB value.
 * Returns null if the color can't be resolved.
 */
function resolveTailwindColor(cls: string): RGB | null {
    // Strip prefix (text-, bg-, border-, etc.)
    const m = cls.match(/^(?:text|bg|border|ring|fill|stroke)-(.+)$/);
    if (!m) return null;
    const colorPart = m[1];

    // 1. Try as a CSS variable (Tailwind v4 stores OKLCH in CSS vars)
    // Convention: --color-{shade} e.g. --color-slate-400, --color-primary
    const cssVarNames = [
        `--color-${colorPart}`,
        `--${colorPart}`,
    ];
    for (const varName of cssVarNames) {
        const val = readCssVar(varName);
        if (!val) continue;

        if (val.startsWith("oklch")) {
            const rgb = parseOklch(val);
            if (rgb) return rgb;
        }
        if (val.startsWith("#")) {
            return hexToRgb(val);
        }
        if (val.startsWith("rgb")) {
            return parseRgb(val);
        }
    }

    // 2. Try reading as a computed style using a temporary element
    if (typeof document !== "undefined") {
        try {
            const el = document.createElement("div");
            el.style.display = "none";
            document.body.appendChild(el);
            // Apply the class and read computed color
            // We need to map the Tailwind class to a CSS property
            const prefix = cls.match(/^(text|bg|border|ring|fill|stroke)/)?.[1];
            if (prefix === "text") {
                el.className = cls;
                const color = getComputedStyle(el).color;
                document.body.removeChild(el);
                if (color && color !== "rgba(0, 0, 0, 0)") return parseRgb(color);
            } else if (prefix === "bg") {
                el.className = cls;
                const color = getComputedStyle(el).backgroundColor;
                document.body.removeChild(el);
                if (color && color !== "rgba(0, 0, 0, 0)") return parseRgb(color);
            } else {
                document.body.removeChild(el);
            }
        } catch {
            // Ignore
        }
    }

    return null;
}

// ── WCAG math ─────────────────────────────────────────────────────────────────

function linearize(c: number): number {
    const n = c / 255;
    return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: RGB): number {
    const r = linearize(rgb.r);
    const g = linearize(rgb.g);
    const b = linearize(rgb.b);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(c1: RGB, c2: RGB): number {
    const l1 = relativeLuminance(c1);
    const l2 = relativeLuminance(c2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

// ── Line scanner ──────────────────────────────────────────────────────────────

// Match Tailwind foreground / background color classes
const FG_PATTERN = /\b(text-[a-zA-Z0-9_/-]+)\b/g;
const BG_PATTERN = /\b(bg-[a-zA-Z0-9_/-]+)\b/g;

interface WcagIssue {
    line: number;
    fgClass: string;
    bgClass: string;
    ratio: number;
    level: "AA" | "AAA";
}

function scanContent(content: string, level: "AA" | "AAA"): WcagIssue[] {
    const issues: WcagIssue[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Find all fg and bg class candidates on this line
        FG_PATTERN.lastIndex = 0;
        BG_PATTERN.lastIndex = 0;

        const fgMatches: string[] = [];
        const bgMatches: string[] = [];

        let m: RegExpExecArray | null;
        while ((m = FG_PATTERN.exec(line)) !== null) fgMatches.push(m[1]);
        while ((m = BG_PATTERN.exec(line)) !== null) bgMatches.push(m[1]);

        if (fgMatches.length === 0 || bgMatches.length === 0) continue;

        for (const fgCls of fgMatches) {
            const fg = resolveTailwindColor(fgCls);
            if (!fg) continue;

            for (const bgCls of bgMatches) {
                const bg = resolveTailwindColor(bgCls);
                if (!bg) continue;

                const ratio = contrastRatio(fg, bg);
                const threshold = level === "AAA" ? 7.0 : 4.5;
                if (ratio < threshold) {
                    issues.push({ line: i + 1, fgClass: fgCls, bgClass: bgCls, ratio, level });
                }
            }
        }
    }

    return issues;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDesignDiagnostics(options: {
    monaco: typeof import("monaco-editor") | null;
    editor: import("monaco-editor").editor.IStandaloneCodeEditor | null;
    path: string;
    content: string;
}) {
    const { monaco, editor, path, content } = options;
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!monaco || !editor) return;

        const model = editor.getModel();
        if (!model) return;

        const settings = getSettings();
        const lang = model.getLanguageId();

        if (!settings.designDiagnostics?.enable || !DESIGN_LANGUAGES.has(lang)) {
            monaco.editor.setModelMarkers(model, OWNER, []);
            return;
        }

        if (timerRef.current) clearTimeout(timerRef.current);

        timerRef.current = setTimeout(() => {
            const currentModel = editor.getModel();
            if (!currentModel) return;

            const level = settings.designDiagnostics?.level ?? "AA";
            const issues = scanContent(content, level);

            const markers = issues.map((issue) => ({
                startLineNumber: issue.line,
                startColumn: 1,
                endLineNumber: issue.line,
                endColumn: model.getLineMaxColumn(issue.line),
                message: `Low contrast ratio (${issue.ratio.toFixed(1)}:1) between ${issue.fgClass} and ${issue.bgClass}. Fails WCAG ${issue.level} (needs ${issue.level === "AAA" ? "7:1" : "4.5:1"}).`,
                severity: (monaco.MarkerSeverity as any).Warning,
                source: OWNER,
                code: "wcag-contrast",
            }));

            monaco.editor.setModelMarkers(currentModel, OWNER, markers);
        }, DEBOUNCE_MS);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [monaco, editor, path, content]);

    // Clear markers on unmount
    useEffect(() => {
        return () => {
            if (!monaco || !editor) return;
            const model = editor.getModel();
            if (model) monaco.editor.setModelMarkers(model, OWNER, []);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
