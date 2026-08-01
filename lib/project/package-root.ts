import { commands } from "@/lib/backend";
import { parseJsonc } from "@/lib/jsonc";
import { cleanPath, dirname, joinPath, normalizePath, toFsPath } from "@/lib/path-utils";

const TSCONFIG_NAMES = ["tsconfig.json", "tsconfig.app.json", "jsconfig.json"] as const;

async function hasTsconfigInDir(dir: string): Promise<boolean> {
    for (const file of TSCONFIG_NAMES) {
        try {
            await commands.readFile(toFsPath(joinPath(dir, file)));
            return true;
        } catch {
            // try next
        }
    }
    return false;
}

/** Find the nearest package root (tsconfig) for a file within the workspace. */
export async function resolvePackageRootForFile(
    projectRoot: string,
    filePath: string,
): Promise<string> {
    const workspace = cleanPath(normalizePath(projectRoot));
    const file = cleanPath(normalizePath(filePath));
    const workspacePrefix = workspace.endsWith("/") ? workspace : `${workspace}/`;

    if (file === workspace || file.startsWith(workspacePrefix)) {
        let current = dirname(file);
        while (current && current.length >= workspace.length) {
            if (await hasTsconfigInDir(current)) {
                return current;
            }
            if (current === workspace) break;
            const parent = dirname(current);
            if (!parent || parent === current) break;
            current = parent;
        }
    }

    try {
        const entries = await commands.lsDir(toFsPath(workspace));
        for (const entry of entries) {
            if (!entry.is_dir) continue;
            const child = cleanPath(normalizePath(entry.path));
            if (file === child || file.startsWith(`${child}/`)) {
                if (await hasTsconfigInDir(child)) {
                    return child;
                }
            }
        }
    } catch {
        // workspace not listable
    }

    return workspace;
}
