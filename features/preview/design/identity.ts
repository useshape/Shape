import type { DesignSourceLoc } from "./types";

const INTERNAL = /^(exports|jsx-runtime|jsx-dev-runtime|jsx-dev-runtime\.development|index)\.(jsx|js|tsx|ts)$/i;

export function isBundledGeneratedPath(fileName: string): boolean {
    const n = fileName.replace(/\\/g, "/").toLowerCase();
    return (
        n.includes("/_next/") ||
        n.includes("/chunks/") ||
        n.includes("node_modules") ||
        /src_[a-z0-9]+\.he5/.test(n) ||
        /\.he5\._\.js$/.test(n)
    );
}

export function isProjectSourcePath(fileName: string): boolean {
    if (!fileName || isBundledGeneratedPath(fileName)) return false;
    const n = normalizeOriginalSourcePath(fileName);
    const base = n.split("/").pop() || n;
    if (INTERNAL.test(base)) return false;
    if (!/\.(tsx|jsx|vue|svelte|html)$/i.test(n)) return false;
    if (!n.includes("/")) {
        return /^(app|page|layout|index|main)\.(tsx|jsx|html)$/i.test(base);
    }
    return /^(src|app|pages|components|lib)\//i.test(n) || n.split("/").length >= 2;
}

export function isResolvedSource(loc?: DesignSourceLoc | null): boolean {
    if (!loc) return false;
    const file = normalizeOriginalSourcePath(loc.fileName);
    if (isProjectSourcePath(file) || isProjectSourcePath(loc.fileName)) return true;
    const chunk = pathFromGeneratedChunk(loc.generated?.fileName || loc.fileName);
    return !!chunk;
}

export function normalizeOriginalSourcePath(fileName: string): string {
    let name = fileName.replace(/\\/g, "/");
    try {
        name = decodeURIComponent(name);
    } catch {
        /* keep */
    }
    name = name.split("?")[0] ?? name;
    name = name.replace(/^https?:\/\/[^/]+/, "");
    name = name.replace(/^rsc:\/\/React\/(?:Server|Client)\//i, "");
    name = name.replace(/^webpack-internal:\/\/\//, "");
    name = name.replace(/^webpack:\/\/[^/]+\//, "");
    name = name.replace(/^turbopack:\/\/\/(?:\[project\]\/)?/, "");
    name = name.replace(/^file:\/\//, "");
    name = name.replace(/^\/@fs\//, "");
    name = name.replace(/^\/_N_E\//, "");
    while (/^\([^)]+\)\//.test(name)) name = name.replace(/^\([^)]+\)\//, "");
    name = name.replace(/^\.\//, "");
    const src = name.toLowerCase().lastIndexOf("/src/");
    if (src >= 0) name = name.slice(src + 1);
    const app = name.toLowerCase().lastIndexOf("/app/");
    if (app >= 0 && !/(^|\/)src\//i.test(name)) name = name.slice(app + 1);
    return name.replace(/^\/+/, "");
}

/** Turbopack: app_page_tsx_1s_43kl._.js → app/page.tsx */
export function pathFromGeneratedChunk(fileName: string): string | null {
    const base = fileName.replace(/\\/g, "/").split("/").pop() || fileName;
    const m = base.match(/^(.+)_(tsx|jsx|ts|js)(?:_[a-z0-9._]+)?\.js$/i);
    if (!m) return null;
    const decoded = m[1]!
        .replace(/__/g, "\0")
        .split("_")
        .map((p) => p.replace(/\0/g, "_"))
        .join("/");
    const path = `${decoded}.${m[2]!.toLowerCase()}`;
    return isProjectSourcePath(path) ? path : null;
}

export function enrichSourceIdentity(loc: DesignSourceLoc | undefined): DesignSourceLoc | undefined {
    if (!loc) return loc;
    const fileName = normalizeOriginalSourcePath(loc.fileName);
    const chunk = pathFromGeneratedChunk(loc.generated?.fileName || loc.fileName);
    const chosen =
        chunk && (!fileName.includes("/") || chunk.split("/").length > fileName.split("/").length)
            ? chunk
            : fileName;
    const resolved = chosen || fileName || chunk || loc.fileName;
    return {
        ...loc,
        fileName: resolved,
        nodeId: `${resolved}:${loc.lineNumber}:${loc.columnNumber ?? 1}`,
    };
}
