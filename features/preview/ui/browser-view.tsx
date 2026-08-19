"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ChromeBrowserIcon } from "@/components/ui/chrome-browser-icon";
import { Tooltip } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
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
    setDesignSelecting,
    setDesignTool,
    upsertDesignPending,
    useDesignModeStore,
    getDesignModeState,
} from "@/features/preview/design-mode/store";
import {
    getHistorySession,
    historyKey,
    historyRedo,
    historyUndo,
    persistHistoryNow,
    switchHistory,
    setHistoryPending,
    type HistorySession,
} from "@/features/preview/design-mode/history";
import type { DesignBridgeApi, DesignLayerNode, DesignPendingEdit, DesignSelectedElement } from "@/features/preview/design-mode/types";
import type { DesignExportPayload } from "@/features/preview/design-mode/export-file";
import { enrichSourceIdentity } from "@/features/preview/design-mode/identity";

type PreviewDevice = {
    id: string;
    label: string;
    icon: "monitor" | "smartphone" | "tablet";
    width: number | null;
    height: number | null;
    radius: number;
};

const PREVIEW_DEVICES: PreviewDevice[] = [
    { id: "full", label: "Full", icon: "monitor", width: null, height: null, radius: 0 },
    { id: "iphone-se", label: "iPhone SE", icon: "smartphone", width: 375, height: 667, radius: 14 },
    { id: "iphone-16", label: "iPhone 16", icon: "smartphone", width: 393, height: 852, radius: 16 },
    { id: "iphone-16-pro-max", label: "iPhone 16 Pro Max", icon: "smartphone", width: 440, height: 956, radius: 18 },
    { id: "pixel-8", label: "Pixel 8", icon: "smartphone", width: 412, height: 915, radius: 16 },
    { id: "galaxy-s24", label: "Galaxy S24", icon: "smartphone", width: 384, height: 824, radius: 16 },
    { id: "ipad-mini", label: "iPad mini", icon: "tablet", width: 744, height: 1133, radius: 12 },
    { id: "ipad-11", label: 'iPad 11"', icon: "tablet", width: 820, height: 1180, radius: 12 },
];

function displayHost(raw: string) {
    try {
        const u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `http://${raw.trim()}`);
        return u.host;
    } catch {
        return raw.trim() || "this page";
    }
}

function pendingSnapshot(): HistorySession["pending"] {
    return getDesignModeState().pending.map((p) => ({
        id: p.id,
        selector: p.selector,
        className: p.className,
        tag: p.tag,
        locateText: p.locateText,
        source: p.source,
        label: p.label,
        styles: Object.fromEntries(
            Object.entries(p.styles).filter(([, v]) => v != null && String(v).trim() !== ""),
        ) as Record<string, string>,
        text: p.text,
    }));
}

