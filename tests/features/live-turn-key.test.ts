import { describe, expect, it } from "vitest";
import { isPlaceholderView, streamVisibleToView } from "@/features/chat/lib/live-turn-key";

describe("stream visibility", () => {
    it("treats a new-chat draft as unbound", () => {
        expect(isPlaceholderView(null)).toBe(true);
        expect(isPlaceholderView("__draft__")).toBe(true);
        expect(isPlaceholderView("__switching__12")).toBe(true);
        expect(isPlaceholderView("171234")).toBe(false);
    });

    it("shows the pending send on a draft and keeps other chats off that draft", () => {
        expect(streamVisibleToView("__draft__", null, "__pending__")).toBe(true);
        expect(streamVisibleToView("__draft__", "chat-a", "chat-a")).toBe(false);
        expect(streamVisibleToView("chat-a", "chat-a", "chat-a")).toBe(true);
        expect(streamVisibleToView("chat-b", "chat-a", "chat-a")).toBe(false);
    });
});
