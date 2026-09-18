export type LayerKind =
    | "frame"
    | "text"
    | "link"
    | "image"
    | "vector"
    | "button"
    | "input"
    | "nav";

export type LayerInfo = {
    tag: string;
    id?: string | null;
    classes?: string[];
    text?: string;
    alt?: string;
    ariaLabel?: string;
    role?: string;
};

export type SourceLoc = {
    fileName: string;
    lineNumber: number;
    columnNumber: number;
};

export type ThemeToken = { name: string; value: string };

const UTILITY =
    /^(?:sm:|md:|lg:|xl:|2xl:|hover:|focus:|active:|disabled:|dark:)*(?:!-?)?(?:w|h|min-w|min-h|max-w|max-h|p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|text|bg|border|rounded|flex|grid|col|row|inset|top|left|right|bottom|z|opacity|shadow|overflow|basis|grow|shrink|order|from|via|to|ring|outline|leading|tracking|font|size|self|content|items|justify|place|object|aspect|cursor|select|pointer-events|whitespace|break|truncate|block|inline|hidden|absolute|relative|fixed|sticky|static|transition|duration|ease|animate|scale|rotate|translate|skew)(?:-|$)/;

const UTILITY_EXACT = new Set([
    "flex",
    "grid",
    "relative",
    "absolute",
    "fixed",
    "sticky",
    "hidden",
    "block",
    "inline",
    "contents",
    "truncate",
    "sr-only",
    "container",
    "group",
    "peer",
    "static",
]);

export function isUtilityClass(name: string) {
    const value = name.trim();
    if (!value || value.startsWith("__shape")) return true;
    if (UTILITY_EXACT.has(value)) return true;
    return UTILITY.test(value);
}

export function humanizeIdent(value: string) {
    const text = value
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!text) return value;
    return text[0].toUpperCase() + text.slice(1);
}

export function layerKind(info: LayerInfo): LayerKind {
    const tag = info.tag.toLowerCase();
    if (tag === "svg" || tag === "path") return "vector";
    if (tag === "img" || tag === "picture" || tag === "video" || tag === "canvas") return "image";
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (tag === "input" || tag === "textarea" || tag === "select") return "input";
    if (tag === "nav") return "nav";
    if (info.role === "heading" || /^h[1-6]$/.test(tag)) return "text";
    if (
        /^(p|span|label|li|em|strong|small|time|figcaption)$/.test(tag)
        && (info.text || "").trim()
    ) {
        return "text";
    }
    return "frame";
}

export function layerTitle(info: LayerInfo) {
    const aria = (info.ariaLabel || "").trim();
    if (aria) return aria.slice(0, 54);
    const alt = (info.alt || "").trim();
    if (alt) return alt.slice(0, 54);
    const kind = layerKind(info);
    const text = (info.text || "").replace(/\s+/g, " ").trim();
    if ((kind === "text" || kind === "link" || kind === "button") && text) {
        return text.slice(0, 54);
    }
    if (info.id && !/^[:_]/.test(info.id) && !info.id.startsWith("__shape")) {
        return humanizeIdent(info.id).slice(0, 54);
    }
    const named = (info.classes || []).find((item) => !isUtilityClass(item));
    if (named) return humanizeIdent(named).slice(0, 54);
    if (kind === "image") return "Image";
    if (kind === "vector") return "Vector";
    if (kind === "button") return "Button";
    if (kind === "nav") return "Navigation";
    if (kind === "input") return "Input";
    if (kind === "link") return "Link";
    if (kind === "text") {
        const tag = info.tag.toLowerCase();
        if (/^h[1-6]$/.test(tag)) return `Heading ${tag[1]}`;
        return "Text";
    }
    const landmarks: Record<string, string> = {
        body: "Page",
        main: "Main",
        header: "Header",
        footer: "Footer",
        section: "Section",
        article: "Article",
        ul: "List",
        ol: "List",
        li: "Item",
        form: "Form",
        table: "Table",
    };
    return landmarks[info.tag.toLowerCase()] ?? "Frame";
}

export function isEditableText(info: LayerInfo) {
    return layerKind(info) === "text" && Boolean((info.text || "").trim());
}

export function isUserSourcePath(file: string) {
    const name = file.replace(/\\/g, "/").toLowerCase();
    if (!name) return false;
    if (name.includes("/node_modules/") || name.startsWith("node_modules/")) return false;
    if (name.includes("/.next/") || name.includes("/.turbo/")) return false;
    if (name.includes("/_next/") || name.includes("/static/chunks/")) return false;
    return true;
}

