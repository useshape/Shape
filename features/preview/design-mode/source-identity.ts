import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import type { DesignSourceLoc } from "./types";

const mapCache = new Map<string, TraceMap | null>();

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
    const n = fileName.replace(/\\/g, "/").split("?")[0];
    return /\.(tsx|jsx|vue|svelte|html)$/i.test(n);
}

export function isResolvedSource(loc?: DesignSourceLoc | null): boolean {
    return !!loc && loc.lineNumber > 0 && isProjectSourcePath(loc.fileName);
}

export function normalizeOriginalSourcePath(fileName: string): string {
    let name = fileName.replace(/\\/g, "/");
    try {
        name = decodeURIComponent(name);
    } catch {
        /* keep */
    }
    name = name.replace(/^https?:\/\/[^/]+/, "");
    name = name.replace(/^webpack:\/\/[^/]+\//, "");
    name = name.replace(/^webpack-internal:\/\/\//, "");
    name = name.replace(/^file:\/\//, "");
    name = name.replace(/^\([^)]+\)\//, "");
    name = name.replace(/^\.\//, "");
    const src = name.toLowerCase().lastIndexOf("/src/");
    if (src >= 0) name = name.slice(src + 1);
    const app = name.toLowerCase().lastIndexOf("/app/");
    if (app >= 0 && !/(^|\/)src\//i.test(name)) name = name.slice(app + 1);
    return name.replace(/^\/+/, "");
}

export async function mapGeneratedToOriginal(
    origin: string,
    generated: { fileName: string; lineNumber: number; columnNumber?: number },
): Promise<DesignSourceLoc | null> {
    if (!generated.fileName || generated.lineNumber < 1) return null;
    let scriptUrl = generated.fileName;
    if (!/^https?:\/\//i.test(scriptUrl)) {
        try {
            scriptUrl = new URL(scriptUrl, origin).href;
        } catch {
            return null;
        }
    }
    const tracer = await loadTraceMap(scriptUrl);
    if (!tracer) return null;
    const pos = originalPositionFor(tracer, {
        line: generated.lineNumber,
        column: Math.max(0, (generated.columnNumber ?? 1) - 1),
    });
    if (!pos.source || pos.line == null || pos.line < 1) return null;
    const fileName = normalizeOriginalSourcePath(pos.source);
    if (!isProjectSourcePath(fileName)) return null;
    return {
        fileName,
        lineNumber: pos.line,
        columnNumber: (pos.column ?? 0) + 1,
        generated,
        mapped: true,
        nodeId: `${fileName}:${pos.line}:${(pos.column ?? 0) + 1}`,
    };
}

export async function enrichSourceIdentity(
    origin: string | undefined,
    loc: DesignSourceLoc | undefined,
): Promise<DesignSourceLoc | undefined> {
    if (isResolvedSource(loc)) return loc;
    if (!origin || !loc?.generated) return loc;
    const mapped = await mapGeneratedToOriginal(origin, loc.generated);
    if (!mapped) return loc;
    return {
        ...mapped,
        componentName: loc.componentName,
        nodeId: mapped.nodeId,
    };
}

async function loadTraceMap(scriptUrl: string): Promise<TraceMap | null> {
    if (mapCache.has(scriptUrl)) return mapCache.get(scriptUrl) ?? null;
    try {
        const res = await fetch(scriptUrl);
        const js = res.ok ? await res.text() : "";
        const hint = js.match(/\/\/[#@]\s*sourceMappingURL=(\S+)/);
        const mapUrl = hint ? new URL(hint[1]!, scriptUrl).href : `${scriptUrl.split("?")[0]}.map`;
        const mapRes = await fetch(mapUrl);
        if (!mapRes.ok) {
            mapCache.set(scriptUrl, null);
            return null;
        }
        const json: unknown = await mapRes.json();
        const tracer = new TraceMap(json as ConstructorParameters<typeof TraceMap>[0]);
        mapCache.set(scriptUrl, tracer);
        return tracer;
    } catch {
        mapCache.set(scriptUrl, null);
        return null;
    }
}
