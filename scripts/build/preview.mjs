import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(root, "src-tauri", "runtime");
const outFile = join(outDir, "bundle.js");
const tailwindOut = join(outDir, "tailwind-browser.js");
const tailwindSrc = join(root, "node_modules", "@tailwindcss", "browser", "dist", "index.global.js");

mkdirSync(outDir, { recursive: true });

await esbuild.build({
    entryPoints: [join(root, "runtime", "entry.ts")],
    outfile: outFile,
    bundle: true,
    format: "iife",
    globalName: "ShapePreviewRuntime",
    platform: "browser",
    target: ["es2020"],
    minify: true,
    sourcemap: false,
    logLevel: "info",
});

copyFileSync(tailwindSrc, tailwindOut);

const publicPreview = join(root, "public", "preview");
mkdirSync(publicPreview, { recursive: true });
copyFileSync(outFile, join(publicPreview, "bundle.js"));
copyFileSync(tailwindOut, join(publicPreview, "tailwind-browser.js"));

console.log(`Wrote ${outFile}`);
console.log(`Wrote ${tailwindOut}`);
console.log(`Wrote ${join(publicPreview, "bundle.js")}`);
