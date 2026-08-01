import { describe, expect, it } from "vitest";

/** Mirror of Rust estimate_tokens: (chars + 3) / 4 */
function estimateTokens(text: string): number {
    return Math.floor((text.length + 3) / 4);
}

describe("context token budget helpers", () => {
    it("estimateTokens approximates chars/4", () => {
        expect(estimateTokens("abcd")).toBe(1);
        expect(estimateTokens("a".repeat(100))).toBe(25);
    });
});
