import type { AccountSummary } from "./account";
import { getShapeDeviceId } from "@/lib/device-id";

/**
 * Canonical website origin for official release builds.
 * Must be the primary Vercel host (www today) — apex 308s to www without CORS
 * headers, which makes browser/WebView `fetch` throw as a network error.
 */
export const SHAPE_PRODUCTION_ORIGIN = "https://www.useshape.org";
const DEV_FALLBACK = "http://localhost:3000";

/** Production → www.useshape.org. Dev → `NEXT_PUBLIC_SHAPE_WEBSITE_URL` or localhost. */
export function resolveShapeApiBase(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  envUrl: string | undefined = process.env.NEXT_PUBLIC_SHAPE_WEBSITE_URL,
): string {
  if (nodeEnv === "production") return SHAPE_PRODUCTION_ORIGIN;
  const trimmed = envUrl?.trim().replace(/\/$/, "");
  return trimmed || DEV_FALLBACK;
}

export const SHAPE_API_BASE = resolveShapeApiBase();

const USAGE_CHECK_TTL_MS = 5_000;
const usageCheckCache = new Map<string, { expiresAt: number; promise: Promise<import("./types").UsageCheckResult> }>();
const usageCheckControllers = new Map<string, AbortController>();

/** Thrown by shapeApiFetch when the server returns a non-2xx response or the network is down. */
export class ShapeApiError extends Error {
  readonly status: number;
  readonly isNetworkError: boolean;
  readonly code: string | null;
  readonly upgradeRequired: boolean;

  constructor(
    message: string,
    status: number,
    isNetworkError = false,
    code: string | null = null,
  ) {
    super(message);
    this.name = "ShapeApiError";
    this.status = status;
    this.isNetworkError = isNetworkError;
    this.code = code;
    this.upgradeRequired = code === "upgrade_required" || status === 426;
  }
}

async function clientVersionHeader(): Promise<string> {
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "0.0.0-dev";
  }
}

export async function shapeApiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const deviceId = await getShapeDeviceId();
  if (deviceId) headers.set("X-Shape-Device-Id", deviceId);
  headers.set("X-Shape-Client-Version", await clientVersionHeader());
  try {
    const { getSettings } = await import("@/lib/settings");
    headers.set("X-Shape-Update-Channel", getSettings().updates.channel);
  } catch {
    headers.set("X-Shape-Update-Channel", "stable");
  }

  let res: Response;
  try {
    res = await fetch(`${SHAPE_API_BASE}/api${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new ShapeApiError(
      `Could not reach Shape Cloud at ${SHAPE_API_BASE}.`,
      0,
      true,
    );
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      code?: string | number;
    };
    const rawCode = data.code;
    const code =
      data.error === "upgrade_required" || rawCode === "upgrade_required"
        ? "upgrade_required"
        : rawCode === 3000 || rawCode === "3000"
          ? "unofficial_build"
          : typeof rawCode === "string"
            ? rawCode
            : null;
    const message = data.message ?? data.error ?? `Request failed (${res.status})`;
    if (code === "upgrade_required" || res.status === 426) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("shape-upgrade-required", { detail: { message } }),
        );
      }
    }
    throw new ShapeApiError(message, res.status, false, code);
  }

  return res.json() as Promise<T>;
}

export async function fetchAccount(token: string) {
  return shapeApiFetch<AccountSummary>("/account", { token });
}

export async function checkUsage(token: string, model: string) {
  const cacheKey = `${token}:${model}`;
  const now = Date.now();
  const cached = usageCheckCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  usageCheckControllers.get(cacheKey)?.abort();
  const controller = new AbortController();
  usageCheckControllers.set(cacheKey, controller);

  const promise = shapeApiFetch<import("./types").UsageCheckResult>("/usage/check", {
    method: "POST",
    token,
    body: JSON.stringify({ model }),
    signal: controller.signal,
  }).finally(() => {
    if (usageCheckControllers.get(cacheKey) === controller) {
      usageCheckControllers.delete(cacheKey);
    }
  });

  usageCheckCache.set(cacheKey, { expiresAt: now + USAGE_CHECK_TTL_MS, promise });
  return promise;
}

/**
 * @deprecated Client-reported usage is rejected by the server (410). Prefer server proxy metering.
 */
export async function recordUsage(
  token: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  idempotencyKey?: string,
) {
  return shapeApiFetch<{ success: boolean; creditsCharged: number; creditsRemaining: number }>(
    "/usage",
    {
      method: "POST",
      token,
      body: JSON.stringify({ model, inputTokens, outputTokens, idempotencyKey }),
    },
  );
}

export async function exchangeOAuthCode(
  code: string,
  redirectUri: string,
  codeVerifier?: string,
) {
  const deviceId = await getShapeDeviceId();
  return shapeApiFetch<import("./types").TokenExchangeResponse>("/oauth/token", {
    method: "POST",
    body: JSON.stringify({
      code,
      redirect_uri: redirectUri,
      client_id: "shape-desktop",
      code_verifier: codeVerifier,
      device_id: deviceId,
    }),
  });
}

export async function pollOAuthCode(state: string) {
  const res = await fetch(`${SHAPE_API_BASE}/api/oauth/poll?state=${encodeURIComponent(state)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ShapeApiError(
      (data as { error?: string }).error ?? `Poll failed (${res.status})`,
      res.status,
    );
  }
  return res.json() as Promise<{ ready: boolean; code?: string }>;
}

export async function revokeToken(token: string) {
  await shapeApiFetch("/auth/token", { method: "DELETE", token });
}

export function dashboardUrl() {
  return `${SHAPE_API_BASE}/dashboard`;
}

export function oauthAuthorizeUrl(state: string, codeChallenge: string) {
  const params = new URLSearchParams({
    client_id: "shape-desktop",
    redirect_uri: "shape://auth/callback",
    state,
    scope: "account:read usage:write billing:read",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${SHAPE_API_BASE}/oauth/authorize?${params.toString()}`;
}
