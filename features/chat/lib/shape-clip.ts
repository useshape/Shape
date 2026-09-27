/** Clipboard hints so a paste from the in-app terminal or editor becomes an attachment. */

export const SHAPE_CLIP_TERMINAL = "application/x-shape-terminal";
export const SHAPE_CLIP_CODE = "application/x-shape-code";

const STORAGE_KEY = "shape-clip-v1";
const MAX_AGE_MS = 2 * 60 * 1000;

export type ShapeClipKind = "terminal" | "code";

export type ShapeClip = {
    kind: ShapeClipKind;
    text: string;
    label: string;
    at: number;
};

export const PASTE_AS_FILE_CHARS = 2000;

export function pasteIsLarge(text: string): boolean {
    if (text.length >= PASTE_AS_FILE_CHARS) return true;
    let lines = 1;
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10) lines += 1;
        if (lines >= 40) return true;
    }
    return false;
}

export function rememberShapeClip(clip: Omit<ShapeClip, "at">) {
    const payload: ShapeClip = { ...clip, at: Date.now() };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
        /* ignore quota */
    }
}

/** Match a plain-text paste against the last in-app terminal or editor copy. */
export function matchRememberedClip(text: string): ShapeClip | null {
    if (!text) return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const clip = JSON.parse(raw) as ShapeClip;
        if (!clip?.text || clip.text !== text) return null;
        if (Date.now() - (clip.at || 0) > MAX_AGE_MS) return null;
        return clip;
    } catch {
        return null;
    }
}

export function terminalAttachmentFile(text: string, label?: string): File {
    const name = `${(label || "Terminal").replace(/[\\/:*?"<>|]/g, " ").trim() || "Terminal"}.txt`;
    return new File([text], name, { type: "text/x-shape-terminal" });
}

export function codeAttachmentFile(text: string, path: string): File {
    const base = path.split(/[/\\]/).pop() || "selection.txt";
    const name = base.includes(".") ? base : `${base}.txt`;
    return new File([text], name, { type: "text/x-shape-code" });
}

export function pastedTextFile(text: string): File {
    return new File([text], "Pasted text.txt", { type: "text/plain" });
}
