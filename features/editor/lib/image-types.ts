/**
 * Shared image-type detection utilities.
 * Used by editor.tsx, tabs/tabs.tsx, image-hover.ts, and use-image-loader.ts
 * so format lists and logic don't diverge.
 */

export const IMAGE_EXTENSIONS = new Set([
    "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "avif", "tiff", "tif", "heic", "heif",
]);

export const FONT_EXTENSIONS = new Set(["woff", "woff2", "ttf", "otf", "eot"]);

/**
 * Extract the true file extension from a path, ignoring diff: prefixes and
 * display-name suffixes like " (a1b2c3d)" or " (Working Tree)".
 */
export function getFileExtension(pathOrName: string): string {
    // Strip diff:* prefix
    const stripped = pathOrName.replace(/^diff:[^:]*(?::[a-f0-9]{4,40})?:/, "");
    // Grab the filename portion (after last slash/backslash)
    const filename = stripped.replace(/.*[/\\]/, "");
    // Strip display-name suffixes like " (abc1234)" or " (Index)"
    const clean = filename.replace(/\s+\([^)]+\)\s*$/, "");
    return (clean.split(".").pop() ?? "").toLowerCase();
}

export function isImageExtension(ext: string): boolean {
    return IMAGE_EXTENSIONS.has(ext);
}

export function isFontExtension(ext: string): boolean {
    return FONT_EXTENSIONS.has(ext);
}
