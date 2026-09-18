import { describe, expect, it } from "vitest";
import { OPENAI_API_MODELS, resolveChatModels, type ModelInfo } from "@/lib/models";

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
    it("unsigned with no keys only keeps Auto", () => {
        const ids = resolveChatModels(list, {
            openaiKey: false,
            openRouterKey: false,
            signedIn: false,
        }).map((m) => m.id);
        expect(ids).toEqual(["auto"]);
    });

    it("OpenAI key uses the static OpenAI list, not the catalog", () => {
        const ids = resolveChatModels(list, {
            openaiKey: true,
            openRouterKey: false,
            signedIn: false,
        }).map((m) => m.id);
        expect(ids).toEqual(["auto", ...OPENAI_API_MODELS.map((m) => m.id)]);
        expect(ids).not.toContain("anthropic/claude-sonnet-4.6");
    });

    it("OpenRouter key keeps catalog API models including Claude", () => {
        const ids = resolveChatModels(list, {
            openaiKey: false,
            openRouterKey: true,
            signedIn: false,
        }).map((m) => m.id);
        expect(ids).toEqual([
            "auto",
            "openai/gpt-4o",
            "anthropic/claude-sonnet-4.6",
            "anthropic/claude-opus-5",
        ]);
    });

    it("both keys still include Claude from the catalog", () => {
        const ids = resolveChatModels(list, {
            openaiKey: true,
            openRouterKey: true,
            signedIn: false,
        }).map((m) => m.id);
        expect(ids).toContain("anthropic/claude-sonnet-4.6");
        expect(ids).toContain("openai/gpt-4o");
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
