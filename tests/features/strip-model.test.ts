import { describe, expect, it } from "vitest";
import {
    activateTab,
    clearSplit,
    createStrip,
    reorderTabs,
    showsSplit,
    splitTabs,
} from "@/features/agent/panes/strip-model";

describe("brave split tabs", () => {
    it("keeps both tabs in one strip and groups them", () => {
        let state = createStrip();
        state = activateTab(state, "a");
        state = activateTab(state, "b");
        state = activateTab(state, "c");
        state = splitTabs(state, "a", "c");
        expect(state.order).toEqual(["a", "c", "b"]);
        expect(state.split).toMatchObject({ left: "a", right: "c" });
        expect(showsSplit(state)).toBe(true);
        state = activateTab(state, "b");
        expect(showsSplit(state)).toBe(false);
        expect(state.split?.left).toBe("a");
        state = activateTab(state, "c");
        expect(showsSplit(state)).toBe(true);
    });

    it("drops the group when a split tab is dragged away from its pair", () => {
        let state = splitTabs(activateTab(activateTab(createStrip(), "a"), "b"), "a", "b");
        state = activateTab(state, "c");
        state = reorderTabs(state, state.order.indexOf("c"), 1);
        expect(state.split).toBeNull();
    });

    it("unsplits without removing the tabs", () => {
        const state = clearSplit(splitTabs(activateTab(activateTab(createStrip(), "a"), "b"), "a", "b"));
        expect(state.split).toBeNull();
        expect(state.order).toEqual(["a", "b"]);
    });
});
