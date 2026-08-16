"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
    recordPreviewLocation,
    seedPreviewFromDevUrl,
    setPreviewUrlBar,
    usePreviewStore,
} from "@/features/preview/store";
import { DESIGN_BRIDGE_SCRIPT } from "@/features/preview/design-mode/bridge-script";
import {
    setDesignBridgeApi,
    setDesignInspect,
    setDesignLayers,
    setDesignModeEnabled,
    setDesignPending,
    setDesignReady,
    setDesignSelected,
    setDesignSelection,
    setDesignTool,
    useDesignModeStore,
    getDesignModeState,
} from "@/features/preview/design-mode/store";
import {
    getHistorySession,
    historyKey,
    historyRedo,
    historyUndo,
    persistHistoryNow,
    restoreHistory,
} from "@/features/preview/design-mode/history";
import type { DesignBridgeApi, DesignLayerNode, DesignSelectedElement } from "@/features/preview/design-mode/types";
import { enrichSourceIdentity, isResolvedSource } from "@/features/preview/design-mode/source-identity";

function displayHost(raw: string) {
    try {
        const u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `http://${raw.trim()}`);
        return u.host;
    } catch {
        return raw.trim() || "this page";
    }
}

function BrowserErrorPage({
    host,
    code,
    onReload,
}: {
    host: string;
    code: string;
    onReload: () => void;
}) {
    return (
        <div
            className="absolute inset-0 z-10 overflow-auto bg-white"
            style={{ fontFamily: 'system-ui, "Segoe UI", sans-serif' }}
        >
            <div className="max-w-[640px] px-[72px] py-10">
                <h1 className="mb-4 text-[32px] font-normal leading-tight text-black">This site can&apos;t be reached</h1>
                <p className="mb-2 text-[15px] leading-relaxed text-[#5f6368]">
                    Check if there is a typo in <span className="font-bold text-black">{host}</span>.
                </p>
                <p className="mb-6 text-[15px] leading-relaxed text-[#5f6368]">If spelling is correct, try reloading the page.</p>
                <p className="mb-8 text-[12px] tracking-wide text-[#9aa0a6]">{code}</p>
                <button
                    type="button"
                    onClick={onReload}
                    className="rounded-[4px] bg-[#1a73e8] px-4 py-[7px] text-[13px] font-medium text-white hover:bg-[#1557b0]"
                >
                    Reload
                </button>
            </div>
        </div>
    );
}

function postToFrame(frame: HTMLIFrameElement | null, msg: Record<string, unknown>) {
    try {
        frame?.contentWindow?.postMessage({ source: "shape-design-host", ...msg }, "*");
    } catch {
        /* ignore */
    }
}

