import { describe, expect, it } from "vitest";
import { joinThoughtLines } from "@/lib/chat/thought-text";

describe("joinThoughtLines", () => {
    it("joins a column of single words", () => {
        const input = ["Now", "I", "will", "edit", "the", "file"].join("\n");
        expect(joinThoughtLines(input)).toBe("Now I will edit the file");
    });

    it("leaves normal paragraphs alone", () => {
        const input = "Now I will edit the file.\nThen I will run tests.";
        expect(joinThoughtLines(input)).toBe(input);
    });
});
