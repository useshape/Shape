/** Hostname for favicon lookups (strips www.). */
export function hostnameOf(urlOrHost: string): string {
    const raw = urlOrHost.trim();
    if (!raw) return "";
    try {
        const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        return new URL(withProto).hostname.replace(/^www\./, "");
    } catch {
        return raw
            .replace(/^https?:\/\//i, "")
            .replace(/^www\./i, "")
            .split("/")[0]
            ?.split("?")[0]
            ?.trim() || "";
    }
}

/** A tab title that is not just the address. */
export function pageLabel(title: string, url: string): string {
    const trimmed = title.trim();
    const host = hostnameOf(url);
    if (!trimmed || /^https?:\/\//i.test(trimmed)) return host || "New tab";
    return trimmed;
}
export function faviconUrl(urlOrHost: string, size = 32): string | null {
    const host = hostnameOf(urlOrHost);
    if (!host) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}
