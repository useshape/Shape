import { describe, expect, it } from "vitest";
import { resolveChatModels, sanitizeEnabledModels, sanitizeSubagentModels, resolveSubagentDefaultModel, subagentModelsForSend, type ModelInfo } from "@/lib/settings/models";

function model(partial: Partial<ModelInfo> & Pick<ModelInfo, "id" | "name" | "provider">): ModelInfo {
    return {
        description: "",
        inputCost: 0,
        cachedInputCost: 0,
        outputCost: 0,
        contextWindow: "128K",
        releaseDate: "",
        ...partial,
    };
}

const list: ModelInfo[] = [
    model({ id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", provider: "Free Models", minTier: "free" }),
    model({ id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", viaApi: true }),
    model({ id: "anthropic/claude-sonnet-4.6", name: "Claude", provider: "Anthropic", viaApi: true }),
];

describe("resolveChatModels", () => {
    it("lists the catalog without inventing an Auto row", () => {
        const ids = resolveChatModels(list).map((m) => m.id);
        expect(ids).toEqual(["deepseek/deepseek-v4-flash", "openai/gpt-4o", "anthropic/claude-sonnet-4.6"]);
    });
});

describe("sanitizeEnabledModels", () => {
    it("drops ids the catalog no longer has", () => {
        expect(
            sanitizeEnabledModels(
                ["auto", "openai/gpt-4o-mini", "openai/gpt-4o"],
                ["anthropic/claude-sonnet-4.6", "openai/gpt-5.5"],
            ),
        ).toEqual([]);
    });
});

describe("sanitizeSubagentModels", () => {
    it("falls back to included models from the catalog", () => {
        const catalog = list;
        expect(sanitizeSubagentModels([], catalog).map((item) => item)).toEqual(["deepseek/deepseek-v4-flash"]);
        expect(sanitizeSubagentModels(["gone/model"], catalog)).toEqual(["deepseek/deepseek-v4-flash"]);
    });
});

describe("subagentModelsForSend", () => {
    it("keeps the included model when credits are gone", () => {
        expect(
            subagentModelsForSend(["deepseek/deepseek-v4-flash", "anthropic/claude-sonnet-4.6"], list, {
                creditsRemaining: 0,
                modelAllowed: () => true,
                defaultModel: "anthropic/claude-sonnet-4.6",
            }),
        ).toEqual({ models: ["deepseek/deepseek-v4-flash"], defaultModel: "deepseek/deepseek-v4-flash" });
    });

    it("keeps a paid model when credits remain", () => {
        expect(
            subagentModelsForSend(["deepseek/deepseek-v4-flash", "openai/gpt-4o"], list, {
                creditsRemaining: 12,
                modelAllowed: () => true,
                defaultModel: "openai/gpt-4o",
            }).models,
        ).toEqual(["deepseek/deepseek-v4-flash", "openai/gpt-4o"]);
        expect(resolveSubagentDefaultModel("openai/gpt-4o", ["deepseek/deepseek-v4-flash", "openai/gpt-4o"])).toBe("openai/gpt-4o");
    });
});
