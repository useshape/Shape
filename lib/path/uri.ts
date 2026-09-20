/** Convert a local filesystem path to a file:// URI for LSP/DAP. */
export function pathToFileUri(filePath: string): string {
    const normalized = filePath.replace(/\\/g, "/");
    if (/^[a-zA-Z]:\//.test(normalized)) {
        return `file:///${normalized}`;
    }
    if (normalized.startsWith("/")) {
        return `file://${normalized}`;
    }
    return `file:///${normalized}`;
}
