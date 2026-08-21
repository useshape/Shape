import type { CSSProperties } from "react";

const NODE_KEYS = new Set(["node", "inline", "ordered", "depth", "index", "siblingCount"]);

/** Convert an HTML `style` attribute (string or object) into a React style object. */
export function htmlStyleToReact(style: unknown): CSSProperties | undefined {
    if (!style) return undefined;
    if (typeof style === "object" && !Array.isArray(style)) {
        return style as CSSProperties;
    }
    if (typeof style !== "string") return undefined;
    const out: Record<string, string> = {};
    for (const part of style.split(";")) {
        const i = part.indexOf(":");
        if (i === -1) continue;
        const key = part.slice(0, i).trim();
        const val = part.slice(i + 1).trim();
        if (!key || !val) continue;
        const camel = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
        out[camel] = val;
    }
    return Object.keys(out).length ? (out as CSSProperties) : undefined;
}

export function alignToStyle(align: unknown): CSSProperties | undefined {
    if (typeof align !== "string") return undefined;
    const v = align.toLowerCase();
    if (v === "center" || v === "right" || v === "left" || v === "justify") {
        return { textAlign: v };
    }
    if (v === "middle") return { verticalAlign: "middle" };
    if (v === "top" || v === "bottom") return { verticalAlign: v };
    return undefined;
}

function pxSize(value: unknown): string | number | undefined {
    if (value == null || value === false) return undefined;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const s = String(value).trim();
    if (!s) return undefined;
    return s;
}

/**
 * Strip react-markdown's `node` payload and fold HTML `align` / `style` into
 * a real React style object so GitHub-style README HTML actually lays out.
 */
export function layoutHtmlProps<T extends Record<string, unknown>>(props: T): {
    rest: Omit<T, "node" | "style" | "align">;
    style: CSSProperties | undefined;
    className: string | undefined;
} {
    const rest = { ...props } as Record<string, unknown>;
    for (const key of NODE_KEYS) delete rest[key];
    const rawStyle = rest.style;
    const align = rest.align;
    delete rest.style;
    delete rest.align;

    const width = pxSize(rest.width);
    const height = pxSize(rest.height);

    const style: CSSProperties = {
        ...htmlStyleToReact(rawStyle),
        ...alignToStyle(align),
    };
    if (width != null && style.width == null) style.width = width;
    if (height != null && style.height == null) style.height = height;

    const className = typeof rest.className === "string" ? rest.className : undefined;
    return {
        rest: rest as Omit<T, "node" | "style" | "align">,
        style: Object.keys(style).length ? style : undefined,
        className,
    };
}

export function headingSlug(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-");
}

export function childText(node: unknown): string {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(childText).join("");
    if (typeof node === "object" && node !== null && "props" in node) {
        const props = (node as { props?: { children?: unknown } }).props;
        return childText(props?.children);
    }
    return "";
}
