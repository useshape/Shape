import { describe, expect, it } from "vitest";
import { freezeActiveSteps, todoCountLabel } from "@/lib/chat/planning-block";

describe("PlanningBlock mapping", () => {
    it("shows n/n counts", () => {
        expect(todoCountLabel(2, 4)).toBe("2/4");
        expect(todoCountLabel(0, 3)).toBe("0/3");
    });

    it("freezes active items when the turn is idle", () => {
        const steps = [
            { status: "done" as const, label: "a" },
            { status: "active" as const, label: "b" },
        ];
        expect(freezeActiveSteps(steps, false)[1]?.status).toBe("pending");
        expect(freezeActiveSteps(steps, true)[1]?.status).toBe("active");
    });
});
