import { describe, expect, it } from "vitest";
import { buildDesignSuggestions, fuzzyMatchScore } from "@/features/editor/lsp/design-completions";
import {
    contextAtOffset,
    getClassPrefixAtOffset,
} from "@/features/editor/lib/class-attribute";

describe("buildDesignSuggestions", () => {
    it("filters by prefix case-insensitively", () => {
        const results = buildDesignSuggestions({ prefix: "text-" });
        expect(
            results.every(
                (r) => r.label.toLowerCase().startsWith("text-") || r.label.includes(":text-"),
            ),
        ).toBe(true);
        expect(results.some((r) => r.label === "text-sm")).toBe(true);
    });

    it("returns ranked utilities when prefix empty", () => {
        const results = buildDesignSuggestions({ prefix: "" });
        expect(results.length).toBeGreaterThan(10);
        expect(results.length).toBeLessThanOrEqual(80);
    });

    it("boosts frequent project classes", () => {
        const freq = new Map<string, number>([["gap-4", 16]]);
        const results = buildDesignSuggestions({ prefix: "gap", frequency: freq });
        const gap4 = results.find((r) => r.label === "gap-4");
        expect(gap4).toBeDefined();
        expect(gap4!.sortPriority).toBeLessThan(10);
    });

    it("dedupes entries", () => {
        const results = buildDesignSuggestions({
            prefix: "flex",
            semantic: [{ label: "flex", sortPriority: 4 }],
            projectTokens: [{ label: "flex", sortPriority: 3 }],
        });
        expect(results.filter((r) => r.label === "flex")).toHaveLength(1);
    });

    it("boosts flex siblings toward align/justify/gap", () => {
        const withFlex = buildDesignSuggestions({
            prefix: "items",
            siblings: ["flex", "gap-2"],
        });
        const without = buildDesignSuggestions({ prefix: "items", siblings: [] });
        const a = withFlex.find((r) => r.label === "items-center")?.sortPriority ?? 99;
        const b = without.find((r) => r.label === "items-center")?.sortPriority ?? 99;
        expect(a).toBeLessThanOrEqual(b);
    });

    it("suggests spacing scale when family prefix ends with dash", () => {
        const results = buildDesignSuggestions({ prefix: "gap-" });
        expect(results.some((r) => r.label === "gap-4")).toBe(true);
        expect(results.some((r) => r.label === "gap-8")).toBe(true);
    });

    it("fuzzy-matches partial labels", () => {
        expect(fuzzyMatchScore("flx", "flex")).not.toBeNull();
        expect(fuzzyMatchScore("jbt", "justify-between")).not.toBeNull();
        expect(fuzzyMatchScore("zzz", "flex")).toBeNull();
    });
});

describe("class context gating", () => {
    it("detects cursor inside className string", () => {
        const line = 'className="flex gap-"';
        const offset = line.length - 1;
        expect(contextAtOffset(line, offset)).not.toBeNull();
        expect(getClassPrefixAtOffset(line, offset)).toBe("gap-");
    });

    it("rejects cursor in CSS", () => {
        const line = "  flex: 1;";
        expect(contextAtOffset(line, 4)).toBeNull();
    });

    it("detects cursor inside cn()", () => {
        const line = 'cn("rounded-lg p-"';
        const offset = line.length - 1;
        expect(contextAtOffset(line, offset)).not.toBeNull();
        expect(getClassPrefixAtOffset(line, offset)).toBe("p-");
    });
});
