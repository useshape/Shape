import { describe, expect, it } from "vitest";
import { placeThreadTab, type ChatTab } from "@/features/chat/ui/shell/tabs";
import { resolveLiveTurnKey } from "@/features/chat/lib/live-turn-key";

describe("thread tabs", () => {
    it("appends a thread beside its parent without selecting it", () => {
        const tabs: ChatTab[] = [
            { id: "parent", title: "Parent" },
            { id: "other", title: "Other" },
        ];
        const next = placeThreadTab(tabs, {
            id: "thread-1",
            title: "Scan",
            parentId: "parent",
        });
        expect(next.map((tab) => tab.id)).toEqual(["parent", "thread-1", "other"]);
        expect(next.find((tab) => tab.id === "parent")).toBeTruthy();
    });

    it("does not let a thread token claim a draft pending turn", () => {
        expect(resolveLiveTurnKey("thread-abc", ["__pending__"], "__draft__")).toBe("thread-abc");
    });
});
