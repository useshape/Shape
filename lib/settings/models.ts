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
    openaiApiModel("openai/gpt-5.4", "GPT-5.4", "Advanced multimodal coding.", { tier: "balanced", contextWindow: "1M" }),
    openaiApiModel("openai/gpt-5.4-mini", "GPT-5.4 Mini", "Fast GPT-5.4 class.", { tier: "fast", contextWindow: "400K" }),
    openaiApiModel("openai/gpt-5.6-sol", "GPT-5.6 Sol", "Current OpenAI coding flagship.", { tier: "flagship", contextWindow: "1M" }),
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
    _opts: { openaiKey: boolean; openRouterKey: boolean; signedIn: boolean },
): ModelInfo[] {
    const byId = new Map<string, ModelInfo>();
    const add = (model: ModelInfo) => {
        if (!byId.has(model.id)) byId.set(model.id, model);
    };

    add(catalog.find((m) => m.id === "auto") ?? AUTO_MODEL);

    for (const model of catalog) {
        if (model.id === "auto" || model.id === "openrouter/auto") continue;
        add(model);
    }

    return [...byId.values()];
}

function isAutoId(id: string): boolean {
    return id === "auto" || id === "openrouter/auto";
}

/** Drop catalog ids that no longer exist. Empty means “all models”. */
export function sanitizeEnabledModels(
    enabled: string[],
    catalogIds: string[],
    _defaults: string[] = [],
): string[] {
    if (enabled.length === 0) return [];
    const known = new Set(catalogIds);
    const kept = enabled.filter((id) => isAutoId(id) || known.has(id));
    const keptReal = kept.filter((id) => !isAutoId(id));
    if (keptReal.length === 0) return [];
    const catalogReal = catalogIds.filter((id) => !isAutoId(id));
    if (catalogReal.length > 0 && catalogReal.every((id) => keptReal.includes(id))) return [];
    return kept;
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
        (m) => m.id === "auto" || isModelEnabled(m.id, enabledModels),
    );
}

/** Subagents never inherit the parent chat model. Empty / unknown → Auto only. */
export const DEFAULT_SUBAGENT_MODELS = ["auto"];

export function sanitizeSubagentModels(enabled: string[] | undefined, catalogIds: string[]): string[] {
    const known = new Set(catalogIds);
    const kept: string[] = [];
    const seen = new Set<string>();
    for (const raw of enabled ?? []) {
        const id = isAutoId(raw) ? "auto" : raw;
        if (seen.has(id)) continue;
        if (!isAutoId(id) && !known.has(id)) continue;
        seen.add(id);
        kept.push(id);
    }
    return kept.length > 0 ? kept : [...DEFAULT_SUBAGENT_MODELS];
}

export function isSubagentModelEnabled(modelId: string, enabled: string[]): boolean {
    const list = enabled.length === 0 ? DEFAULT_SUBAGENT_MODELS : enabled;
    if (isAutoId(modelId)) return list.some((id) => isAutoId(id));
    return list.includes(modelId);
}

export function resolveSubagentDefaultModel(defaultModel: string | undefined, allowed: string[]): string {
    const list = allowed.length === 0 ? DEFAULT_SUBAGENT_MODELS : allowed;
    const wanted = defaultModel && isAutoId(defaultModel) ? "auto" : defaultModel;
    if (wanted && isSubagentModelEnabled(wanted, list)) return wanted;
    return list.includes("auto") ? "auto" : list[0] ?? "auto";
}

/**
 * Drop paid ids when the user cannot bill them (free plan, or paid plan with 0 credits).
 * Auto always remains so a nested agent cannot spend credits the parent no longer has.
 */
export function subagentModelsForSend(
    enabled: string[] | undefined,
    catalogIds: string[],
    opts: {
        creditsRemaining: number;
        modelAllowed: (id: string) => boolean;
        defaultModel?: string;
    },
): { models: string[]; defaultModel: string } {
    const allowed = sanitizeSubagentModels(enabled, catalogIds);
    const canBillPaid = opts.creditsRemaining > 0;
    const models = allowed.filter((id) => {
        if (isAutoId(id)) return true;
        return canBillPaid && opts.modelAllowed(id);
    });
    const next = models.length > 0 ? models : [...DEFAULT_SUBAGENT_MODELS];
    return {
        models: next,
        defaultModel: resolveSubagentDefaultModel(opts.defaultModel, next),
    };
}
