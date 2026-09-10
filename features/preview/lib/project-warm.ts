"use client";

/**
 * Warm project analysis when a workspace opens or meaningfully changes.
 * Caches start-command + route discovery so Design Mode / Run open faster.
 */

import { detectDevCommand, type DevCommandInfo } from "@/features/detection/lib/lib";
import { discoverDesignPages, type DesignPage } from "@/features/preview/lib/discover-routes";

type WarmSnapshot = {
    path: string;
    analyzedAt: number;
    fingerprint: string;
    dev: DevCommandInfo | null;
    pages: DesignPage[];
};

let cache: WarmSnapshot | null = null;
let inflight: Promise<WarmSnapshot | null> | null = null;
const listeners = new Set<() => void>();

function emit() {
    for (const l of listeners) l();
}

export function subscribeProjectWarm(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

export function getProjectWarmSnapshot(): WarmSnapshot | null {
    return cache;
}

/** Cheap fingerprint of package + route entrypoints for change detection. */
async function fingerprintProject(projectPath: string): Promise<string> {
    const { commands } = await import("@/lib/backend");
    const parts: string[] = [];
    try {
        const pkg = await commands.readFile(
            projectPath.replace(/[/\\]+$/, "") +
                (projectPath.includes("\\") ? "\\package.json" : "/package.json"),
        );
        parts.push(`pkg:${pkg.length}:${hashStr(pkg)}`);
    } catch {
        parts.push("pkg:missing");
    }
    for (const rel of ["app", "src/app", "pages", "src/pages"]) {
        try {
            const dir =
                projectPath.replace(/[/\\]+$/, "") +
                (projectPath.includes("\\") ? `\\${rel.replace(/\//g, "\\")}` : `/${rel}`);
            const entries = await commands.lsDir(dir);
            parts.push(`${rel}:${entries.length}`);
        } catch {
            /* skip */
        }
    }
    return parts.join("|");
}

function hashStr(s: string): string {
    let h = 0;
    for (let i = 0; i < Math.min(s.length, 8000); i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}

/**
 * Analyze (or refresh) project metadata for Design Mode / Run.
 * Skips work when fingerprint is unchanged unless `force`.
 */
export async function warmProjectAnalysis(
    projectPath: string | null,
    opts?: { force?: boolean },
): Promise<WarmSnapshot | null> {
    if (!projectPath) {
        cache = null;
        emit();
        return null;
    }

    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const fp = await fingerprintProject(projectPath);
            if (
                !opts?.force
                && cache
                && cache.path.replace(/\\/g, "/").toLowerCase()
                    === projectPath.replace(/\\/g, "/").toLowerCase()
                && cache.fingerprint === fp
            ) {
                return cache;
            }

            const [dev, pages] = await Promise.all([
                detectDevCommand(projectPath),
                discoverDesignPages(projectPath),
            ]);

            cache = {
                path: projectPath,
                analyzedAt: Date.now(),
                fingerprint: fp,
                dev,
                pages,
            };
            emit();

            // Fire-and-forget codebase index for AI search (performance later, not blocking UI).
            void (async () => {
                try {
                    const { commands } = await import("@/lib/backend");
                    const { getShapeAccessToken } = await import("@/lib/cloud/store");
                    const token = getShapeAccessToken();
                    if (token) await commands.indexProject(projectPath, token);
                } catch {
                    /* optional */
                }
            })();

            return cache;
        } catch (e) {
            console.error("Project warm analysis failed:", e);
            return cache;
        } finally {
            inflight = null;
        }
    })();

    return inflight;
}
