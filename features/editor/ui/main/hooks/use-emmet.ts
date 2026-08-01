"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

let emmetInitialized = false;

export function registerEmmetForMonaco(monaco: unknown) {
    if (emmetInitialized || !monaco) return;
    void import("emmet-monaco-es").then(({ emmetHTML, emmetCSS, emmetJSX }) => {
        if (emmetInitialized) return;
        const m = monaco as any;
        emmetHTML(m, ["html", "htm", "xml", "svg"], { tokenizer: "standard" });
        emmetCSS(m, ["css", "scss", "less"], { tokenizer: "standard" });
        emmetJSX(m, ["javascript", "typescript", "javascriptreact", "typescriptreact"], { tokenizer: "standard" });
        emmetInitialized = true;
    }).catch(console.error);
}
