import { SHAPE_API_BASE } from "@/lib/shape-auth/api";

export type CatalogModel = {
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
  minTier: string;
};

export type ShapeCatalog = {
  tiers: { id: string; name: string; price: number; credits: number; autoIncluded: boolean; description: string }[];
  models: CatalogModel[];
  providerOrder: readonly string[];
  freeTierModelIds: string[];
  defaultEnabledModelIds: string[];
  userTier?: string;
  allowedModelIds?: string[];
};

const FALLBACK_CATALOG: ShapeCatalog = {
  tiers: [],
  models: [
    {
      id: "auto",
      name: "Auto",
      description: "Uses a fast included model for everyday tasks.",
      provider: "Auto",
      inputCost: 0,
      cachedInputCost: 0,
      outputCost: 0,
      contextWindow: "200K",
      releaseDate: "Rolling",
      minTier: "free",
    },
  ],
  providerOrder: ["Auto"],
  freeTierModelIds: ["auto", "openrouter/auto"],
  defaultEnabledModelIds: ["auto"],
  allowedModelIds: ["auto"],
};

let cached: ShapeCatalog | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

export async function fetchCatalog(token?: string | null): Promise<ShapeCatalog> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS && (!token || cached.allowedModelIds)) {
    return cached;
  }

  try {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${SHAPE_API_BASE}/api/catalog`, { headers });
    if (!res.ok) return cached ?? FALLBACK_CATALOG;
    const data = (await res.json()) as ShapeCatalog;
    cached = data;
    cachedAt = now;
    return data;
  } catch {
    return cached ?? FALLBACK_CATALOG;
  }
}

export function isModelAllowedInCatalog(catalog: ShapeCatalog, modelId: string): boolean {
  const normalized = modelId === "openrouter/auto" ? "auto" : modelId;
  if (catalog.allowedModelIds) {
    return catalog.allowedModelIds.includes(normalized);
  }
  return catalog.freeTierModelIds.includes(normalized);
}

export function catalogModelsAsModelInfo(catalog: ShapeCatalog) {
  return catalog.models.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    provider: m.provider,
    inputCost: m.inputCost,
    cachedInputCost: m.cachedInputCost,
    outputCost: m.outputCost,
    contextWindow: m.contextWindow,
    releaseDate: m.releaseDate,
    tags: m.tags,
    tier: m.tier,
  }));
}
