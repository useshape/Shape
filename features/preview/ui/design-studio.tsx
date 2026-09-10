"use client";

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { commands, useProjectState } from "@/lib/backend";
import {
    getDesignBridge,
    getDesignModeState,
    setDesignBridgeApi,
    setDesignLayers,
    setDesignModeEnabled,
    setDesignReady,
    setDesignSelected,
    setDesignSelection,
    setDesignInspect,
    setDesignTool,
    useDesignModeStore,
} from "@/features/preview/design-mode/store";
import { designLog, DESIGN_LOG_SESSION, ingestDesignBridgeLog } from "@/features/preview/design-mode/log";
import type {
    DesignBridgeApi,
    DesignLayerNode,
    DesignSelectedElement,
} from "@/features/preview/design-mode/types";
import type { DesignExportPayload } from "@/features/preview/design-mode/export-file";
import { applyDesignHistory, DesignInspectorPanel } from "@/features/preview/ui/design/inspector";
import { DesignSidebar } from "@/features/preview/ui/design/sidebar";
import { DesignChrome } from "@/features/preview/ui/design/chrome";
import { DesignStylesSection } from "@/features/preview/ui/design/styles-section";
import {
    clampWidth,
    DESIGN_LEFT_MAX,
    DESIGN_LEFT_MIN,
    DESIGN_RIGHT_MAX,
    DESIGN_RIGHT_MIN,
    persistDesignLeftOpen,
    persistDesignLeftWidth,
    persistDesignRightOpen,
    persistDesignRightWidth,
    readDesignPanelPrefs,
} from "@/features/preview/ui/design/design-layout";
import { cn } from "@/lib/utils";
import { upsertDesignPending } from "@/features/preview/design-mode/store";
import { recordChange, setHistoryPending } from "@/features/preview/design-mode/history";
import type { DesignTextStyle } from "@/features/preview/ui/design/styles-model";
import {
    detectDevCommand,
    type DevCommandInfo,
} from "@/features/detection/lib/lib";
import { DESIGN_BRIDGE_SCRIPT } from "@/features/preview/design-mode/bridge-script";
import { WorkingDots } from "@/features/chat/ui/message/bubble";
import {
    designPhaseLabel,
    getDesignPreviewSnapshot,
    startDesignPreview,
    stopDesignPreview,
    subscribeDesignPreview,
    type DesignPreviewPhase,
} from "@/features/preview/design-preview-session";
import {
    previewUrlForPage,
    type DesignPage,
} from "@/features/preview/lib/discover-routes";
import {
    getProjectWarmSnapshot,
    warmProjectAnalysis,
} from "@/features/preview/lib/project-warm";
import { showPreviewUrl } from "@/features/preview/store";

function postToFrame(frame: HTMLIFrameElement | null, msg: Record<string, unknown>) {
    try {
        frame?.contentWindow?.postMessage({ source: "shape-design-host", ...msg }, "*");
    } catch {
        /* ignore */
    }
}

function replayDesignPending(frame: HTMLIFrameElement | null) {
    const pending = getDesignModeState().pending;
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
        if (edit.tokenUpdates) {
            for (const [name, value] of Object.entries(edit.tokenUpdates)) {
                postToFrame(frame, { type: "shape-design-set-var", name, value });
            }
        }
    }
}

function syncHistoryPending() {
    setHistoryPending(
        getDesignModeState().pending.map((p) => ({
            id: p.id,
            selector: p.selector,
            className: p.className,
            tag: p.tag,
            locateText: p.locateText,
            source: p.source,
            label: p.label,
            styles: Object.fromEntries(
                Object.entries(p.styles).filter(([, v]) => v != null),
            ) as Record<string, string>,
            text: p.text,
        })),
    );
}

function recordCanvasStyles(
    el: DesignSelectedElement,
    before: Record<string, string>,
    after: Record<string, string>,
) {
    recordChange({
        id: el.id,
        selector: el.selector,
        label: el.label,
        before,
        after,
    });
    syncHistoryPending();
}

function useDesignPreview() {
    return useSyncExternalStore(
        subscribeDesignPreview,
        getDesignPreviewSnapshot,
        getDesignPreviewSnapshot,
    );
}

