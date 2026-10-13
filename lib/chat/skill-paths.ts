"use client";

/** Normalize a directory path: forward slashes, no trailing separator. */
export function normalizeSkillPath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** Path separator used by the given directory. */
export function skillPathSep(dir: string): string {
    return dir.includes("\\") ? "\\" : "/";
}

/** Join a directory and a relative path with the directory's separator. */
export function joinSkillPath(dir: string, relativePath: string): string {
    const sep = skillPathSep(dir);
    const relative = relativePath.replace(/^[\\/]+/, "").replace(/[\\/]+/g, sep);
    return `${dir.replace(/[\\/]+$/, "")}${sep}${relative}`;
}

/** True when `child` is `parent` or lives inside it, ignoring case like the FS does. */
export function isInsideSkillPath(child: string, parent: string): boolean {
    const normalizedChild = normalizeSkillPath(child).toLowerCase();
    const normalizedParent = normalizeSkillPath(parent).toLowerCase();
    return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`);
}

/**
 * Path to show for a skill location: project-relative when it lives in the
 * project, `~/…` when it lives in the home directory, absolute otherwise.
 */
export function displaySkillPath(fullPath: string, projectPath: string | null, homeDir: string | null): string {
    const normalized = normalizeSkillPath(fullPath);
    if (projectPath && isInsideSkillPath(normalized, projectPath)) {
        const relative = normalized.slice(normalizeSkillPath(projectPath).length).replace(/^\/+/, "");
        return relative === "" ? "." : relative;
    }
    if (homeDir && isInsideSkillPath(normalized, homeDir)) {
        const relative = normalized.slice(normalizeSkillPath(homeDir).length).replace(/^\/+/, "");
        return relative === "" ? "~" : `~/${relative}`;
    }
    return normalized;
}
