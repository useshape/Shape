import { describe, expect, it } from "vitest";
import { resolveChatModels, type ModelInfo } from "@/lib/settings/models";

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
    model({ id: "auto", name: "Auto", provider: "Auto" }),
    model({ id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", viaApi: true }),
    model({ id: "anthropic/claude-sonnet-4.6", name: "Claude", provider: "Anthropic", viaApi: true }),
    model({ id: "anthropic/claude-opus-5", name: "Opus", provider: "Anthropic" }),
];

describe("resolveChatModels", () => {
    it("unsigned only keeps Auto", () => {
        const ids = resolveChatModels(list, {
            openaiKey: true,
            openRouterKey: true,
            signedIn: false,
        }).map((m) => m.id);
        expect(ids).toEqual(["auto"]);
    });

    it("API keys do not unlock extra models", () => {
        const ids = resolveChatModels(list, {
            openaiKey: true,
            openRouterKey: true,
            signedIn: false,
        }).map((m) => m.id);
        expect(ids).not.toContain("openai/gpt-4o");
        expect(ids).not.toContain("anthropic/claude-sonnet-4.6");
    });

    it("signed in keeps Shape-hosted models", () => {
        const ids = resolveChatModels(list, {
            openaiKey: false,
            openRouterKey: false,
            signedIn: true,
        }).map((m) => m.id);
        expect(ids).toEqual(["auto", "anthropic/claude-opus-5"]);
    });
});
