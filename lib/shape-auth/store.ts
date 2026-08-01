import { useSyncExternalStore } from "react";
import { commands } from "@/lib/backend/commands";
import {
  dashboardUrl,
  exchangeOAuthCode,
  fetchAccount,
  oauthAuthorizeUrl,
  pollOAuthCode,
  revokeToken,
  ShapeApiError,
} from "./api";
import type { ShapeAuthState, ShapeTier } from "./types";
import { clearShapeCatalog, refreshShapeCatalog } from "@/lib/catalog-store";
import { identifyTelemetryUser } from "@/lib/telemetry";

const STORAGE_KEY = "shape-auth-token";
const PROFILE_KEY = "shape-auth-profile";
const PENDING_OAUTH_KEY = "shape-auth-pending-oauth";
const REDIRECT_URI = "shape://auth/callback";
const LOGIN_TIMEOUT_MS = 90 * 1000;
const LOGIN_POLL_BASE_MS = 1000;
const LOGIN_POLL_MAX_MS = 8000;
const REVALIDATE_INTERVAL_MS = 5 * 60 * 1000;

type PendingOAuth = {
  state: string;
  codeVerifier: string;
  startedAt: number;
};

type CachedProfile = {
  userId: string;
  email: string;
  name: string | null;
  tier: ShapeTier;
  creditsRemaining: number;
  creditsIncluded: number;
  freeAutoPercent: number | null;
  cachedAt: number;
};

const DEFAULT_STATE: ShapeAuthState = {
  loggedIn: false,
  isLoggingIn: false,
  isLoading: true,
  offline: false,
  revalidating: false,
  error: null,
  userId: null,
  email: null,
  name: null,
  tier: "free",
  creditsRemaining: 0,
  creditsIncluded: 0,
  freeAutoPercent: null,
  accessToken: null,
};

let state: ShapeAuthState = { ...DEFAULT_STATE };
const listeners = new Set<() => void>();
let initialized = false;
let pendingState: string | null = null;
let pendingCodeVerifier: string | null = null;
let loginPollTimer: ReturnType<typeof setTimeout> | null = null;
let finishingOAuth = false;
/** Prevents poll + deep-link from exchanging the same one-time code twice. */
let finishedOAuthCode: string | null = null;
let pollAttempt = 0;
/** Bumped so in-flight polls cannot re-arm after success/cancel. */
let loginPollGeneration = 0;
let loginWaiter: ((success: boolean) => void) | null = null;
let revalidateTimer: ReturnType<typeof setInterval> | null = null;

