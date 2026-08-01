import type { OutlineSymbol } from "@/lib/backend/types";

export type DocumentSymbolAction = {
    id: string;
    label: string;
    shortcut: string;
    run: () => void;
};

function pathFromModel(model: { uri: { path: string } }): string {
    let path = model.uri.path;
    if (path.startsWith("/") && path.length >= 3 && path[2] === ":") {
        path = path.slice(1);
    }
    return path.replace(/\//g, "\\");
}

function flattenOutline(
    nodes: OutlineSymbol[],
    container?: string,
    out: { sym: OutlineSymbol; label: string }[] = [],
) {
    for (const node of nodes) {
        const label = container ? `${node.name} — ${container}` : node.name;
        out.push({ sym: node, label });
        if (node.children.length > 0) {
            flattenOutline(node.children, node.name, out);
        }
    }
    return out;
}

async function getActiveFileContent(path: string): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monaco = (window as any).monaco;
    const editors = monaco?.editor?.getEditors?.() ?? [];
    for (const editor of editors) {
        const model = editor.getModel?.();
        if (!model) continue;
        if (pathFromModel(model) === path) {
            return model.getValue();
        }
    }

    const { commands } = await import("@/lib/backend");
    return commands.readFile(path);
}

export function openDocumentSymbolsPalette() {
    window.dispatchEvent(
        new CustomEvent("shape-command-palette", {
            detail: { mode: "editor_symbols", placeholder: "Search symbols in file…" },
        }),
    );
}

export async function buildDocumentSymbolActions(filter = ""): Promise<DocumentSymbolAction[]> {
    const { commands } = await import("@/lib/backend");
    const state = await commands.getProjectState();
    const path = state.active_file;
    if (!path) return [];

    let content = "";
    try {
        content = await getActiveFileContent(path);
    } catch {
        return [];
    }

    const extension = path.split(".").pop() || "";
    const response = await commands.getOutline(path, content, extension, Date.now());
    const flat = flattenOutline(response.symbols);

    const q = filter.toLowerCase().trim();
    const filtered = q
        ? flat.filter(
              ({ label, sym }) =>
                  label.toLowerCase().includes(q) ||
                  sym.kind.toLowerCase().includes(q),
          )
        : flat;

    return filtered.slice(0, 200).map(({ sym, label }, idx) => ({
        id: `doc_sym_${idx}_${sym.id}`,
        label,
        shortcut: `${sym.start_line}:${sym.start_col}`,
        run: () => {
            window.dispatchEvent(
                new CustomEvent("shape-editor-jump", {
                    detail: { path, line: sym.start_line, column: sym.start_col },
                }),
            );
        },
    }));
}
