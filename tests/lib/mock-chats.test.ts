import { afterEach, describe, expect, it, vi } from "vitest";
import { mockChatsEnabled, mockConversation, mockConversations, setMockChats } from "@/lib/dev/mock-chats";

describe("mock chats", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        window.localStorage.clear();
    });

    it("stays off in production", () => {
        vi.stubEnv("NODE_ENV", "production");
        setMockChats(true);
        expect(mockChatsEnabled()).toBe(false);
        expect(mockConversations("/repo")).toEqual([]);
        expect(mockConversation("mock-chat-tax")).toBeNull();
    });

    it("injects sample sessions without writing them anywhere else", () => {
        vi.stubEnv("NODE_ENV", "development");
        setMockChats(true);
        const chats = mockConversations("/repo/shape");
        expect(chats.length).toBeGreaterThan(4);
        expect(new Set(chats.map((chat) => chat.title)).size).toBe(chats.length);
        const open = mockConversation("mock-chat-tax", "/repo/shape");
        expect(open?.history.length).toBeGreaterThan(1);
        expect(open?.history.some((message) => message.role === "user")).toBe(true);
        expect(open?.history.some((message) => message.content.includes("<edit"))).toBe(true);
        expect(open?.project_path).toBe("/repo/shape");
    });
});
