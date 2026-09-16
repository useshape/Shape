import { describe, expect, it, vi } from "vitest";
import { detectDevCommand, isWebProject, pickDevScript, portFromScript } from "@/features/detection/lib/lib";

vi.mock("@/lib/backend", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/backend")>();
    return {
        ...actual,
        commands: {
            ...actual.commands,
            lsDir: vi.fn(),
            readFile: vi.fn(),
        },
    };
});

import { commands } from "@/lib/backend";

describe("isWebProject", () => {
    it("detects package.json", async () => {
        vi.mocked(commands.lsDir).mockResolvedValue([
            { name: "package.json", path: "C:/p/package.json", is_dir: false },
        ]);
        expect(await isWebProject("C:/p")).toBe(true);
    });

    it("detects vite config", async () => {
        vi.mocked(commands.lsDir).mockResolvedValue([
            { name: "vite.config.ts", path: "C:/p/vite.config.ts", is_dir: false },
        ]);
        expect(await isWebProject("C:/p")).toBe(true);
    });

    it("detects src with web extensions", async () => {
        vi.mocked(commands.lsDir).mockResolvedValue([
            { name: "src", path: "C:/p/src", is_dir: true },
            { name: "index.tsx", path: "C:/p/index.tsx", is_dir: false },
        ]);
        expect(await isWebProject("C:/p")).toBe(true);
    });

    it("returns false for empty non-web directory", async () => {
        vi.mocked(commands.lsDir).mockResolvedValue([
            { name: "README.md", path: "C:/p/README.md", is_dir: false },
        ]);
        expect(await isWebProject("C:/p")).toBe(false);
    });

    it("returns true for empty directory", async () => {
        vi.mocked(commands.lsDir).mockResolvedValue([]);
        expect(await isWebProject("C:/p")).toBe(true);
    });

    it("returns true on ls error", async () => {
        vi.mocked(commands.lsDir).mockRejectedValue(new Error("fail"));
        expect(await isWebProject("C:/p")).toBe(true);
    });
});

describe("pickDevScript", () => {
    it("skips run-p wrappers and picks the framework script", () => {
        expect(
            pickDevScript({
                dev: "run-p --race dev:*",
                "dev:next": "next dev --turbopack --port 3003",
                "dev:css": "tailwindcss -w",
            }),
        ).toBe("dev:next");
    });

    it("keeps a plain npm run dev script", () => {
        expect(pickDevScript({ dev: "next dev", start: "next start" })).toBe("dev");
    });
});

describe("portFromScript", () => {
    it("reads --port from next/vite scripts", () => {
        expect(portFromScript("next dev --turbopack --port 3003")).toBe("3003");
        expect(portFromScript("vite --port=5174")).toBe("5174");
    });
});

describe("detectDevCommand", () => {
    it("runs the framework script body directly with the script port", async () => {
        vi.mocked(commands.lsDir).mockResolvedValue([
            { name: "package.json", path: "C:/app/package.json", is_dir: false },
        ]);
        vi.mocked(commands.readFile).mockResolvedValue(
            JSON.stringify({
                scripts: {
                    dev: "run-p --race dev:*",
                    "dev:next": "next dev --turbopack --port 3003",
                },
                dependencies: { next: "15.0.0" },
            }),
        );

        const info = await detectDevCommand("C:/app");
        expect(info).toMatchObject({
            command: "next dev --turbopack --port 3003",
            script: "dev:next",
            urlHint: "http://localhost:3003/",
        });
    });

    it("leaves bare next dev alone and waits for the terminal scrape for the port", async () => {
        vi.mocked(commands.lsDir).mockResolvedValue([
            { name: "package.json", path: "C:/app/package.json", is_dir: false },
        ]);
        vi.mocked(commands.readFile).mockResolvedValue(
            JSON.stringify({
                scripts: { dev: "next dev" },
                dependencies: { next: "16.0.0" },
            }),
        );

        const info = await detectDevCommand("C:/app");
        expect(info).toMatchObject({
            command: "next dev",
            script: "dev",
            urlHint: "http://localhost:3000/",
        });
    });
});
