/** Path helpers shared across the IDE (no preview dependency). */

export function normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, "/");
}

/** Collapse `.` / `..` segments and duplicate slashes. */
export function cleanPath(filePath: string): string {
    const normalized = normalizePath(filePath);
    const isWindowsAbs = /^[A-Za-z]:\//.test(normalized);
    const parts = normalized.split("/");
    const stack: string[] = [];

    for (const part of parts) {
        if (!part || part === ".") continue;
        if (part === "..") {
            if (stack.length > 0 && stack[stack.length - 1] !== "..") stack.pop();
            else if (!isWindowsAbs) stack.push("..");
            continue;
        }
        stack.push(part);
    }

    if (isWindowsAbs) return `${parts[0]}/${stack.slice(1).join("/")}`;
    return stack.join("/") || "";
}

/** Use OS-native separators for Tauri fs commands on Windows. */
export function toFsPath(filePath: string): string {
    const cleaned = cleanPath(normalizePath(filePath));
    if (/^[A-Za-z]:\//.test(cleaned)) {
        return cleaned.replace(/\//g, "\\");
    }
    return cleaned;
}

export function dirname(filePath: string): string {
    const normalized = cleanPath(normalizePath(filePath));
    const idx = normalized.lastIndexOf("/");
    return idx === -1 ? "" : normalized.slice(0, idx);
}

export function joinPath(...parts: string[]): string {
    return cleanPath(normalizePath(parts.filter(Boolean).join("/")));
}

/** Strip line/column suffixes like `file.ts:12` or `file.ts:12:3`. */
export function stripLineColumnSuffix(filePath: string): string {
    return filePath.replace(/:[0-9]+(?::[0-9]+)?$/, "");
}

/**
 * Resolve a chat/agent path reference to an absolute filesystem path.
 * Handles relative paths, `./`, backticks, and `file.ts:line` suffixes.
 */
export function resolveProjectFilePath(
    filePath: string,
    projectPath: string | null | undefined,
): string {
    let raw = filePath.trim().replace(/^[`"']+|[`"']+$/g, "");
    raw = stripLineColumnSuffix(raw);
    raw = raw.replace(/^\.\//, "").replace(/^\.\\/, "");

    if (/^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith("/")) {
        return toFsPath(raw);
    }
    if (!projectPath) return toFsPath(raw);

    const joined = joinPath(normalizePath(projectPath), normalizePath(raw));
    return toFsPath(joined);
}
