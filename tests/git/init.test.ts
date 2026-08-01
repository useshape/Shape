import { describe, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { invoke } from "@tauri-apps/api/core";

describe("init", () => {
    it("invoke", async () => {
        const spy = vi.fn(() => undefined);
        mockIPC((cmd, args) => {
            if (cmd === "git_init") {
                spy(args);
                return undefined;
            }
        });

        await invoke("git_init", { path: "C:/projects/demo" });
        expect(spy).toHaveBeenCalledWith({ path: "C:/projects/demo" });
    });

    it("errors", async () => {
        mockIPC((cmd) => {
            if (cmd === "git_init") throw new Error("Repository already exists");
        });

        await expect(invoke("git_init", { path: "C:/projects/demo" })).rejects.toThrow(
            "Repository already exists",
        );
    });
});
