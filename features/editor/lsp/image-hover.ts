/**
 * Image hover preview — dispatches `shape-image-hover` for a fixed popup anchored
 * to the URL token in the editor (not the cursor).
 */

import { convertFileSrc } from "@tauri-apps/api/core";
import { joinPath, toFsPath } from "@/lib/path-utils";
import { getFileExtension } from "@/features/editor/lsp/image-types";
import { getSettings } from "@/lib/settings";

const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif|tiff?)(\?[^"')\s]*)?$/i;
const ROOT_RELATIVE_PREFIXES = ["public", "", "static", "assets", "src/assets"] as const;

const PATTERNS: RegExp[] = [
    /url\(\s*["']?([^"')]+)["']?\s*\)/gi,
    /(?:src|href)\s*=\s*["']([^"']+)["']/gi,
    /import\s+\S+\s+from\s+["']([^"']+)["']/gi,
    /require\s*\(\s*["']([^"']+)["']\s*\)/gi,
    /(?:src|href|image|logo|icon|apple|background|poster|thumbnail)\s*[=:]\s*["']([^"']+)["']/gi,
    /\{\s*(?:url|src)\s*:\s*["']([^"']+)["']/gi,
    /!\[[^\]]*\]\(([^)]+)\)/gi,
    /["'`](https?:\/\/[^"'`\s]+\.(png|jpe?g|gif|webp|svg|ico|bmp|avif|tiff?)(\?[^"'`\s]*)?)["'`]/gi,
    /(data:image\/[a-zA-Z+]+;(?:base64|charset=utf-8),[A-Za-z0-9+/=,%]+)/gi,
];

const IMAGE_CONTEXT_KEYS = /(?:icon|apple|favicon|logo|image|img|photo|poster|thumbnail|avatar|banner|cover|hero|splash|sprite|background)\s*[=:]/i;

interface ImageMatch {
    url: string;
    start: number;
    end: number;
}

function stripDiffPrefix(path: string): string {
    return path.replace(/^diff:[^:]*(?::[a-f0-9]{4,40})?:/, "");
}

/** Normalize Monaco model URI to an OS filesystem path. */
export function editorModelFilePath(model: { uri?: { fsPath?: string; path?: string } }): string {
    const uri = model.uri;
    if (!uri) return "";
    if (uri.fsPath) return toFsPath(stripDiffPrefix(uri.fsPath));
    let path = uri.path ?? "";
    if (path.startsWith("/") && path.length >= 3 && path[2] === ":") {
        path = path.slice(1);
    }
    return toFsPath(stripDiffPrefix(path));
}

function findImageMatches(line: string): ImageMatch[] {
    const seen = new Set<string>();
    const results: ImageMatch[] = [];

    for (const pattern of PATTERNS) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(line)) !== null) {
            const url = (m[1] ?? m[0]).trim();
            if (!url || seen.has(url)) continue;

            const hasImageExt = IMAGE_EXTS.test(url);
            const isDataUri = url.startsWith("data:image/");
            const contextBefore = line.slice(Math.max(0, m.index - 40), m.index);
            const strongContext = IMAGE_CONTEXT_KEYS.test(contextBefore);

            if (!hasImageExt && !isDataUri && !strongContext) continue;

            seen.add(url);
            results.push({
                url,
                start: m.index,
                end: m.index + m[0].length,
            });
        }
    }
    return results;
}