function DesignLoadingScreen({
    phase,
}: {
    phase: DesignPreviewPhase;
}) {
    const label = designPhaseLabel(phase);
    const [shown, setShown] = useState(label);
    const [anim, setAnim] = useState<"in" | "out" | "enter">("in");

    useEffect(() => {
        const next = designPhaseLabel(phase);
        if (next === shown) return;
        setAnim("out");
        const t = window.setTimeout(() => {
            setShown(next);
            setAnim("enter");
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setAnim("in"));
            });
        }, 160);
        return () => window.clearTimeout(t);
    }, [phase, shown]);

    return (
        <div className="flex min-h-0 flex-1 items-center justify-center px-10">
            <div className="flex items-center gap-3">
                <WorkingDots className="imsg-typing" />
                <div className="relative h-6 w-40 overflow-hidden">
                    <span
                        className="absolute inset-x-0 top-0 text-sm font-medium text-text-secondary transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                        style={{
                            opacity: anim === "in" ? 1 : 0,
                            transform:
                                anim === "in"
                                    ? "translateY(0)"
                                    : anim === "out"
                                      ? "translateY(-8px)"
                                      : "translateY(8px)",
                        }}
                    >
                        {shown}…
                    </span>
                </div>
            </div>
        </div>
    );
}


/**
 * Design Mode — full-bleed canvas under a dedicated chrome bar.
 */
