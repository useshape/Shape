"use client";

import { useSyncExternalStore } from "react";
import {
  catalogModelsAsModelInfo,
  FALLBACK_CATALOG,
  fetchCatalog,
  isModelAllowedInCatalog,
  type ShapeCatalog,
} from "@/lib/catalog";
import type { ModelInfo } from "@/lib/settings/models";

type CatalogState = {
  catalog: ShapeCatalog | null;
  loading: boolean;
  error: string | null;
};

let state: CatalogState = { catalog: null, loading: false, error: null };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setState(patch: Partial<CatalogState>) {
  state = { ...state, ...patch };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function getShapeCatalog(): ShapeCatalog | null {
  return state.catalog;
}

export function getCatalogModels(): ModelInfo[] {
  return catalogModelsAsModelInfo(state.catalog ?? FALLBACK_CATALOG);
}

export function getCatalogProviderOrder(): readonly string[] {
  return state.catalog?.providerOrder ?? FALLBACK_CATALOG.providerOrder;
}

export function getCatalogDefaultEnabledIds(): string[] {
  return (state.catalog ?? FALLBACK_CATALOG).defaultEnabledModelIds ?? ["auto"];
}

export function isCatalogModelAllowed(modelId: string): boolean {
  const catalog = state.catalog ?? FALLBACK_CATALOG;
  return isModelAllowedInCatalog(catalog, modelId);
}

export async function refreshShapeCatalog(token?: string | null): Promise<ShapeCatalog> {
  setState({ loading: true, error: null });
  try {
    const catalog = await fetchCatalog(token);
    setState({ catalog, loading: false });
    return catalog;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load catalog";
    setState({ loading: false, error: message });
    throw err;
  }
}

export function useShapeCatalog() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function clearShapeCatalog() {
  setState({ catalog: FALLBACK_CATALOG, loading: false, error: null });
}
