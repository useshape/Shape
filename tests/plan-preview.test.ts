import { describe, expect, it } from "vitest";
import {
    displayPlanName,
    humanizePlanTitle,
    joinPlanDocument,
    parsePlanMarkdown,
    splitPlanDocument,
} from "@/lib/plan/preview";

describe("plan-preview", () => {
    it("parses goal and todos from plan markdown", () => {
        const md = `# Plan

## Goal
Remove login and improve portfolio.

## Todos
- [ ] Run baseline checks
- [ ] Delete auth routes
- [ ] Update homepage copy
`;
        const parsed = parsePlanMarkdown(md);
        expect(parsed.title).toBe("Plan");
        expect(parsed.goal).toBe("Remove login and improve portfolio.");
        expect(parsed.todos).toEqual([
            "Run baseline checks",
            "Delete auth routes",
            "Update homepage copy",
        ]);
    });

    it("humanizes slug titles", () => {
        expect(humanizePlanTitle("portfolio-auth-removal-enhancements")).toBe(
            "Portfolio Auth Removal Enhancements",
        );
    });

    it("prefers the document heading over a filename", () => {
        const parsed = parsePlanMarkdown(`# Add GitHub OAuth

## Goal
Implement the authorization code flow.

## Todos
- [ ] Install the session packages
- [ ] Create src/oauth.ts
`);
        expect(displayPlanName("NOTES.md", parsed.title)).toBe("Add GitHub OAuth");
        expect(parsed.todos).toEqual([
            "Install the session packages",
            "Create src/oauth.ts",
        ]);
    });

    it("keeps todos in a trailing comment, not a markdown heading", () => {
        const file = joinPlanDocument("# Auth\n\n## Goal\nShip OAuth.\n", [
            { label: "Add callback route", done: false },
            { label: "Store session", done: true },
        ]);
        expect(file).not.toMatch(/##\s*Todos/i);
        expect(file).toContain("<!--shape-todos");
        const split = splitPlanDocument(file);
        expect(split.body).toContain("## Goal");
        expect(split.body).not.toContain("shape-todos");
        expect(split.todos).toEqual([
            { label: "Add callback route", done: false },
            { label: "Store session", done: true },
        ]);
        expect(parsePlanMarkdown(file).todos).toEqual(["Add callback route", "Store session"]);
    });
});
