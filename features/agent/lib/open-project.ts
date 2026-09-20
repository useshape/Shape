import { commands, getProjectSnapshot } from "@/lib/backend";
import { clearExtraWorkspaceFolders } from "@/lib/workspace/folders";
import { notifyWorkspaceOpened } from "@/lib/workspace/trust";

export function normalizeProjectPath(path: string): string {
    return path
        .trim()
        .replace(/[\\/]+$/, "")
        .replace(/\//g, "\\");
}

export function projectPathsEqual(
    a: string | null | undefined,
    b: string | null | undefined,
): boolean {
    if (!a || !b) return false;
    return normalizeProjectPath(a).toLowerCase() === normalizeProjectPath(b).toLowerCase();
}

export function projectLeaf(path: string | null | undefined): string {
    if (!path) return "Project";
    const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/);
    return parts[parts.length - 1] || path;
}

/** Always-safe project switch — owned by the Agent View host, not Home. */
export async function openProject(path: string): Promise<boolean> {
    const normalized = normalizeProjectPath(path);
    if (!normalized) return false;

    const current = getProjectSnapshot().project_path;
    if (projectPathsEqual(current, normalized)) return true;

    clearExtraWorkspaceFolders();
    await commands.setProjectPath(normalized);
    notifyWorkspaceOpened(normalized);
    return true;
}
