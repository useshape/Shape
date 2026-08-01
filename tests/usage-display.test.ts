import { describe, expect, it } from "vitest";
import {
    formatMessageUsageLine,
    formatModelLabel,
    isAutoModelId,
    resolveChatUsageDisplay,
} from "@/lib/usage-display";

describe("usage-display", () => {
    it("detects auto models", () => {
        expect(isAutoModelId("auto")).toBe(true);
        expect(isAutoModelId("openrouter/auto")).toBe(true);
        expect(isAutoModelId("anthropic/claude-sonnet-4")).toBe(false);
    });

    it("formats model labels", () => {
        expect(formatModelLabel("auto")).toBe("Auto");
        expect(formatModelLabel("openrouter/auto")).toBe("Auto");
        expect(formatModelLabel("anthropic/claude-sonnet-4")).toBe("Claude Sonnet 4");
    });

    it("formats auto usage lines from turn tokens, not account %", () => {
        expect(
            formatMessageUsageLine({ usedAuto: true, autoPercent: 42, tokens: 1200 }, "openrouter/auto"),
        ).toBe("1.2k tokens");
        expect(formatMessageUsageLine({ usedAuto: true }, "auto")).toBe("Included");
    });

    it("formats credit usage lines", () => {
        expect(
            formatMessageUsageLine({ creditsCharged: 1.25 }, "anthropic/claude-sonnet-4"),
        ).toBe("1.25 credits");
        expect(
            formatMessageUsageLine(
                { creditsCharged: 1.25, tokens: 3400 },
                "anthropic/claude-sonnet-4",
            ),
        ).toBe("1.25 credits · 3.4k tokens");
    });

    it("resolves chat ring for auto vs credits", () => {
        expect(
            resolveChatUsageDisplay("auto", {
                loggedIn: true,
                tier: "pro",
                freeAutoPercent: 18,
                creditsIncluded: 1500,
                creditsRemaining: 1200,
            }),
        ).toMatchObject({ mode: "auto", percent: 18 });

        expect(
            resolveChatUsageDisplay("anthropic/claude-sonnet-4", {
                loggedIn: true,
                tier: "pro",
                freeAutoPercent: 18,
                creditsIncluded: 1500,
                creditsRemaining: 1200,
            }),
        ).toMatchObject({ mode: "credits", percent: 20 });
    });
});
