import { describe, expect, it } from "vitest";
import {
    formatMessageModelLabel,
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
        expect(formatModelLabel("")).toBe("");
        expect(formatModelLabel(null)).toBe("");
    });

    it("shows Auto when Auto was selected, otherwise the concrete model name", () => {
        expect(
            formatMessageModelLabel("google/gemini-2.5-flash", { usedAuto: true }),
        ).toBe("Auto");
        expect(formatMessageModelLabel("auto", { usedAuto: true })).toBe("Auto");
        expect(formatMessageModelLabel("anthropic/claude-sonnet-4", { usedAuto: false })).toBe(
            "Claude Sonnet 4",
        );
        expect(formatMessageModelLabel("deepseek/deepseek-v4-flash", { usedAuto: false })).toBe(
            "Deepseek V4 Flash",
        );
    });

    it("formats auto usage lines as response %, not tokens or account %", () => {
        expect(
            formatMessageUsageLine(
                { usedAuto: true, autoPercent: 42, tokens: 1200 },
                "openrouter/auto",
            ),
        ).toBe("1% used");
        expect(
            formatMessageUsageLine({ usedAuto: true, tokens: 100_000 }, "auto"),
        ).toBe("2% used");
        expect(formatMessageUsageLine({ usedAuto: true }, "auto")).toBe("");
    });

    it("formats credit usage lines without tokens", () => {
        expect(
            formatMessageUsageLine({ creditsCharged: 1.25 }, "anthropic/claude-sonnet-4"),
        ).toBe("1.25");
        expect(
            formatMessageUsageLine(
                { creditsCharged: 1.25, tokens: 3400 },
                "anthropic/claude-sonnet-4",
            ),
        ).toBe("1.25");
    });

    it("splits usage into separate rows and omits empty fields", async () => {
        const { formatMessageUsageRows } = await import("@/lib/usage-display");
        expect(
            formatMessageUsageRows(
                { usedAuto: true, tokens: 100_000, inputTokens: 80_000, outputTokens: 20_000 },
                "auto",
            ),
        ).toEqual([
            { label: "Usage", value: "2% used" },
            { label: "Input", value: "80,000" },
            { label: "Output", value: "20,000" },
        ]);
        expect(formatMessageUsageRows({ usedAuto: true }, "auto")).toEqual([]);
        expect(formatMessageUsageRows(undefined, "auto")).toEqual([]);
    });

    it("resolves chat ring from monthly Auto or credits usage", () => {
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
            mode: "auto",
            percent: 18,
            title: "18% used",
            tooltip: "18% used this month (Auto)",
        });

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
        ).toMatchObject({
            mode: "auto",
            percent: 18,
            title: "18% used",
            tooltip: "18% used this month (Auto)",
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
            mode: "credits",
            percent: 20,
            title: "20% used",
            tooltip: "20% used this month",
        });
    });
});
