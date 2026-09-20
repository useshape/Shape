/** True for plans saved under `.shape/plans/` or `*.plan.md` files. */
export function isPlanFilePath(path: string): boolean {
    const normalized = path.replace(/\\/g, "/").toLowerCase();
    return normalized.includes("/.shape/plans/") || normalized.endsWith(".plan.md");
}

export function planSlugFromPath(path: string): string {
    const fileName = path.split(/[\\/]/).pop() || "plan.md";
    return fileName.replace(/\.md$/i, "");
}
