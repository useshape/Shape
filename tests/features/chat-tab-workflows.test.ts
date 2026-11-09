import { afterEach, describe, expect, it } from "vitest";
import {
    hasGeneratingChats,
    resetGeneratingChatsForTests,
    setChatGenerating,
} from "@/features/chat/lib/generating-chats";
import { streamVisibleToView } from "@/features/chat/lib/live-turn-key";

describe("chat tab workflows while an agent is running", () => {
    afterEach(() => {
        resetGeneratingChatsForTests();
    });

    it("keeps a running agent attached to its own tab when opening another chat", () => {
        setChatGenerating("running", true);
        expect(hasGeneratingChats()).toBe(true);
        expect(streamVisibleToView("other", "running", "running")).toBe(false);
        expect(streamVisibleToView("running", "running", "running")).toBe(true);
    });

    it("does not paint a background stream onto a new draft tab", () => {
        setChatGenerating("running", true);
        expect(streamVisibleToView("__new_chat__", "running", "running")).toBe(false);
        expect(hasGeneratingChats()).toBe(true);
    });

    it("allows two chats to generate without stealing each other's stream", () => {
        setChatGenerating("one", true);
        setChatGenerating("two", true);
        expect(streamVisibleToView("one", "one", "one")).toBe(true);
        expect(streamVisibleToView("two", "one", "one")).toBe(false);
        expect(streamVisibleToView("two", "two", "two")).toBe(true);
    });
});
