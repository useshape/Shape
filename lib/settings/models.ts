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
    return allModels.filter((m) => isModelEnabled(m.id, enabledModels));
}
