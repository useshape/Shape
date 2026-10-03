import { describe, expect, it } from "vitest";
import { buildPlanBuildMessage } from "@/lib/chat/continue-action";

describe("plan build message", () => {
    it("does not tell the agent to stay on a generated git branch", () => {
        const msg = buildPlanBuildMessage("docs/plan.md", "Auth");
        expect(msg).not.toMatch(/Stay on git branch/);
        expect(msg).toContain("Build the plan");
    });
});
