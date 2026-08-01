import { describe, expect, it } from "vitest";
import { parseMessageContent } from "@/features/chat/ui/md/renderer";
import {
    buildPlanBuildMessage,
    parseShapeContinueAction,
} from "@/lib/shape-continue-action";

describe("parseMessageContent todos", () => {
    it("parses live todo checklist XML", () => {
        const text = `
<todos title="Auth plan">
<todo id="1" status="completed">Add login route</todo>
<todo id="2" status="in_progress">Wire session cookie</todo>
<todo id="3" status="pending">Add tests</todo>
</todos>`;

        const chunks = parseMessageContent(text);
        const block = chunks.find((c) => c.type === "todos");
        expect(block?.content).toBe("Auth plan");
        expect(block?.todos).toEqual([
            { id: "1", label: "Add login route", status: "done" },
            { id: "2", label: "Wire session cookie", status: "active" },
            { id: "3", label: "Add tests", status: "pending" },
        ]);
    });

    it("keeps only the latest todos block when updates stream in", () => {
        const text = `
<todos title="Plan">
<todo id="1" status="in_progress">First</todo>
</todos>
Working…
<todos title="Plan">
<todo id="1" status="completed">First</todo>
<todo id="2" status="in_progress">Second</todo>
</todos>`;

        const chunks = parseMessageContent(text);
        const todos = chunks.filter((c) => c.type === "todos");
        expect(todos).toHaveLength(1);
        expect(todos[0]?.todos?.map((t) => t.status)).toEqual(["done", "active"]);
    });
});

describe("buildPlanBuildMessage", () => {
    it("embeds plan_build action and update_todos instructions", () => {
        const msg = buildPlanBuildMessage(".shape/plans/auth.md", "Auth");
        const parsed = parseShapeContinueAction(msg);
        expect(parsed.action).toEqual({
            type: "plan_build",
            path: ".shape/plans/auth.md",
            title: "Auth",
        });
        expect(msg).toContain("update_todos");
        expect(msg).toContain("in_progress");
    });
});
