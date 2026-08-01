/** Build an app route with trailing slash (required for Next static export routing). */
export function appRoute(path: string, query?: Record<string, string>): string {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const base = normalized.endsWith("/") ? normalized : `${normalized}/`;
    if (!query || Object.keys(query).length === 0) return base;
    return `${base}?${new URLSearchParams(query).toString()}`;
}
