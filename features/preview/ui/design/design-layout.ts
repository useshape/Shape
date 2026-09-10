/** Design Mode panel width / visibility helpers (unit-tested). */

export const DESIGN_LEFT_MIN = 200;
export const DESIGN_LEFT_MAX = 420;
export const DESIGN_LEFT_DEFAULT = 288;
export const DESIGN_RIGHT_MIN = 200;
export const DESIGN_RIGHT_MAX = 420;
export const DESIGN_RIGHT_DEFAULT = 320;

export const DESIGN_LEFT_WIDTH_KEY = "design-mode-left-width";
export const DESIGN_RIGHT_WIDTH_KEY = "design-mode-right-width";
export const DESIGN_LEFT_OPEN_KEY = "design-mode-left-open";
export const DESIGN_RIGHT_OPEN_KEY = "design-mode-right-open";

export function clampWidth(n: number, min: number, max: number): number {
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.round(n)));
}

export function parseStoredWidth(
    raw: string | null,
    fallback: number,
    min: number,
    max: number,
): number {
    if (raw == null || raw === "") return clampWidth(fallback, min, max);
    const n = Number(raw);
    if (!Number.isFinite(n)) return clampWidth(fallback, min, max);
    return clampWidth(n, min, max);
}

export function parseStoredOpen(raw: string | null, fallback = true): boolean {
    if (raw == null || raw === "") return fallback;
    if (raw === "false" || raw === "0") return false;
    if (raw === "true" || raw === "1") return true;
    return fallback;
}

export function readDesignPanelPrefs(): {
    leftWidth: number;
    rightWidth: number;
    leftOpen: boolean;
    rightOpen: boolean;
} {
    try {
        return {
            leftWidth: parseStoredWidth(
                localStorage.getItem(DESIGN_LEFT_WIDTH_KEY),
                DESIGN_LEFT_DEFAULT,
                DESIGN_LEFT_MIN,
                DESIGN_LEFT_MAX,
            ),
            rightWidth: parseStoredWidth(
                localStorage.getItem(DESIGN_RIGHT_WIDTH_KEY),
                DESIGN_RIGHT_DEFAULT,
                DESIGN_RIGHT_MIN,
                DESIGN_RIGHT_MAX,
            ),
            leftOpen: parseStoredOpen(localStorage.getItem(DESIGN_LEFT_OPEN_KEY), true),
            rightOpen: parseStoredOpen(localStorage.getItem(DESIGN_RIGHT_OPEN_KEY), true),
        };
    } catch {
        return {
            leftWidth: DESIGN_LEFT_DEFAULT,
            rightWidth: DESIGN_RIGHT_DEFAULT,
            leftOpen: true,
            rightOpen: true,
        };
    }
}

export function persistDesignLeftWidth(n: number) {
    try {
        localStorage.setItem(
            DESIGN_LEFT_WIDTH_KEY,
            String(clampWidth(n, DESIGN_LEFT_MIN, DESIGN_LEFT_MAX)),
        );
    } catch {
        /* ignore */
    }
}

export function persistDesignRightWidth(n: number) {
    try {
        localStorage.setItem(
            DESIGN_RIGHT_WIDTH_KEY,
            String(clampWidth(n, DESIGN_RIGHT_MIN, DESIGN_RIGHT_MAX)),
        );
    } catch {
        /* ignore */
    }
}

export function persistDesignLeftOpen(open: boolean) {
    try {
        localStorage.setItem(DESIGN_LEFT_OPEN_KEY, open ? "true" : "false");
    } catch {
        /* ignore */
    }
}

export function persistDesignRightOpen(open: boolean) {
    try {
        localStorage.setItem(DESIGN_RIGHT_OPEN_KEY, open ? "true" : "false");
    } catch {
        /* ignore */
    }
}