export function DesignStudio({ onClose }: { onClose: () => void }) {
    const { project_path } = useProjectState();
    const design = useDesignModeStore();
    const preview = useDesignPreview();
    const [dev, setDev] = useState<DevCommandInfo | null>(null);
    const [bootError, setBootError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [pagePath, setPagePath] = useState("/");
    const [frameSrc, setFrameSrc] = useState<string | null>(null);
    const [liveViews, setLiveViews] = useState<Array<{ label?: string; path?: string }>>([]);
    const [bridgeReady, setBridgeReady] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const startedFor = useRef<string | null>(null);
    const exportWaiters = useRef(
        new Map<string, { resolve: (v: DesignExportPayload) => void; reject: (e: Error) => void }>(),
    );
    const fontWaiters = useRef(new Map<string, (names: string[]) => void>());

    useEffect(() => {
        try {
            document.documentElement.dataset.designMode = "1";
        } catch {
            /* ignore */
        }
        return () => {
            try {
                delete document.documentElement.dataset.designMode;
            } catch {
                /* ignore */
            }
            // Do NOT stopDesignPreview here — Strict Mode remount was killing the
            // server before Ready. User Exit calls handleClose → stop.
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        void commands
            .registerDesignBridge(DESIGN_BRIDGE_SCRIPT)
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setBridgeReady(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Once Ready, load the real preview URL (proxy broke HMR + in-app page clicks).
    useEffect(() => {
        if (!bridgeReady) return;
        if (preview.phase !== "ready" || !preview.url) {
            setFrameSrc(null);
            return;
        }
        if (pagePath.startsWith("view:")) return;
        const src = previewUrlForPage(preview.url, pagePath);
        setFrameSrc(src);
        showPreviewUrl(src);
    }, [bridgeReady, preview.phase, preview.url, pagePath, reloadKey]);

    useEffect(() => {
        if (!project_path) {
            setDev(null);
            setBootError("Open a project to use Design Mode.");
            return;
        }
        let cancelled = false;
        setBootError(null);

        const boot = async () => {
            const warm =
                getProjectWarmSnapshot()?.path.replace(/\\/g, "/").toLowerCase()
                    === project_path.replace(/\\/g, "/").toLowerCase()
                    ? getProjectWarmSnapshot()
                    : await warmProjectAnalysis(project_path);
            if (cancelled) return;
            const info = warm?.dev ?? (await detectDevCommand(project_path));
            if (cancelled) return;
            setDev(info);
            if (!info) {
                setBootError("This project has no detectable web start script.");
                return;
            }
            // Already ready from a prior Design session — stay up.
            const snap = getDesignPreviewSnapshot();
            if (snap.phase === "ready" && snap.url) {
                startedFor.current = project_path;
                return;
            }
            // Already booting (Strict remount) — do not kill / respawn mid-start.
            // Use module snapshot, NOT the component ref (ref resets on remount).
            if (
                snap.command
                && (snap.phase === "preparing"
                    || snap.phase === "starting"
                    || snap.phase === "compiling"
                    || snap.phase === "almost")
            ) {
                startedFor.current = project_path;
                return;
            }
            startedFor.current = project_path;
            void startDesignPreview(info.command, info.urlHint);
        };

        const handle = window.setTimeout(() => {
            void boot();
        }, 50);

        return () => {
            cancelled = true;
            window.clearTimeout(handle);
        };
    }, [project_path]);

    const showCanvas = Boolean(frameSrc);
    const showLoading =
        !bootError
        && preview.phase !== "error"
        && !showCanvas
        && (preview.phase === "idle"
            || preview.phase === "preparing"
            || preview.phase === "starting"
            || preview.phase === "compiling"
            || preview.phase === "almost"
            || preview.phase === "ready");

    const onSelectPage = useCallback((page: DesignPage) => {
        if (page.kind === "view" || page.path.startsWith("view:")) {
            setPagePath(page.path);
            postToFrame(iframeRef.current, {
                type: "shape-design-open-view",
                label: page.label,
            });
            return;
        }
        setPagePath(page.path);
        try {
            const snap = getDesignPreviewSnapshot();
            const currentSrc = iframeRef.current?.src;
            if (snap.url && currentSrc) {
                const current = new URL(currentSrc);
                const next = new URL(previewUrlForPage(snap.url, page.path));
                if (current.origin === next.origin && current.pathname === next.pathname) {
                    postToFrame(iframeRef.current, {
                        type: "shape-design-open-view",
                        label: page.label,
                    });
                    return;
                }
            }
        } catch {
            /* fall through to reload */
        }
        setReloadKey((k) => k + 1);
        setDesignLayers([]);
        setDesignSelected(null);
    }, []);

    const enableInspect = useCallback(() => {
        setDesignModeEnabled(true);
        setDesignInspect(true);
        setDesignTool("select");
        designLog("INFO", "host:enable", { session: DESIGN_LOG_SESSION, surface: "design-studio" });
        postToFrame(iframeRef.current, {
            type: "shape-design-enable",
            inspect: true,
            tool: "select",
        });
    }, []);

    useEffect(() => {
        if (!showCanvas) {
            setDesignModeEnabled(false);
            return;
        }
        setDesignModeEnabled(true);
        setDesignInspect(true);
        setDesignTool("select");
        return () => setDesignModeEnabled(false);
    }, [showCanvas]);

    const selectLayer = useCallback((id: string) => {
        postToFrame(iframeRef.current, { type: "shape-design-select", id });
    }, []);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            const data = event.data;
            if (!data || data.source !== "shape-design") return;
            if (data.type === "shape-design-log") {
                ingestDesignBridgeLog(data);
                return;
            }
            if (data.type === "shape-design-ready") {
                setDesignReady(true);
                designLog("INFO", "host:bridge-ready", {
                    session: DESIGN_LOG_SESSION,
                    href: typeof data.href === "string" ? data.href : undefined,
                });
                if (!getDesignModeState().enabled) return;
                postToFrame(iframeRef.current, {
                    type: "shape-design-enable",
                    inspect: getDesignModeState().inspect,
                    tool: "select",
                });
                // HMR: reselect by source loc / selector, not only data-shape-id
                const prev = getDesignModeState().selected;
                if (prev) {
                    const sourceKey = prev.source
                        ? `${prev.source.fileName}:${prev.source.lineNumber}:${prev.source.columnNumber ?? 1}`
                        : undefined;
                    postToFrame(iframeRef.current, {
                        type: "shape-design-reselect",
                        id: prev.id,
                        selector: prev.selector,
                        sourceKey,
                    });
                }
                // Replay pending live styles after HMR / reload
                window.setTimeout(() => replayDesignPending(iframeRef.current), 40);
            }
            if (data.type === "shape-design-tree" && Array.isArray(data.nodes)) {
                setDesignLayers(data.nodes as DesignLayerNode[]);
            }
            if (data.type === "shape-design-pages" && Array.isArray(data.views)) {
                setLiveViews(data.views as Array<{ label?: string; path?: string }>);
            }
            if (data.type === "shape-design-selected") {
                setDesignSelected(data.element as DesignSelectedElement | null, !!data.additive);
            }
            if (data.type === "shape-design-area" && Array.isArray(data.elements)) {
                setDesignSelection(data.elements as DesignSelectedElement[]);
            }
            if (data.type === "shape-design-moved" && data.id) {
                const el = getDesignModeState().selected;
                if (el && el.id === data.id) {
                    const after = {
                        position: String(data.position || el.styles.position || "relative"),
                        left: String(data.left ?? el.styles.left),
                        top: String(data.top ?? el.styles.top),
                    };
                    const before = {
                        position: String(el.styles.position || "static"),
                        left: String(el.styles.left || "0px"),
                        top: String(el.styles.top || "0px"),
                    };
                    upsertDesignPending({
                        id: el.id,
                        tag: el.tag,
                        selector: el.selector,
                        className: el.className,
                        locateText: el.locateText,
                        source: el.source,
                        label: el.label,
                        styles: after,
                        inspect: el.inspect,
                    });
                    setDesignSelected({
                        ...el,
                        styles: { ...el.styles, ...after },
                    });
                    recordCanvasStyles(el, before, after);
                }
            }
            if (data.type === "shape-design-resized" && data.id) {
                const el = getDesignModeState().selected;
                if (el && el.id === data.id) {
                    const after = {
                        width: String(data.width ?? el.styles.width),
                        height: String(data.height ?? el.styles.height),
                    };
                    const before = {
                        width: String(el.styles.width || ""),
                        height: String(el.styles.height || ""),
                    };
                    upsertDesignPending({
                        id: el.id,
                        tag: el.tag,
                        selector: el.selector,
                        className: el.className,
                        locateText: el.locateText,
                        source: el.source,
                        label: el.label,
                        styles: after,
                        inspect: el.inspect,
                    });
                    setDesignSelected({
                        ...el,
                        styles: { ...el.styles, ...after },
                    });
                    recordCanvasStyles(el, before, after);
                }
            }
            if (data.type === "shape-design-reordered" && data.id) {
                const el = getDesignModeState().selected;
                if (el && el.id === data.id) {
                    upsertDesignPending({
                        id: el.id,
                        tag: el.tag,
                        selector: el.selector,
                        className: el.className,
                        locateText: el.locateText,
                        source: el.source,
                        label: el.label,
                        styles: {},
                        inspect: el.inspect,
                        siblingReorder: {
                            parentSelector: String(data.parentSelector || ""),
                            fromIndex: Number(data.fromIndex) || 0,
                            toIndex: Number(data.toIndex) || 0,
                        },
                    });
                    recordChange({
                        id: el.id,
                        selector: el.selector,
                        label: el.label,
                        before: { __reorder: String(data.fromIndex ?? 0) },
                        after: { __reorder: String(data.toIndex ?? 0) },
                    });
                    syncHistoryPending();
                }
            }
            if (data.type === "shape-design-text-edited" && data.id) {
                const el = getDesignModeState().selected;
                if (el && el.id === data.id) {
                    const text = String(data.text ?? "");
                    upsertDesignPending({
                        id: el.id,
                        tag: el.tag,
                        selector: el.selector,
                        className: el.className,
                        locateText: el.locateText,
                        source: el.source,
                        label: el.label,
                        styles: {},
                        text,
                        inspect: el.inspect,
                    });
                    recordChange({
                        id: el.id,
                        selector: el.selector,
                        label: el.label,
                        before: {},
                        after: {},
                        textBefore: el.text,
                        textAfter: text,
                    });
                    setDesignSelected({ ...el, text });
                    syncHistoryPending();
                }
            }
            if (data.type === "shape-design-fonts" && typeof data.req === "string") {
                const wait = fontWaiters.current.get(data.req);
                if (wait) {
                    fontWaiters.current.delete(data.req);
                    wait(Array.isArray(data.fonts) ? data.fonts : []);
                }
            }
            if (data.type === "shape-design-export" && typeof data.req === "string") {
                const wait = exportWaiters.current.get(data.req);
                if (!wait) return;
                exportWaiters.current.delete(data.req);
                if (data.error) wait.reject(new Error(String(data.error)));
                else wait.resolve(data as DesignExportPayload);
            }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, []);

    useEffect(() => {
        const api: DesignBridgeApi = {
            select: selectLayer,
            style: (id, styles, selector) =>
                postToFrame(iframeRef.current, { type: "shape-design-style", id, styles, selector }),
            content: (id, text, selector) =>
                postToFrame(iframeRef.current, { type: "shape-design-content", id, text, selector }),
            undo: () => postToFrame(iframeRef.current, { type: "shape-design-undo" }),
            redo: () => postToFrame(iframeRef.current, { type: "shape-design-redo" }),
            reset: () => postToFrame(iframeRef.current, { type: "shape-design-reset" }),
            inspect: (enabled) => {
                setDesignInspect(enabled);
                postToFrame(iframeRef.current, { type: "shape-design-inspect", enabled });
            },
            pause: (enabled, resumeAfterEdit) =>
                postToFrame(iframeRef.current, {
                    type: "shape-design-pause",
                    enabled,
                    resumeAfterEdit,
                }),
            pseudo: (id, pseudo, enabled, selector) =>
                postToFrame(iframeRef.current, {
                    type: "shape-design-pseudo",
                    id,
                    selector,
                    pseudo,
                    enabled,
                }),
            classToggle: (id, className, enabled, selector) =>
                postToFrame(iframeRef.current, {
                    type: "shape-design-class",
                    id,
                    selector,
                    className,
                    enabled,
                }),
            watch: (id, enabled, selector) =>
                postToFrame(iframeRef.current, {
                    type: "shape-design-watch",
                    id,
                    selector,
                    enabled,
                }),
            emulateFocus: (enabled) =>
                postToFrame(iframeRef.current, { type: "shape-design-emulate-focus", enabled }),
            listFonts: () =>
                new Promise<string[]>((resolve) => {
                    const req = `${Date.now().toString(36)}`;
                    fontWaiters.current.set(req, resolve);
                    postToFrame(iframeRef.current, { type: "shape-design-list-fonts", req });
                    window.setTimeout(() => {
                        if (!fontWaiters.current.has(req)) return;
                        fontWaiters.current.delete(req);
                        resolve([]);
                    }, 2000);
                }),
            injectFont: (family) =>
                postToFrame(iframeRef.current, { type: "shape-design-inject-font", family }),
            setCssVar: (name, value) =>
                postToFrame(iframeRef.current, { type: "shape-design-set-var", name, value }),
            reselect: (opts) =>
                postToFrame(iframeRef.current, { type: "shape-design-reselect", ...opts }),
            exportElement: (id, opts) =>
                new Promise((resolve, reject) => {
                    const req = `${Date.now().toString(36)}`;
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

    const handleClose = useCallback(() => {
        void stopDesignPreview();
        setFrameSrc(null);
        startedFor.current = null;
        onClose();
    }, [onClose]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [handleClose]);

    const retry = useCallback(() => {
        if (!dev || !project_path) return;
        startedFor.current = project_path;
        setBootError(null);
        void startDesignPreview(dev.command, dev.urlHint);
    }, [dev, project_path]);

    const bridge = getDesignBridge();
    const showError = Boolean(bootError) || preview.phase === "error";
    const shellReady = showCanvas && !showLoading;

    const prefs = useRef(readDesignPanelPrefs());
    const [leftOpen, setLeftOpen] = useState(prefs.current.leftOpen);
    const [rightOpen, setRightOpen] = useState(prefs.current.rightOpen);
    const [leftWidth, setLeftWidth] = useState(prefs.current.leftWidth);
    const [rightWidth, setRightWidth] = useState(prefs.current.rightWidth);
    const [resizing, setResizing] = useState<"left" | "right" | null>(null);
    const leftWidthRef = useRef(leftWidth);
    const rightWidthRef = useRef(rightWidth);
    leftWidthRef.current = leftWidth;
    rightWidthRef.current = rightWidth;

    useEffect(() => {
        if (!resizing) return;
        const onMove = (e: MouseEvent) => {
            if (resizing === "left") {
                const next = clampWidth(e.clientX, DESIGN_LEFT_MIN, DESIGN_LEFT_MAX);
                leftWidthRef.current = next;
                setLeftWidth(next);
            } else {
                const next = clampWidth(window.innerWidth - e.clientX, DESIGN_RIGHT_MIN, DESIGN_RIGHT_MAX);
                rightWidthRef.current = next;
                setRightWidth(next);
            }
        };
        const onUp = () => {
            if (resizing === "left") persistDesignLeftWidth(leftWidthRef.current);
            else persistDesignRightWidth(rightWidthRef.current);
            setResizing(null);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [resizing]);

    const toggleLeft = useCallback(() => {
        setLeftOpen((v) => {
            const next = !v;
            persistDesignLeftOpen(next);
            return next;
        });
    }, []);
    const toggleRight = useCallback(() => {
        setRightOpen((v) => {
            const next = !v;
            persistDesignRightOpen(next);
            return next;
        });
    }, []);

    const applyColorVar = useCallback(
        (cssVar: string) => {
            const el = getDesignModeState().selected;
            if (!el || !bridge) return;
            const isText = /^(h[1-6]|p|span|a|button|label|li|td|th)$/i.test(el.tag) || !!(el.text || "").trim();
            const styles: Record<string, string> = isText
                ? { color: `var(${cssVar})` }
                : { backgroundColor: `var(${cssVar})`, backgroundImage: "none" };
            bridge.style(el.id, styles, el.selector);
            upsertDesignPending({
                id: el.id,
                tag: el.tag,
                selector: el.selector,
                className: el.className,
                locateText: el.locateText,
                source: el.source,
                label: el.label,
                styles,
                inspect: el.inspect,
            });
        },
        [bridge],
    );

    const applyTextStyle = useCallback(
        (style: DesignTextStyle) => {
            const el = getDesignModeState().selected;
            if (!el || !bridge) return;
            const styles: Record<string, string> = {};
            if (style.vars.fontSize) styles.fontSize = `var(${style.vars.fontSize})`;
            if (style.vars.lineHeight) styles.lineHeight = `var(${style.vars.lineHeight})`;
            if (style.vars.fontWeight) styles.fontWeight = `var(${style.vars.fontWeight})`;
            if (style.vars.fontFamily) styles.fontFamily = `var(${style.vars.fontFamily})`;
            if (!Object.keys(styles).length) return;
            bridge.style(el.id, styles, el.selector);
            upsertDesignPending({
                id: el.id,
                tag: el.tag,
                selector: el.selector,
                className: el.className,
                locateText: el.locateText,
                source: el.source,
                label: el.label,
                styles,
                inspect: el.inspect,
            });
        },
        [bridge],
    );

    const handleSelectTool = useCallback(() => {
        setDesignTool("select");
        setDesignInspect(true);
        postToFrame(iframeRef.current, {
            type: "shape-design-enable",
            inspect: true,
            tool: "select",
        });
    }, []);

    const handleInteractTool = useCallback(() => {
        setDesignInspect(false);
        postToFrame(iframeRef.current, {
            type: "shape-design-inspect",
            enabled: false,
        });
    }, []);

    const pageLabel = pagePath.startsWith("view:") ? pagePath.slice(5) : pagePath;

    return (
        <div
            className="absolute inset-0 z-50 flex min-h-0 w-full flex-col overflow-hidden bg-editor"
            role="main"
            aria-label="Design Mode"
        >
            <DesignChrome
                pageLabel={shellReady ? pageLabel : undefined}
                inspect={design.inspect}
                toolsEnabled={shellReady}
                leftOpen={leftOpen}
                rightOpen={rightOpen}
                onToggleLeft={toggleLeft}
                onToggleRight={toggleRight}
                onBack={handleClose}
                onSelect={handleSelectTool}
                onInteract={handleInteractTool}
                onReload={() => setReloadKey((k) => k + 1)}
                onUndo={() => applyDesignHistory(bridge, "before")}
                onRedo={() => applyDesignHistory(bridge, "after")}
            />

            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                {shellReady ? (
                    <>
                        <div
                            style={{
                                width: leftOpen ? leftWidth : 0,
                                flex: "0 0 auto",
                            }}
                            className={cn(
                                "h-full overflow-hidden",
                                !resizing && "transition-[width] duration-200 ease-[var(--ease-out)]",
                            )}
                        >
                            <div style={{ width: leftWidth }} className="flex h-full">
                                <DesignSidebar
                                    projectPath={project_path}
                                    activePath={pagePath}
                                    liveViews={liveViews}
                                    onSelectPage={onSelectPage}
                                    onSelectLayer={selectLayer}
                                />
                            </div>
                        </div>
                        <div
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize left panel"
                            className={cn(
                                "group relative z-30 w-0 shrink-0",
                                !leftOpen && "pointer-events-none opacity-0",
                            )}
                            onMouseDown={(e) => {
                                if (!leftOpen) return;
                                e.preventDefault();
                                setResizing("left");
                            }}
                        >
                            <div className="absolute inset-y-0 -left-1.5 w-3 cursor-col-resize" />
                            <div className="pointer-events-none absolute inset-y-0 left-0 w-px transition-colors group-hover:bg-border-secondary group-active:bg-text-muted" />
                        </div>
                    </>
                ) : null}

                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-editor">
                    {showLoading ? <DesignLoadingScreen phase={preview.phase} /> : null}

                    {showCanvas ? (
                        <div className="relative min-h-0 w-full flex-1 overflow-hidden bg-editor">
                            <iframe
                                ref={iframeRef}
                                key={`${frameSrc}-${reloadKey}`}
                                title={`Design preview ${pagePath}`}
                                src={frameSrc ?? undefined}
                                className="absolute inset-0 h-full w-full border-0 bg-editor"
                                sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"
                                onLoad={() => enableInspect()}
                            />
                        </div>
                    ) : null}

                    {showError && !showCanvas ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8">
                            <p className="max-w-md whitespace-pre-wrap text-center text-sm text-text-muted">
                                {bootError || preview.error || "Could not open preview"}
                            </p>
                            {dev ? (
                                <Button size="sm" onClick={retry}>
                                    Try again
                                </Button>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                {shellReady ? (
                    <>
                        <div
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize right panel"
                            className={cn(
                                "group relative z-30 w-0 shrink-0",
                                !rightOpen && "pointer-events-none opacity-0",
                            )}
                            onMouseDown={(e) => {
                                if (!rightOpen) return;
                                e.preventDefault();
                                setResizing("right");
                            }}
                        >
                            <div className="absolute inset-y-0 -left-1.5 w-3 cursor-col-resize" />
                            <div className="pointer-events-none absolute inset-y-0 left-0 w-px transition-colors group-hover:bg-border-secondary group-active:bg-text-muted" />
                        </div>
                        <div
                            style={{
                                width: rightOpen ? rightWidth : 0,
                                flex: "0 0 auto",
                            }}
                            className={cn(
                                "h-full overflow-hidden",
                                !resizing && "transition-[width] duration-200 ease-[var(--ease-out)]",
                            )}
                        >
                            <aside
                                style={{ width: rightWidth }}
                                className="flex h-full flex-col border-l border-border-subtle bg-panel"
                            >
                                <div className="flex h-10 shrink-0 items-center border-b border-border-subtle px-4">
                                    <span className="text-sm font-medium text-text-primary">Properties</span>
                                </div>
                                <div className="min-h-0 flex-1 overflow-hidden">
                                    <DesignInspectorPanel bridge={bridge} />
                                </div>
                                <DesignStylesSection
                                    onApplyColorVar={applyColorVar}
                                    onApplyTextStyle={applyTextStyle}
                                />
                            </aside>
                        </div>
                    </>
                ) : null}
            </div>
        </div>
    );
}
