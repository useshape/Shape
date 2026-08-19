import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./tests/setup.ts"],
        include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
        passWithNoTests: false,
    },
    resolve: {
        alias: [
            { find: "@", replacement: path.resolve(__dirname, ".") },
            // monaco-editor 0.49 has `module` but no `main`/`exports`; Vite won't resolve the bare specifier.
            {
                find: /^monaco-editor$/,
                replacement: path.resolve(__dirname, "node_modules/monaco-editor/esm/vs/editor/editor.api.js"),
            },
        ],
    },
});
