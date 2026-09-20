/** Model display shape. Catalog data is fetched from the website at runtime. */
export interface ModelInfo {
    id: string;
    name: string;
    description: string;
    provider: string;
    inputCost: number;
    cachedInputCost: number;
    outputCost: number;
    contextWindow: string;
    releaseDate: string;
    tags?: { label: string }[];
    tier?: "flagship" | "balanced" | "fast";
    viaApi?: boolean;
}

const AUTO_MODEL: ModelInfo = {
    id: "auto",
    name: "Auto",
    description: "Picks a fast model for everyday work.",
    provider: "Auto",
    inputCost: 0,
    cachedInputCost: 0,
    outputCost: 0,
    contextWindow: "200K",
    releaseDate: "Rolling",
};

function openaiApiModel(
    id: string,
    name: string,
    description: string,
    extra?: Partial<ModelInfo>,
): ModelInfo {
    return {
        id,
        name,
        description,
        provider: "OpenAI",
        inputCost: 0,
        cachedInputCost: 0,
        outputCost: 0,
        contextWindow: "128K",
        releaseDate: "",
        viaApi: true,
        ...extra,
    };
}

export const OPENAI_API_MODELS: ModelInfo[] = [
    openaiApiModel("openai/gpt-4o-mini", "GPT-4o mini", "Fast everyday chat and coding.", { tier: "fast" }),
    openaiApiModel("openai/gpt-4o", "GPT-4o", "Flagship with vision.", { tier: "flagship" }),
    openaiApiModel("openai/gpt-4.1-mini", "GPT-4.1 mini", "Fast coding and chat.", { tier: "fast" }),
    openaiApiModel("openai/gpt-4.1", "GPT-4.1", "Strong coding and long context.", { tier: "balanced", contextWindow: "1M" }),
    openaiApiModel("openai/o4-mini", "o4-mini", "Fast reasoning.", { tier: "fast" }),
    openaiApiModel("openai/gpt-5-mini", "GPT-5 mini", "Fast GPT-5 class.", { tier: "fast" }),
    openaiApiModel("openai/gpt-5", "GPT-5", "Flagship reasoning and coding.", { tier: "flagship" }),
    openaiApiModel("openai/gpt-5.4", "GPT-5.4", "Advanced multimodal coding.", { tier: "balanced", contextWindow: "200K" }),
];

export function isApiModel(model: { id: string; viaApi?: boolean }): boolean {
    if (model.id === "auto" || model.id === "openrouter/auto") return false;
    return Boolean(model.viaApi);
}

export function isOpenAiApiModel(model: { id: string; provider: string }): boolean {
    return model.provider === "OpenAI" || model.id.startsWith("openai/");
}

export function resolveChatModels(
    catalog: ModelInfo[],
    opts: { openaiKey: boolean; openRouterKey: boolean; signedIn: boolean },
): ModelInfo[] {
    const byId = new Map<string, ModelInfo>();
    const add = (model: ModelInfo) => {
        if (!byId.has(model.id)) byId.set(model.id, model);
    };

    add(catalog.find((m) => m.id === "auto") ?? AUTO_MODEL);

    if (opts.signedIn) {
        for (const model of catalog) {
            if (model.id === "auto" || model.id === "openrouter/auto") continue;
            if (!model.viaApi) add(model);
        }
    }

    return [...byId.values()];
}

export function getModelsByProvider(models: ModelInfo[]): Record<string, ModelInfo[]> {
    const grouped: Record<string, ModelInfo[]> = {};
    for (const m of models) {
        if (!grouped[m.provider]) grouped[m.provider] = [];
        grouped[m.provider].push(m);
    }
    return grouped;
}

export function isModelEnabled(modelId: string, enabledModels: string[]): boolean {
    if (enabledModels.length === 0) return true;
    return enabledModels.includes(modelId);
}

export function getVisibleModels(allModels: ModelInfo[], enabledModels: string[]): ModelInfo[] {
    return allModels.filter(
        (m) => m.id === "auto" || isApiModel(m) || isModelEnabled(m.id, enabledModels),
    );
}
