import { describe, expect, it } from "vitest";
import {
    locateMarkdownText,
    applyInlineMarkdownFormat,
    applyMarkdownBlock,
    findMarkdownSpan,
} from "@/features/editor/ui/markdown/lib/markdown-format";

describe("locateMarkdownText", () => {
    it("finds exact substrings", () => {
        expect(locateMarkdownText("hello world", "world")).toEqual({ start: 6, end: 11 });
    });

    it("uses preferred source range when provided", () => {
        expect(locateMarkdownText("aaa hello aaa hello", "hello", { start: 14, end: 19 })).toEqual({
            start: 14,
            end: 19,
        });
    });

    it("finds text inside bold markers", () => {
        const src = "Say **hello** there";
        const range = locateMarkdownText(src, "hello");
        expect(range).not.toBeNull();
        expect(src.slice(range!.start, range!.end)).toBe("hello");
    });

    it("finds link label text", () => {
        const src = "Welcome from [Atom](https://atom.io) and friends";
        const range = locateMarkdownText(src, "Atom");
        expect(range).not.toBeNull();
        expect(src.slice(range!.start, range!.end)).toBe("Atom");
    });

    it("finds heading text without the hash markers", () => {
        const src = "# Zed\n\nWelcome to Zed";
        const range = locateMarkdownText(src, "Zed");
        expect(range).not.toBeNull();
        expect(src.slice(range!.start, range!.end)).toBe("Zed");
    });

    it("finds text across a markdown link in a sentence", () => {
        const src =
            "High-performance multiplayer code editor from the creators of [Atom](https://atom.io) and [Tree-sitter](https://tree-sitter.github.io).";
        const span = findMarkdownSpan(src, "creators of Atom and Tree-sitter");
        expect(span).toBeTruthy();
        const range = locateMarkdownText(src, "creators of Atom and Tree-sitter");
        expect(range).not.toBeNull();
    });

    it("returns null when missing", () => {
        expect(locateMarkdownText("abc", "zzz")).toBeNull();
    });
});

describe("applyInlineMarkdownFormat", () => {
    it("wraps located text in bold markers", () => {
        expect(applyInlineMarkdownFormat("Say hello", "hello", "bold")).toBe("Say **hello**");
    });

    it("wraps link label in bold", () => {
        expect(applyInlineMarkdownFormat("See [Atom](https://atom.io) now", "Atom", "bold")).toBe(
            "See [**Atom**](https://atom.io) now",
        );
    });

    it("respects preferred offsets", () => {
        expect(
            applyInlineMarkdownFormat("hello hello", "hello", "bold", { start: 6, end: 11 }),
        ).toBe("hello **hello**");
    });
});

describe("applyMarkdownBlock", () => {
    it("promotes a paragraph line to h2", () => {
        expect(applyMarkdownBlock("Hello world\n\nMore", "Hello world", "h2")).toBe(
            "## Hello world\n\nMore",
        );
    });
});
