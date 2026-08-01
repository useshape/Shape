"use client";

import { useEffect, useRef, useState } from "react";
import { commands } from "@/lib/backend";
import { getSettings } from "@/lib/settings";
import { isWorkspaceTrusted } from "@/lib/workspace-trust";
import type { EslintDiagnostic } from "@/lib/backend/types";

const ESLINT_OWNER = "eslint";
const LINT_DEBOUNCE_MS = 600;
let prettierProvidersRegistered = false;

const LINTABLE_EXTENSIONS = new Set([
    "js", "jsx", "ts", "tsx", "mjs", "cjs", "vue", "svelte",
]);

function isLintable(path: string): boolean {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    return LINTABLE_EXTENSIONS.has(ext);
}

function severityToMonaco(monaco: typeof import("monaco-editor"), severity: string) {
    switch (severity) {
        case "error":
            return monaco.MarkerSeverity.Error;
        case "warning":
            return monaco.MarkerSeverity.Warning;
        default:
            return monaco.MarkerSeverity.Info;
    }
}

function diagnosticsToMarkers(
    monaco: typeof import("monaco-editor"),
    diagnostics: EslintDiagnostic[],
) {
    return diagnostics.map((d) => ({
        startLineNumber: d.line,
        startColumn: d.column,
        endLineNumber: d.end_line,
        endColumn: d.end_column,
        message: d.message,
        severity: severityToMonaco(monaco, d.severity),
        source: ESLINT_OWNER,
        code: d.rule_id ?? undefined,
    }));
}

export function useEslint(options: {
    monaco: typeof import("monaco-editor") | null;
    editor: import("monaco-editor").editor.IStandaloneCodeEditor | null;
    path: string;
    projectPath: string | null;
    content: string;
}) {
    const { monaco, editor, path, projectPath, content } = options;
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const requestIdRef = useRef(0);
    const [trustEpoch, setTrustEpoch] = useState(0);

    useEffect(() => {
        const onTrusted = () => setTrustEpoch((n) => n + 1);
        window.addEventListener("shape-workspace-trusted", onTrusted);
        return () => window.removeEventListener("shape-workspace-trusted", onTrusted);
    }, []);

    useEffect(() => {
        if (!monaco || !editor || !projectPath || !isLintable(path) || !isWorkspaceTrusted(projectPath)) {
            return;
        }

        const settings = getSettings();
        if (!settings.eslint.enable) {
            const model = editor.getModel();
            if (model) {
                monaco.editor.setModelMarkers(model, ESLINT_OWNER, []);
            }
            return;
        }

        if (timerRef.current) clearTimeout(timerRef.current);

        timerRef.current = setTimeout(async () => {
            const requestId = ++requestIdRef.current;
            const model = editor.getModel();
            if (!model) return;

            try {
                const result = await commands.eslintLintFile(
                    projectPath,
                    path,
                    model.getValue(),
                    false,
                );
                if (requestId !== requestIdRef.current) return;

                monaco.editor.setModelMarkers(
                    model,
                    ESLINT_OWNER,
                    diagnosticsToMarkers(monaco, result.diagnostics),
                );
            } catch {
                if (requestId !== requestIdRef.current) return;
                monaco.editor.setModelMarkers(model, ESLINT_OWNER, []);
            }
        }, LINT_DEBOUNCE_MS);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [monaco, editor, path, projectPath, content, trustEpoch]);

    useEffect(() => {
        return () => {
            if (monaco && editor) {
                const model = editor.getModel();
                if (model) {
                    monaco.editor.setModelMarkers(model, ESLINT_OWNER, []);
                }
            }
        };
    }, [monaco, editor, path]);
}

export async function applyEslintFixOnSave(options: {
    monaco: typeof import("monaco-editor");
    editor: import("monaco-editor").editor.IStandaloneCodeEditor;
    path: string;
    projectPath: string;
}): Promise<string | null> {
    const settings = getSettings();
    if (!settings.eslint.enable || !settings.eslint.fixOnSave || !isLintable(options.path)) {
        return null;
    }

    const content = options.editor.getValue();
    const result = await commands.eslintLintFile(
        options.projectPath,
        options.path,
        content,
        true,
    );

    if (result.content && result.content !== content) {
        options.editor.setValue(result.content);
    }

    const model = options.editor.getModel();
    if (model) {
        options.monaco.editor.setModelMarkers(
            model,
            ESLINT_OWNER,
            diagnosticsToMarkers(options.monaco, result.diagnostics),
        );
    }

    return result.content ?? content;
}

export function registerPrettierFormatProvider(options: {
    monaco: typeof import("monaco-editor");
    projectPath: string | null;
}) {
    const { monaco, projectPath } = options;
    if (!projectPath || prettierProvidersRegistered) return () => {};
    prettierProvidersRegistered = true;

    function pathFromModel(model: import("monaco-editor").editor.ITextModel): string {
        let path = model.uri.path;
        if (path.startsWith("/") && path.length >= 3 && path[2] === ":") {
            path = path.slice(1);
        }
        return path.replace(/\//g, "\\");
    }

    const disposables = [
        monaco.languages.registerDocumentFormattingEditProvider("javascript", createProvider()),
        monaco.languages.registerDocumentFormattingEditProvider("typescript", createProvider()),
        monaco.languages.registerDocumentFormattingEditProvider("javascriptreact", createProvider()),
        monaco.languages.registerDocumentFormattingEditProvider("typescriptreact", createProvider()),
        monaco.languages.registerDocumentFormattingEditProvider("json", createProvider()),
        monaco.languages.registerDocumentFormattingEditProvider("css", createProvider()),
        monaco.languages.registerDocumentFormattingEditProvider("scss", createProvider()),
        monaco.languages.registerDocumentFormattingEditProvider("less", createProvider()),
        monaco.languages.registerDocumentFormattingEditProvider("html", createProvider()),
        monaco.languages.registerDocumentFormattingEditProvider("markdown", createProvider()),
    ];

    function createProvider(): import("monaco-editor").languages.DocumentFormattingEditProvider {
        return {
            displayName: "Prettier",
            provideDocumentFormattingEdits: async (model) => {
                if (!getSettings().prettier.enable || !projectPath) return [];
                const path = pathFromModel(model);
                const content = model.getValue();
                try {
                    const formatted = await commands.prettierFormatFile(projectPath, path, content);
                    if (formatted === content) return [];
                    return [{
                        range: model.getFullModelRange(),
                        text: formatted,
                    }];
                } catch {
                    return [];
                }
            },
        };
    }

    return () => {
        disposables.forEach((d) => {
            try { d.dispose(); } catch { /* noop */ }
        });
    };
}
