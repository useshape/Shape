import { describe, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";

describe("git branch integration", () => {
    it("refresh event propagates", async () => {
        const handler = vi.fn();
        mockIPC(() => {}, { shouldMockEvents: true });
        const unlisten = await import("@tauri-apps/api/event").then(({ listen }) =>
            listen("shape-git-refresh", handler),
        );
        await emit("shape-git-refresh", {});
        expect(handler).toHaveBeenCalled();
        if (typeof unlisten === "function") await unlisten();
    });

    it("project state invoke works", async () => {
        mockIPC((cmd) => {
            if (cmd === "get_project_state") {
                return { project_path: "C:/repo", open_files: [] };
            }
        });
        const state = await import("@tauri-apps/api/core").then(({ invoke }) =>
            invoke<{ project_path: string }>("get_project_state"),
        );
        expect(state.project_path).toBe("C:/repo");
    });
});
