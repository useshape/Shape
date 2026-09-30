import { beforeEach, describe, expect, it, vi } from "vitest";

describe("chat collections", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.resetModules();
    });

    it("puts a chat in one collection and strips it from the previous one", async () => {
        const meta = await import("@/lib/sidebar/chat-list-meta");
        const first = meta.createCollection({
            name: "Alpha",
            icon: "star",
            color: "blue",
            chatIds: ["a", "b"],
        });
        expect(meta.getCollections()).toHaveLength(1);
        expect(first.chatIds).toEqual(["a", "b"]);

        const second = meta.createCollection({
            name: "Beta",
            icon: "flag",
            color: "teal",
            chatIds: ["b", "c"],
        });
        const list = meta.getCollections();
        expect(list).toHaveLength(2);
        const alpha = list.find((c) => c.id === first.id)!;
        const beta = list.find((c) => c.id === second.id)!;
        expect(alpha.chatIds).toEqual(["a"]);
        expect(beta.chatIds).toEqual(["b", "c"]);
    });

    it("drops empty collections when chats move away", async () => {
        const meta = await import("@/lib/sidebar/chat-list-meta");
        meta.createCollection({
            name: "Solo",
            icon: "book",
            color: "amber",
            chatIds: ["x"],
        });
        await new Promise((r) => setTimeout(r, 2));
        meta.createCollection({
            name: "Next",
            icon: "code",
            color: "rose",
            chatIds: ["x"],
        });
        const names = meta.getCollections().map((c) => c.name);
        expect(names).toEqual(["Next"]);
    });

    it("deleteCollection removes the group without touching chat ids themselves", async () => {
        const meta = await import("@/lib/sidebar/chat-list-meta");
        const created = meta.createCollection({
            name: "Temp",
            icon: "heart",
            color: "violet",
            chatIds: ["chat-1", "chat-2"],
        });
        meta.deleteCollection(created.id);
        expect(meta.getCollections()).toHaveLength(0);
        expect(created.chatIds).toEqual(["chat-1", "chat-2"]);
    });
});
