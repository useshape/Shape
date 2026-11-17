import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SESSION_PATH = path.join(HERE, ".session.json");
const API_BASE = (
  process.env.NEXT_PUBLIC_SHAPE_WEBSITE_URL || "https://www.useshape.org"
).replace(/\/$/, "");
const CLIENT_ID = "shape-desktop";
const REDIRECT_URI = "shape://auth/callback";
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

export function sessionPath() {
  return SESSION_PATH;
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function pkce() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

async function loadSession() {
  try {
    const raw = JSON.parse(await fs.readFile(SESSION_PATH, "utf8"));
    if (raw?.accessToken) return raw;
  } catch {
    /* missing */
  }
  return null;
}

async function saveSession(session) {
  await fs.writeFile(SESSION_PATH, JSON.stringify(session, null, 2), "utf8");
}

function extractHexToken(buf, key) {
  const tryFind = (haystack, needle) => {
    let from = 0;
    let found = null;
    while (from < haystack.length) {
      const idx = haystack.indexOf(needle, from);
      if (idx < 0) break;
      const window = haystack.slice(idx, idx + 1200);
      const match = window.match(/[a-f0-9]{64}/i);
      if (match) found = match[0];
      from = idx + needle.length;
    }
    return found;
  };
  return (
    tryFind(buf.toString("latin1"), key) ||
    tryFind(buf.toString("utf16le"), key)
  );
}

async function tokenFromWebView() {
  const dir = path.join(
    process.env.LOCALAPPDATA || "",
    "com.shape.app",
    "EBWebView",
    "Default",
    "Local Storage",
    "leveldb",
  );
  let entries = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }
  let access = null;
  let refresh = null;
  for (const name of entries) {
    if (!name.endsWith(".log") && !name.endsWith(".ldb")) continue;
    const buf = await fs.readFile(path.join(dir, name));
    access = extractHexToken(buf, "shape-auth-token") || access;
    refresh = extractHexToken(buf, "shape-auth-refresh-token") || refresh;
  }
  if (!access && !refresh) return null;
  return { accessToken: access, refreshToken: refresh, source: "webview" };
}

async function refreshAccess(refreshToken) {
  const res = await fetch(`${API_BASE}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Refresh failed (${res.status})`);
  }
  return data;
}

function openBrowser(url) {
  return new Promise((resolve, reject) => {
    const cmd =
      process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : process.platform === "darwin"
          ? ["open", [url]]
          : ["xdg-open", [url]];
    execFile(cmd[0], cmd[1], (err) => (err ? reject(err) : resolve()));
  });
}

export async function loginWithOAuth() {
  const state = randomUUID();
  const { verifier, challenge } = pkce();
  const authorize = new URL(`${API_BASE}/oauth/authorize`);
  authorize.searchParams.set("client_id", CLIENT_ID);
  authorize.searchParams.set("redirect_uri", REDIRECT_URI);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("scope", "account:read usage:write billing:read");
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  const login = new URL(`${API_BASE}/login`);
  login.searchParams.set(
    "callbackUrl",
    `${authorize.pathname}${authorize.search}`,
  );
  console.error("Sign in in your browser. Waiting for Shape Cloud…");
  console.error(login.toString());
  await openBrowser(login.toString());

  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  let delay = 1000;
  while (Date.now() < deadline) {
    const res = await fetch(
      `${API_BASE}/api/oauth/poll?state=${encodeURIComponent(state)}`,
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ready && data.code) {
      const tokenRes = await fetch(`${API_BASE}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: data.code,
          redirect_uri: REDIRECT_URI,
          client_id: CLIENT_ID,
          code_verifier: verifier,
        }),
      });
      const tokens = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok) {
        throw new Error(
          tokens.error || tokens.message || `Token exchange failed (${tokenRes.status})`,
        );
      }
      const session = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        source: "oauth",
      };
      await saveSession(session);
      console.error("Signed in.");
      return session;
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay + 500, 8000);
  }
  throw new Error("Sign-in timed out.");
}

export async function resolveToken({ forceLogin = false } = {}) {
  if (!forceLogin) {
    const env = process.env.SHAPE_ACCESS_TOKEN?.trim();
    if (env) return { accessToken: env, source: "env" };

    const saved = await loadSession();
    if (saved?.accessToken) return saved;

    const webview = await tokenFromWebView();
    if (webview?.accessToken) {
      await saveSession(webview);
      return webview;
    }
    if (webview?.refreshToken) {
      try {
        const rotated = await refreshAccess(webview.refreshToken);
        const session = {
          accessToken: rotated.accessToken,
          refreshToken: rotated.refreshToken || webview.refreshToken,
          source: "webview-refresh",
        };
        await saveSession(session);
        return session;
      } catch {
        /* fall through to login */
      }
    }
  }
  return loginWithOAuth();
}
