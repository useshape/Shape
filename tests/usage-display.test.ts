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
        ).toBe("1.2K tokens");
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
        ).toBe("1.25 credits · 3.4K tokens");
    });

    it("resolves chat ring from last-turn delta, not monthly totals", () => {
        expect(
            resolveChatUsageDisplay(
                "auto",
                {
                    loggedIn: true,
                    tier: "pro",
                    freeAutoPercent: 18,
                    creditsIncluded: 1500,
                    creditsRemaining: 1200,
                },
                null,
            ),
        ).toMatchObject({ mode: "auto", percent: 0, title: "0% used" });

        expect(
            resolveChatUsageDisplay(
                "auto",
                {
                    loggedIn: true,
                    tier: "pro",
                    freeAutoPercent: 18,
                    creditsIncluded: 1500,
                    creditsRemaining: 1200,
                },
                { tokens: 100_000, creditsCharged: 0, usedAuto: true, at: 1 },
            ),
        ).toMatchObject({ mode: "auto", percent: 2, title: "2% used" });

        expect(
            resolveChatUsageDisplay(
                "anthropic/claude-sonnet-4",
                {
                    loggedIn: true,
                    tier: "pro",
                    freeAutoPercent: 18,
                    creditsIncluded: 1500,
                    creditsRemaining: 1200,
                },
                { tokens: 0, creditsCharged: 75, usedAuto: false, at: 1 },
            ),
        ).toMatchObject({
            mode: "credits",
            percent: 5,
            title: "5% used",
            tooltip: "Credits: 5% used (1,200 left)",
        });
    });
});
