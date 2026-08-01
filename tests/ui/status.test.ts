import { beforeEach, describe, expect, it } from "vitest";
import { statusProgress } from "@/lib/status-progress";

describe("status progress", () => {
    beforeEach(() => {
        statusProgress.clear();
    });

    it("push and get message", () => {
        statusProgress.push("a", "Loading");
        expect(statusProgress.getMessage()).toBe("Loading");
    });

    it("tracks multiple messages", () => {
        statusProgress.push("git", "Refreshing git status...");
        statusProgress.push("lsp", "Starting TypeScript...");
        expect(statusProgress.getMessage()).toBe("Starting TypeScript...");
        expect(statusProgress.getAllMessages()).toEqual([
            "Refreshing git status...",
            "Starting TypeScript...",
        ]);
    });

    it("replaces entry with same id", () => {
        statusProgress.push("a", "One");
        statusProgress.push("a", "Two");
        expect(statusProgress.getAllMessages()).toEqual(["Two"]);
    });

    it("remove clears entry", () => {
        statusProgress.push("a", "Loading");
        statusProgress.remove("a");
        expect(statusProgress.getMessage()).toBeNull();
    });

    it("remove is no-op for missing id", () => {
        statusProgress.push("a", "Loading");
        statusProgress.remove("missing");
        expect(statusProgress.getMessage()).toBe("Loading");
    });

    it("clear removes all entries", () => {
        statusProgress.push("a", "One");
        statusProgress.push("b", "Two");
        statusProgress.clear();
        expect(statusProgress.getAllMessages()).toEqual([]);
    });
});
