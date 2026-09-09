"use client";

import { RiCloseLine, RiCrosshair2Line, RiEyeLine, RiRefreshLine } from "@remixicon/react";
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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
import type {
    DesignBridgeApi,
    DesignLayerNode,
    DesignSelectedElement,
} from "@/features/preview/design-mode/types";
import type { DesignExportPayload } from "@/features/preview/design-mode/export-file";
import { DesignInspectorPanel } from "@/features/preview/ui/design/inspector";
import { DesignSidebar } from "@/features/preview/ui/design/sidebar";
import { SidebarPanelHeaderFrame } from "@/features/panels/ui/sidebar-panel-header";
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

function useDesignPreview() {
    return useSyncExternalStore(
        subscribeDesignPreview,
        getDesignPreviewSnapshot,
        getDesignPreviewSnapshot,
    );
}

function ToolBtn({
    label,
    active,
    onClick,
    disabled,
    children,
}: {
    label: string;
    active?: boolean;
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
}) {
    return (
        <Tooltip content={label}>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={label}
                aria-pressed={active}
                disabled={disabled}
                onClick={onClick}
                className={cn(
                    "size-9 rounded-lg text-text-secondary",
                    active
                        ? "bg-accent-text-bg text-accent-text hover:bg-accent-text-bg hover:text-accent-text"
                        : "hover:bg-panel-hover hover:text-text-primary",
                )}
            >
                {children}
            </Button>
        </Tooltip>
    );
}

function DesignLoadingScreen({
    phase,
    onExit,
}: {
    phase: DesignPreviewPhase;
    onExit: () => void;
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
        <div className="absolute inset-0 z-20 flex flex-col bg-background">
            <div className="h-titlebar shrink-0" data-tauri-drag-region />
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
            <div className="pointer-events-none flex shrink-0 justify-center pb-6">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="pointer-events-auto rounded-full px-5"
                    onClick={onExit}
                >
                    Exit
                </Button>
            </div>
        </div>
    );
}


/**
 * Design Mode — full-bleed takeover. Loading is centered; no agent sidebar/chat chrome.
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
            if (data.type === "shape-design-ready") {
                setDesignReady(true);
                if (!getDesignModeState().enabled) return;
                postToFrame(iframeRef.current, {
                    type: "shape-design-enable",
                    inspect: getDesignModeState().inspect,
                    tool: "select",
                });
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

    return (
        <div
            className="absolute inset-0 z-50 flex min-h-0 w-full overflow-hidden bg-editor"
            role="main"
            aria-label="Design Mode"
        >
            {shellReady ? (
                <DesignSidebar
                    projectPath={project_path}
                    activePath={pagePath}
                    liveViews={liveViews}
                    onSelectPage={onSelectPage}
                    onSelectLayer={selectLayer}
                    onExit={handleClose}
                />
            ) : null}

            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-editor">
                {showLoading ? (
                    <DesignLoadingScreen
                        phase={preview.phase}
                        onExit={handleClose}
                    />
                ) : null}

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
                    <div className="absolute inset-0 z-20 flex flex-col bg-background">
                        <div className="h-titlebar shrink-0" data-tauri-drag-region />
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
                        <div className="pointer-events-none flex shrink-0 justify-center pb-6">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="pointer-events-auto rounded-full px-5"
                                onClick={handleClose}
                            >
                                Exit
                            </Button>
                        </div>
                    </div>
                ) : null}

                {showCanvas ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center">
                        <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border-subtle bg-panel p-1 shadow-sm">
                            <ToolBtn
                                label="Select"
                                active={design.inspect}
                                onClick={() => {
                                    setDesignTool("select");
                                    setDesignInspect(true);
                                    postToFrame(iframeRef.current, {
                                        type: "shape-design-enable",
                                        inspect: true,
                                        tool: "select",
                                    });
                                }}
                            >
                                <Icon icon={RiCrosshair2Line} />
                            </ToolBtn>
                            <ToolBtn
                                label="Interact"
                                active={!design.inspect}
                                onClick={() => {
                                    setDesignInspect(false);
                                    postToFrame(iframeRef.current, {
                                        type: "shape-design-inspect",
                                        enabled: false,
                                    });
                                }}
                            >
                                <Icon icon={RiEyeLine} />
                            </ToolBtn>
                            <div className="px-2 text-xs tabular-nums text-text-muted">
                                {pagePath.startsWith("view:") ? pagePath.slice(5) : pagePath}
                            </div>
                            <ToolBtn
                                label="Reload"
                                onClick={() => setReloadKey((k) => k + 1)}
                            >
                                <Icon icon={RiRefreshLine} />
                            </ToolBtn>
                            <ToolBtn label="Exit Design Mode" onClick={handleClose}>
                                <Icon icon={RiCloseLine} />
                            </ToolBtn>
                        </div>
                    </div>
                ) : null}
            </div>

            {shellReady ? (
                <aside className="flex w-70 shrink-0 flex-col border-l border-border-subtle bg-panel">
                    <SidebarPanelHeaderFrame title="Properties" />
                    <div className="min-h-0 flex-1 overflow-hidden">
                        <DesignInspectorPanel bridge={bridge} />
                    </div>
                </aside>
            ) : null}
        </div>
    );
}