/** Ordered filesystem candidates for a raw image URL in the editor. */
export function resolveLocalImagePathCandidates(
    rawUrl: string,
    filePath: string,
    projectPath?: string | null,
): string[] {
    if (rawUrl.startsWith("data:") || /^https?:\/\//i.test(rawUrl)) return [];

    const normalizedFile = toFsPath(stripDiffPrefix(filePath));
    const normalizedProject = projectPath ? toFsPath(stripDiffPrefix(projectPath)) : null;

    if (rawUrl.startsWith("/")) {
        if (!normalizedProject) return [];
        const rel = rawUrl.replace(/^\//, "").split("?")[0] ?? "";
        const candidates: string[] = [];
        for (const prefix of ROOT_RELATIVE_PREFIXES) {
            const joined = prefix
                ? joinPath(normalizedProject, prefix, rel)
                : joinPath(normalizedProject, rel);
            candidates.push(toFsPath(joined));
        }
        return [...new Set(candidates)];
    }

    if (!normalizedFile) return [];
    const dir = normalizedFile.replace(/[/\\][^/\\]+$/, "");
    return [toFsPath(joinPath(dir, rawUrl))];
}

export function resolveLocalImagePath(rawUrl: string, filePath: string, projectPath?: string | null): string | null {
    return resolveLocalImagePathCandidates(rawUrl, filePath, projectPath)[0] ?? null;
}

/** Resolve a displayable image src for the hover card <img>. */
export function resolveImageDisplaySrc(
    rawUrl: string,
    filePath: string,
    projectPath?: string | null,
    candidateIndex = 0,
): string {
    if (rawUrl.startsWith("data:") || /^https?:\/\//i.test(rawUrl)) return rawUrl;

    const candidates = resolveLocalImagePathCandidates(rawUrl, filePath, projectPath);
    const local = candidates[candidateIndex];
    if (local) return convertFileSrc(local);

    if (rawUrl.startsWith("/") && typeof window !== "undefined") {
        return window.location.origin + rawUrl;
    }

    return rawUrl;
}

export interface ImageHoverDetail {
    rawUrl: string;
    filePath: string;
    lineNumber: number;
    /** 1-based column at the start of the matched URL token */
    column: number;
    displaySrc: string;
    tooltip: string;
}

/** Tooltip label: relative path and image type. */
export function getImageHoverTooltip(rawUrl: string): string {
    if (rawUrl.startsWith("data:image/")) {
        const mime = rawUrl.slice("data:image/".length).split(";")[0] ?? "image";
        return `${rawUrl.slice(0, 32)}… · ${mime.toUpperCase()}`;
    }
    const ext = getFileExtension(rawUrl);
    const type = ext ? ext.toUpperCase() : "IMAGE";
    return `${rawUrl} · ${type}`;
}

const SHOW_DELAY_MS = 400;
const DISMISS_MS = 300;

/** Attach per-editor mouse-move listener. Call once per editor instance in onMount. */
export function attachImageHoverToEditor(
    editor: any,
    getProjectPath: () => string | null = () => null,
) {
    let activeKey = "";
    let pendingKey = "";
    let dismissTimer: number | null = null;
    let showTimer: number | null = null;
    let cardInteracting = false;

    const clearDismiss = () => {
        if (dismissTimer !== null) {
            window.clearTimeout(dismissTimer);
            dismissTimer = null;
        }
    };

    const clearShow = () => {
        if (showTimer !== null) {
            window.clearTimeout(showTimer);
            showTimer = null;
        }
        pendingKey = "";
    };

    const reset = () => {
        activeKey = "";
        pendingKey = "";
        cardInteracting = false;
        clearDismiss();
        clearShow();
    };

    const scheduleDismiss = () => {
        if (cardInteracting) return;
        clearDismiss();
        dismissTimer = window.setTimeout(() => {
            reset();
            window.dispatchEvent(new CustomEvent("shape-image-hover", { detail: null }));
        }, DISMISS_MS);
    };

    const onInteracting = (e: Event) => {
        cardInteracting = Boolean((e as CustomEvent<boolean>).detail);
        if (cardInteracting) clearDismiss();
        else scheduleDismiss();
    };

    const onReset = () => reset();

    window.addEventListener("shape-image-hover-interacting", onInteracting);
    window.addEventListener("shape-image-hover-reset", onReset);

    editor.onMouseMove((e: any) => {
        if (getSettings().editor?.imagePreview === false) return;

        const model = editor.getModel();
        if (!model) return;

        const target = e.target;
        if (!target?.position) return;

        const line: string = model.getLineContent(target.position.lineNumber);
        const col = target.position.column - 1;
        const hit = findImageMatches(line).find((m) => col >= m.start && col <= m.end);

        if (!hit) {
            clearShow();
            return;
        }

        clearDismiss();

        const projectPath = getProjectPath();
        const filePath = editorModelFilePath(model);
        const displaySrc = resolveImageDisplaySrc(hit.url, filePath, projectPath);
        const key = `${filePath}|${hit.url}`;

        if (key === activeKey) return;

        if (key === pendingKey) return;

        clearShow();
        if (activeKey) {
            activeKey = "";
            window.dispatchEvent(new CustomEvent("shape-image-hover", { detail: null }));
        }

        pendingKey = key;
        showTimer = window.setTimeout(() => {
            showTimer = null;
            if (pendingKey !== key) return;

            activeKey = key;
            pendingKey = "";
            const detail: ImageHoverDetail = {
                rawUrl: hit.url,
                filePath,
                lineNumber: target.position.lineNumber,
                column: hit.start + 1,
                displaySrc,
                tooltip: getImageHoverTooltip(hit.url),
            };
            window.dispatchEvent(new CustomEvent("shape-image-hover", { detail }));
        }, SHOW_DELAY_MS);
    });

    editor.onDidDispose(() => {
        window.removeEventListener("shape-image-hover-interacting", onInteracting);
        window.removeEventListener("shape-image-hover-reset", onReset);
        reset();
    });
}
