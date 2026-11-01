import { describe, expect, it } from "vitest";
import { emittedShowcaseType, SHOWCASE_MARKERS, SHOWCASE_MARKUP } from "@/features/agent/showcase/fixture";
import { parseMessageContent, type Chunk } from "@/features/chat/ui/md/renderer";

describe("component showcase fixture", () => {
    it("covers every parser chunk type", () => {
        const types = new Set(parseMessageContent(SHOWCASE_MARKUP).map((chunk) => chunk.type));
        const required = Object.keys(SHOWCASE_MARKERS) as Chunk["type"][];
        expect(required.length).toBeGreaterThan(20);
        for (const type of required) {
            expect(types.has(emittedShowcaseType(type)), type).toBe(true);
        }
    });
});
