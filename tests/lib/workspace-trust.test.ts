import { describe, expect, it, beforeEach, vi } from "vitest";
import {
    isWorkspaceTrusted,
    listTrustedWorkspaces,
    normalizeWorkspacePath,
    shouldPromptWorkspaceTrust,
    trustWorkspace,
    untrustWorkspace,
} from "@/lib/workspace/trust";

describe("workspace-trust", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.stubGlobal("window", {
            dispatchEvent: vi.fn(),
        });
    });

    it("normalizes paths for comparison", () => {
        expect(normalizeWorkspacePath("C:\\Projects\\App\\")).toBe("c:/projects/app");
    });

    it("tracks trusted workspaces", () => {
        expect(isWorkspaceTrusted("C:/foo")).toBe(false);
        trustWorkspace("C:/foo");
        expect(isWorkspaceTrusted("C:/foo")).toBe(true);
        expect(listTrustedWorkspaces()).toContain("c:/foo");
        untrustWorkspace("C:/foo");
        expect(isWorkspaceTrusted("C:/foo")).toBe(false);
    });

    it("matches trusted paths regardless of slash style", () => {
        trustWorkspace("C:\\repo\\shape");
        expect(isWorkspaceTrusted("C:/repo/shape")).toBe(true);
    });

    it("prompts until the user trusts or declines", () => {
        expect(shouldPromptWorkspaceTrust("C:/new-repo")).toBe(true);
        untrustWorkspace("C:/new-repo");
        expect(shouldPromptWorkspaceTrust("C:/new-repo")).toBe(false);
        expect(isWorkspaceTrusted("C:/new-repo")).toBe(false);
        trustWorkspace("C:/new-repo");
        expect(shouldPromptWorkspaceTrust("C:/new-repo")).toBe(false);
        expect(isWorkspaceTrusted("C:/new-repo")).toBe(true);
    });
});
