import { describe, expect, it } from "vitest";
import { isLooseTalkBubble, talkSegments } from "../../features/chat/lib/talk-segments";

describe("talk segments", () => {
    it("keeps a paragraph as one bubble", () => {
        expect(talkSegments("Here is the whole thought.\n\nIt stays together.")).toEqual([
            "Here is the whole thought.\n\nIt stays together.",
        ]);
    });

    it("splits only on a line that is just ---", () => {
        expect(talkSegments("oh nice\n---\nThe answer is 4.")).toEqual(["oh nice", "The answer is 4."]);
    });

    it("pulls a photo burst out of the surrounding text", () => {
        const content = [
            "here",
            '<generated_image media_id="a">https://a.test/1.png</generated_image>',
            '<generated_image media_id="b">https://a.test/2.png</generated_image>',
            "---",
            "those two",
        ].join("\n");
        const parts = talkSegments(content);
        expect(parts).toHaveLength(3);
        expect(parts[0]).toBe("here");
        expect(parts[1]).toContain("https://a.test/1.png");
        expect(parts[1]).toContain("https://a.test/2.png");
        expect(parts[2]).toBe("those two");
        expect(isLooseTalkBubble(parts[1])).toBe(true);
        expect(isLooseTalkBubble(parts[0])).toBe(false);
    });
});
