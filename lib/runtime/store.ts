"use client";

import { useSyncExternalStore } from "react";
import { SHAPE_API_BASE } from "@/lib/cloud/api";

type FlagRule = {
  mode?: "on" | "off" | "percent";
  percent?: number;
  allowUserIds?: string[];
  minTier?: string;
};

type RuntimeConfig = {
  env?: "development" | "production";
  flags?: Record<string, { enabled: boolean; payload?: { development?: FlagRule; production?: FlagRule } | null }>;
  disabledModels?: string[];
  disabledPlugins?: string[];
};

const TIER_RANK: Record<string, number> = { free: 0, plus: 1, pro: 2, max: 3 };

let config: RuntimeConfig | null = null;
let ctx: { userId: string | null; tier: string } = { userId: null, tier: "free" };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function hashPercent(userId: string, key: string) {
  let h = 2166136261;
  const input = `${key}:${userId}`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100;
}

export function evaluateRuntimeFlag(key: string, fallback = true) {
  const flag = config?.flags?.[key];
  if (!flag) return fallback;
  const env = config?.env ?? "production";
  const rule = flag.payload?.[env];
  if (!rule) return flag.enabled;
  if (ctx.userId && rule.allowUserIds?.includes(ctx.userId)) return true;
  if (rule.minTier && TIER_RANK[ctx.tier] < (TIER_RANK[rule.minTier] ?? 0)) return false;
  if (rule.mode === "on") return true;
  if (rule.mode === "off") return false;
  if (rule.mode === "percent") {
    if (!ctx.userId) return false;
    return hashPercent(ctx.userId, key) < Math.max(0, Math.min(100, rule.percent ?? 0));
  }
  return flag.enabled;
}

export async function refreshShapeRuntime(next?: { userId?: string | null; tier?: string }) {
  if (next) ctx = { userId: next.userId ?? null, tier: next.tier ?? ctx.tier };
  const res = await fetch(`${SHAPE_API_BASE}/api/runtime`);
  if (!res.ok) return;
  config = (await res.json()) as RuntimeConfig;
  emit();
}

export function useRuntimeFlag(key: string, fallback = true) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => evaluateRuntimeFlag(key, fallback),
    () => fallback,
  );
}

export function getRuntimeDisabledModels() {
  return config?.disabledModels ?? [];
}
