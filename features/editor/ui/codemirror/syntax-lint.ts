"use client";

import { syntaxTree } from "@codemirror/language";
import { linter, type Diagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import { commands } from "@/lib/backend";

type ShapeDiag = {
    message: string;
    severity: string;
    line: number;
    column: number;
};

/** Tree-sitter-style parse errors via the active language grammar + push to the agent. */
export function shapeSyntaxLinter(path: string): Extension {
    return linter(
        (view) => {
            const diags: Diagnostic[] = [];
            const tree = syntaxTree(view.state);
            tree.iterate({
                enter(node) {
                    if (!node.type.isError) return;
                    const from = node.from;
                    const to = Math.max(from + 1, node.to);
                    const line = view.state.doc.lineAt(from);
                    const snippet = view.state.sliceDoc(from, Math.min(to, from + 40)).replace(/\s+/g, " ");
                    diags.push({
                        from,
                        to,
                        severity: "error",
                        message: snippet
                            ? `Unexpected syntax near \`${snippet}\``
                            : `Syntax error at line ${line.number}`,
                    });
                    if (diags.length >= 40) return false;
                },
            });

            const payload: ShapeDiag[] = diags.map((d) => {
                const line = view.state.doc.lineAt(d.from);
                return {
                    message: d.message,
                    severity: d.severity === "warning" ? "warning" : "error",
                    line: line.number,
                    column: d.from - line.from + 1,
                };
            });
            void commands.setDiagnostics(path, payload).catch(() => undefined);
            return diags;
        },
        { delay: 450 },
    );
}
