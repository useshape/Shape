"use client";

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { commands, useProjectState } from "@/lib/backend";
import { navigatePreview, usePreviewStore } from "@/features/preview/store";
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
import {
    detectDevCommand,
    type DevCommandInfo,
} from "@/features/detection/lib/lib";
import { DESIGN_BRIDGE_SCRIPT } from "@/features/preview/design-mode/bridge-script";
import { HostedSidebarBack } from "@/features/agent/sidebar/hosted-nav";
import { WorkingDots } from "@/features/chat/ui/message/bubble";
import {
    designPhaseLabel,
    getDesignPreviewSnapshot,
    startDesignPreview,
    stopDesignPreview,
    subscribeDesignPreview,
    type DesignPreviewPhase,
} from "@/features/preview/design-preview-session";

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

function DesignLoadingScreen({ phase }: { phase: DesignPreviewPhase }) {
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
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-panel">
            <div className="flex items-center gap-3">
                <WorkingDots className="imsg-typing" />
                <div className="relative h-6 w-44 overflow-hidden">
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
 * Design Mode — opens straight into loading → live canvas.
 * No Recents home / custom design sidebar chrome.
 */
export function DesignStudio({
    onClose,
    navPortalTarget,
    sidebarExpanded = true,
}: {
    onClose: () => void;
    navPortalTarget?: HTMLElement | null;
    sidebarExpanded?: boolean;
}) {
    const { project_path } = useProjectState();
    const { iframeSrc, loading, error, reloadKey } = usePreviewStore();
    const design = useDesignModeStore();
    const preview = useDesignPreview();
    const [dev, setDev] = useState<DevCommandInfo | null>(null);
    const [bootError, setBootError] = useState<string | null>(null);
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
            void stopDesignPreview();
            startedFor.current = null;
        };
    }, []);

    useEffect(() => {
        void commands.registerDesignBridge(DESIGN_BRIDGE_SCRIPT).catch(() => {});
    }, []);

    // Detect start command, then auto-launch preview for the open project.
    useEffect(() => {
        if (!project_path) {
            setDev(null);
            setBootError("Open a project to use Design Mode.");
            return;
        }
        let cancelled = false;
        setBootError(null);
        void detectDevCommand(project_path).then((info) => {
            if (cancelled) return;
            setDev(info);
            if (!info) {
                setBootError("This project has no detectable web start script.");
                return;
            }
            if (
                startedFor.current === project_path
                && preview.phase !== "idle"
                && preview.phase !== "error"
            ) {
                return;
            }
            startedFor.current = project_path;
            void startDesignPreview(info.command, info.urlHint);
        });
        return () => {
            cancelled = true;
        };
        // Only re-run when the project changes — not on every preview phase tick.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project_path]);

    useEffect(() => {
        if (preview.phase !== "ready" || !preview.url || iframeSrc) return;
        let cancelled = false;
        let tries = 0;
        const tick = () => {
            if (cancelled || tries >= 10) return;
            tries += 1;
            void navigatePreview(preview.url!);
        };
        tick();
        const id = window.setInterval(tick, 1200);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, [preview.phase, preview.url, iframeSrc]);

    const showCanvas =
        preview.phase === "ready" && Boolean(iframeSrc) && !loading && !error;
    const showLoading =
        !bootError
        && preview.phase !== "error"
        && !error
        && (preview.phase === "idle"
            || preview.phase === "preparing"
            || preview.phase === "starting"
            || preview.phase === "compiling"
            || preview.phase === "almost"
            || (preview.phase === "ready" && (!iframeSrc || loading)));

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
        enableInspect();
        return () => setDesignModeEnabled(false);
    }, [showCanvas, enableInspect]);

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
    const showError = Boolean(bootError) || preview.phase === "error" || Boolean(error);
    const collapsed = Boolean(navPortalTarget) && !sidebarExpanded;

    const sidebarNav = (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <HostedSidebarBack
                label="Back"
                onBack={handleClose}
                collapsed={collapsed}
            />
        </div>
    );

    return (
        <div
            className="absolute inset-0 z-40 flex min-h-0 w-full overflow-hidden bg-panel"
            role="main"
            aria-label="Design Mode"
        >
            {navPortalTarget ? createPortal(sidebarNav, navPortalTarget) : null}

            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-2">
                {showLoading ? <DesignLoadingScreen phase={preview.phase} /> : null}

                {showCanvas ? (
                    <iframe
                        ref={iframeRef}
                        key={reloadKey}
                        title="Design preview"
                        src={iframeSrc ?? undefined}
                        className="h-full w-full border-0 bg-white"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                        onLoad={() => enableInspect()}
                    />
                ) : null}

                {showError && !showCanvas ? (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-panel px-8">
                        <p className="text-sm text-text-muted">
                            {bootError || preview.error || error || "Could not open preview"}
                        </p>
                        {dev ? (
                            <Button size="sm" onClick={retry}>
                                Try again
                            </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={handleClose}>
                            Exit Design Mode
                        </Button>
                    </div>
                ) : null}

                {showCanvas ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center">
                        <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-border-subtle bg-surface-1 p-1.5 shadow-sm">
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
                                <Icon name="colorize" size={16} />
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
                                <Icon name="visibility" size={16} />
                            </ToolBtn>
                            <div className="mx-1 h-6 w-px bg-border-subtle" />
                            <ToolBtn
                                label="Reload"
                                onClick={() => preview.url && void navigatePreview(preview.url)}
                            >
                                <Icon name="refresh" size={16} />
                            </ToolBtn>
                        </div>
                    </div>
                ) : null}
            </div>

            {showCanvas ? (
                <aside className="flex w-70 shrink-0 flex-col border-l border-border-subtle bg-surface-1">
                    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pt-2">
                        <DesignInspectorPanel bridge={bridge} />
                    </div>
                </aside>
            ) : null}
        </div>
    );
}