function settleLoginWaiter(success: boolean) {
  if (!loginWaiter) return;
  loginWaiter(success);
  loginWaiter = null;
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ShapeAuthState {
  return state;
}

function setState(patch: Partial<ShapeAuthState>) {
  state = { ...state, ...patch };
  emit();
}

function reportAuthError(message: string) {
  setState({ isLoggingIn: false, error: message });
  void import("@/features/notifications").then(({ notify }) => {
    if (/cancel/i.test(message)) {
      notify.info("Shape", message);
    } else {
      void import("@/lib/errors/catalog").then(({ SHAPE_ERRORS, getError }) => {
        const entry = getError(SHAPE_ERRORS.SIGN_IN_FAILED);
        notify.error(entry.title, message.trim() || entry.description, { code: entry.code });
      });
    }
  });
}

function clearLoginPoll() {
  if (loginPollTimer !== null) {
    clearTimeout(loginPollTimer);
    loginPollTimer = null;
  }
  pollAttempt = 0;
  loginPollGeneration += 1;
}

function savePendingOAuth(oauthState: string, codeVerifier: string) {
  try {
    const payload: PendingOAuth = {
      state: oauthState,
      codeVerifier,
      startedAt: Date.now(),
    };
    localStorage.setItem(PENDING_OAUTH_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function clearPendingOAuth() {
  try {
    localStorage.removeItem(PENDING_OAUTH_KEY);
  } catch {
    /* ignore */
  }
}

function loadPendingOAuth(): PendingOAuth | null {
  try {
    const raw = localStorage.getItem(PENDING_OAUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingOAuth;
    if (!parsed?.state || !parsed?.codeVerifier || typeof parsed.startedAt !== "number") {
      clearPendingOAuth();
      return null;
    }
    if (Date.now() - parsed.startedAt > LOGIN_TIMEOUT_MS + 30_000) {
      clearPendingOAuth();
      return null;
    }
    return parsed;
  } catch {
    clearPendingOAuth();
    return null;
  }
}

/** Restore PKCE state after a hot reload / app rebuild mid sign-in. */
function ensurePendingOAuthLoaded() {
  if (pendingState && pendingCodeVerifier) return;
  const saved = loadPendingOAuth();
  if (!saved) return;
  pendingState = saved.state;
  pendingCodeVerifier = saved.codeVerifier;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createPkcePair() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64UrlEncode(verifierBytes);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64UrlEncode(new Uint8Array(digest));
  return { verifier, challenge };
}

async function loadToken(): Promise<string | null> {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function loadCachedProfile(): CachedProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedProfile;
    if (!parsed?.userId || !parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCachedProfile(profile: CachedProfile | null) {
  try {
    if (profile) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } else {
      localStorage.removeItem(PROFILE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function applyCachedProfile(token: string, profile: CachedProfile) {
  setState({
    loggedIn: true,
    isLoggingIn: false,
    isLoading: false,
    revalidating: true,
    offline: false,
    error: null,
    userId: profile.userId,
    email: profile.email,
    name: profile.name,
    tier: profile.tier,
    creditsRemaining: profile.creditsRemaining,
    creditsIncluded: profile.creditsIncluded ?? 0,
    freeAutoPercent: profile.freeAutoPercent,
    accessToken: token,
  });
}

async function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  broadcastAuthChange();
}

function broadcastAuthChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("shape-auth-changed"));
  void import("@tauri-apps/api/event")
    .then(({ emit }) => emit("shape-auth-changed"))
    .catch(() => {
      /* not in tauri */
    });
}

function setupAuthSync() {
  if (typeof window === "undefined") return;

  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      void applyToken(e.newValue);
    }
  });

  window.addEventListener("shape-auth-changed", () => {
    void loadToken().then(async (token) => {
      if (token === state.accessToken) return;
      await applyToken(token);
    });
  });

  window.addEventListener("focus", () => {
    void refreshShapeAuth();
  });

  window.addEventListener("online", () => {
    if (state.accessToken) void refreshShapeAuth();
  });

  if (revalidateTimer === null) {
    revalidateTimer = setInterval(() => {
      if (state.accessToken) void refreshShapeAuth();
    }, REVALIDATE_INTERVAL_MS);
  }

  void import("@tauri-apps/api/event")
    .then(({ listen }) =>
      listen("shape-auth-changed", () => {
        void loadToken().then(async (token) => {
          if (token === state.accessToken) return;
          await applyToken(token);
        });
      }),
    )
    .catch(() => {
      /* not in tauri */
    });
}

async function applyToken(token: string | null) {
  if (!token) {
    clearShapeCatalog();
    saveCachedProfile(null);
    setState({
      ...DEFAULT_STATE,
      isLoading: false,
      accessToken: null,
    });
    return;
  }

  const cached = loadCachedProfile();
  const prevTier = state.tier;
  if (cached) {
    applyCachedProfile(token, cached);
  } else {
    setState({
      isLoading: true,
      revalidating: false,
      offline: false,
      accessToken: token,
    });
  }

  try {
    const account = await fetchAccount(token);
    saveCachedProfile({
      userId: account.id,
      email: account.email,
      name: account.name,
      tier: account.tier,
      creditsRemaining: account.creditsRemaining,
      creditsIncluded: account.creditsIncluded,
      freeAutoPercent: account.freeAutoPercent,
      cachedAt: Date.now(),
    });
    setState({
      loggedIn: true,
      isLoggingIn: false,
      isLoading: false,
      revalidating: false,
      offline: false,
      error: null,
      userId: account.id,
      email: account.email,
      name: account.name,
      tier: account.tier,
      creditsRemaining: account.creditsRemaining,
      creditsIncluded: account.creditsIncluded,
      freeAutoPercent: account.freeAutoPercent,
      accessToken: token,
    });
    void identifyTelemetryUser(account.id, { tier: account.tier });
    if (account.tier !== prevTier || !cached) {
      void refreshShapeCatalog(token).catch(() => undefined);
    }
  } catch (err) {
    const isAuthError =
      err instanceof ShapeApiError && (err.status === 401 || err.status === 404);
    const isNetwork =
      err instanceof ShapeApiError ? err.isNetworkError : true;

    if (isAuthError) {
      await saveToken(null);
      saveCachedProfile(null);
      clearShapeCatalog();
      setState({
        ...DEFAULT_STATE,
        isLoading: false,
        error: "Session expired. Sign in again.",
      });
      return;
    }

    if (cached && isNetwork) {
      setState({
        loggedIn: true,
        isLoading: false,
        revalidating: false,
        offline: true,
        error: null,
        accessToken: token,
        userId: cached.userId,
        email: cached.email,
        name: cached.name,
        tier: cached.tier,
        creditsRemaining: cached.creditsRemaining,
        creditsIncluded: cached.creditsIncluded ?? 0,
        freeAutoPercent: cached.freeAutoPercent,
      });
      void import("@/lib/errors/catalog").then(({ notifyOfflineOnce }) => {
        notifyOfflineOnce();
      });
      return;
    }

    setState({
      ...DEFAULT_STATE,
      isLoading: false,
      error: err instanceof Error ? err.message : "Could not load account.",
    });
  }
}

async function finishOAuth(code: string) {
  if (finishedOAuthCode === code || finishingOAuth) return;
  if (state.loggedIn) return;
  ensurePendingOAuthLoaded();
  finishingOAuth = true;
  // Stop poll loop so it cannot race a second token exchange.
  clearLoginPoll();

  try {
    const result = await exchangeOAuthCode(code, REDIRECT_URI, pendingCodeVerifier ?? undefined);
    finishedOAuthCode = code;
    await saveToken(result.accessToken);
    pendingState = null;
    pendingCodeVerifier = null;
    clearPendingOAuth();
    await applyToken(result.accessToken);
    settleLoginWaiter(true);
  } catch (err) {
    // Concurrent success already signed us in; treat expired-code races as OK.
    if (state.loggedIn || finishedOAuthCode) {
      settleLoginWaiter(true);
      return;
    }
    pendingState = null;
    pendingCodeVerifier = null;
    clearPendingOAuth();
    const message = err instanceof Error ? err.message : "Sign in failed";
    reportAuthError(message);
    settleLoginWaiter(false);
  } finally {
    finishingOAuth = false;
  }
}

function handleOAuthDeepLink(rawUrl: string) {
  try {
    ensurePendingOAuthLoaded();
    const url = new URL(rawUrl);
    const error = url.searchParams.get("error");
    if (error) {
      clearLoginPoll();
      clearPendingOAuth();
      pendingState = null;
      pendingCodeVerifier = null;
      reportAuthError(
        error === "access_denied" ? "Sign-in was cancelled" : `Sign-in failed (${error})`,
      );
      settleLoginWaiter(false);
      return;
    }

    const code = url.searchParams.get("code");
    const linkState = url.searchParams.get("state");
    if (!code) return;

    if (pendingState && linkState && linkState !== pendingState && code !== pendingState) {
      return;
    }

    void finishOAuth(code);
  } catch (err) {
    console.warn("[shape-auth] invalid oauth callback url:", err);
  }
}

let deepLinkListening = false;

async function setupOAuthDeepLinkListener() {
  if (deepLinkListening || typeof window === "undefined") return;
  deepLinkListening = true;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    await listen<string>("shape-oauth-callback", (event) => {
      handleOAuthDeepLink(event.payload);
    });
  } catch {
    /* browser / non-tauri */
  }
}

function nextPollDelayMs() {
  pollAttempt += 1;
  if (pollAttempt <= 3) return LOGIN_POLL_BASE_MS;
  return Math.min(LOGIN_POLL_MAX_MS, LOGIN_POLL_BASE_MS * 2 ** (pollAttempt - 3));
}

async function pollForOAuthCallback(deadline: number, generation: number) {
  if (generation !== loginPollGeneration) return;

  if (!state.isLoggingIn || !pendingState || Date.now() >= deadline) {
    if (generation !== loginPollGeneration) return;
    if (state.isLoggingIn && pendingState) {
      pendingState = null;
      pendingCodeVerifier = null;
      clearPendingOAuth();
      reportAuthError("Sign-in cancelled or timed out");
      settleLoginWaiter(false);
    }
    return;
  }

  try {
    const result = await pollOAuthCode(pendingState);
    if (generation !== loginPollGeneration) return;
    if (result.ready && result.code) {
      await finishOAuth(result.code);
      return;
    }
  } catch (err) {
    if (generation !== loginPollGeneration) return;
    if (err instanceof ShapeApiError && !err.isNetworkError && err.status >= 400 && err.status !== 404) {
      clearLoginPoll();
      reportAuthError(err.message);
      settleLoginWaiter(false);
      return;
    }
  }

  if (generation !== loginPollGeneration) return;
  loginPollTimer = setTimeout(() => {
    void pollForOAuthCallback(deadline, generation);
  }, nextPollDelayMs());
}

export async function initShapeAuth() {
  if (initialized) return;
  initialized = true;
  setupAuthSync();
  void setupOAuthDeepLinkListener();

  const token = await loadToken();
  if (token) {
    const cached = loadCachedProfile();
    if (cached) applyCachedProfile(token, cached);
    clearPendingOAuth();
  }
  void refreshShapeCatalog(token).catch(() => undefined);
  await applyToken(token);

  // Resume PKCE after rebuild/reload while the browser login is still in flight.
  // Must run after applyToken(null), which resets isLoggingIn via DEFAULT_STATE.
  if (!token) {
    ensurePendingOAuthLoaded();
    if (pendingState && pendingCodeVerifier) {
      const saved = loadPendingOAuth();
      const remaining = saved
        ? LOGIN_TIMEOUT_MS - (Date.now() - saved.startedAt)
        : 0;
      if (remaining > 5_000) {
        setState({ isLoggingIn: true, error: null, isLoading: false });
        const deadline = Date.now() + remaining;
        const generation = loginPollGeneration;
        void pollForOAuthCallback(deadline, generation);
      } else {
        clearPendingOAuth();
        pendingState = null;
        pendingCodeVerifier = null;
      }
    }
  }
}

export async function loginShape(): Promise<boolean> {
  if (state.loggedIn) return true;
  if (state.isLoggingIn) {
    return new Promise<boolean>((resolve) => {
      const previous = loginWaiter;
      loginWaiter = (success) => {
        previous?.(success);
        resolve(success);
      };
    });
  }

  return new Promise<boolean>((resolve) => {
    loginWaiter = resolve;
    void startLoginShape();
  });
}

async function startLoginShape() {
  clearLoginPoll();
  finishedOAuthCode = null;
  await setupOAuthDeepLinkListener();
  setState({ isLoggingIn: true, error: null });
  pendingState = crypto.randomUUID();
  const pkce = await createPkcePair();
  pendingCodeVerifier = pkce.verifier;
  savePendingOAuth(pendingState, pendingCodeVerifier);
  const url = oauthAuthorizeUrl(pendingState, pkce.challenge);
  try {
    await commands.openUrlExternal(url);
  } catch (err) {
    clearPendingOAuth();
    pendingState = null;
    pendingCodeVerifier = null;
    reportAuthError(err instanceof Error ? err.message : "Could not open the browser");
    settleLoginWaiter(false);
    return;
  }

  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  const generation = loginPollGeneration;
  void pollForOAuthCallback(deadline, generation);
}

/** Stop an in-progress browser sign-in and unblock the UI. */
export function cancelLoginShape() {
  if (!state.isLoggingIn) return;
  clearLoginPoll();
  pendingState = null;
  pendingCodeVerifier = null;
  clearPendingOAuth();
  reportAuthError("Sign-in cancelled");
  settleLoginWaiter(false);
}

export async function logoutShape() {
  clearLoginPoll();
  pendingState = null;
  pendingCodeVerifier = null;
  clearPendingOAuth();
  settleLoginWaiter(false);
  const token = state.accessToken;
  if (token) {
    try {
      await revokeToken(token);
    } catch {
      /* ignore */
    }
  }
  await saveToken(null);
  saveCachedProfile(null);
  clearShapeCatalog();
  setState({ ...DEFAULT_STATE, isLoading: false });
}

export function openShapeBilling() {
  void commands.openUrlExternal(dashboardUrl());
}

export function useShapeAuth() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getShapeAccessToken(): string | null {
  return state.accessToken;
}

export function getShapeAuthState(): ShapeAuthState {
  return state;
}

export async function refreshShapeAuth() {
  const token = state.accessToken ?? (await loadToken());
  await applyToken(token);
}

/** Call when an API response indicates the session is no longer valid. */
export async function handleAuthFailure() {
  await saveToken(null);
  saveCachedProfile(null);
  clearShapeCatalog();
  setState({
    ...DEFAULT_STATE,
    isLoading: false,
    error: "Session expired. Sign in again.",
  });
}
