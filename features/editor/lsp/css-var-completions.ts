/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Project-wide CSS variable intelligence for Monaco Editor.
 *
 * Registers completion, hover, and definition providers across all languages so
 * that `var(--*)` references get completions, hover documentation, and
 * jump-to-definition backed by the variables parsed from the project's CSS files.
 */

import type { CssVariable } from "@/lib/css-variables";

// ── Variable registry ────────────────────────────────────────────────────────

interface VariableEntry extends CssVariable {
    filePath: string;
}

let _registry: VariableEntry[] = [];
let _registrationsDone = false;

/** Replace the current variable registry with a fresh set from a file. */
export function registerCssVariables(filePath: string, variables: CssVariable[]) {
    _registry = _registry.filter((e) => e.filePath !== filePath);
    for (const v of variables) {
        _registry.push({ ...v, filePath });
    }
}

/** Look up a variable by name (must include `--` prefix). */
export function lookupVariable(name: string): VariableEntry | undefined {
    return _registry.find((v) => v.name === name);
}

// ── Monaco provider registration ─────────────────────────────────────────────

const ALL_LANGUAGES = [
    "css", "scss", "less",
    "html",
    "typescript", "typescriptreact",
    "javascript", "javascriptreact",
];

/** Detect a `var(--` completion trigger at the cursor. */
function getVarPrefixAtPosition(model: any, position: any): string | null {
    const line: string = model.getLineContent(position.lineNumber);
    const col = position.column - 1;
    const before = line.slice(0, col);
    const m = before.match(/var\(\s*(--[\w-]*)$/);
    if (m) return m[1];
    // Also match bare `--` in CSS value context
    const bareM = before.match(/(--[\w-]*)$/);
    if (bareM && (line.includes("var(") || /\.css|\.scss|\.less/.test(""))) return bareM[1];
    return null;
}

/** Extract the `--variable-name` under the cursor (or null). */
function getVarNameAtPosition(model: any, position: any): string | null {
    const line: string = model.getLineContent(position.lineNumber);
    const col = position.column - 1;
    const before = line.slice(0, col);
    const after = line.slice(col);
    const beforeMatch = before.match(/(--[\w-]*)$/);
    if (!beforeMatch) return null;
    const afterMatch = after.match(/^([\w-]*)/);
    return beforeMatch[1] + (afterMatch ? afterMatch[1] : "");
}

function kindIcon(kind: string): number {
    // monaco.languages.CompletionItemKind equivalents (numeric)
    switch (kind) {
        case "color": return 15; // Color
        case "font": return 9; // Text
        case "size": return 12; // Unit
        default: return 5; // Field
    }
}

function buildMarkdown(entry: VariableEntry): string {
    const colorSwatch =
        entry.kind === "color" && entry.value
            ? `\n\n<span style="display:inline-block;width:12px;height:12px;background:${entry.value};border:1px solid #555;vertical-align:middle;margin-right:4px;border-radius:2px"></span>`
            : "";
    const lines = [
        `**\`${entry.name}\`**${colorSwatch}`,
        `\`${entry.value}\``,
        `*Defined in* \`${entry.filePath.replace(/\\/g, "/").split("/").pop()}\` — line ${entry.line}`,
    ];
    return lines.join("\n\n");
}

/** One-time registration of Monaco providers. Call after monaco is ready. */
export function ensureCssVarProviders(monaco: any) {
    if (_registrationsDone || typeof monaco === "undefined") return;
    _registrationsDone = true;

    // ── Completion Provider ───────────────────────────────────────────────────
    monaco.languages.registerCompletionItemProvider(ALL_LANGUAGES, {
        triggerCharacters: ["-", "("],
        provideCompletionItems(model: any, position: any) {
            const prefix = getVarPrefixAtPosition(model, position);
            if (prefix === null) return { suggestions: [] };

            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: position.column - prefix.length,
                endColumn: position.column,
            };

            const suggestions = _registry.map((entry) => ({
                label: entry.name,
                kind: kindIcon(entry.kind),
                detail: entry.value,
                documentation: {
                    value: buildMarkdown(entry),
                    isTrusted: true,
                },
                insertText: entry.name,
                range,
                sortText: entry.name,
            }));

            return { suggestions };
        },
    });

    // ── Hover Provider ────────────────────────────────────────────────────────
    monaco.languages.registerHoverProvider(ALL_LANGUAGES, {
        provideHover(model: any, position: any) {
            const name = getVarNameAtPosition(model, position);
            if (!name) return null;
            const entry = lookupVariable(name);
            if (!entry) return null;

            const startCol = model.getLineContent(position.lineNumber).indexOf(name) + 1;
            return {
                range: {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: startCol,
                    endColumn: startCol + name.length,
                },
                contents: [{ value: buildMarkdown(entry), isTrusted: true }],
            };
        },
    });

    // ── Definition Provider ───────────────────────────────────────────────────
    monaco.languages.registerDefinitionProvider(ALL_LANGUAGES, {
        provideDefinition(model: any, position: any) {
            const name = getVarNameAtPosition(model, position);
            if (!name) return null;
            const entry = lookupVariable(name);
            if (!entry) return null;

            const monaco_ = (window as any).monaco;
            if (!monaco_) return null;

            return {
                uri: monaco_.Uri.file(entry.filePath),
                range: {
                    startLineNumber: entry.line,
                    endLineNumber: entry.line,
                    startColumn: 1,
                    endColumn: entry.name.length + 1,
                },
            };
        },
    });
}
