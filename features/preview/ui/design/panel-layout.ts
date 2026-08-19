export const DESIGN_EXPORT_FORMATS = ["png", "svg", "pdf", "webm"] as const;
export const DESIGN_EXPORT_SCALES = [1, 2, 4] as const;

export const DESIGN_SECTION_ORDER = [
    "position",
    "layout",
    "appearance",
    "typography",
    "fill",
    "stroke",
    "effects",
    "export",
] as const;

export type DesignFillTarget = "color" | "backgroundColor";

export function isDesignTextElement(tag: string | undefined, text?: string): boolean {
    if ((text || "").trim()) return true;
    return /^(h[1-6]|p|span|a|button|label|li|td|th|blockquote|figcaption|em|strong|small|code|pre|input|textarea)$/.test(
        tag ?? "",
    );
}

export function designFillTarget(isTextElement: boolean): DesignFillTarget {
    return isTextElement ? "color" : "backgroundColor";
}

export function parseRadiusCorners(value: string): [number, number, number, number] {
    const parts = (value || "")
        .split(/\s+/)
        .map((p) => parseFloat(p))
        .filter((n) => Number.isFinite(n));
    if (!parts.length) return [0, 0, 0, 0];
    if (parts.length === 1) return [parts[0]!, parts[0]!, parts[0]!, parts[0]!];
    if (parts.length === 2) return [parts[0]!, parts[1]!, parts[0]!, parts[1]!];
    if (parts.length === 3) return [parts[0]!, parts[1]!, parts[2]!, parts[1]!];
    return [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
}

export function formatRadiusCorners(tl: number, tr: number, br: number, bl: number): string {
    if (tl === tr && tr === br && br === bl) return `${tl}px`;
    return `${tl}px ${tr}px ${br}px ${bl}px`;
}

export type DesignFlow = "block" | "row" | "column" | "grid";

export function designFlow(display: string, flexDirection: string): DesignFlow {
    if (/grid/i.test(display)) return "grid";
    if (/flex/i.test(display)) return flexDirection.startsWith("column") ? "column" : "row";
    return "block";
}

export function stylesForFlow(flow: DesignFlow): Record<string, string> {
    if (flow === "grid") return { display: "grid", flexDirection: "row" };
    if (flow === "row") return { display: "flex", flexDirection: "row" };
    if (flow === "column") return { display: "flex", flexDirection: "column" };
    return {
        display: "block",
        flexDirection: "row",
        justifyContent: "flex-start",
        alignItems: "stretch",
        gap: "0px",
        flexWrap: "nowrap",
    };
}
