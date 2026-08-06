"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { commands } from "@/lib/backend";
import { cn } from "@/lib/utils";
import {
    getPreviewCurrentUrl,
    navigatePreview,
    previewBack,
    previewForward,
    previewReload,
    seedPreviewFromDevUrl,
    getLastDevUrl,
    setPreviewUrlBar,
    recordPreviewLocation,
    isLocalPreviewUrl,
    ensurePreviewLoaded,
    inferPreviewUrlFromPerformance,
    endPreviewStackNav,
    usePreviewStore,
} from "../store";

export default function PreviewPanel() {
    const { history, index, urlBar, iframeSrc, reloadKey, error, loading } = usePreviewStore();
    const inputRef = useRef<HTMLInputElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const canBack = index > 0;
    const canForward = index >= 0 && index < history.length - 1;
    const currentUrl = getPreviewCurrentUrl();
    const loadStartedAt = useRef(0);

    useEffect(() => {
        seedPreviewFromDevUrl(getLastDevUrl());
        ensurePreviewLoaded();
    }, []);

    // Track cross-origin iframe document loads via Resource Timing when we can't read location.
    useEffect(() => {
        if (typeof PerformanceObserver === "undefined") return;
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                const name = entry.name;
                if (!isLocalPreviewUrl(name)) continue;
                if (/\.(js|css|map|png|jpe?g|gif|svg|woff2?|ttf|ico)(\?|$)/i.test(name)) continue;
                const rt = entry as PerformanceResourceTiming;
                if (
                    rt.initiatorType === "iframe" ||
                    rt.initiatorType === "other" ||
                    rt.initiatorType === ""
                ) {
                    recordPreviewLocation(name);
                }
            }
        });
        try {
            observer.observe({ type: "resource", buffered: true });
        } catch {
            try {
                observer.observe({ entryTypes: ["resource"] });
            } catch {
                /* unsupported */
            }
        }
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            const data = event.data;
            if (!data || typeof data !== "object") return;
            if ((data as { type?: string }).type !== "shape-preview-navigate") return;
            const url = (data as { url?: string }).url;
            if (typeof url !== "string" || !url.trim()) return;
            if (!isLocalPreviewUrl(url)) return;
            recordPreviewLocation(url);
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement | null)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;
            if (!(e.altKey || e.metaKey)) return;
            if (e.key === "ArrowLeft" && canBack) {
                e.preventDefault();
                previewBack();
            } else if (e.key === "ArrowRight" && canForward) {
                e.preventDefault();
                previewForward();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [canBack, canForward]);

    const onSubmit = useCallback(
        (e?: React.FormEvent) => {
            e?.preventDefault();
            loadStartedAt.current = performance.now();
            void navigatePreview(urlBar);
        },
        [urlBar],
    );

    const openExternal = useCallback(() => {
        const url = currentUrl || urlBar.trim();
        if (!url) return;
        void commands.openUrlExternal(url);
    }, [currentUrl, urlBar]);

    const onIframeLoad = useCallback(() => {
        const frame = iframeRef.current;
        if (!frame) {
            endPreviewStackNav();
            return;
        }
        try {
            const href = frame.contentWindow?.location?.href;
            if (href && href !== "about:blank") {
                recordPreviewLocation(href);
                endPreviewStackNav();
                return;
            }
        } catch {
            // Cross-origin — fall through to Resource Timing.
        }
        const inferred = inferPreviewUrlFromPerformance();
        if (inferred) {
            recordPreviewLocation(inferred);
        }
        endPreviewStackNav();
    }, []);

    const onIframeError = useCallback(() => {
        // Keep URL bar; user can open externally.
    }, []);

    return (
        <div className="flex h-full flex-col overflow-hidden bg-panel font-sans">
            <div className="flex shrink-0 items-center gap-1 px-2 py-1.5">
                <Tooltip content="Back">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-text-muted hover:text-text-primary"
                        disabled={!canBack}
                        onClick={() => {
                            loadStartedAt.current = performance.now();
                            previewBack();
                        }}
                    >
                        <Icon name="arrow_back" size={14} />
                    </Button>
                </Tooltip>
                <Tooltip content="Forward">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-text-muted hover:text-text-primary"
                        disabled={!canForward}
                        onClick={() => {
                            loadStartedAt.current = performance.now();
                            previewForward();
                        }}
                    >
                        <Icon name="arrow_forward" size={14} />
                    </Button>
                </Tooltip>
                <Tooltip content="Reload">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-text-muted hover:text-text-primary"
                        disabled={!currentUrl}
                        onClick={() => {
                            loadStartedAt.current = performance.now();
                            previewReload();
                        }}
                    >
                        <Icon name="refresh" size={14} />
                    </Button>
                </Tooltip>

                <form onSubmit={onSubmit} className="flex min-w-0 flex-1 items-center gap-1">
                    <input
                        ref={inputRef}
                        type="text"
                        value={urlBar}
                        onChange={(e) => setPreviewUrlBar(e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        placeholder="http://localhost:3000"
                        spellCheck={false}
                        className={cn(
                            "h-7 min-w-0 flex-1 rounded-md border border-border-subtle bg-surface-1 px-2 text-xs text-text-primary",
                            "outline-none focus:border-border-strong placeholder:text-text-muted",
                        )}
                        aria-label="Preview URL"
                    />
                    <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-xs text-text-muted hover:text-text-primary"
                        disabled={loading}
                    >
                        Go
                    </Button>
                </form>

                <Tooltip content="Open in browser">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-text-muted hover:text-text-primary"
                        disabled={!currentUrl && !urlBar.trim()}
                        onClick={openExternal}
                    >
                        <Icon name="open_in_new" size={14} />
                    </Button>
                </Tooltip>
            </div>

            {error ? (
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle bg-surface-1 px-3 py-2 text-xs text-text-secondary">
                    <p className="min-w-0 flex-1 leading-relaxed">{error}</p>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 px-2 text-xs"
                        onClick={openExternal}
                    >
                        Open externally
                    </Button>
                </div>
            ) : null}

            <div className="relative min-h-0 flex-1 bg-editor">
                {iframeSrc ? (
                    <iframe
                        key={`${iframeSrc}::${reloadKey}`}
                        ref={iframeRef}
                        title="Local preview"
                        src={iframeSrc}
                        className="h-full w-full border-0 bg-white"
                        onLoad={onIframeLoad}
                        onError={onIframeError}
                        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"
                        referrerPolicy="no-referrer"
                    />
                ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-text-muted">
                        <Icon name="public" size={28} className="opacity-50" />
                        <p>Preview local sites here (localhost only).</p>
                        <p className="text-xs">
                            Enter a URL and press Go, or open Preview after your dev server starts.
                        </p>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-2 h-7 px-3 text-xs"
                            onClick={() => void navigatePreview(urlBar || "http://localhost:3000")}
                        >
                            Load {urlBar || "http://localhost:3000"}
                        </Button>
                    </div>
                )}
                {loading ? (
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 animate-pulse bg-accent" />
                ) : null}
            </div>
        </div>
    );
}
