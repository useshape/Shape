import { describe, expect, it } from "vitest";
import {
    formatMessageModelLabel,
    formatMessageUsageLine,
    formatModelLabel,
    isAutoModelId,
    resolveChatUsageDisplay,
} from "@/lib/chat/usage-display";

describe("usage-display", () => {
    it("detects auto models", () => {
        expect(isAutoModelId("auto")).toBe(true);
        expect(isAutoModelId("openrouter/auto")).toBe(true);
        expect(isAutoModelId("anthropic/claude-sonnet-4")).toBe(false);
    });

    it("formats model labels", () => {
        expect(formatModelLabel("auto")).toBe("Free");
        expect(formatModelLabel("openrouter/auto")).toBe("Free");
        expect(formatModelLabel("anthropic/claude-sonnet-4")).toBe("Claude Sonnet 4");
        expect(formatModelLabel("")).toBe("");
        expect(formatModelLabel(null)).toBe("");
    });

    it("shows Free when Free was selected, otherwise the concrete model name", () => {
        expect(
            formatMessageModelLabel("google/gemini-2.5-flash", { usedAuto: true }),
        ).toBe("Gemini 2.5 Flash");
        expect(formatMessageModelLabel("auto", { usedAuto: true })).toBe("Free");
        expect(formatMessageModelLabel("anthropic/claude-sonnet-4", { usedAuto: false })).toBe(
            "Claude Sonnet 4",
        );
        expect(formatMessageModelLabel("deepseek/deepseek-v4-flash", { usedAuto: false })).toBe(
            "Deepseek V4 Flash",
        );
    });

    it("formats auto usage lines as token counts, not a client-side pool percent", () => {
        expect(
            formatMessageUsageLine(
                { usedAuto: true, autoPercent: 42, tokens: 1200 },
                "openrouter/auto",
            ),
        ).toBe("1,200");
        expect(
            formatMessageUsageLine({ usedAuto: true, tokens: 100_000 }, "auto"),
        ).toBe("100,000");
        expect(formatMessageUsageLine({ usedAuto: true }, "auto")).toBe("");
    });

    it("formats credit usage lines without tokens", () => {
        expect(
            formatMessageUsageLine({ creditsCharged: 1.25 }, "anthropic/claude-sonnet-4"),
        ).toBe("1.25%");
        expect(
            formatMessageUsageLine(
                { creditsCharged: 1.25, tokens: 3400 },
                "anthropic/claude-sonnet-4",
            ),
        ).toBe("1.25%");
    });

    it("splits usage into separate rows and omits empty fields", async () => {
        const { formatMessageUsageRows } = await import("@/lib/chat/usage-display");
        expect(
            formatMessageUsageRows(
                { usedAuto: true, tokens: 100_000, inputTokens: 80_000, outputTokens: 20_000 },
                "auto",
            ),
        ).toEqual([
            { label: "Tokens", value: "100,000" },
            { label: "Input", value: "80,000" },
            { label: "Output", value: "20,000" },
        ]);
        expect(formatMessageUsageRows({ usedAuto: true }, "auto")).toEqual([]);
        expect(formatMessageUsageRows(undefined, "auto")).toEqual([]);
    });

    it("resolves free usage as percent used and paid usage as remaining past 100%", () => {
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
        ).toMatchObject({
            mode: "free",
            percent: 18,
            title: "18% used",
            headline: "18%",
            tooltip: "18% of free usage used",
            showMeter: true,
        });

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
            mode: "usage",
            percent: 20,
            title: "1200% usage remaining",
            headline: "1200%",
            showMeter: true,
        });

        expect(
            resolveChatUsageDisplay(
                "anthropic/claude-sonnet-4",
                {
                    loggedIn: true,
                    tier: "plus",
                    freeAutoPercent: 0,
                    creditsIncluded: 450,
                    creditsRemaining: 0,
                },
                null,
            ),
        ).toMatchObject({
            mode: "usage",
            title: "Usage limit reached",
            showMeter: true,
            warn: true,
        });
    });
});
