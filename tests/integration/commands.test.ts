import { describe, expect, it, vi } from "vitest";
import { emit } from "@tauri-apps/api/event";
import { mockInvoke, invokeMocked } from "../helpers/tauri";

describe("integration commands", () => {
    it("mocks github auth status", async () => {
        mockInvoke((cmd) => {
            if (cmd === "github_auth_status") {
                return { loggedIn: true, username: "dev", avatarUrl: null, provider: "gcm" };
            }
        });
        const status = await invokeMocked<{
            loggedIn: boolean;
            username: string;
            provider: string;
        }>("github_auth_status");
        expect(status.loggedIn).toBe(true);
        expect(status.username).toBe("dev");
    });

    it("mocks project state", async () => {
        mockInvoke((cmd) => {
            if (cmd === "get_project_state") {
                return { project_path: "C:/repo", open_files: [], active_file: null };
            }
        });
        const state = await invokeMocked<{ project_path: string }>("get_project_state");
        expect(state.project_path).toBe("C:/repo");
    });

    it("mocks git current branch", async () => {
        mockInvoke((cmd) => {
            if (cmd === "git_current_branch") {
                return "main";
            }
        });
        const branch = await invokeMocked<string>("git_current_branch", { path: "C:/repo" });
        expect(branch).toBe("main");
    });

    it("receives git refresh events", async () => {
        mockInvoke(() => {}, { shouldMockEvents: true });
        const handler = vi.fn();
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten = await listen("shape-git-refresh", handler);
        await emit("shape-git-refresh", {});
        expect(handler).toHaveBeenCalled();
        if (typeof unlisten === "function") await unlisten();
    });
});
