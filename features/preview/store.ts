import { useSyncExternalStore } from "react";
import { commands } from "@/lib/backend";

export type PreviewState = {
    /** Full history stack of navigated URLs. */
    history: string[];
    /** Current index into history (-1 when empty). */
    index: number;
    /** Draft text in the URL bar (may differ from committed URL while editing). */
    urlBar: string;
    /** iframe src currently loaded (null = blank). */
    iframeSrc: string | null;
    /** Bump to force iframe reload of the same URL. */
    reloadKey: number;
    /** User-facing error (frame blocked, invalid URL, etc.). */
    error: string | null;
    /** True while a navigation / frame check is in flight. */
    loading: boolean;
};

const DEFAULT_URL = "http://localhost:3000/";

let state: PreviewState = {
    history: [],
    index: -1,
    urlBar: DEFAULT_URL,
    iframeSrc: null,
    reloadKey: 0,
    error: null,
    loading: false,
};

/** True while we are applying back/forward from our stack (skip re-recording). */
let applyingStackNav = false;
/** Expected URL while stack-navigating — ignore unrelated Resource Timing noise. */
let stackNavTarget: string | null = null;

const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function getSnapshot() {
    return state;
}

function setState(patch: Partial<PreviewState>) {
    state = { ...state, ...patch };
    emit();
}

/** True for loopback hosts only (localhost / 127.0.0.1 / ::1 / 0.0.0.0). */
export function isLocalPreviewUrl(raw: string): boolean {
    try {
        const u = new URL(normalizePreviewUrl(raw));
        if (u.protocol !== "http:" && u.protocol !== "https:") return false;
        const host = u.hostname.toLowerCase();
        return (
            host === "localhost" ||
            host === "127.0.0.1" ||
            host === "0.0.0.0" ||
            host === "[::1]" ||
            host === "::1"
        );
    } catch {
        return false;
    }
}

/** Normalize typed input into an absolute local URL; rewrite 0.0.0.0 → localhost. */
export function normalizePreviewUrl(raw: string): string {
    let s = raw.trim();
    if (!s) return DEFAULT_URL;
    if (!/^https?:\/\//i.test(s)) {
        s = `http://${s}`;
    }
    const u = new URL(s);
    if (u.hostname === "0.0.0.0" || u.hostname === "[::1]" || u.hostname === "::1") {
        u.hostname = "localhost";
    }
    return u.toString();
}

export function previewUrlsEqual(a: string, b: string): boolean {
    try {
        const ua = new URL(normalizePreviewUrl(a));
        const ub = new URL(normalizePreviewUrl(b));
        const strip = (p: string) => (p.length > 1 ? p.replace(/\/$/, "") : p);
        return (
            ua.protocol === ub.protocol &&
            ua.host === ub.host &&
            strip(ua.pathname) === strip(ub.pathname) &&
            ua.search === ub.search &&
            ua.hash === ub.hash
        );
    } catch {
        return a === b;
    }
}

function framesBlockedByHeaders(res: Response): string | null {
    const xfo = (res.headers.get("x-frame-options") || "").toLowerCase();
    if (xfo.includes("deny") || xfo.includes("sameorigin")) {
        return "This site blocks embedding (X-Frame-Options). Open it in your browser instead.";
    }
    const csp = res.headers.get("content-security-policy") || "";
    const frameAncestors = csp.match(/frame-ancestors\s+([^;]+)/i);
    if (frameAncestors) {
        const value = frameAncestors[1].trim().toLowerCase();
        if (value === "'none'" || value === "none") {
            return "This site blocks embedding (CSP frame-ancestors). Open it in your browser instead.";
        }
    }
    return null;
}

async function checkFrameAllowed(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, { method: "HEAD", mode: "cors", cache: "no-store" });
        return framesBlockedByHeaders(res);
    } catch {
        try {
            const res = await fetch(url, { method: "GET", mode: "cors", cache: "no-store" });
            return framesBlockedByHeaders(res);
        } catch {
            return null;
        }
    }
}

