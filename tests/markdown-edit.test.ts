import { describe, expect, it } from "vitest";
import {
    findImageSpan,
    insertEmptyParagraphAfter,
    insertEmptyParagraphAtEnd,
    moveMarkdownRange,
    replaceBlockVisibleText,
    setImageWidth,
} from "@/features/editor/ui/markdown/lib/markdown-edit";

describe("replaceBlockVisibleText", () => {
    it("keeps heading markers when editing the title", () => {
        expect(replaceBlockVisibleText("## Hello\n\nBody", { start: 0, end: 8 }, "World")).toBe(
            "## World\n\nBody",
        );
    });

    it("replaces a list item body", () => {
        expect(replaceBlockVisibleText("- old item\n- keep", { start: 0, end: 10 }, "new item")).toBe(
            "- new item\n- keep",
        );
    });
});

describe("insertEmptyParagraphAfter", () => {
    it("inserts an editable HTML paragraph after a block", () => {
        const { next, caret } = insertEmptyParagraphAfter("Hello\n\nWorld", 5);
        expect(next).toContain("<p><br></p>");
        expect(next.slice(caret.start, caret.end)).toBe("<p><br></p>");
    });
});

describe("insertEmptyParagraphAtEnd", () => {
    it("appends a paragraph after existing content", () => {
        const { next } = insertEmptyParagraphAtEnd("Hello");
        expect(next.startsWith("Hello")).toBe(true);
        expect(next).toContain("<p><br></p>");
    });
});

describe("setImageWidth", () => {
    it("converts a markdown image to an HTML img with width", () => {
        expect(setImageWidth("![Logo](./logo.png)", { start: 0, end: 19 }, 320)).toBe(
            '<img src="./logo.png" alt="Logo" width="320">',
        );
    });

    it("updates width on an existing HTML img", () => {
        expect(setImageWidth('<img src="a.png" alt="A" width="100">', { start: 0, end: 37 }, 240)).toBe(
            '<img src="a.png" alt="A" width="240">',
        );
    });
});

describe("findImageSpan", () => {
    it("finds a markdown image by src", () => {
        const src = "See ![x](./a.png) please";
        expect(findImageSpan(src, "./a.png")).toEqual({ start: 4, end: 17 });
    });
});

describe("moveMarkdownRange", () => {
    it("moves a block to a later offset", () => {
        const src = "![a](a.png)\n\nHello";
        const next = moveMarkdownRange(src, { start: 0, end: 11 }, src.length);
        expect(next.indexOf("![a](a.png)")).toBeGreaterThan(next.indexOf("Hello"));
    });
});
