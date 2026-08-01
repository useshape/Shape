import { describe, expect, it, vi } from "vitest";
import { isWebProject } from "@/features/detection/lib/lib";

vi.mock("@/lib/backend/commands", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/backend/commands")>();
    return {
        ...actual,
        commands: {
            ...actual.commands,
            lsDir: vi.fn(),
        },
    };
});

import { commands } from "@/lib/backend/commands";

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
