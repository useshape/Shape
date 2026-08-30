/**
 * Lightweight file/folder icon paths — no @iconify-json/vscode-icons bundle.
 * Uses lucide-style SVG data URLs for a tiny set of common extensions.
 */

const SVG = (body: string, color = "#a3a3a3") =>
    `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
    )}`;

const FILE = SVG(
    `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>`,
);
const FOLDER = SVG(
    `<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>`,
);
const FOLDER_OPEN = SVG(
    `<path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/>`,
);

const BY_EXT: Record<string, string> = {
    ts: FILE,
    tsx: FILE,
    js: FILE,
    jsx: FILE,
    json: FILE,
    md: FILE,
    css: FILE,
    html: FILE,
    rs: FILE,
    py: FILE,
    toml: FILE,
    yml: FILE,
    yaml: FILE,
};

export function isDocumentLightTheme(): boolean {
    if (typeof document === "undefined") return false;
    return document.documentElement.getAttribute("data-theme") === "light";
}

export function getFolderIconPath(_name: string, isOpen = false, _light = false): string {
    return isOpen ? FOLDER_OPEN : FOLDER;
}

export function getIconPath(name: string, _light = false): string {
    const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
    return BY_EXT[ext] ?? FILE;
}
