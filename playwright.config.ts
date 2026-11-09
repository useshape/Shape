import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    testMatch: "**/*.spec.ts",
    timeout: 60_000,
    fullyParallel: false,
    use: {
        baseURL: "http://127.0.0.1:4177",
        viewport: { width: 900, height: 700 },
    },
    webServer: {
        command: "bunx --bun serve . -p 4177",
        port: 4177,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
    },
});
