"use client";

import { RiAlertLine, RiCloseLine } from "@remixicon/react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { detectDevCommand } from "@/features/detection/lib/lib";
import {
    ensureBackgroundRun,
    getBackgroundRunCwd,
    getLastPreviewReadyUrl,
    subscribePreviewReady,
} from "@/features/terminal/background-run";
import { commands } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { discoverDesignPages, previewUrlForPage, type DesignPage } from "../lib/discover-routes";
import {
    getLastDevUrl,
    getPreviewCurrentUrl,
    navigatePreview,
    previewReload,
    resetPreviewState,
    usePreviewStore,
} from "../store";
import {
    DesignBottomToolbar,
    type DesignViewport,
} from "./bottom-toolbar";
import {
    DESIGN_BRIDGE_SCRIPT,
    type DesignElementSnapshot,
    type DesignLayerSnapshot,
} from "./bridge";
import { DesignLeftPanel } from "./left-panel";
import { DesignStylePanel } from "./style-panel";
import { DesignToolbar } from "./toolbar";

type SourceTarget = {
    file: string;
    tag: string;
    openingStart: number;
    openingEnd: number;
    nodeStart: number;
    nodeEnd: number;
    line: number;
    confidence: number;
};

function LoadingCanvas({ label, detail }: { label: string; detail: string }) {
    return (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-editor">
            <div className="flex flex-col items-center">
                <div className="relative size-24">
                    <motion.div
                        className="absolute inset-0 rounded-[28px] border border-accent/30"
                        animate={{ rotate: 360, borderRadius: ["28px", "48px", "28px"] }}
                        transition={{ duration: 4.2, ease: "linear", repeat: Infinity }}
                    />
                    <motion.div
                        className="absolute inset-3 rounded-full border border-text-muted/30"
                        animate={{ rotate: -360, scale: [0.88, 1.08, 0.88] }}
                        transition={{ duration: 3.1, ease: "easeInOut", repeat: Infinity }}
                    >
                        <motion.span
                            className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_18px_var(--accent)]"
                            animate={{ scale: [0.7, 1.25, 0.7] }}
                            transition={{ duration: 1.4, repeat: Infinity }}
                        />
                    </motion.div>
                    <motion.div
                        className="absolute inset-7.5 rounded-lg bg-accent/15 ring-1 ring-accent/50"
                        animate={{ rotate: [0, 90, 180, 270, 360] }}
                        transition={{ duration: 2.8, ease: "easeInOut", repeat: Infinity }}
                    />
                </div>
                <p className="mt-5 text-sm font-medium text-text-primary">{label}</p>
                <p className="mt-1 text-xs text-text-muted">{detail}</p>
            </div>
        </div>
    );
}

function joinProjectPath(root: string, relative: string) {
    const separator = root.includes("\\") ? "\\" : "/";
    return `${root.replace(/[/\\]+$/, "")}${separator}${relative.replace(/[/\\]/g, separator)}`;
}

