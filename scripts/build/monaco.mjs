import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(root, "public", "monaco");

const workers = [
    ["editor.worker.js", "monaco-editor/esm/vs/editor/editor.worker.js"],
    ["json.worker.js", "monaco-editor/esm/vs/language/json/json.worker.js"],
    ["css.worker.js", "monaco-editor/esm/vs/language/css/css.worker.js"],
    ["html.worker.js", "monaco-editor/esm/vs/language/html/html.worker.js"],
    ["ts.worker.js", "monaco-editor/esm/vs/language/typescript/ts.worker.js"],
];

mkdirSync(outDir, { recursive: true });

await Promise.all(
    workers.map(([outName, entry]) =>
        esbuild.build({
            entryPoints: [join(root, "node_modules", entry)],
            outfile: join(outDir, outName),
            bundle: true,
            // IIFE so classic `new Worker(url)` works (ESM workers need `{ type: "module" }`).
            format: "iife",
            platform: "browser",
            target: ["es2020"],
            minify: true,
            sourcemap: false,
            logLevel: "silent",
        }),
    ),
);

console.log(`Wrote ${workers.length} Monaco workers to ${outDir}`);
