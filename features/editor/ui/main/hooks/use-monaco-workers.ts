import { useEffect, useState } from "react";
import { notify } from "@/features/notifications";
import "monaco-editor/min/vs/editor/editor.main.css";

const MONACO_WORKER_BASE = "/monaco";

/** Hard ceiling so a stuck vscode-api init cannot blank the editor indefinitely. */
const LSP_WARMUP_BUDGET_MS = 10_000;

function monacoWorkerUrl(file: string): string {
    return `${MONACO_WORKER_BASE}/${file}`;
}

function configureMonacoEnvironment() {
    type MonacoEnvironment = {
        getWorkerUrl?: (_workerId: string, label: string) => string;
        getWorker?: (_workerId: string, label: string) => Worker;
    };

    const env = self as typeof globalThis & { MonacoEnvironment?: MonacoEnvironment };

    const workerFile = (label: string) => {
        if (label === "json") return "json.worker.js";
        if (label === "css" || label === "scss" || label === "less") return "css.worker.js";
        if (label === "html" || label === "handlebars" || label === "razor") return "html.worker.js";
        if (label === "typescript" || label === "javascript") return "ts.worker.js";
        return "editor.worker.js";
    };

    env.MonacoEnvironment = {
        getWorkerUrl(_workerId: string, label: string) {
            return monacoWorkerUrl(workerFile(label));
        },
        getWorker(_workerId: string, label: string) {
            return new Worker(monacoWorkerUrl(workerFile(label)));
        },
    };
}

/**
 * Load Monaco for the editor. vscode-api init is best-effort and must never
 * blank the editor (previous "Services are already initialized" loop).
 */
export function useMonacoWorkers() {
    const [monacoReady, setMonacoReady] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const setupMonaco = async () => {
            if (typeof window === "undefined") return;

            configureMonacoEnvironment();

            // Prefer codingame init before monaco-editor import (better LSP).
            // Never wait longer than LSP_WARMUP_BUDGET_MS — editor paint wins.
            try {
                const { LspClientManager } = await import("@/features/editor/lsp/lsp-client");
                let budgetHit = false;
                await Promise.race([
                    LspClientManager.warmupServices(),
                    new Promise<void>((resolve) => {
                        setTimeout(() => {
                            budgetHit = true;
                            LspClientManager.releaseEditorBootBarrier();
                            resolve();
                        }, LSP_WARMUP_BUDGET_MS);
                    }),
                ]);
                if (budgetHit) {
                    console.warn(
                        "[LSP] warmup exceeded editor boot budget — opening editor without language services",
                    );
                }
            } catch (err) {
                console.warn("[LSP] warmup before Monaco failed:", err);
            }
            if (cancelled) return;

            try {
                const { registerBundledMonacoLanguages } = await import(
                    "@/lib/editor/register-monaco-languages"
                );
                await registerBundledMonacoLanguages();
            } catch (err) {
                console.warn("[Monaco] language pack registration failed:", err);
            }
            if (cancelled) return;

            // Dynamic imports — avoid static @monaco-editor/react at module top
            // (that was booting StandaloneServices before initialize()).
            const [{ loader }, monaco] = await Promise.all([
                import("@monaco-editor/react"),
                import("monaco-editor"),
            ]);
            if (cancelled) return;

            loader.config({ monaco });

            const { defineShapeMonacoThemes } = await import("@/lib/ui/monaco-theme");
            defineShapeMonacoThemes(monaco);

            for (const lang of ["css", "scss", "less", "html", "typescript", "javascript"]) {
                monaco.languages.registerCodeActionProvider(lang, {
                    provideCodeActions: () => ({ actions: [], dispose: () => {} }),
                });
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ts = (monaco.languages as any).typescript;
            if (ts?.typescriptDefaults) {
                const tsOptions = {
                    jsx: ts.JsxEmit?.ReactJSX || 4,
                    moduleResolution: ts.ModuleResolutionKind?.NodeJs || 2,
                    allowNonTsExtensions: true,
                    target: ts.ScriptTarget?.Latest || 99,
                    module: ts.ModuleKind?.CommonJS || 1,
                    allowJs: true,
                    experimentalDecorators: true,
                    emitDecoratorMetadata: true,
                };
                ts.typescriptDefaults.setCompilerOptions(tsOptions);
                ts.javascriptDefaults.setCompilerOptions(tsOptions);
                ts.typescriptDefaults.setDiagnosticsOptions({
                    noSemanticValidation: true,
                    noSyntaxValidation: false,
                });
                ts.javascriptDefaults.setDiagnosticsOptions({
                    noSemanticValidation: true,
                    noSyntaxValidation: false,
                });
            }

            if (!cancelled) setMonacoReady(true);
        };

        setupMonaco().catch((error) => {
            console.error("Failed to initialize Monaco:", error);
            notify.error(
                "Editor Error",
                `Failed to initialize editor: ${error instanceof Error ? error.message : String(error)}`,
            );
        });

        return () => {
            cancelled = true;
        };
    }, []);

    return monacoReady;
}