/** Editor-hosted simple browser (activity bar → shape://browser). */
export function BrowserView() {
    const { history, index, urlBar, iframeSrc, reloadKey, error, loading } = usePreviewStore();
    const design = useDesignModeStore();
    const [frameFailed, setFrameFailed] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const selectSeq = useRef(0);
    const replayOnceRef = useRef(false);
    const canBack = index > 0;
    const canForward = index >= 0 && index < history.length - 1;
    const currentUrl = getPreviewCurrentUrl();

    const frameSrc = iframeSrc;

    useEffect(() => {
        void commands.registerDesignBridge(DESIGN_BRIDGE_SCRIPT).catch(() => {
            /* web / older runtime */
        });
        seedPreviewFromDevUrl(getLastDevUrl());
        ensurePreviewLoaded();
        const start = getLastDevUrl() || urlBar.trim();
        if (start && !iframeSrc) void navigatePreview(start);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- open the current URL once
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

    const replayPending = useCallback((frame: HTMLIFrameElement | null) => {
        const session = getHistorySession();
        const pending = session?.pending?.length ? session.pending : getDesignModeState().pending;
        for (const edit of pending) {
            if (edit.styles && Object.keys(edit.styles).length) {
                postToFrame(frame, {
                    type: "shape-design-style",
                    id: edit.id,
                    selector: edit.selector,
                    styles: edit.styles,
                });
            }
            if (edit.text != null) {
                postToFrame(frame, {
                    type: "shape-design-content",
                    id: edit.id,
                    selector: edit.selector,
                    text: edit.text,
                });
            }
        }
    }, []);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            const data = event.data;
            if (!data || data.source !== "shape-design") return;
            if (data.type === "shape-design-ready") {
                setDesignReady(true);
                if (!getDesignModeState().enabled) return;
                postToFrame(iframeRef.current, {
                    type: "shape-design-enable",
                    inspect: getDesignModeState().inspect,
                    tool: getDesignModeState().tool,
                });
                if (replayOnceRef.current) {
                    replayOnceRef.current = false;
                    window.setTimeout(() => replayPending(iframeRef.current), 40);
                }
            }
            if (data.type === "shape-design-tree" && Array.isArray(data.nodes)) {
                setDesignLayers(data.nodes as DesignLayerNode[]);
            }
            if (data.type === "shape-design-selected") {
                const seq = ++selectSeq.current;
                const raw = (data.element as DesignSelectedElement | null) ?? null;
                if (!raw) {
                    setDesignSelected(null, !!data.additive);
                    return;
                }
                void (async () => {
                    let origin: string | undefined;
                    try {
                        origin = iframeSrc ? new URL(iframeSrc).origin : undefined;
                    } catch {
                        origin = undefined;
                    }
                    const source = await enrichSourceIdentity(origin, raw.source);
                    if (seq !== selectSeq.current) return;
                    const next = {
                        ...raw,
                        source,
                        editable: isResolvedSource(source),
                    };
                    setDesignSelected(next, !!data.additive);
                })();
            }
            if (data.type === "shape-design-area" && Array.isArray(data.elements)) {
                const els = data.elements as DesignSelectedElement[];
                setDesignSelection(data.additive ? [...getDesignModeState().selection, ...els] : els);
            }
            if (data.type === "shape-design-network") {
                window.dispatchEvent(new CustomEvent("shape-design-network", { detail: data }));
            }
            if (data.type === "shape-design-watch-hit") {
                void import("@/features/notifications").then(({ notify }) => {
                    notify.info("Element changed", "The watched element updated in the preview.");
                });
            }
            if (data.type === "shape-preview-location" && typeof data.href === "string") {
                recordPreviewLocation(data.href);
            }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [replayPending, iframeSrc]);

    const exitDesignMode = useCallback(() => {
        postToFrame(iframeRef.current, { type: "shape-design-disable" });
        void persistHistoryNow();
        setDesignModeEnabled(false);
    }, []);

    const toggleDesignMode = useCallback(async () => {
        if (design.enabled) {
            exitDesignMode();
            return;
        }
        const target = currentUrl || iframeSrc || urlBar.trim() || "http://localhost:3000";
        if (!isLocalPreviewUrl(target) && !target.startsWith("http://127.0.0.1")) {
            return;
        }
        window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "primary-sidebar", value: true } }));
        window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "secondary-sidebar", value: true } }));
        setDesignModeEnabled(true);
        try {
            const session = await restoreHistory(historyKey(target));
            if (session.pending.length) {
                setDesignPending(
                    session.pending.map((p) => ({
                        id: p.id,
                        selector: p.selector,
                        label: p.label,
                        styles: p.styles,
                        text: p.text,
                    })),
                );
            }
            replayOnceRef.current = getDesignModeState().pending.length > 0;
            postToFrame(iframeRef.current, {
                type: "shape-design-enable",
                inspect: getDesignModeState().inspect,
                tool: getDesignModeState().tool,
            });
        } catch (err) {
            console.error("[design-mode] failed to start", err);
            setDesignModeEnabled(false);
        }
    }, [currentUrl, design.enabled, exitDesignMode, iframeSrc, urlBar]);

    useEffect(() => {
        const onExit = () => {
            if (!getDesignModeState().enabled) return;
            exitDesignMode();
        };
        window.addEventListener("shape-design-exit", onExit);
        return () => window.removeEventListener("shape-design-exit", onExit);
    }, [exitDesignMode]);

    useEffect(() => {
        const onToggle = () => {
            void toggleDesignMode();
        };
        window.addEventListener("shape-toggle-design-mode", onToggle);
        return () => window.removeEventListener("shape-toggle-design-mode", onToggle);
    }, [toggleDesignMode]);

    useEffect(() => {
        const onTool = (e: Event) => {
            const tool = (e as CustomEvent<{ tool?: string }>).detail?.tool;
            if (tool !== "select" && tool !== "draw") return;
            setDesignTool(tool);
            postToFrame(iframeRef.current, { type: "shape-design-tool", tool });
        };
        window.addEventListener("shape-design-set-tool", onTool as EventListener);
        return () => {
            window.removeEventListener("shape-design-set-tool", onTool as EventListener);
        };
    }, []);

    const selectLayer = useCallback((id: string) => {
        postToFrame(iframeRef.current, { type: "shape-design-select", id });
    }, []);

    useEffect(() => {
        if (!design.enabled) return;
        const typing = (el: EventTarget | null) => {
            if (!(el instanceof HTMLElement)) return false;
            const tag = el.tagName;
            return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
        };
        const applyEntry = (entry: ReturnType<typeof historyUndo>, side: "before" | "after") => {
            if (!entry) return;
            const styles = side === "before" ? entry.before : entry.after;
            if (Object.keys(styles).length) {
                postToFrame(iframeRef.current, {
                    type: "shape-design-style",
                    id: entry.id,
                    selector: entry.selector,
                    styles,
                });
            }
            const text = side === "before" ? entry.textBefore : entry.textAfter;
            if (text != null) {
                postToFrame(iframeRef.current, {
                    type: "shape-design-content",
                    id: entry.id,
                    selector: entry.selector,
                    text,
                });
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "d") {
                e.preventDefault();
                void toggleDesignMode();
            }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
                e.preventDefault();
                const next = !design.inspect;
                setDesignInspect(next);
                postToFrame(iframeRef.current, { type: "shape-design-inspect", enabled: next });
            }
            if (e.key === "Escape") {
                setDesignSelected(null);
                postToFrame(iframeRef.current, { type: "shape-design-select", id: "" });
            }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing(e.target)) {
                e.preventDefault();
                if (e.shiftKey) applyEntry(historyRedo(), "after");
                else applyEntry(historyUndo(), "before");
            }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y" && !typing(e.target)) {
                e.preventDefault();
                applyEntry(historyRedo(), "after");
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [design.enabled, design.inspect, toggleDesignMode]);

    useEffect(() => {
        const api: DesignBridgeApi = {
            select: selectLayer,
            style: (id: string, styles: Record<string, string>, selector?: string) =>
                postToFrame(iframeRef.current, { type: "shape-design-style", id, styles, selector }),
            content: (id: string, text: string, selector?: string) =>
                postToFrame(iframeRef.current, { type: "shape-design-content", id, text, selector }),
            undo: () => postToFrame(iframeRef.current, { type: "shape-design-undo" }),
            redo: () => postToFrame(iframeRef.current, { type: "shape-design-redo" }),
            reset: () => postToFrame(iframeRef.current, { type: "shape-design-reset" }),
            inspect: (enabled: boolean) => {
                setDesignInspect(enabled);
                postToFrame(iframeRef.current, { type: "shape-design-inspect", enabled });
            },
            pause: (enabled: boolean, resumeAfterEdit?: boolean) =>
                postToFrame(iframeRef.current, { type: "shape-design-pause", enabled, resumeAfterEdit }),
            pseudo: (id: string, pseudo: string, enabled: boolean, selector?: string) =>
                postToFrame(iframeRef.current, { type: "shape-design-pseudo", id, selector, pseudo, enabled }),
            classToggle: (id: string, className: string, enabled: boolean, selector?: string) =>
                postToFrame(iframeRef.current, { type: "shape-design-class", id, selector, className, enabled }),
            watch: (id: string, enabled: boolean, selector?: string) =>
                postToFrame(iframeRef.current, { type: "shape-design-watch", id, selector, enabled }),
            emulateFocus: (enabled: boolean) =>
                postToFrame(iframeRef.current, { type: "shape-design-emulate-focus", enabled }),
        };
        setDesignBridgeApi(api);
        return () => setDesignBridgeApi(null);
    }, [selectLayer]);

    const showError = Boolean(error) || frameFailed;
    const coverFrame = showError;
    const netCode = error?.startsWith("ERR_")
        ? error
        : "ERR_CONNECTION_REFUSED";
    const netHost = displayHost(urlBar || currentUrl || "");

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

                <form onSubmit={onSubmit} className="flex min-w-0 flex-1 items-center">
                    <div className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border-subtle bg-surface-1 px-2">
                        <ChromeBrowserIcon size={14} className="shrink-0" />
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
                </form>

                <Tooltip content={design.enabled ? "Exit design mode" : "Design mode"}>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "h-7 w-7",
                            design.enabled ? "text-accent-text bg-accent-text-bg" : "text-text-muted hover:text-text-primary",
                        )}
                        disabled={!iframeSrc && !urlBar.trim()}
                        onClick={() => void toggleDesignMode()}
                    >
                        <Icon name="palette" size={16} />
                    </Button>
                </Tooltip>
                {design.enabled ? (
                    <Tooltip content={design.inspect ? "Select · Shift-drag region · Ctrl-click add (Ctrl+I to browse)" : "Interacting with page"}>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={cn(
                                "h-7 w-7",
                                design.inspect ? "text-accent-text" : "text-text-muted hover:text-text-primary",
                            )}
                            onClick={() => {
                                const next = !design.inspect;
                                setDesignInspect(next);
                                postToFrame(iframeRef.current, { type: "shape-design-inspect", enabled: next });
                            }}
                        >
                            <Icon name={design.inspect ? "colorize" : "visibility"} size={16} />
                        </Button>
                    </Tooltip>
                ) : null}

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
                {frameSrc ? (
                    <iframe
                        key={`${frameSrc}::${reloadKey}`}
                        ref={iframeRef}
                        title="Browser"
                        src={frameSrc}
                        className={cn(
                            "absolute inset-0 h-full w-full border-0 bg-editor",
                            coverFrame && "invisible",
                        )}
                        onLoad={() => {
                            const frame = iframeRef.current;
                            if (!frame) return;
                            if (design.enabled) {
                                postToFrame(frame, {
                                    type: "shape-design-enable",
                                    inspect: design.inspect,
                                    tool: design.tool,
                                });
                            }
                            window.setTimeout(() => {
                                try {
                                    const href = frame.contentWindow?.location?.href ?? "";
                                    if (
                                        href.startsWith("chrome-error:") ||
                                        href.startsWith("edge://") ||
                                        href.includes("dnserror") ||
                                        href.includes("networkerror")
                                    ) {
                                        setFrameFailed(true);
                                    } else if (href.startsWith("http")) {
                                        recordPreviewLocation(href);
                                    }
                                } catch {
                                    /* cross-origin success is fine */
                                }
                            }, 50);
                        }}
                        onError={() => setFrameFailed(true)}
                        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"
                        referrerPolicy="no-referrer"
                    />
                ) : null}

                {showError ? (
                    <BrowserErrorPage
                        host={netHost}
                        code={netCode}
                        onReload={() => {
                            setFrameFailed(false);
                            if (currentUrl) previewReload();
                            else void navigatePreview(urlBar.trim());
                        }}
                    />
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
