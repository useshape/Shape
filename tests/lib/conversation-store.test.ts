import { describe, expect, it } from "vitest";
import { conversationStorePath, TALK_CONVERSATION_STORE } from "@/lib/chat/conversation-store";

describe("conversationStorePath", () => {
    it("keeps chat off the project store", () => {
        expect(conversationStorePath("Chat", "C:/repo")).toBe(TALK_CONVERSATION_STORE);
        expect(conversationStorePath("Code", "C:/repo")).toBe("C:/repo");
    });
});
