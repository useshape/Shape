/** Model display shape. The list itself comes from the API catalog. */
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
    minTier?: string;
    viaApi?: boolean;
}

export function isApiModel(model: { viaApi?: boolean }): boolean {
    return Boolean(model.viaApi);
}

export function resolveChatModels(catalog: ModelInfo[]): ModelInfo[] {
    const byId = new Map<string, ModelInfo>();
    for (const model of catalog) {
        if (model.id === "auto" || model.id === "openrouter/auto") continue;
        if (!byId.has(model.id)) byId.set(model.id, model);
    }
    return [...byId.values()];
}

function isLegacyAuto(id: string): boolean {
    return id === "auto" || id === "openrouter/auto";
}

/** Drop catalog ids that no longer exist. Empty means every model. */
export function sanitizeEnabledModels(enabled: string[], catalogIds: string[], _defaults: string[] = []): string[] {
    if (enabled.length === 0) return [];
    const known = new Set(catalogIds);
    const kept = enabled.filter((id) => known.has(id) && !isLegacyAuto(id));
    if (kept.length === 0) return [];
    if (catalogIds.length > 0 && catalogIds.every((id) => kept.includes(id))) return [];
    return kept;
}

export function isModelEnabled(modelId: string, enabledModels: string[]): boolean {
    if (enabledModels.length === 0) return true;
    return enabledModels.includes(modelId);
}

export function getVisibleModels(allModels: ModelInfo[], enabledModels: string[]): ModelInfo[] {
    return allModels.filter(
        (model) => isIncludedModel(model) || isModelEnabled(model.id, enabledModels),
    );
}

export function isIncludedModel(model: { minTier?: string; provider?: string }): boolean {
    return model.minTier === "free" || model.provider === "Free Models";
}

export function sanitizeSubagentModels(
    enabled: string[] | undefined,
    catalog: Array<{ id: string; minTier?: string; provider?: string }>,
): string[] {
    const known = new Set(catalog.map((model) => model.id));
    const kept: string[] = [];
    const seen = new Set<string>();
    for (const raw of enabled ?? []) {
        if (isLegacyAuto(raw) || seen.has(raw) || !known.has(raw)) continue;
        seen.add(raw);
        kept.push(raw);
    }
    if (kept.length > 0) return kept;
    return catalog.filter(isIncludedModel).map((model) => model.id);
}

export function isSubagentModelEnabled(modelId: string, enabled: string[]): boolean {
    return enabled.includes(modelId);
}

export function resolveSubagentDefaultModel(defaultModel: string | undefined, allowed: string[]): string {
    if (defaultModel && !isLegacyAuto(defaultModel) && allowed.includes(defaultModel)) return defaultModel;
    return allowed[0] ?? "";
}

export function subagentModelsForSend(
    enabled: string[] | undefined,
    catalog: Array<{ id: string; minTier?: string; provider?: string }>,
    opts: {
        creditsRemaining: number;
        modelAllowed: (id: string) => boolean;
        defaultModel?: string;
    },
): { models: string[]; defaultModel: string } {
    const allowed = sanitizeSubagentModels(enabled, catalog);
    const included = new Set(catalog.filter(isIncludedModel).map((model) => model.id));
    const canBill = opts.creditsRemaining > 0;
    const models = allowed.filter((id) => included.has(id) || (canBill && opts.modelAllowed(id)));
    return {
        models,
        defaultModel: resolveSubagentDefaultModel(opts.defaultModel, models),
    };
}
