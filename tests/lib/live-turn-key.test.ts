import { describe, expect, it } from "vitest";
import { resolveLiveTurnKey } from "@/features/chat/lib/live-turn-key";

describe("resolveLiveTurnKey", () => {
    it("never attaches a named turn to a different conversation", () => {
        expect(resolveLiveTurnKey("chat-a", ["chat-b"], "chat-b")).toBeNull();
        expect(resolveLiveTurnKey("chat-a", ["chat-a", "chat-b"], "chat-b")).toBe("chat-a");
    });

    it("binds a named event to the pending slot only", () => {
        expect(resolveLiveTurnKey("chat-a", ["__pending__"], "chat-b")).toBe("__pending__");
    });

    it("accepts an unscoped event only for the viewed turn or a single pending turn", () => {
        expect(resolveLiveTurnKey(null, ["chat-a"], "chat-a")).toBe("chat-a");
        expect(resolveLiveTurnKey(null, ["__pending__"], "chat-b")).toBe("__pending__");
        expect(resolveLiveTurnKey(null, ["chat-a"], "chat-b")).toBeNull();
        expect(resolveLiveTurnKey(null, ["chat-a", "chat-b"], "chat-a")).toBeNull();
    });
});
