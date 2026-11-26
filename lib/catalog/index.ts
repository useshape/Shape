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
  models: [],
  providerOrder: [],
  freeTierModelIds: [],
  defaultEnabledModelIds: [],
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

    const res = await fetch(`${SHAPE_API_BASE}/api/catalog`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new Error(`Catalog request failed (${res.status})`);
    }
    const data = (await res.json()) as ShapeCatalog;
    if (!Array.isArray(data.models) || data.models.length === 0) {
      throw new Error("Catalog response did not include models");
    }
    cached = data;
    cachedAt = now;
    return data;
  } catch (err) {
    if (cached?.models?.length) return cached;
    throw err instanceof Error ? err : new Error("Catalog request failed");
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
  return true;
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
    minTier: m.minTier,
    viaApi: m.viaApi,
  }));
}
