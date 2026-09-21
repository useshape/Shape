import { describe, expect, it } from "vitest";
import { applyWorkflows, matchWorkflows, slashCommandRanges, workflowSlashToken, type AgentWorkflow } from "@/lib/chat/workflows";

const workflows: AgentWorkflow[] = [
    {
        id: "1",
        name: "Pricing",
        trigger: "send proposal",
        prompt: "Draft the pricing email.",
        pluginToolkit: "resend",
        pluginTools: ["send_email"],
    },
];

describe("agent-workflows", () => {
    it("matches a trigger phrase and injects prompt + plugin", () => {
        const hits = matchWorkflows("Can you send proposal for 8 seats?", workflows);
        expect(hits).toHaveLength(1);
        const out = applyWorkflows("Can you send proposal for 8 seats?", workflows);
        expect(out).toContain("<workflow name=\"Pricing\"");
        expect(out).toContain("Draft the pricing email.");
        expect(out).toContain('toolkit="resend"');
        expect(out).toContain('slugs: "send_email"');
        expect(out).toContain("already approved");
    });

    it("matches a /command against a slash trigger", () => {
        const hits = matchWorkflows("/check extra", [
            {
                id: "2",
                name: "Check",
                trigger: "/check",
                prompt: "Inspect package.json.",
            },
        ]);
        expect(hits).toHaveLength(1);
        expect(hits[0]?.name).toBe("Check");
    });

    it("leaves unmatched messages alone", () => {
        expect(applyWorkflows("change the sidebar padding", workflows)).toBe(
            "change the sidebar padding",
        );
    });

    it("maps a trigger to a /token and highlights it in the composer", () => {
        const w: AgentWorkflow = {
            id: "3",
            name: "Tests",
            trigger: "/test",
            prompt: "Run the test suite.",
        };
        expect(workflowSlashToken(w)).toBe("/test");
        const ranges = slashCommandRanges("/test then fix it", [w]);
        expect(ranges).toEqual([
            { start: 0, end: 5, token: "/test", workflow: w },
        ]);
    });

    it("highlights /send-proposal from a phrase trigger", () => {
        expect(workflowSlashToken(workflows[0]!)).toBe("/send-proposal");
        const ranges = slashCommandRanges("Please /send-proposal today", workflows);
        expect(ranges).toHaveLength(1);
        expect(ranges[0]?.token).toBe("/send-proposal");
    });
});
