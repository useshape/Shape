import { describe, expect, it } from "vitest";
import { humanizePlanTitle, parsePlanMarkdown } from "@/lib/plan-preview";

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
});
