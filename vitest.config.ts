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
        alias: {
            "@": path.resolve(__dirname, "."),
        },
    },
});