function pendingFromSession(pending: HistorySession["pending"]): DesignPendingEdit[] {
    return pending.map((p) => ({
        id: p.id,
        selector: p.selector,
        className: p.className,
        tag: p.tag,
        locateText: p.locateText,
        source: p.source,
        label: p.label,
        styles: p.styles,
        text: p.text,
    }));
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
            className="absolute inset-0 z-10 overflow-auto bg-editor"
            style={{ fontFamily: 'inter, "Segoe UI", sans-serif' }}
        >
            <div className="max-w-[640px] px-[92px] py-50">
                <h1 className="mb-4 text-2xl font-semibold text-text-primary">This site can&apos;t be reached</h1>
                <p className="mb-2 text-sm text-text-muted">
                    Check if there is a typo in <span className="font-semibold text-text-primary">{host}</span>.
                </p>
                <p className="mb-6 text-sm text-text-muted">If spelling is correct, try reloading the page.</p>
                <p className="mb-8 text-sm text-text-muted">{code}</p>
                <Button
                    onClick={onReload}
                    variant="secondary"
                    size="sm"
                >
                    Reload
                </Button>
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
    const exportWaiters = useRef(
        new Map<string, { resolve: (v: DesignExportPayload) => void; reject: (e: Error) => void }>(),
    );
    const fontWaiters = useRef(new Map<string, (names: string[]) => void>());
    const [previewDeviceId, setPreviewDeviceId] = useState("full");
    const previewDevice = PREVIEW_DEVICES.find((d) => d.id === previewDeviceId) ?? PREVIEW_DEVICES[0]!;
    const framed = previewDevice.width != null;
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
        const url = getPreviewCurrentUrl() || iframeSrc || urlBar.trim();
        const session = getHistorySession();
        if (url && session && session.key !== historyKey(url)) return;
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
    }, [iframeSrc, urlBar]);

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
                window.setTimeout(() => replayPending(iframeRef.current), 40);
            }
            if (data.type === "shape-design-export-result") {
                const waiter = exportWaiters.current.get(String(data.req || ""));
                if (!waiter) return;
                exportWaiters.current.delete(String(data.req || ""));
                if (data.error) waiter.reject(new Error(String(data.error)));
                else waiter.resolve(data as DesignExportPayload);
            }
            if (data.type === "shape-design-fonts") {
                const waiter = fontWaiters.current.get(String(data.req || ""));
                if (!waiter) return;
                fontWaiters.current.delete(String(data.req || ""));
                waiter(Array.isArray(data.fonts) ? (data.fonts as string[]) : []);
            }
            if (data.type === "shape-design-selecting") {
                setDesignSelecting(true);
            }
            if (data.type === "shape-design-mutated" && data.id && data.styles) {
                const state = getDesignModeState();
                const el = state.selection.find((s) => s.id === data.id) ?? (state.selected?.id === data.id ? state.selected : null);
                if (el) {
                    const styles = data.styles as Record<string, string>;
                    upsertDesignPending({
                        id: el.id,
                        tag: el.tag,
                        selector: el.selector,
                        className: el.className,
                        locateText: el.locateText,
                        source: el.source,
                        label: el.label,
                        styles,
                        text: el.text,
                        inspect: el.inspect,
                    });
                    setDesignSelected({ ...el, styles: { ...el.styles, ...styles } }, true);
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
                    const source = enrichSourceIdentity(raw.source);
                    if (seq !== selectSeq.current) return;
                    const next = {
                        ...raw,
                        source,
                        editable: true,
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
        setHistoryPending(pendingSnapshot());
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
        if (!design.enabled) return;
        const url = currentUrl || iframeSrc;
        if (!url) return;
        const key = historyKey(url);
        let cancelled = false;
        void (async () => {
            const session = await switchHistory(key, pendingSnapshot());
            if (cancelled) return;
            setDesignPending(pendingFromSession(session.pending));
            setDesignSelected(null);
            postToFrame(iframeRef.current, {
                type: "shape-design-enable",
                inspect: getDesignModeState().inspect,
                tool: getDesignModeState().tool,
            });
            window.setTimeout(() => {
                if (!cancelled) replayPending(iframeRef.current);
            }, 60);
        })();
        return () => {
            cancelled = true;
        };
    }, [currentUrl, design.enabled, iframeSrc, replayPending]);

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
            style: (id: string, styles: Record<string, string>, selector?: string) => {
                postToFrame(iframeRef.current, { type: "shape-design-style", id, styles, selector });
            },
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
            listFonts: () =>
                new Promise<string[]>((resolve) => {
                    const req = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
                    fontWaiters.current.set(req, resolve);
                    postToFrame(iframeRef.current, { type: "shape-design-list-fonts", req });
                    window.setTimeout(() => {
                        if (!fontWaiters.current.has(req)) return;
                        fontWaiters.current.delete(req);
                        resolve([]);
                    }, 2000);
                }),
            injectFont: (family: string) =>
                postToFrame(iframeRef.current, { type: "shape-design-inject-font", family }),
            exportElement: (id, opts) =>
                new Promise((resolve, reject) => {
                    const req = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
                    exportWaiters.current.set(req, { resolve, reject });
                    postToFrame(iframeRef.current, {
                        type: "shape-design-export",
                        req,
                        id,
                        selector: opts.selector,
                        format: opts.format,
                        scale: opts.scale,
                    });
                    window.setTimeout(() => {
                        if (!exportWaiters.current.has(req)) return;
                        exportWaiters.current.delete(req);
                        reject(new Error("Export timed out."));
                    }, 12000);
                }),
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

                {design.enabled ? (
                    <DropdownMenu>
                        <Tooltip content={previewDevice.label}>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-text-muted hover:text-text-primary"
                                    aria-label="Preview device"
                                >
                                    <Icon name={previewDevice.icon} size={16} />
                                </Button>
                            </DropdownMenuTrigger>
                        </Tooltip>
                        <DropdownMenuContent align="end" className="min-w-[220px]">
                            <DropdownMenuLabel>Preview size</DropdownMenuLabel>
                            {PREVIEW_DEVICES.map((device) => (
                                <DropdownMenuItem
                                    key={device.id}
                                    onSelect={() => setPreviewDeviceId(device.id)}
                                    className={cn(previewDeviceId === device.id && "bg-panel-hover")}
                                >
                                    <Icon name={device.icon} size={14} />
                                    <span className="flex-1">{device.label}</span>
                                    {device.width ? (
                                        <span className="text-[11px] text-text-muted">
                                            {device.width}×{device.height}
                                        </span>
                                    ) : null}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
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
                    <div
                        className={cn(
                            "flex h-full min-h-0 w-full justify-center",
                            framed ? "items-center overflow-auto bg-panel-hover p-4" : "w-full",
                        )}
                    >
                        <div
                            className={cn("relative min-h-0", framed ? "shrink-0 overflow-hidden bg-editor shadow-md" : "h-full w-full")}
                            style={
                                framed
                                    ? {
                                          width: previewDevice.width!,
                                          height: previewDevice.height!,
                                          maxWidth: "100%",
                                          maxHeight: "100%",
                                          borderRadius: previewDevice.radius,
                                      }
                                    : { width: "100%", height: "100%" }
                            }
                        >
                    <iframe
                        key={`${frameSrc}::${reloadKey}`}
                        ref={iframeRef}
                        title="Browser"
                        src={frameSrc}
                        className={cn(
                            "h-full w-full border-0 bg-editor",
                            !framed && "absolute inset-0",
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
                                window.setTimeout(() => replayPending(frame), 60);
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
                        </div>
                    </div>
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
