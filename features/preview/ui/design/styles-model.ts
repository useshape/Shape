import type { CssVariable } from "@/lib/css-variables";
import { formatVariableDisplayName, normalizeVariableName } from "@/lib/css-variables";

export type DesignColorStyle = {
    id: string;
    name: string;
    cssVar: string;
    value: string;
    group: string;
};

export type DesignTextStyle = {
    id: string;
    name: string;
    group: string;
    fontSize?: string;
    lineHeight?: string;
    fontWeight?: string;
    fontFamily?: string;
    /** Display like `Ag Regular · 15/20` */
    subtitle: string;
    /** CSS vars to apply when picking this style */
    vars: Partial<{
        fontSize: string;
        lineHeight: string;
        fontWeight: string;
        fontFamily: string;
    }>;
};

function groupKeyFromVar(name: string): string {
    const n = name.replace(/^--/, "");
    const parts = n.split("-");
    if (parts.length <= 1) return "Other";
    // color-primary-500 → Color, text-muted → Text, font-size-lg → Font size
    if (parts[0] === "color") return "Color";
    if (parts[0] === "background" || parts[0] === "surface" || parts[0] === "panel") return "Surfaces";
    if (parts[0] === "text" || parts[0] === "foreground") return "Text";
    if (parts[0] === "border") return "Border";
    if (parts[0] === "font") return "Font";
    if (parts[0] === "text" && parts[1] === "size") return "Type scale";
    return parts[0]!.charAt(0).toUpperCase() + parts[0]!.slice(1);
}

export function colorStylesFromVariables(vars: CssVariable[]): DesignColorStyle[] {
    return vars
        .filter((v) => v.kind === "color")
        .map((v) => ({
            id: v.name,
            name: formatVariableDisplayName(v.name),
            cssVar: v.name,
            value: v.value,
            group: groupKeyFromVar(v.name),
        }));
}

function parsePxLike(value: string | undefined): number | null {
    if (!value) return null;
    const m = value.trim().match(/^([\d.]+)(px|rem|em)?$/i);
    if (!m) return null;
    const n = parseFloat(m[1]!);
    if (!Number.isFinite(n)) return null;
    const unit = (m[2] || "px").toLowerCase();
    if (unit === "rem" || unit === "em") return Math.round(n * 16);
    return Math.round(n);
}

export function formatTypeSubtitle(opts: {
    fontSize?: string;
    lineHeight?: string;
    fontWeight?: string;
}): string {
    const size = parsePxLike(opts.fontSize);
    const lh = parsePxLike(opts.lineHeight);
    const weight = (opts.fontWeight || "").toLowerCase();
    let weightLabel = "Regular";
    if (weight === "700" || weight === "bold") weightLabel = "Emphasized";
    else if (weight === "600" || weight === "semibold") weightLabel = "Semibold";
    else if (weight === "500" || weight === "medium") weightLabel = "Medium";
    else if (weight === "300" || weight === "light") weightLabel = "Light";
    const scale =
        size != null && lh != null
            ? `${size}/${lh}`
            : size != null
              ? `${size}`
              : opts.fontSize?.trim() || "—";
    return `Ag ${weightLabel} · ${scale}`;
}

/**
 * Build composite text styles by pairing --font-size-* with matching --line-height-* / --font-weight-*.
 */
