import { invoke } from "@tauri-apps/api/core";

export type PythonInterpreter = {
    path: string;
    label: string;
    version?: string;
};

/** Discover installed / workspace Python interpreters (VS Code-style). */
export async function discoverPythonInterpreters(
    projectPath: string | null,
): Promise<PythonInterpreter[]> {
    try {
        return await invoke<PythonInterpreter[]>("discover_python_interpreters", {
            projectPath,
        });
    } catch {
        return [];
    }
}

/** Palette row: version-first label from discovery, then path (ASCII spaces, no em dash). */
export function formatInterpreterLabel(interp: PythonInterpreter): string {
    const title =
        interp.label.trim() ||
        (interp.version ? `Python ${interp.version}` : "Python");
    return `${title}  ${interp.path}`;
}

/**
 * Resolve the configured interpreter to an executable command string.
 * `"auto"` → first discovered path, else `python` / `python3` on PATH.
 */
export async function resolvePythonInterpreter(
    configured: string,
    projectPath: string | null,
): Promise<string> {
    if (configured && configured !== "auto") return quoteIfNeeded(configured);

    const found = await discoverPythonInterpreters(projectPath);
    if (found[0]?.path) return quoteIfNeeded(found[0].path);

    return navigator.platform.toLowerCase().includes("win") ? "python" : "python3";
}

function quoteIfNeeded(path: string): string {
    if (/\s/.test(path) && !path.startsWith('"')) return `"${path}"`;
    return path;
}
