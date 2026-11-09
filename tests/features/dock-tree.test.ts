import { describe, expect, it } from "vitest";
import { closePanel, defaultDock, dropPanel, placePanel, chatPanel, walkGroups } from "@/features/agent/dock/tree";

describe("dock tree", () => {
    it("starts as a chat with a bottom terminal", () => {
        const dock = defaultDock("chat-a");
        expect(dock.root.type).toBe("split");
        if (dock.root.type !== "split") return;
        expect(dock.root.dir).toBe("col");
        expect(dock.root.sizes[1]).toBeLessThan(dock.root.sizes[0]);
        expect(walkGroups(dock.root)).toHaveLength(2);
    });

    it("splits a chat to the right and collapses when that tab closes", () => {
        const start = defaultDock("chat-a", false);
        const split = placePanel(start, chatPanel("thread-1", "Thread"), "right", false);
        expect(split.focused).toBe(start.focused);
        expect(walkGroups(split.root)).toHaveLength(2);
        const closed = closePanel(split, "thread-1");
        expect(closed.root.type).toBe("group");
    });

    it("drops a tab into the center of a group", () => {
        const start = defaultDock("chat-a", false);
        const groupId = start.focused;
        const next = dropPanel(start, chatPanel("chat-b", "Other"), groupId, "center", true);
        const group = walkGroups(next.root)[0];
        expect(group?.tabs.map((tab) => tab.id)).toEqual(["chat-a", "chat-b"]);
        expect(group?.active).toBe("chat-b");
    });
});
