import { SHAPE_API_BASE } from "@/lib/cloud/api";

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
  viaApi?: boolean;
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

export const FALLBACK_CATALOG: ShapeCatalog = {
  tiers: [],
  models: [
    {
      id: "auto",
      name: "Auto",
      description: "Picks a fast model for everyday work.",
      provider: "Auto",
      inputCost: 0,
      cachedInputCost: 0,
      outputCost: 0,
      contextWindow: "200K",
      releaseDate: "Rolling",
      minTier: "free",
    },
    {
      id: "openai/gpt-4o-mini",
      name: "GPT-4o mini",
      description: "Fast everyday chat and coding.",
      provider: "OpenAI",
      inputCost: 0.15,
      cachedInputCost: 0.075,
      outputCost: 0.6,
      contextWindow: "128K",
      releaseDate: "2024-07",
      tier: "fast",
      minTier: "free",
      viaApi: true,
    },
    {
      id: "openai/gpt-4o",
      name: "GPT-4o",
      description: "Flagship with vision.",
      provider: "OpenAI",
      inputCost: 2.5,
      cachedInputCost: 1.25,
      outputCost: 10,
      contextWindow: "128K",
      releaseDate: "2024-05",
      tier: "flagship",
      minTier: "free",
      viaApi: true,
    },
    {
      id: "anthropic/claude-sonnet-4.6",
      name: "Claude Sonnet 4.6",
      description: "Coding and agents.",
      provider: "Anthropic",
      inputCost: 3,
      cachedInputCost: 0.3,
      outputCost: 15,
      contextWindow: "200K",
      releaseDate: "2025",
      tier: "balanced",
      minTier: "free",
      viaApi: true,
    },
  ],
  providerOrder: ["Auto", "OpenAI", "Anthropic"],
  freeTierModelIds: ["auto", "openrouter/auto", "openai/gpt-4o-mini", "openai/gpt-4o", "anthropic/claude-sonnet-4.6"],
  defaultEnabledModelIds: ["auto", "openai/gpt-4o-mini", "openai/gpt-4o"],
  allowedModelIds: ["auto", "openai/gpt-4o-mini", "openai/gpt-4o", "anthropic/claude-sonnet-4.6"],
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

/** True only when the Shape API catalog endpoint responds — not a local fallback. */
export async function isCatalogServerReachable(token?: string | null): Promise<boolean> {
  try {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${SHAPE_API_BASE}/api/catalog`, {
      headers,
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
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
    viaApi: m.viaApi,
  }));
}