export function textStylesFromVariables(vars: CssVariable[]): DesignTextStyle[] {
    const byName = new Map(vars.map((v) => [v.name, v]));
    const sizeVars = vars.filter(
        (v) =>
            /font-size|text-size|--text-\w+$/i.test(v.name)
            || (v.kind === "size" && /size|text/i.test(v.name) && parsePxLike(v.value) != null),
    );
    const out: DesignTextStyle[] = [];
    const seen = new Set<string>();

    for (const sizeVar of sizeVars) {
        const base = sizeVar.name
            .replace(/^--/, "")
            .replace(/font-size-?/i, "")
            .replace(/text-size-?/i, "")
            .replace(/^text-/i, "")
            .replace(/-+$/g, "");
        const candidates = [
            `--line-height-${base}`,
            `--leading-${base}`,
            `--font-line-height-${base}`,
            `--text-${base}--line-height`,
        ];
        let lineHeight: string | undefined;
        let lineVar: string | undefined;
        for (const c of candidates) {
            const hit = byName.get(c);
            if (hit) {
                lineHeight = hit.value;
                lineVar = hit.name;
                break;
            }
        }
        const weightCandidates = [`--font-weight-${base}`, `--font-${base}-weight`];
        let fontWeight: string | undefined;
        let weightVar: string | undefined;
        for (const c of weightCandidates) {
            const hit = byName.get(c);
            if (hit) {
                fontWeight = hit.value;
                weightVar = hit.name;
                break;
            }
        }
        const id = sizeVar.name;
        if (seen.has(id)) continue;
        seen.add(id);
        const name = formatVariableDisplayName(sizeVar.name);
        out.push({
            id,
            name,
            group: groupKeyFromVar(sizeVar.name),
            fontSize: sizeVar.value,
            lineHeight,
            fontWeight,
            subtitle: formatTypeSubtitle({
                fontSize: sizeVar.value,
                lineHeight,
                fontWeight,
            }),
            vars: {
                fontSize: sizeVar.name,
                ...(lineVar ? { lineHeight: lineVar } : {}),
                ...(weightVar ? { fontWeight: weightVar } : {}),
            },
        });
    }

    // Font family tokens as their own rows when no size pairing
    for (const v of vars.filter((x) => x.kind === "font" && /font-family|font-sans|font-serif|font-mono|font-display/i.test(x.name))) {
        if (seen.has(v.name)) continue;
        seen.add(v.name);
        out.push({
            id: v.name,
            name: formatVariableDisplayName(v.name),
            group: "Font family",
            fontFamily: v.value,
            subtitle: v.value.split(",")[0]?.replace(/['"]/g, "").trim() || "Font",
            vars: { fontFamily: v.name },
        });
    }

    return out;
}

export function groupByGroupKey<T extends { group: string }>(
    items: T[],
): Array<{ group: string; items: T[] }> {
    const map = new Map<string, T[]>();
    for (const item of items) {
        const list = map.get(item.group) ?? [];
        list.push(item);
        map.set(item.group, list);
    }
    return [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([group, groupItems]) => ({ group, items: groupItems }));
}

export function slugToCssVarName(input: string, kind: "color" | "text"): string {
    const normalized = normalizeVariableName(
        input
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, ""),
    );
    if (!normalized || normalized === "--") return kind === "color" ? "--color-new" : "--font-size-new";
    const bare = normalized.replace(/^--/, "");
    if (kind === "color" && !bare.startsWith("color-")) return `--color-${bare}`;
    if (kind === "text" && !bare.startsWith("font-size-") && !bare.startsWith("text-")) {
        return `--font-size-${bare}`;
    }
    return normalized.startsWith("--") ? normalized : `--${normalized}`;
}

export function nearestColorToken(
    cssColor: string,
    tokens: DesignColorStyle[],
    opts?: { maxDistance?: number },
): DesignColorStyle | null {
    const needle = cssColor.trim();
    if (!needle || !tokens.length) return null;
    const needleHex = normalizeHex(needle);
    if (!needleHex) return null;

    let best: DesignColorStyle | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const token of tokens) {
        const tokenHex = normalizeHex(token.value);
        if (!tokenHex) continue;
        if (tokenHex === needleHex) return token;
        const dist = hexDistance(needleHex, tokenHex);
        if (dist < bestDist) {
            bestDist = dist;
            best = token;
        }
    }
    const max = opts?.maxDistance ?? 12;
    return bestDist <= max ? best : null;
}

function normalizeHex(cssColor: string): string | null {
    const raw = cssColor.trim().toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(raw)) {
        return raw
            .slice(1)
            .split("")
            .map((c) => c + c)
            .join("");
    }
    if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(raw)) {
        return raw.slice(1, 7);
    }
    const rgb = raw.match(
        /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i,
    );
    if (rgb) {
        const ch = (n: string) =>
            Math.max(0, Math.min(255, Math.round(Number(n))))
                .toString(16)
                .padStart(2, "0");
        return `${ch(rgb[1]!)}${ch(rgb[2]!)}${ch(rgb[3]!)}`;
    }
    return null;
}

function hexDistance(a: string, b: string): number {
    const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
    const dr = channel(a, 0) - channel(b, 0);
    const dg = channel(a, 2) - channel(b, 2);
    const db = channel(a, 4) - channel(b, 4);
    return Math.sqrt(dr * dr + dg * dg + db * db);
}
