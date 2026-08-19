import type { DesignComputedStyles } from "../../design-mode/types";
import type { DesignEffect } from "./fields";

function splitCssList(value: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < value.length; i++) {
        const c = value[i];
        if (c === "(") depth++;
        else if (c === ")") depth = Math.max(0, depth - 1);
        else if (c === "," && depth === 0) {
            out.push(value.slice(start, i).trim());
            start = i + 1;
        }
    }
    out.push(value.slice(start).trim());
    return out.filter(Boolean);
}

function parseShadow(part: string, index: number): DesignEffect | null {
    const inset = /\binset\b/i.test(part);
    const rest = part.replace(/\binset\b/gi, "").trim();
    const nums: number[] = [];
    const numRe = /(-?[\d.]+)px/gi;
    let m: RegExpExecArray | null;
    let lastNum = 0;
    while ((m = numRe.exec(rest))) {
        nums.push(parseFloat(m[1]!));
        lastNum = m.index + m[0].length;
    }
    if (nums.length < 2) return null;
    const color = (rest.slice(0, rest.search(/-?[\d.]+px/i)).trim() || rest.slice(lastNum).trim() || "rgb(0 0 0 / 0.25)").trim();
    return {
        id: `${inset ? "inner" : "drop"}-shadow-seed-${index}`,
        kind: inset ? "inner-shadow" : "drop-shadow",
        x: nums[0] ?? 0,
        y: nums[1] ?? 0,
        blur: nums[2] ?? 0,
        spread: nums[3] ?? 0,
        color: color || "rgb(0 0 0 / 0.25)",
        opacity: 1,
    };
}

function progressiveFromMask(mask?: string): { progressive: boolean; progressiveAngle?: number } {
    if (!mask || mask === "none") return { progressive: false };
    const angle = mask.match(/linear-gradient\(\s*(-?[\d.]+)deg/i);
    return { progressive: /linear-gradient/i.test(mask), progressiveAngle: angle ? Number(angle[1]) : 180 };
}

export function parseEffectsFromStyles(
    styles: Partial<DesignComputedStyles> & { maskImage?: string; WebkitMaskImage?: string },
): DesignEffect[] {
    const out: DesignEffect[] = [];
    const shadow = styles.boxShadow?.trim();
    if (shadow && shadow !== "none") {
        splitCssList(shadow).forEach((part, i) => {
            const fx = parseShadow(part, i);
            if (fx) out.push(fx);
        });
    }
    const mask = styles.maskImage || styles.WebkitMaskImage;
    const prog = progressiveFromMask(mask);
    const filter = styles.filter?.trim() || "";
    const layerBlur = filter.match(/blur\(\s*([\d.]+)px\s*\)/i);
    if (layerBlur) {
        out.push({
            id: "layer-blur-seed",
            kind: "layer-blur",
            blur: parseFloat(layerBlur[1]!),
            opacity: 1,
            ...prog,
        });
    }
    const backdrop = styles.backdropFilter?.trim() || "";
    const bgBlur = backdrop.match(/blur\(\s*([\d.]+)px\s*\)/i);
    if (bgBlur) {
        out.push({
            id: "background-blur-seed",
            kind: "background-blur",
            blur: parseFloat(bgBlur[1]!),
            opacity: 1,
            ...prog,
        });
    }
    const extra = styles as Record<string, string | undefined>;
    const progToken = extra["--shape-prog-blur"]?.trim();
    if (progToken && progToken !== "none") {
        const angle = parseFloat(String(extra["--shape-prog-angle"] || "180")) || 180;
        const kind = extra["--shape-prog-mode"] === "backdrop" ? "background-blur" : "layer-blur";
        out.push({
            id: `${kind}-seed`,
            kind,
            blur: parseFloat(progToken) || 8,
            startBlur: parseFloat(String(extra["--shape-prog-start"] || "0")) || 0,
            opacity: 1,
            progressive: true,
            progressiveAngle: angle,
        });
    }
    return out;
}
