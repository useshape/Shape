import { describe, expect, it } from "vitest";
import { laneFor } from "@/lib/sidebar/chat-lanes";

describe("laneFor", () => {
    it("uses the store fallback when a chat has no lane", () => {
        expect(laneFor("untagged-talk", "Chat")).toBe("Chat");
        expect(laneFor("untagged-code", "Code")).toBe("Code");
    });
});
