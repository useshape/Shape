import { describe, expect, it } from "vitest";
import { revealComposerCaret, syncComposerOverlayScroll } from "@/lib/chat/composer-scroll";

describe("composer overlay scroll", () => {
    it("copies scrollLeft and scrollTop onto the overlay", () => {
        const overlay = { scrollLeft: 0, scrollTop: 0 };
        syncComposerOverlayScroll({ scrollLeft: 120, scrollTop: 4 }, overlay);
        expect(overlay.scrollLeft).toBe(120);
        expect(overlay.scrollTop).toBe(4);
    });

    it("no-ops when overlay is missing", () => {
        expect(() => syncComposerOverlayScroll({ scrollLeft: 10, scrollTop: 0 }, null)).not.toThrow();
    });

    it("scrolls to the end when the caret is at the end of a long line", () => {
        const textarea = {
            selectionStart: 40,
            value: "x".repeat(40),
            scrollWidth: 400,
            clientWidth: 100,
            scrollLeft: 0,
        };
        expect(revealComposerCaret(textarea)).toBe(300);
        expect(textarea.scrollLeft).toBe(300);
    });

    it("leaves scroll alone when the caret is in the middle", () => {
        const textarea = {
            selectionStart: 2,
            value: "hello world this is long",
            scrollWidth: 400,
            clientWidth: 100,
            scrollLeft: 12,
        };
        expect(revealComposerCaret(textarea)).toBe(12);
        expect(textarea.scrollLeft).toBe(12);
    });
});
