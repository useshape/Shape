/** Pure helpers for MCP OAuth / Integrations UI (vitest-friendly). */

/** Build the RFC 8252 loopback redirect used by desktop MCP OAuth clients. */
export function loopbackRedirectUri(port: number, host: "127.0.0.1" | "localhost" = "127.0.0.1"): string {
    return `http://${host}:${port}/callback`;
}

/** Parse OAuth callback query from a full URL or path+query. */
export function parseOAuthCallbackParams(callbackUrl: string): {
    code?: string;
    state?: string;
    error?: string;
    errorDescription?: string;
} {
    let search = "";
    try {
        const u = new URL(callbackUrl);
        search = u.search;
    } catch {
        const q = callbackUrl.indexOf("?");
        search = q >= 0 ? callbackUrl.slice(q) : "";
    }
    const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
    return {
        code: params.get("code") ?? undefined,
        state: params.get("state") ?? undefined,
        error: params.get("error") ?? undefined,
        errorDescription: params.get("error_description") ?? undefined,
    };
}

/** Server id is encoded as `{id}:{nonce}` in OAuth state. */
export function serverIdFromOAuthState(state: string): string | null {
    const i = state.indexOf(":");
    if (i <= 0) return null;
    return state.slice(0, i);
}

/** Truncate scopes the way the native client does for long AS lists (e.g. Slack). */
export function truncateOAuthScopes(raw: string, maxChars = 400): string {
    if (raw.length <= maxChars) return raw;
    const preferred = ["openid", "offline_access", "read", "write", "mcp:connect", "default"];
    const available = raw.split(/\s+/).filter(Boolean);
    const picked = preferred.filter((p) => available.includes(p));
    if (picked.length > 0) return picked.join(" ");
    const out: string[] = [];
    for (const s of available) {
        const next = out.length === 0 ? s : `${out.join(" ")} ${s}`;
        if (next.length > maxChars) break;
        out.push(s);
    }
    return out[0] ?? available[0] ?? "openid";
}

/** Display name for an MCP tool (strip mcp__server__ prefix). */
export function humanizeToolName(name: string): string {
    return name
        .replace(/^mcp__[^_]+__/i, "")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
}

/** Extract a WWW-Authenticate parameter (quoted or bare). */
export function extractWwwAuthenticateParam(wwwAuth: string, key: string): string | null {
    const quoted = `${key}="`;
    const qi = wwwAuth.indexOf(quoted);
    if (qi >= 0) {
        const rest = wwwAuth.slice(qi + quoted.length);
        const end = rest.indexOf('"');
        if (end >= 0) return rest.slice(0, end);
    }
    const bare = `${key}=`;
    const bi = wwwAuth.indexOf(bare);
    if (bi < 0) return null;
    const rest = wwwAuth.slice(bi + bare.length).trimStart();
    const end = rest.search(/[\s,]/);
    const value = (end < 0 ? rest : rest.slice(0, end)).trim().replace(/^"|"$/g, "");
    return value || null;
}

export function isPublicNoAuthError(msg: string): boolean {
    const m = msg.toLowerCase();
    return m.includes("public_no_auth") || m.includes("did not request authentication");
}
