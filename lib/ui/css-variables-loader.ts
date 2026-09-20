import { commands } from "@/lib/backend";
import { getCachedGlobalsCssContent, setCachedGlobalsCssContent } from "@/lib/ui/css-variables";

/** Common locations for the project's global CSS / design token file. */
export const GLOBALS_CSS_CANDIDATES = [
    "app/globals.css",
    "src/app/globals.css",
    "styles/globals.css",
    "src/styles/globals.css",
    "src/index.css",
    "src/global.css",
    "app/global.css",
    "src/styles/global.css",
    "styles/global.css",
    "src/app/global.css",
    "website/app/globals.css",
    "website/src/app/globals.css",
    "website/src/index.css",
    "shape/app/globals.css",
    "shape/src/app/globals.css",
];

let loadPromise: Promise<{ content: string; path: string | null }> | null = null;
let loadedForProject: string | null = null;
let loadedPath: string | null = null;

/**
 * Ensure the globals CSS cache is seeded from disk so CSS variables are
 * available (color picker variables tab, radius stops, ...) without requiring
 * the user to open the globals file first.
 */
export async function ensureGlobalsCssLoaded(projectPath: string): Promise<string> {
    const result = await resolveGlobalsCss(projectPath);
    return result.content;
}

/** Resolve globals CSS content + absolute path for token read/write. */
export async function resolveGlobalsCss(
    projectPath: string,
): Promise<{ content: string; path: string | null }> {
    const cached = getCachedGlobalsCssContent();
    if (cached && loadedForProject === projectPath) {
        return { content: cached, path: loadedPath };
    }
    if (cached && loadedForProject === null) {
        loadedForProject = projectPath;
        return { content: cached, path: loadedPath };
    }

    if (!loadPromise) {
        loadPromise = (async () => {
            const root = projectPath.replace(/[\\/]+$/, "");
            for (const rel of GLOBALS_CSS_CANDIDATES) {
                try {
                    const abs = `${root}/${rel}`.replace(/\\/g, "/");
                    const content = await commands.readFile(abs);
                    if (content && content.includes("--")) {
                        setCachedGlobalsCssContent(content);
                        loadedForProject = projectPath;
                        loadedPath = abs;
                        return { content, path: abs };
                    }
                } catch {
                    // not found — try the next candidate
                }
            }
            loadedForProject = projectPath;
            loadedPath = null;
            return { content: getCachedGlobalsCssContent(), path: null };
        })().finally(() => {
            loadPromise = null;
        });
    }
    return loadPromise;
}

export function invalidateGlobalsCssCache() {
    loadedForProject = null;
    loadedPath = null;
    loadPromise = null;
    setCachedGlobalsCssContent("");
}
