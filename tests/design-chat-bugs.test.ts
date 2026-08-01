import { describe, expect, it } from "vitest";
import { parseShapeContinueAction } from "@/lib/shape-continue-action";
import { parseMessageContent } from "@/features/chat/ui/md/renderer";

describe("parseShapeContinueAction", () => {
    it("still parses plan_build continue actions", () => {
        const content = [
            '<shape_action type="plan_build" path="PLAN.md" title="Ship it" />',
            "Continue.",
        ].join("\n");
        const parsed = parseShapeContinueAction(content);
        expect(parsed.action).toMatchObject({
            type: "plan_build",
            path: "PLAN.md",
            title: "Ship it",
        });
        expect(parsed.displayText).toBe("Continue");
    });
});

describe("visual preview parsing", () => {
    it("renders a single design_previews block without selection chrome", () => {
        const content = [
            "Here is the button.",
            '<design_previews selected="">',
            '<design_preview id="btn" name="PrimaryButton" style="radix" path="/tmp/x.html" width="640" height="360" kind="html"/>',
            "</design_previews>",
            "Want me to add it to the project?",
        ].join("\n");
        const chunks = parseMessageContent(content);
        const preview = chunks.find((c) => c.type === "design_previews");
        expect(preview?.designPreviews?.length).toBe(1);
        expect(preview?.designPreviews?.[0]?.name).toBe("PrimaryButton");
        const text = chunks
            .filter((c) => c.type === "text")
            .map((c) => c.content)
            .join("");
        expect(text).toContain("Want me to add it");
        expect(text).not.toContain("<design_preview");
    });

    it("hides list_terminals and terminal_input from prose", () => {
        const content = [
            "Waiting on scaffold.",
            "<list_terminals>",
            "session_id: 1 | running: true | command: npx create-next-app@latest . --yes",
            "</list_terminals>",
            '<terminal_input session="1">|</terminal_input>',
            "Still waiting.",
        ].join("\n");
        const chunks = parseMessageContent(content);
        const text = chunks
            .filter((c) => c.type === "text")
            .map((c) => c.content)
            .join("");
        expect(text).not.toContain("session_id:");
        expect(text).not.toContain("<terminal_input");
        expect(text).toContain("Waiting on scaffold");
        expect(text).toContain("Still waiting");
    });
});