export function normalizeSourcePath(file: string, projectRoot = "") {
    let name = file;
    try {
        name = decodeURIComponent(name);
    } catch {
        /* keep */
    }
    name = name.replace(/\\/g, "/");
    name = name
        .replace(/^webpack-internal:\/\/\//, "")
        .replace(/^webpack:\/\/_N_E\//, "")
        .replace(/^webpack:\/\/\//, "")
        .replace(/^webpack:\/\//, "")
        .replace(/^turbopack:\/\/\/\[project\]\//, "")
        .replace(/^turbopack:\/\/\//, "")
        .replace(/^\/?@fs\//, "/")
        .replace(/^file:\/\/\//, "")
        .replace(/^file:\/\//, "")
        .replace(/^\(app-pages-browser\)\/?/, "")
        .replace(/^\(rsc\)\/?/, "")
        .replace(/^\(app-ssr\)\/?/, "")
        .replace(/^\.\//, "");
    if (/^https?:\/\//i.test(name)) {
        try {
            name = new URL(name).pathname || name;
        } catch {
            /* keep */
        }
    }
    name = name.replace(/^\/_next\/static\/chunks\//, "");
    if (name.startsWith("/") && /^\/[A-Za-z]:\//.test(name)) name = name.slice(1);
    if (projectRoot) {
        const root = projectRoot.replace(/\\/g, "/").replace(/\/$/, "");
        if (name.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
            name = name.slice(root.length + 1);
        }
    }
    return name.replace(/\?.*$/, "").replace(/#.*$/, "");
}

export function guessSourceFromChunkUrl(chunkUrl: string, projectRoot = ""): SourceLoc | null {
    const normalized = normalizeSourcePath(chunkUrl, projectRoot);
    if (!normalized || !isUserSourcePath(normalized)) return null;
    let rel = normalized.replace(/^\/+/, "");
    const markers = ["/app/", "/src/", "/pages/", "/components/", "/features/", "/lib/"];
    let cut = -1;
    for (const marker of markers) {
        const index = `/${rel}`.indexOf(marker);
        if (index >= 0) {
            cut = index;
            rel = `/${rel}`.slice(index + 1);
            break;
        }
    }
    if (cut < 0) {
        if (!/^(app|src|pages|components|features|lib)\//.test(rel)) return null;
    }
    rel = rel.replace(/-[a-f0-9]{8,16}(?=\.)/i, "");
    rel = rel.replace(/\.(js|mjs|cjs)$/i, "");
    if (!/\.(tsx|ts|jsx|js)$/i.test(rel)) rel += ".tsx";
    if (!isUserSourcePath(rel)) return null;
    return { fileName: rel, lineNumber: 1, columnNumber: 1 };
}

function looksLikeColor(value: string) {
    const v = value.trim().toLowerCase();
    return (
        v.startsWith("#")
        || v.startsWith("rgb")
        || v.startsWith("hsl")
        || v.startsWith("oklch")
        || v.startsWith("oklab")
        || v.startsWith("lab(")
        || v.startsWith("color(")
        || /^(transparent|currentcolor)$/.test(v)
    );
}

export function groupThemeTokens(tokens: ThemeToken[]) {
    const text: ThemeToken[] = [];
    const color: ThemeToken[] = [];
    const link: ThemeToken[] = [];
    const other: ThemeToken[] = [];
    for (const token of tokens) {
        const name = token.name.toLowerCase();
        if (name.includes("link")) link.push(token);
        else if (
            name.includes("font")
            || name.includes("text")
            || name.includes("leading")
            || name.includes("tracking")
            || name.includes("letter")
        ) {
            text.push(token);
        } else if (
            looksLikeColor(token.value)
            || name.includes("color")
            || name.includes("background")
            || name.includes("foreground")
            || name.includes("accent")
            || /--(?:bg|fg)-/.test(name)
        ) {
            color.push(token);
        } else {
            other.push(token);
        }
    }
    return { text, color, link, other };
}

export function libraryGroup(path: string, kind: string): "components" | "styles" | "vectors" | "code" | "media" {
    const lower = path.replace(/\\/g, "/").toLowerCase();
    if (kind === "vector" || lower.endsWith(".svg")) return "vectors";
    if (kind === "style" || lower.endsWith(".css")) return "styles";
    if (kind === "component") return "components";
    if (kind === "code") return "code";
    if (/(^|\/)(components|ui|features\/.+\/ui)\//.test(lower) && /\.(tsx|jsx)$/.test(lower)) {
        return "components";
    }
    if (kind === "image" || kind === "video" || kind === "font") return "media";
    return "code";
}

export function componentFolder(path: string) {
    const parts = path.replace(/\\/g, "/").split("/");
    const index = parts.findIndex((part) =>
        ["components", "ui", "features"].includes(part.toLowerCase()),
    );
    if (index >= 0 && parts[index + 1]) return humanizeIdent(parts[index + 1].replace(/\.(tsx|jsx)$/i, ""));
    return "Project";
}
