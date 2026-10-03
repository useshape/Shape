import { describe, expect, it } from "vitest";
import { effortDisplayLabel } from "@/features/chat/ui/composer/reasoning-effort";

describe("reasoning effort labels", () => {
    it("maps Extra High to max", () => {
        expect(effortDisplayLabel("max")).toBe("Extra High");
        expect(effortDisplayLabel("ultra")).toBe("High");
        expect(effortDisplayLabel("high")).toBe("Medium");
        expect(effortDisplayLabel("low")).toBe("Low");
    });
});
