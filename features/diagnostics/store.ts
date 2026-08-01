import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";

export type DiagnosticSeverity = "error" | "warning" | "info";

export type Diagnostic = {
    file: string;
    message: string;
    severity: DiagnosticSeverity;
    line: number;
    column: number;
    source?: string;
    code?: string;
};

type DiagnosticsSnapshot = {
    all: Diagnostic[];
    byFile: Record<string, Diagnostic[]>;
    totals: { errors: number; warnings: number; infos: number };
};

let current: DiagnosticsSnapshot = {
    all: [],
    byFile: {},
    totals: { errors: 0, warnings: 0, infos: 0 },
};

const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot(): DiagnosticsSnapshot {
    return current;
}

export function useDiagnostics() {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getFileSummary(path: string): { errors: number; warnings: number; infos: number } {
    const list = current.byFile[path] || [];
    let errors = 0, warnings = 0, infos = 0;
    for (const d of list) {
        if (d.severity === "error") errors++;
        else if (d.severity === "warning") warnings++;
        else infos++;
    }
    return { errors, warnings, infos };
}

export function updateDiagnosticsFromMonaco(monaco: typeof import("monaco-editor")) {
    function normalizePath(input: string): string {
        let p = input;
        if (p.startsWith("/") && p.length >= 3 && p[2] === ":") {
            p = p.slice(1);
        }
        if (p.startsWith("file://")) {
            try {
                const url = new URL(p);
                p = decodeURIComponent(url.pathname || "");
                if (p.startsWith("/") && p.length >= 3 && p[2] === ":") {
                    p = p.slice(1);
                }
            } catch {
                // ignore
            }
        }
        p = p.replace(/\//g, "\\");
        return p;
    }
    const markers = monaco.editor.getModelMarkers({});
    const all: Diagnostic[] = [];
    const byFile: Record<string, Diagnostic[]> = {};
    let errors = 0, warnings = 0, infos = 0;

    for (const m of markers) {
        const raw = (m.resource && "path" in m.resource ? (m.resource as unknown as { path: string }).path : "") || m.resource.toString() || "";
        const file = normalizePath(raw);
        const severity: DiagnosticSeverity =
            m.severity === monaco.MarkerSeverity.Error
                ? "error"
                : m.severity === monaco.MarkerSeverity.Warning
                    ? "warning"
                    : "info";

        if (severity === "error") errors++;
        else if (severity === "warning") warnings++;
        else infos++;

        const diag: Diagnostic = {
            file,
            message: m.message,
            severity,
            line: m.startLineNumber,
            column: m.startColumn,
            source: m.source,
            code: typeof m.code === "object" ? m.code?.value : (m.code as string | undefined),
        };
        all.push(diag);
        if (!byFile[file]) byFile[file] = [];
        byFile[file].push(diag);
    }

    current = { all, byFile, totals: { errors, warnings, infos } };
    emit();

    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("shape-diagnostics-updated"));
    }

    // Sync with backend for AI context
    for (const [file, diags] of Object.entries(byFile)) {
        invoke("set_diagnostics", {
            path: file,
            diagnostics: diags.map(d => ({
                message: d.message,
                severity: d.severity,
                line: d.line,
                column: d.column,
            }))
        }).catch(() => { });
    }
}
