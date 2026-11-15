import { describe, expect, it } from "vitest";
import { applyBrowsePayload, getBrowseFrame } from "@/features/agent/browser/session";

describe("browse frames stay with their chat", () => {
    it("does not paint one chat's page onto another chat", () => {
        applyBrowsePayload({
            conversationId: "chat-a",
            status: "controlling",
            url: "https://sentry.io/",
            title: "Sentry",
            image: "data:image/jpeg;base64,aaa",
        });
        applyBrowsePayload({
            conversationId: "chat-b",
            status: "stopped",
            url: "https://example.com/",
            title: "Example",
            image: "data:image/jpeg;base64,bbb",
        });

        expect(getBrowseFrame("chat-a")?.url).toBe("https://sentry.io/");
        expect(getBrowseFrame("chat-a")?.image).toContain("aaa");
        expect(getBrowseFrame("chat-b")?.url).toBe("https://example.com/");
        expect(getBrowseFrame("chat-b")?.image).toContain("bbb");
        expect(getBrowseFrame(null)).toBeNull();
    });

    it("keeps a chat's last frame when that session stops", () => {
        applyBrowsePayload({
            conversationId: "chat-a",
            status: "controlling",
            url: "https://sentry.io/pricing/",
            image: "data:image/jpeg;base64,price",
        });
        applyBrowsePayload({ conversationId: "chat-a", status: "stopped" });

        const frame = getBrowseFrame("chat-a");
        expect(frame?.status).toBe("stopped");
        expect(frame?.url).toBe("https://sentry.io/pricing/");
        expect(frame?.image).toContain("price");
        expect(getBrowseFrame("chat-b")?.url).not.toBe("https://sentry.io/pricing/");
    });
});
