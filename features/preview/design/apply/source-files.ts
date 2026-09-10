import { commands } from "@/lib/backend";
import type { SearchOptions } from "@/lib/backend/types";
import { isBundledGeneratedPath, normalizeOriginalSourcePath } from "../identity";
import type { DesignSourceLoc } from "../types";

export const SEARCH_CODE: SearchOptions = {
    case_sensitive: false,
    whole_word: false,
    is_regex: false,
    include_pattern: "*.{tsx,jsx,ts,js,html,vue,svelte}",
    respect_gitignore: true,
    include_hidden: false,
    follow_symlinks: false,
    exclude_tests: true,
    exclude_docs: true,
    exclude_build: true,
    exclude_assets: true,
    only_source: true,
};

export const SEARCH_STYLE: SearchOptions = {
    ...SEARCH_CODE,
    include_pattern: "*.{css,scss,sass,less,module.css,module.scss}",
};

export function join(root: string, rel: string) {
    const slash = root.includes("\\") ? "\\" : "/";
    return `${root.replace(/[\\/]$/, "")}${slash}${rel.replaceAll("/", slash)}`;
}

export function dirname(path: string) {
    return path.replace(/[/\\][^/\\]+$/, "");
}

export function pathInRoot(file: string, root: string): boolean {
    const a = file.replace(/\\/g, "/").toLowerCase();
    const b = root.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
    return a === b || a.startsWith(`${b}/`);
}

export function layoutPathsNear(filePath: string): string[] {
    const names = ["layout.tsx", "layout.jsx", "layout.js"];
    const out: string[] = [];
    let dir = dirname(filePath);
    for (let i = 0; i < 8 && dir; i++) {
        for (const n of names) out.push(join(dir, n));
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return out;
}

export function resolveRelative(fromFile: string, rel: string) {
    const slash = fromFile.includes("\\") ? "\\" : "/";
    const parts = dirname(fromFile).split(/[/\\]/);
    for (const seg of rel.replace(/^\.\//, "").split("/")) {
        if (seg === "..") parts.pop();
        else if (seg && seg !== ".") parts.push(seg);
    }
    return parts.join(slash);
}

export function resolveSourcePath(projectPath: string, loc: DesignSourceLoc): string[] {
    if (isBundledGeneratedPath(loc.fileName)) return [];
    const name = normalizeOriginalSourcePath(loc.fileName);
    const candidates = [name];
    if (name && !name.toLowerCase().startsWith(projectPath.replace(/\\/g, "/").toLowerCase())) {
        const rel = name.replace(/^[/\\]+/, "");
        candidates.push(join(projectPath, rel));
        const idx = rel.toLowerCase().lastIndexOf("/src/");
        const win = rel.toLowerCase().lastIndexOf("\\src\\");
        const cut = Math.max(idx, win);
        if (cut >= 0) candidates.push(join(projectPath, rel.slice(cut + 1)));
        const base = rel.split(/[/\\]/).slice(-4).join("/");
        candidates.push(join(projectPath, base));
        const file = rel.split(/[/\\]/).pop();
        if (file) {
            candidates.push(join(projectPath, "src/" + file));
            candidates.push(join(projectPath, "app/" + file));
        }
    }
    return [...new Set(candidates.filter(Boolean))];
}

export async function readLatest(path: string): Promise<string | null> {
    try {
        let dirty: string | undefined;
        try {
            const { loadDirtyBuffer } = await import("@/lib/dirty-buffers");
            dirty = loadDirtyBuffer(path)?.content;
        } catch {
            /* tests */
        }
        commands.invalidateFileCache(path);
        const disk = await commands.readFile(path);
        if (typeof disk !== "string") return dirty ?? null;
        if (dirty && dirty !== disk) return dirty;
        return disk;
    } catch {
        return null;
    }
}

export async function readFirst(paths: string[]): Promise<{ path: string; content: string } | null> {
    for (const path of paths) {
        const content = await readLatest(path);
        if (content != null) return { path, content };
    }
    return null;
}

export async function persistWrite(path: string, expected: string): Promise<string | null> {
    await commands.saveFile(path, expected);
    commands.invalidateFileCache(path);
    let disk: string;
    try {
        disk = await commands.readFile(path);
    } catch (err) {
        return err instanceof Error ? err.message : "Could not re-read file after save.";
    }
    if (disk.replace(/\r\n/g, "\n") !== expected.replace(/\r\n/g, "\n")) {
        return "Saved file does not match the patch. The write did not persist.";
    }
    try {
        const { emit } = await import("@tauri-apps/api/event");
        await emit("shape-file-edited", path);
    } catch {
        /* not running under Tauri */
    }
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("shape-file-edited"));
    }
    try {
        const { clearDirtyBuffer } = await import("@/lib/dirty-buffers");
        clearDirtyBuffer(path);
    } catch {
        /* ignore */
    }
    return null;
}

export async function revertSourceWrites(entries: { path: string; previous: string }[]): Promise<string | null> {
    for (const entry of entries) {
        const err = await persistWrite(entry.path, entry.previous);
        if (err) return err;
    }
    return null;
}
