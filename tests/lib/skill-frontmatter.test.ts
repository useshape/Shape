import { describe, expect, it } from "vitest";
import { parseSkillDocument } from "@/lib/chat/skill-frontmatter";

describe("parseSkillDocument", () => {
    it("reads name, description, and body from frontmatter", () => {
        const parsed = parseSkillDocument(
            ["---", "name: pdf-processing", "description: Extract text and tables from PDFs.", "---", "", "# PDF", "", "Steps."].join("\n"),
            "fallback"
        );

        expect(parsed).toEqual({
            name: "pdf-processing",
            description: "Extract text and tables from PDFs.",
            body: "# PDF\n\nSteps.",
        });
    });

    it("treats a file without frontmatter as plain instructions", () => {
        const parsed = parseSkillDocument("# Guide\n\nDo the thing.", "guide");

        expect(parsed).toEqual({ name: "guide", description: "", body: "# Guide\n\nDo the thing." });
    });

    it("unwraps quoted scalars", () => {
        const parsed = parseSkillDocument(
            ['---', 'name: "release-notes"', "description: 'Draft release notes from commits.'", "---", "Body"].join("\n"),
            "fallback"
        );

        expect(parsed.name).toBe("release-notes");
        expect(parsed.description).toBe("Draft release notes from commits.");
    });

    it("joins folded and literal block scalars", () => {
        const folded = parseSkillDocument(
            ["---", "name: folded", "description: >", "  First line", "  second line.", "---", "Body"].join("\n"),
            "fallback"
        );
        const literal = parseSkillDocument(
            ["---", "name: literal", "description: |", "  First line", "  second line.", "---", "Body"].join("\n"),
            "fallback"
        );

        expect(folded.description).toBe("First line second line.");
        expect(literal.description).toBe("First line\nsecond line.");
    });

    it("appends when_to_use to the description", () => {
        const parsed = parseSkillDocument(
            ["---", "name: review", "description: Review code.", "when_to_use: Use when the user asks for a review.", "---", "Body"].join("\n"),
            "fallback"
        );

        expect(parsed.description).toBe("Review code. Use when the user asks for a review.");
    });

    it("keeps the fallback name when frontmatter omits it", () => {
        const parsed = parseSkillDocument(["---", "description: Only a description.", "---", "Body"].join("\n"), "from-folder");

        expect(parsed.name).toBe("from-folder");
    });

    it("ignores an unterminated frontmatter block", () => {
        const parsed = parseSkillDocument(["---", "name: broken", "Body without closing marker"].join("\n"), "fallback");

        expect(parsed).toEqual({
            name: "fallback",
            description: "",
            body: "---\nname: broken\nBody without closing marker",
        });
    });

    it("ignores unknown fields and comments", () => {
        const parsed = parseSkillDocument(
            ["---", "# a comment", "name: keep", "allowed-tools: Read, Grep", "metadata:", "  author: someone", "---", "Body"].join("\n"),
            "fallback"
        );

        expect(parsed.name).toBe("keep");
        expect(parsed.body).toBe("Body");
    });
});
