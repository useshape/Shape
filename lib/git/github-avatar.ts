/** Resolve GitHub avatar URLs from commit author email / name. Cached in-memory. */

const cache = new Map<string, string | null>();

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

/** Parse GitHub noreply addresses into a login. */
export function githubLoginFromEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const e = normalizeEmail(email);
    // 123456+login@users.noreply.github.com or login@users.noreply.github.com
    const m = e.match(
        /^(?:\d+\+)?([a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38})@users\.noreply\.github\.com$/i,
    );
    if (m) return m[1];
    return null;
}

/** When the display name is already a plausible GitHub login. */
function loginFromName(name: string | null | undefined): string | null {
    if (!name) return null;
    const n = name.trim();
    if (/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(n)) return n;
    return null;
}

export function githubAvatarUrlForLogin(login: string, size = 64): string {
    return `https://github.com/${encodeURIComponent(login)}.png?size=${size}`;
}

/**
 * Resolve a GitHub avatar URL from author email / name.
 * Prefers noreply GitHub emails; falls back to name-as-login when it looks like a handle.
 */
export function resolveGithubAvatarUrl(
    email: string | null | undefined,
    name?: string | null,
    size = 64,
): string | null {
    const key =
        (email ? normalizeEmail(email) : "") ||
        (name ? `name:${name.trim().toLowerCase()}` : "");
    if (!key) return null;
    if (cache.has(key)) return cache.get(key) ?? null;

    const login = githubLoginFromEmail(email) ?? loginFromName(name);
    if (login) {
        const url = githubAvatarUrlForLogin(login, size);
        cache.set(key, url);
        return url;
    }

    cache.set(key, null);
    return null;
}
