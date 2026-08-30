"use client";

import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import type { Extension } from "@codemirror/state";

/** Pick a CodeMirror language extension from a file path. */
export function languageForPath(path: string): Extension | null {
    const ext = path.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase() || "";
    switch (ext) {
        case "ts":
        case "mts":
        case "cts":
            return javascript({ typescript: true });
        case "tsx":
            return javascript({ typescript: true, jsx: true });
        case "js":
        case "mjs":
        case "cjs":
            return javascript();
        case "jsx":
            return javascript({ jsx: true });
        case "json":
        case "jsonc":
            return json();
        case "html":
        case "htm":
        case "vue":
        case "svelte":
        case "astro":
            return html();
        case "css":
        case "scss":
        case "sass":
        case "less":
            return css();
        case "md":
        case "mdx":
            return markdown();
        case "py":
            return python();
        case "rs":
            return rust();
        case "sql":
            return sql();
        default:
            return null;
    }
}