/** Probe loopback reachability so we never mount an iframe that shows the OS/Edge error page. */
async function probePreviewReachable(url: string): Promise<boolean> {
    try {
        if (await commands.probePreviewUrl(url)) return true;
    } catch {
        /* web / command missing — fall through to fetch */
    }

    const tryOnce = async (method: "HEAD" | "GET", mode: RequestMode) => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 2500);
        try {
            await fetch(url, { method, mode, cache: "no-store", signal: controller.signal });
            return true;
        } catch {
            return false;
        } finally {
            window.clearTimeout(timer);
        }
    };

    // CORS may fail on local apps even when the server is up — treat opaque/no-cors success as reachable.
    if (await tryOnce("HEAD", "no-cors")) return true;
    if (await tryOnce("GET", "no-cors")) return true;
    // Some servers reject HEAD; a CORS GET that returns anything (incl. 4xx) still means the host is up.
    try {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 2500);
        try {
            await fetch(url, { method: "GET", mode: "cors", cache: "no-store", signal: controller.signal });
            return true;
        } finally {
            window.clearTimeout(timer);
        }
    } catch {
        return false;
    }
}

export function getPreviewCurrentUrl(): string | null {
    if (state.index < 0 || state.index >= state.history.length) return null;
    return state.history[state.index] ?? null;
}

