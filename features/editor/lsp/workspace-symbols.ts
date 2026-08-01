/* eslint-disable @typescript-eslint/no-explicit-any */

export type WorkspaceSymbol = {
    name: string;
    kind: number;
    location: {
        uri: string;
        range: { start: { line: number; character: number }; end: { line: number; character: number } };
    };
    containerName?: string;
};

export async function fetchWorkspaceSymbols(query: string): Promise<WorkspaceSymbol[]> {
    const monaco = (window as any).monaco;
    if (!monaco) return [];

    try {
        const editors = monaco.editor?.getEditors?.() ?? [];
        if (editors.length === 0) return [];

        const workspace = (monaco as any).workspace;
        if (workspace?.getAllSymbols) {
            const symbols = await workspace.getAllSymbols(query);
            return normalizeSymbols(symbols);
        }

        const editor = editors[editors.length - 1];
        const model = editor.getModel();
        if (!model) return [];

        const languageId = model.getLanguageId();
        const providers = monaco.languages.getSymbolProviders?.(languageId) ?? [];

        const all: WorkspaceSymbol[] = [];
        for (const provider of providers) {
            if (!provider.provideWorkspaceSymbols) continue;
            const result = await provider.provideWorkspaceSymbols(query, {} as any);
            if (result) all.push(...normalizeSymbols(result));
        }
        return all;
    } catch (e) {
        console.warn("Workspace symbols fetch failed:", e);
        return [];
    }
}

function normalizeSymbols(input: any[]): WorkspaceSymbol[] {
    if (!Array.isArray(input)) return [];
    return input.map((s) => ({
        name: s.name ?? s.label ?? "",
        kind: s.kind ?? 0,
        location: {
            uri: s.location?.uri?.path ?? s.location?.uri ?? s.uri?.path ?? s.uri ?? "",
            range: s.location?.range ?? s.range ?? {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
            },
        },
        containerName: s.containerName,
    })).filter((s) => s.name);
}

export function openWorkspaceSymbolsPalette() {
    window.dispatchEvent(new CustomEvent("shape-command-palette", {
        detail: {
            mode: "workspace_symbols",
            placeholder: "Search symbols in workspace…",
        },
    }));
}

export async function buildWorkspaceSymbolActions(filter = "") {
    const symbols = await fetchWorkspaceSymbols(filter);
    const { commands } = await import("@/lib/backend");

    return symbols.slice(0, 200).map((sym, idx) => {
        let path = sym.location.uri;
        if (path.startsWith("/") && path.length >= 3 && path[2] === ":") {
            path = path.slice(1);
        }
        path = path.replace(/\//g, "\\");
        const line = (sym.location.range.start.line ?? 0) + 1;
        const column = (sym.location.range.start.character ?? 0) + 1;
        const fileName = path.split(/[\\/]/).pop() || path;
        const label = sym.containerName
            ? `${sym.name} — ${sym.containerName} (${fileName})`
            : `${sym.name} (${fileName})`;

        return {
            id: `ws_sym_${idx}_${sym.name}`,
            label,
            shortcut: `${line}:${column}`,
            run: async () => {
                await commands.openFile(path, fileName);
                window.dispatchEvent(new CustomEvent("shape-editor-jump", {
                    detail: { path, line, column },
                }));
            },
        };
    });
}
