import { commands } from "@/lib/backend";
import { getCachedGlobalsCssContent, setCachedGlobalsCssContent } from "@/lib/css-variables";

/** Common locations for the project's global CSS / design token file. */
const GLOBALS_CSS_CANDIDATES = [
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
];

let loadPromise: Promise<string> | null = null;
let loadedForProject: string | null = null;

/**
 * Ensure the globals CSS cache is seeded from disk so CSS variables are
 * available (color picker variables tab, radius stops, ...) without requiring
 * the user to open the globals file first.
 */
export async function ensureGlobalsCssLoaded(projectPath: string): Promise<string> {
    const cached = getCachedGlobalsCssContent();
    if (cached && loadedForProject === projectPath) return cached;
    if (cached && loadedForProject === null) {
        // Seeded by an opened editor buffer — trust it.
        loadedForProject = projectPath;
        return cached;
    }

    if (!loadPromise) {
        loadPromise = (async () => {
            const root = projectPath.replace(/[\\/]+$/, "");
            for (const rel of GLOBALS_CSS_CANDIDATES) {
                try {
                    const content = await commands.readFile(`${root}/${rel}`);
                    if (content && content.includes("--")) {
                        setCachedGlobalsCssContent(content);
                        loadedForProject = projectPath;
                        return content;
                    }
                } catch {
                    // not found — try the next candidate
                }
            }
            loadedForProject = projectPath;
            return getCachedGlobalsCssContent();
        })().finally(() => {
            loadPromise = null;
        });
    }
    return loadPromise;
}