export function DesignStudio({
    onClose,
    projectPath,
}: {
    onClose: () => void;
    projectPath: string;
}) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const { iframeSrc, reloadKey, urlBar, error } = usePreviewStore();
    const [designerRoot, setDesignerRoot] = useState(projectPath);
    const [framework, setFramework] = useState("");
    const [pages, setPages] = useState<DesignPage[]>([]);
    const [assets, setAssets] = useState<Array<{
        path: string;
        name: string;
        bytes: number;
        kind: "image" | "font" | "video";
    }>>([]);
    const [layers, setLayers] = useState<DesignLayerSnapshot[]>([]);
    const [selected, setSelected] = useState<DesignElementSnapshot | null>(null);
    const [target, setTarget] = useState<SourceTarget | null>(null);
    const [mappingError, setMappingError] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [booting, setBooting] = useState(true);
    const [saved, setSaved] = useState(true);
    const [viewport, setViewport] = useState<DesignViewport>("desktop");
    const [zoom, setZoom] = useState(100);

    const currentUrl = getPreviewCurrentUrl() || iframeSrc || urlBar;
    const activePage = useMemo(() => {
        if (!currentUrl) return "/";
        try {
            return new URL(currentUrl).pathname || "/";
        } catch {
            return "/";
        }
    }, [currentUrl]);
    const routeSource = pages.find((page) => page.path === activePage)?.source;

    const resolveElement = useCallback(
        async (element: DesignElementSnapshot) => {
            setMappingError(null);
            const matches = await commands.resolveDesignElement(designerRoot, {
                tag: element.tag,
                id: element.id,
                classes: element.classes,
                text: element.text,
                routeSource,
                sourceFile: element.source?.fileName,
                sourceLine: element.source?.lineNumber,
            });
            const best = matches[0] ?? null;
            if (!best) {
                setTarget(null);
                setMappingError("No safe source match. Shape will not guess.");
                return null;
            }
            if (matches[1] && matches[1].confidence === best.confidence) {
                setTarget(null);
                setMappingError("Multiple source elements match. Select a more specific child.");
                return null;
            }
            setTarget(best);
            return best;
        },
        [designerRoot, routeSource],
    );

    useEffect(() => {
        let cancelled = false;
        let unsubscribeReady = () => {};
        let opened = false;
        let opening: Promise<boolean> | null = null;
        setBooting(true);
        setReady(false);
        setLayers([]);
        setSelected(null);
        setTarget(null);
        resetPreviewState();
        void (async () => {
            try {
                const info = await commands.inspectDesignProject(projectPath);
                if (cancelled) return;
                setFramework(info.framework);
                setDesignerRoot(info.projectRoot);
                if (!info.supported) {
                    setMappingError("Design mode supports React + Vite, Next.js, Astro, and Remix.");
                    setBooting(false);
                    return;
                }
                const [discovered, projectAssets] = await Promise.all([
                    discoverDesignPages(info.projectRoot),
                    commands.listDesignAssets(info.projectRoot),
                ]);
                if (cancelled) return;
                setPages(discovered);
                setAssets(projectAssets);
                await commands.registerDesignBridge(DESIGN_BRIDGE_SCRIPT);
                if (cancelled) return;

                const dev = await detectDevCommand(info.projectRoot);
                if (!dev) {
                    setMappingError("No development command was found for this project.");
                    setBooting(false);
                    return;
                }

                const openWhenReachable = (url: string) => {
                    if (opened) return Promise.resolve(true);
                    if (opening) return opening;
                    opening = (async () => {
                        if (cancelled || !(await commands.probePreviewUrl(url))) return false;
                        opened = true;
                        await navigatePreview(url, { replace: true });
                        return true;
                    })().finally(() => {
                        opening = null;
                    });
                    return opening;
                };

                unsubscribeReady = subscribePreviewReady((url) => {
                    void openWhenReachable(url);
                });

                const normalizePath = (value: string) =>
                    value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
                const runningHere =
                    getBackgroundRunCwd()
                    && normalizePath(getBackgroundRunCwd()!) === normalizePath(info.projectRoot);
                const existingUrl = runningHere ? getLastPreviewReadyUrl() : null;
                if (existingUrl && (await openWhenReachable(existingUrl))) return;

                await ensureBackgroundRun(dev.command, info.projectRoot);
                for (let attempt = 0; attempt < 60 && !cancelled && !opened; attempt += 1) {
                    const announced = getLastPreviewReadyUrl();
                    if (announced && (await openWhenReachable(announced))) break;
                    if (attempt >= 10 && (await openWhenReachable(dev.urlHint))) break;
                    await new Promise((resolve) => window.setTimeout(resolve, 500));
                }
                if (!cancelled && !opened) {
                    setMappingError(`The development server did not become ready at ${dev.urlHint}.`);
                    setBooting(false);
                }
            } catch (cause) {
                if (!cancelled) {
                    setMappingError(cause instanceof Error ? cause.message : String(cause));
                    setBooting(false);
                }
            }
        })();
        return () => {
            cancelled = true;
            unsubscribeReady();
        };
    }, [projectPath]);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (event.source !== iframeRef.current?.contentWindow) return;
            const data = event.data as {
                type?: string;
                element?: DesignElementSnapshot;
                layers?: DesignLayerSnapshot[];
                styles?: Record<string, string>;
                text?: string;
            };
            if (data.type === "shape-design-ready") {
                setReady(true);
                setBooting(false);
            } else if (data.type === "shape-design-tree" && Array.isArray(data.layers)) {
                setLayers(data.layers);
            } else if (data.type === "shape-design-selection" && data.element) {
                setSelected(data.element);
                void resolveElement(data.element);
            } else if (data.type === "shape-design-commit-styles" && data.element && data.styles) {
                setSelected(data.element);
                void (async () => {
                    const resolved = await resolveElement(data.element!);
                    if (!resolved) return;
                    setSaved(false);
                    try {
                        await commands.applyDesignSourcePatch({
                            projectPath: designerRoot,
                            target: resolved,
                            styles: data.styles,
                        });
                        await resolveElement(data.element!);
                    } catch (cause) {
                        setMappingError(cause instanceof Error ? cause.message : String(cause));
                    } finally {
                        setSaved(true);
                    }
                })();
            } else if (data.type === "shape-design-commit-text" && data.element) {
                void (async () => {
                    const resolved = await resolveElement(data.element!);
                    if (!resolved) return;
                    setSaved(false);
                    try {
                        await commands.applyDesignSourcePatch({
                            projectPath: designerRoot,
                            target: resolved,
                            text: data.text ?? "",
                        });
                    } catch (cause) {
                        setMappingError(cause instanceof Error ? cause.message : String(cause));
                    } finally {
                        setSaved(true);
                    }
                })();
            } else if (
                (data.type === "shape-design-delete" || data.type === "shape-design-duplicate")
                && data.element
            ) {
                void (async () => {
                    const resolved = await resolveElement(data.element!);
                    if (!resolved) return;
                    setSaved(false);
                    try {
                        await commands.applyDesignSourcePatch({
                            projectPath: designerRoot,
                            target: resolved,
                            operation: data.type === "shape-design-delete" ? "delete" : "duplicate",
                        });
                        setSelected(null);
                        setTarget(null);
                        setReady(false);
                        previewReload();
                    } catch (cause) {
                        setMappingError(cause instanceof Error ? cause.message : String(cause));
                    } finally {
                        setSaved(true);
                    }
                })();
            }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [designerRoot, resolveElement]);

    const previewStyles = useCallback((styles: Record<string, string>) => {
        iframeRef.current?.contentWindow?.postMessage(
            { type: "shape-design-apply-preview", styles },
            "*",
        );
        setSelected((current) =>
            current ? { ...current, styles: { ...current.styles, ...styles } } : current,
        );
    }, []);

    const commitStyles = useCallback(
        async (styles: Record<string, string>) => {
            if (!selected || !target) {
                setMappingError("Select an element with a unique source match first.");
                return;
            }
            setSaved(false);
            try {
                await commands.applyDesignSourcePatch({
                    projectPath: designerRoot,
                    target,
                    styles,
                });
                await resolveElement({ ...selected, styles: { ...selected.styles, ...styles } });
            } catch (cause) {
                setMappingError(cause instanceof Error ? cause.message : String(cause));
                previewReload();
            } finally {
                setSaved(true);
            }
        },
        [designerRoot, resolveElement, selected, target],
    );

    const openSource = useCallback(() => {
        if (!target) return;
        const fullPath = joinProjectPath(designerRoot, target.file);
        void commands.openFile(fullPath, target.file.split("/").pop() ?? target.file).then(onClose);
    }, [designerRoot, onClose, target]);

    const applyStructure = useCallback(
        async (operation: "delete" | "duplicate") => {
            if (!target) {
                setMappingError("Select an element with a unique source match first.");
                return;
            }
            setSaved(false);
            try {
                await commands.applyDesignSourcePatch({
                    projectPath: designerRoot,
                    target,
                    operation,
                });
                setSelected(null);
                setTarget(null);
                setReady(false);
                previewReload();
            } catch (cause) {
                setMappingError(cause instanceof Error ? cause.message : String(cause));
            } finally {
                setSaved(true);
            }
        },
        [designerRoot, target],
    );

    const changePage = useCallback(
        (path: string) => {
            const base = currentUrl || getLastDevUrl();
            if (!base) return;
            setReady(false);
            setSelected(null);
            setTarget(null);
            void navigatePreview(previewUrlForPage(base, path));
        },
        [currentUrl],
    );

    const canvasWidth =
        viewport === "mobile" ? 390 : viewport === "tablet" ? 768 : "100%";
    const selectedKey = selected?.key ?? null;

    return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-editor">
            <DesignToolbar
                onClose={onClose}
                projectPath={designerRoot}
                pages={pages}
                activePage={activePage}
                onPageChange={changePage}
                onReload={() => {
                    setReady(false);
                    previewReload();
                }}
                onOpenCode={openSource}
                saved={saved}
            />
            <div className="flex min-h-0 flex-1">
                <DesignLeftPanel
                    layers={layers}
                    selectedKey={selectedKey}
                    onSelectLayer={(key) => {
                        iframeRef.current?.contentWindow?.postMessage(
                            { type: "shape-design-select-key", key },
                            "*",
                        );
                    }}
                    pages={pages}
                    activePage={activePage}
                    onPageChange={changePage}
                    assets={assets}
                    projectRoot={designerRoot}
                />
                <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-editor">
                    <div className="relative min-h-0 flex-1 overflow-auto">
                    <div className="flex h-full min-h-90 min-w-full items-stretch justify-center p-5">
                        <div
                            className={cn(
                                "relative h-full min-h-80 overflow-hidden rounded-md border border-border bg-white shadow-lg transition-[width,transform] duration-300",
                            )}
                            style={{
                                width: canvasWidth,
                                maxWidth: "100%",
                                transform: `scale(${zoom / 100})`,
                                transformOrigin: "center center",
                            }}
                        >
                            {iframeSrc ? (
                                <iframe
                                    key={`${iframeSrc}:${reloadKey}`}
                                    ref={iframeRef}
                                    src={iframeSrc}
                                    title="Design canvas"
                                    className="h-full w-full border-0 bg-white"
                                    sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"
                                    referrerPolicy="no-referrer"
                                    onLoad={() => {
                                        window.setTimeout(() => {
                                            iframeRef.current?.contentWindow?.postMessage(
                                                { type: "shape-design-refresh" },
                                                "*",
                                            );
                                        }, 80);
                                    }}
                                />
                            ) : null}
                            {!ready || booting ? (
                                <LoadingCanvas
                                    label={
                                        error
                                            ? "Waiting for the development server"
                                            : !iframeSrc
                                              ? `Starting ${framework ? framework.replace("-", " + ") : "project"}`
                                              : "Preparing the canvas"
                                    }
                                    detail={
                                        iframeSrc
                                            ? "Mapping the live page to source"
                                            : "The preview will open automatically when it is ready"
                                    }
                                />
                            ) : null}
                        </div>
                    </div>
                    {mappingError ? (
                        <div className="absolute left-1/2 top-3 z-30 flex max-w-[min(520px,80%)] -translate-x-1/2 items-center gap-2 rounded-lg border border-border-secondary bg-surface-4/95 px-3 py-2 text-xs text-text-secondary shadow-lg backdrop-blur">
                            <Icon icon={RiAlertLine} className="text-warning" />
                            <span className="min-w-0 flex-1">{mappingError}</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Dismiss"
                                onClick={() => setMappingError(null)}
                            >
                                <Icon icon={RiCloseLine} />
                            </Button>
                        </div>
                    ) : null}
                    </div>
                    <div className="flex h-14 shrink-0 items-center justify-center border-t border-border bg-panel/40">
                    <DesignBottomToolbar
                        viewport={viewport}
                        onViewportChange={setViewport}
                        zoom={zoom}
                        onZoomChange={setZoom}
                        onUndo={() => {
                            void commands.undoDesignSourcePatch().then((changed) => {
                                if (changed) previewReload();
                            });
                        }}
                        onRedo={() => {
                            void commands.redoDesignSourcePatch().then((changed) => {
                                if (changed) previewReload();
                            });
                        }}
                        onCapture={() => {
                            if (ready && iframeSrc) {
                                void commands.capturePagePreview(iframeSrc).catch((cause) => {
                                    setMappingError(cause instanceof Error ? cause.message : String(cause));
                                });
                            }
                        }}
                        onOpenCode={openSource}
                        canCapture={ready && Boolean(iframeSrc)}
                        canOpenCode={Boolean(target)}
                    />
                    </div>
                </main>
                <DesignStylePanel
                    key={selectedKey ?? "empty"}
                    element={selected}
                    source={target ? { file: target.file, line: target.line } : null}
                    onPreview={previewStyles}
                    onCommit={(styles) => void commitStyles(styles)}
                    onOpenSource={openSource}
                    onDuplicate={() => void applyStructure("duplicate")}
                    onDelete={() => void applyStructure("delete")}
                />
            </div>
        </div>
    );
}
