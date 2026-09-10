import {
    invalidateGlobalsCssCache,
    resolveGlobalsCss,
} from "@/lib/css-variables-loader";
import { setCachedGlobalsCssContent } from "@/lib/css-variables";
import { insertCustomProperty, patchCustomProperty, validateCssSource } from "./patch-css";
import { persistWrite } from "./source-files";

export type TokenUpdate = { name: string; value: string };

function normalizeTokenName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return trimmed;
    return trimmed.startsWith("--") ? trimmed : `--${trimmed}`;
}

/**
 * Resolve globals CSS and apply custom-property updates in memory.
 * Missing properties are inserted into `:root`.
 */
export async function stageTokenUpdates(
    projectPath: string,
    updates: TokenUpdate[],
    writes?: Map<string, string>,
): Promise<{ path: string; content: string } | { error: string }> {
    if (!updates.length) return { error: "No token updates." };

    const resolved = await resolveGlobalsCss(projectPath);
    if (!resolved.path) {
        return { error: "No globals.css (or theme CSS) with variables found." };
    }

    let css = writes?.get(resolved.path) ?? resolved.content;
    if (!css?.trim()) {
        css = ":root {\n}\n";
    }

    for (const update of updates) {
        const name = normalizeTokenName(update.name);
        const value = String(update.value ?? "").trim();
        if (!name || !value) {
            return { error: `Invalid token update for ${update.name || "(empty)"}.` };
        }
        const patched = patchCustomProperty(css, name, value);
        if (!("error" in patched)) {
            css = patched.css;
            continue;
        }
        const inserted = insertCustomProperty(css, name, value, { into: "root" });
        if ("error" in inserted) {
            return { error: inserted.error };
        }
        css = inserted.css;
    }

    const parseErr = validateCssSource(css);
    if (parseErr) return { error: parseErr };

    writes?.set(resolved.path, css);
    return { path: resolved.path, content: css };
}

/**
 * Patch (or insert) CSS custom properties in the project's globals file and persist.
 * When `writes` is provided, stages into the map without saving (for batched apply).
 */
export async function applyTokenUpdates(
    projectPath: string,
    updates: TokenUpdate[],
    writes?: Map<string, string>,
): Promise<{ files: string[]; errors: string[] }> {
    const staged = await stageTokenUpdates(projectPath, updates, writes);
    if ("error" in staged) {
        return { files: [], errors: [staged.error] };
    }

    if (writes) {
        return { files: [staged.path], errors: [] };
    }

    const persist = await persistWrite(staged.path, staged.content);
    if (persist) {
        return { files: [], errors: [persist] };
    }

    setCachedGlobalsCssContent(staged.content);
    invalidateGlobalsCssCache();
    setCachedGlobalsCssContent(staged.content);

    return { files: [staged.path], errors: [] };
}
