"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ChromeBrowserIcon } from "@/components/ui/chrome-browser-icon";
import { Tooltip } from "@/components/ui/tooltip";
import { commands } from "@/lib/backend";
import { cn } from "@/lib/utils";
import {
    ensurePreviewLoaded,
    getLastDevUrl,
    getPreviewCurrentUrl,
    isLocalPreviewUrl,
    navigatePreview,
    previewBack,
    previewForward,
    previewReload,
    seedPreviewFromDevUrl,
    setPreviewUrlBar,
    usePreviewStore,
} from "@/features/preview/store";

function BrowserEmptyState({
    title,
    description,
    actionLabel,
    onAction,
}: {
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
}) {
    return (
        <div className="absolute inset-0 z-10 flex h-full flex-col items-center justify-center gap-3 bg-editor px-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-text-muted">
                <ChromeBrowserIcon size={28} />
            </div>
            <div className="max-w-sm space-y-1.5">
                <p className="text-sm font-medium text-text-primary">{title}</p>
                <p className="text-sm leading-relaxed text-text-muted">{description}</p>
            </div>
            {actionLabel && onAction ? (
                <Button type="button" variant="secondary" size="sm" className="mt-1" onClick={onAction}>
                    {actionLabel}
                </Button>
            ) : null}
        </div>
    );
}

/** Editor-hosted simple browser (activity bar → shape://browser). */
export function BrowserView() {
    const { history, index, urlBar, iframeSrc, reloadKey, error, loading } = usePreviewStore();
    const [frameFailed, setFrameFailed] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const canBack = index > 0;
    const canForward = index >= 0 && index < history.length - 1;
    const currentUrl = getPreviewCurrentUrl();

    useEffect(() => {
        seedPreviewFromDevUrl(getLastDevUrl());
        ensurePreviewLoaded();
    }, []);

    useEffect(() => {
        setFrameFailed(false);
    }, [iframeSrc, reloadKey]);

    const onSubmit = useCallback(
        (e?: React.FormEvent) => {
            e?.preventDefault();
            setFrameFailed(false);
            void navigatePreview(urlBar);
        },
        [urlBar],
    );

    const openExternal = useCallback(() => {
        const url = currentUrl || urlBar.trim();
        if (!url) return;
        void commands.openUrlExternal(url);
    }, [currentUrl, urlBar]);

    const showEmpty = !iframeSrc && !error && !frameFailed && !loading;
    const showError = Boolean(error) || frameFailed;
    const coverFrame = showEmpty || showError || loading;
    const errorTitle = useMemo(() => {
        if (frameFailed) return "Page unavailable";
        if (error) return "Couldn't load page";
        return "No page open";
    }, [error, frameFailed]);

    return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-editor font-sans">
            <div className="flex h-[36px] shrink-0 items-center gap-1 border-b border-border-subtle px-2">
                <Tooltip content="Back">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-text-muted hover:text-text-primary"
                        disabled={!canBack}
                        onClick={() => {
                            setFrameFailed(false);
                            previewBack();
                        }}
                    >
                        <Icon name="arrow_back" size={16} />
                    </Button>
                </Tooltip>
                <Tooltip content="Forward">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-text-muted hover:text-text-primary"
                        disabled={!canForward}
                        onClick={() => {
                            setFrameFailed(false);
                            previewForward();
                        }}
                    >
                        <Icon name="arrow_forward" size={16} />
                    </Button>
                </Tooltip>
                <Tooltip content="Reload">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-text-muted hover:text-text-primary"
                        disabled={!currentUrl}
                        onClick={() => {
                            setFrameFailed(false);
                            previewReload();
                        }}
                    >
                        <Icon name="refresh" size={16} />
                    </Button>
                </Tooltip>

                <form onSubmit={onSubmit} className="flex min-w-0 flex-1 items-center gap-1">
                    <div className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border-subtle bg-surface-1 px-2">
                        <ChromeBrowserIcon size={16} className="shrink-0 text-text-muted" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={urlBar}
                            onChange={(e) => setPreviewUrlBar(e.target.value)}
                            onFocus={(e) => e.currentTarget.select()}
                            placeholder="http://localhost:3000"
                            spellCheck={false}
                            className={cn(
                                "h-full min-w-0 flex-1 bg-transparent text-xs text-text-primary",
                                "outline-none placeholder:text-text-muted",
                            )}
                            aria-label="Browser URL"
                        />
                    </div>
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

                <Tooltip content="Open externally">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-text-muted hover:text-text-primary"
                        disabled={!currentUrl && !urlBar.trim()}
                        onClick={openExternal}
                    >
                        <Icon name="open_in_new" size={16} />
                    </Button>
                </Tooltip>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden bg-editor">
                {iframeSrc ? (
                    <iframe
                        key={`${iframeSrc}::${reloadKey}`}
                        ref={iframeRef}
                        title="Browser"
                        src={iframeSrc}
                        className={cn(
                            "absolute inset-0 h-full w-full border-0 bg-editor",
                            coverFrame && "invisible",
                        )}
                        onLoad={() => {
                            const frame = iframeRef.current;
                            if (!frame) return;
                            try {
                                const href = frame.contentWindow?.location?.href ?? "";
                                if (
                                    !href ||
                                    href === "about:blank" ||
                                    href.startsWith("chrome-error:") ||
                                    href.startsWith("edge://") ||
                                    href.includes("dnserror") ||
                                    href.includes("networkerror")
                                ) {
                                    setFrameFailed(true);
                                }
                            } catch {
                                /* cross-origin success is fine */
                            }
                        }}
                        onError={() => setFrameFailed(true)}
                        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"
                        referrerPolicy="no-referrer"
                    />
                ) : null}

                {showEmpty ? (
                    <BrowserEmptyState
                        title="No page open"
                        description="Enter a localhost URL to preview your app in Shape. Dev servers can also open here automatically."
                        actionLabel={`Load ${urlBar.trim() || "http://localhost:3000"}`}
                        onAction={() => void navigatePreview(urlBar.trim() || "http://localhost:3000")}
                    />
                ) : null}

                {showError ? (
                    <BrowserEmptyState
                        title={errorTitle}
                        description={
                            error ||
                            "This page couldn't be reached. Check the URL and that your server is running."
                        }
                        actionLabel="Try again"
                        onAction={() => {
                            setFrameFailed(false);
                            if (currentUrl) previewReload();
                            else void navigatePreview(urlBar.trim() || "http://localhost:3000");
                        }}
                    />
                ) : null}

                {loading && !showError ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-editor">
                        <p className="text-sm text-text-muted">Loading…</p>
                    </div>
                ) : null}

                {iframeSrc && isLocalPreviewUrl(iframeSrc) === false ? (
                    <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-md border border-border bg-panel px-2 py-1 text-xs text-text-muted shadow-sm">
                        Localhost URLs only
                    </div>
                ) : null}
            </div>
        </div>
    );
}