export function usePreviewStore(): PreviewState {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function commitNavigation(url: string, opts?: { replace?: boolean; reload?: boolean }) {
    const replace = opts?.replace ?? false;
    const reload = opts?.reload ?? false;
    let history = state.history.slice();
    let index = state.index;

    if (replace && index >= 0) {
        history[index] = url;
    } else if (index >= 0 && previewUrlsEqual(history[index]!, url)) {
        setState({
            loading: false,
            iframeSrc: url,
            reloadKey: reload ? state.reloadKey + 1 : state.reloadKey,
            error: null,
            urlBar: url,
        });
        return;
    } else {
        history = history.slice(0, index + 1);
        history.push(url);
        index = history.length - 1;
    }

    setState({
        history,
        index,
        iframeSrc: url,
        reloadKey: reload ? state.reloadKey + 1 : state.reloadKey + 1,
        loading: false,
        error: null,
        urlBar: url,
    });
}

export async function navigatePreview(raw: string, opts?: { replace?: boolean }) {
    let url: string;
    try {
        url = normalizePreviewUrl(raw);
    } catch {
        setState({
            error: "Enter a valid localhost URL (e.g. http://localhost:3000).",
            iframeSrc: null,
            loading: false,
        });
        return;
    }
    if (!isLocalPreviewUrl(url)) {
        setState({
            error: "Preview only loads local sites (localhost / 127.0.0.1).",
            urlBar: raw.trim() || state.urlBar,
            iframeSrc: null,
            loading: false,
        });
        return;
    }

    // Clear the iframe first so a previous Edge/WebView error page never stays visible.
    setState({ loading: true, error: null, urlBar: url, iframeSrc: null });

    const reachable = await probePreviewReachable(url);
    if (!reachable) {
        setState({
            loading: false,
            iframeSrc: null,
            error: "Nothing is listening at this address. Start your dev server, then try again.",
            urlBar: url,
            history: state.history,
            index: state.index,
        });
        return;
    }

    const blockMsg = await checkFrameAllowed(url);
    commitNavigation(url, { replace: opts?.replace, reload: true });
    if (blockMsg) {
        setState({ error: blockMsg, iframeSrc: null });
    }
}

export function previewBack() {
    if (state.index <= 0) return;
    const index = state.index - 1;
    const url = state.history[index]!;
    applyingStackNav = true;
    stackNavTarget = url;
    setState({
        index,
        iframeSrc: null,
        urlBar: url,
        error: null,
        loading: true,
    });
    void (async () => {
        const reachable = await probePreviewReachable(url);
        if (!reachable) {
            applyingStackNav = false;
            stackNavTarget = null;
            setState({
                loading: false,
                iframeSrc: null,
                error: "Nothing is listening at this address. Start your dev server, then try again.",
            });
            return;
        }
        setState({
            iframeSrc: url,
            reloadKey: state.reloadKey + 1,
            loading: false,
            error: null,
        });
    })();
}

export function previewForward() {
    if (state.index < 0 || state.index >= state.history.length - 1) return;
    const index = state.index + 1;
    const url = state.history[index]!;
    applyingStackNav = true;
    stackNavTarget = url;
    setState({
        index,
        iframeSrc: null,
        urlBar: url,
        error: null,
        loading: true,
    });
    void (async () => {
        const reachable = await probePreviewReachable(url);
        if (!reachable) {
            applyingStackNav = false;
            stackNavTarget = null;
            setState({
                loading: false,
                iframeSrc: null,
                error: "Nothing is listening at this address. Start your dev server, then try again.",
            });
            return;
        }
        setState({
            iframeSrc: url,
            reloadKey: state.reloadKey + 1,
            loading: false,
            error: null,
        });
    })();
}

export function endPreviewStackNav() {
    applyingStackNav = false;
    stackNavTarget = null;
}

export function recordPreviewLocation(raw: string) {
    let url: string;
    try {
        url = normalizePreviewUrl(raw);
    } catch {
        return;
    }
    if (!isLocalPreviewUrl(url)) return;

    if (applyingStackNav) {
        // Keep the flag until we land on the intended URL (or close enough).
        // Spurious Resource Timing entries must not clear the guard early.
        if (stackNavTarget && !previewUrlsEqual(url, stackNavTarget)) {
            return;
        }
        applyingStackNav = false;
        stackNavTarget = null;
        setState({ urlBar: url, error: null });
        return;
    }

    if (state.index >= 0 && previewUrlsEqual(state.history[state.index]!, url)) {
        setState({ urlBar: url, error: null });
        return;
    }
    const history = state.history.slice(0, state.index + 1);
    history.push(url);
    setState({
        history,
        index: history.length - 1,
        urlBar: url,
        iframeSrc: url,
        error: null,
        loading: false,
    });
}

export function previewReload() {
    const url = getPreviewCurrentUrl();
    if (!url) return;
    applyingStackNav = true;
    stackNavTarget = url;
    setState({
        iframeSrc: null,
        error: null,
        urlBar: url,
        loading: true,
    });
    void (async () => {
        const reachable = await probePreviewReachable(url);
        if (!reachable) {
            applyingStackNav = false;
            stackNavTarget = null;
            setState({
                loading: false,
                iframeSrc: null,
                error: "Nothing is listening at this address. Start your dev server, then try again.",
            });
            return;
        }
        setState({
            iframeSrc: url,
            reloadKey: state.reloadKey + 1,
            loading: false,
            error: null,
        });
    })();
}

export function setPreviewUrlBar(value: string) {
    setState({ urlBar: value });
}

export function setPreviewError(error: string | null) {
    setState({ error });
}

let globalLastDevUrl: string | null = null;

export function getLastDevUrl() {
    return globalLastDevUrl;
}

export function setLastDevUrl(url: string) {
    globalLastDevUrl = url;
    seedPreviewFromDevUrl(url);
}

export function seedPreviewFromDevUrl(devUrl: string | null | undefined) {
    if (!devUrl || state.history.length > 0) return;
    try {
        const url = normalizePreviewUrl(devUrl);
        if (!isLocalPreviewUrl(url)) return;
        // Prefill the bar only — never auto-load a dead URL into an iframe (shows OS error page).
        setState({ urlBar: url });
    } catch {
        /* ignore */
    }
}

/** Prefill URL bar; do not auto-navigate (avoids Edge/WebView error page on open). */
export function ensurePreviewLoaded() {
    if (state.urlBar) return;
    setState({ urlBar: DEFAULT_URL });
}

export function openPreviewPanel(url?: string) {
    void import("@/lib/browser-tab").then(({ openBrowserTab }) => openBrowserTab());
    if (url) {
        void navigatePreview(url);
    } else {
        ensurePreviewLoaded();
    }
}

/** Best-effort: recover the URL of a cross-origin iframe document load from Resource Timing. */
export function inferPreviewUrlFromPerformance(afterMs = 0): string | null {
    try {
        const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        for (let i = entries.length - 1; i >= 0; i--) {
            const e = entries[i]!;
            if (afterMs && e.startTime + (performance.timeOrigin || 0) < afterMs) continue;
            if (!isLocalPreviewUrl(e.name)) continue;
            // Document navigations in iframes often show as iframe / other / empty initiator.
            if (
                e.initiatorType === "iframe" ||
                e.initiatorType === "other" ||
                e.initiatorType === "" ||
                e.initiatorType === "fetch" ||
                e.initiatorType === "xmlhttprequest"
            ) {
                // Prefer navigations that look like HTML documents (no obvious static asset).
                if (/\.(js|css|map|png|jpe?g|gif|svg|woff2?|ttf|ico)(\?|$)/i.test(e.name)) continue;
                return normalizePreviewUrl(e.name);
            }
        }
    } catch {
        /* ignore */
    }
    return null;
}
