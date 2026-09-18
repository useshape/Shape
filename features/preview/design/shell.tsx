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
    sameProjectPath,
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
    DESIGN_BRIDGE_SCRIPT,
    type DesignElementSnapshot,
    type DesignLayerSnapshot,
} from "./bridge";
import { DesignDeploy } from "./deploy";
import { DEFAULT_DEVICE, type DesignDevice } from "./devices";
import { guessSourceFromChunkUrl, isUserSourcePath } from "./library";
import { DesignLeftPanel } from "./left-panel";
import { DesignStylePanel } from "./panel";
import type { ComponentOptionPatch } from "./panel/options";
import { DesignRail } from "./rail";
import { DragEdge } from "./resize";
import { DesignToolbar } from "./toolbar";
import type { DesignToolMode } from "./bottom-toolbar";

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

function LoadingCanvas({
    label,
    detail,
    failed,
    onPickPackage,
    onClose,
}: {
    label: string;
    detail: string;
    failed?: boolean;
    onPickPackage?: () => void;
    onClose?: () => void;
}) {
    return (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-editor">
            <div className="flex max-w-md flex-col items-center px-6 text-center">
                {!failed ? (
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
                ) : (
                    <Icon icon={RiAlertLine} className="size-10 text-warning" />
                )}
                <p className="mt-5 text-sm font-medium text-text-primary">{label}</p>
                <p className="mt-1 text-sm text-text-muted">{detail}</p>
                {failed ? (
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                        {onPickPackage ? (
                            <Button variant="secondary" size="sm" onClick={onPickPackage}>
                                Choose package.json
                            </Button>
                        ) : null}
                        {onClose ? (
                            <Button variant="ghost" size="sm" onClick={onClose}>
                                Close
                            </Button>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function joinProjectPath(root: string, relative: string) {
    const separator = root.includes("\\") ? "\\" : "/";
    return `${root.replace(/[/\\]+$/, "")}${separator}${relative.replace(/[/\\]/g, separator)}`;
}

function concatBytes(...chunks: Uint8Array[]) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

function jpegToPdf(jpeg: Uint8Array, width: number, height: number) {
    const encoder = new TextEncoder();
    const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q\n`;
    let body = encoder.encode("%PDF-1.4\n");
    const offsets: number[] = [];
    const push = (bytes: Uint8Array) => {
        offsets.push(body.length);
        body = concatBytes(body, bytes);
    };
    push(encoder.encode("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"));
    push(encoder.encode("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"));
    push(
        encoder.encode(
            `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >> endobj\n`,
        ),
    );
    push(encoder.encode(`4 0 obj << /Length ${content.length} >> stream\n${content}endstream\nendobj\n`));
    push(
        concatBytes(
            encoder.encode(
                `5 0 obj << /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >> stream\n`,
            ),
            jpeg,
            encoder.encode("\nendstream\nendobj\n"),
        ),
    );
    const xrefStart = body.length;
    let xref = `xref\n0 6\n0000000000 65535 f \n`;
    for (const offset of offsets) {
        xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
    }
    return concatBytes(
        body,
        encoder.encode(xref),
        encoder.encode(`trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`),
    );
}

function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Failed to decode export"));
        image.src = src;
    });
}

function loopbackPreviewUrl(raw: string): string {
    try {
        const url = new URL(raw.includes("://") ? raw : `http://${raw}`);
        if (
            url.hostname === "localhost"
            || url.hostname === "0.0.0.0"
            || url.hostname === "[::1]"
            || url.hostname === "::1"
        ) {
            url.hostname = "127.0.0.1";
        }
        return url.toString();
    } catch {
        return raw;
    }
}

export function DesignStudio({
    onClose,
    projectPath,
}: {
    onClose: () => void;
    projectPath: string;
}) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const { iframeSrc, reloadKey, urlBar } = usePreviewStore();
    const [bootRoot, setBootRoot] = useState(projectPath);
    const [designerRoot, setDesignerRoot] = useState(projectPath);
    const [framework, setFramework] = useState("");
    const [pages, setPages] = useState<DesignPage[]>([]);
    const [assets, setAssets] = useState<Array<{
        path: string;
        name: string;
        bytes: number;
        kind: "image" | "font" | "video" | "vector" | "style" | "component" | "code";
    }>>([]);
    const [layers, setLayers] = useState<DesignLayerSnapshot[]>([]);
    const [selected, setSelected] = useState<DesignElementSnapshot | null>(null);
    const [target, setTarget] = useState<SourceTarget | null>(null);
    const [mappingError, setMappingError] = useState<string | null>(null);
    const [bootError, setBootError] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [booting, setBooting] = useState(true);
    const [saved, setSaved] = useState(true);
    const [zoom, setZoom] = useState(100);
    const [toolMode, setToolMode] = useState<DesignToolMode>("select");
    const [device, setDevice] = useState<DesignDevice>(DEFAULT_DEVICE);
    const [leftWidth, setLeftWidth] = useState(240);
    const [rightWidth, setRightWidth] = useState(400);
    const [deployOpen, setDeployOpen] = useState(false);
    const [themeTokens, setThemeTokens] = useState<Array<{ name: string; value: string }>>([]);
    const bridgeSynced = useRef(false);

    useEffect(() => {
        setBootRoot(projectPath);
    }, [projectPath]);

    const currentUrl = getPreviewCurrentUrl() || iframeSrc || urlBar;
    const activePage = useMemo(() => {
        if (!currentUrl) return "/";
        try {
            return new URL(currentUrl).pathname || "/";
        } catch {
            return "/";
        }
    }, [currentUrl]);

    const resolveElement = useCallback(
        async (element: DesignElementSnapshot) => {
            if (!element.source?.fileName) {
                setTarget(null);
                return null;
            }
            let fileName = element.source.fileName;
            let lineNumber = element.source.lineNumber;
            let columnNumber = element.source.columnNumber;
            if (!isUserSourcePath(fileName)) {
                const guessed = guessSourceFromChunkUrl(fileName, designerRoot);
                if (!guessed) {
                    setTarget(null);
                    return null;
                }
                fileName = guessed.fileName;
                lineNumber = lineNumber || guessed.lineNumber;
                columnNumber = columnNumber || guessed.columnNumber;
            }
            const matches = await commands.resolveDesignElement(designerRoot, {
                tag: element.tag,
                id: element.id,
                classes: element.classes,
                text: element.text || null,
                sourceFile: fileName,
                sourceLine: lineNumber,
                sourceColumn: columnNumber,
            });
            const next = matches[0] ?? null;
            setTarget(next);
            return next;
        },
        [designerRoot],
    );

    useEffect(() => {
        let cancelled = false;
        let unsubscribeReady = () => {};
        let opened = false;
        let opening: Promise<boolean> | null = null;
        setBooting(true);
        setReady(false);
        setBootError(null);
        setLayers([]);
        setSelected(null);
        setTarget(null);
        setThemeTokens([]);
        resetPreviewState();
        void (async () => {
            try {
                const info = await commands.inspectDesignProject(bootRoot);
                if (cancelled) return;
                setFramework(info.framework);
                setDesignerRoot(info.projectRoot);
                if (!info.supported) {
                    setBootError("Design mode supports React + Vite, Next.js, Astro, and Remix.");
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

                const detected = await detectDevCommand(info.projectRoot);
                if (!detected) {
                    setBootError("No development command was found for this project.");
                    setBooting(false);
                    return;
                }
                const dev = detected;

                const openWhenReachable = (url: string) => {
                    if (opened) return Promise.resolve(true);
                    if (opening) return opening;
                    opening = (async () => {
                        if (cancelled || !(await commands.probePreviewUrl(url))) return false;
                        opened = true;
                        // Load the scraped URL directly — WebView2 injects the bridge into iframes.
                        await navigatePreview(loopbackPreviewUrl(url), { replace: true });
                        return true;
                    })().finally(() => {
                        opening = null;
                    });
                    return opening;
                };

                unsubscribeReady = subscribePreviewReady((url) => {
                    void openWhenReachable(loopbackPreviewUrl(url));
                });

                const runningHere =
                    Boolean(getBackgroundRunCwd())
                    && sameProjectPath(getBackgroundRunCwd()!, info.projectRoot);
                const existingUrl = runningHere ? getLastPreviewReadyUrl() : null;
                // Prefer the URL scraped from the terminal (actual bound port).
                if (existingUrl && (await openWhenReachable(loopbackPreviewUrl(existingUrl)))) {
                    /* opened */
                } else {
                    await ensureBackgroundRun(dev.command, info.projectRoot);
                    for (let attempt = 0; attempt < 60 && !cancelled && !opened; attempt += 1) {
                        const announced = getLastPreviewReadyUrl();
                        if (announced && (await openWhenReachable(loopbackPreviewUrl(announced)))) {
                            break;
                        }
                        if (attempt >= 10) {
                            const hint = loopbackPreviewUrl(dev.urlHint);
                            if (await openWhenReachable(hint)) break;
                        }
                        await new Promise((resolve) => window.setTimeout(resolve, 500));
                    }
                }

                if (!cancelled && !opened) {
                    setBootError(`Could not start the preview at ${dev.urlHint}.`);
                    setBooting(false);
                }
            } catch (cause) {
                if (!cancelled) {
                    setBootError(cause instanceof Error ? cause.message : String(cause));
                    setBooting(false);
                }
            }
        })();
        return () => {
            cancelled = true;
            unsubscribeReady();
        };
    }, [bootRoot]);

    useEffect(() => {
        if (!ready || bridgeSynced.current) return;
        bridgeSynced.current = true;
        void commands.registerDesignBridge(DESIGN_BRIDGE_SCRIPT).then(() => {
            previewReload();
        });
    }, [ready]);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (event.source !== iframeRef.current?.contentWindow) return;
            const data = event.data as {
                type?: string;
                element?: DesignElementSnapshot;
                layers?: DesignLayerSnapshot[];
                styles?: Record<string, string>;
                text?: string;
                attributes?: Record<string, string>;
                themeTokens?: Array<{ name: string; value: string }>;
            };
            if (data.type === "shape-design-ready") {
                setReady(true);
                setBooting(false);
                if (Array.isArray(data.themeTokens)) setThemeTokens(data.themeTokens);
            } else if (data.type === "shape-design-tree" && Array.isArray(data.layers)) {
                setLayers(data.layers);
            } else if (data.type === "shape-design-selection") {
                if (data.element) {
                    setSelected(data.element);
                    void resolveElement(data.element);
                } else {
                    setSelected(null);
                    setTarget(null);
                }
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
                        setMappingError(null);
                    } catch (cause) {
                        setMappingError(
                            cause instanceof Error ? cause.message : String(cause),
                        );
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
                        setMappingError(null);
                    } catch (cause) {
                        setMappingError(
                            cause instanceof Error ? cause.message : String(cause),
                        );
                    } finally {
                        setSaved(true);
                    }
                })();
            } else if (data.type === "shape-design-commit-attr" && data.element && data.attributes) {
                void (async () => {
                    const resolved = await resolveElement(data.element!);
                    if (!resolved) return;
                    setSaved(false);
                    try {
                        await commands.applyDesignSourcePatch({
                            projectPath: designerRoot,
                            target: resolved,
                            attributes: data.attributes,
                        });
                        setMappingError(null);
                    } catch (cause) {
                        setMappingError(
                            cause instanceof Error ? cause.message : String(cause),
                        );
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
                    } catch {
                        previewReload();
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
        const frame = iframeRef.current?.contentWindow;
        const key = selected?.key;
        if (frame) {
            frame.postMessage(
                { type: "shape-design-apply-preview", styles, key },
                "*",
            );
        }
        setSelected((current) =>
            current ? { ...current, styles: { ...current.styles, ...styles } } : current,
        );
    }, [selected?.key]);

    useEffect(() => {
        iframeRef.current?.contentWindow?.postMessage(
            { type: "shape-design-set-mode", mode: toolMode, projectRoot: designerRoot },
            "*",
        );
    }, [toolMode, ready, iframeSrc, designerRoot]);

    useEffect(() => {
        if (!ready) return;
        iframeRef.current?.contentWindow?.postMessage(
            { type: "shape-design-config", projectRoot: designerRoot },
            "*",
        );
    }, [ready, designerRoot, iframeSrc]);

    const undoDesign = useCallback(() => {
        void commands.undoDesignSourcePatch().then((changed) => {
            if (changed) previewReload();
        });
    }, []);

    const redoDesign = useCallback(() => {
        void commands.redoDesignSourcePatch().then((changed) => {
            if (changed) previewReload();
        });
    }, []);

    const commitStyles = useCallback(
        async (styles: Record<string, string>) => {
            const current = selected;
            if (!current) return;
            // Keep the canvas updated even if source mapping fails.
            iframeRef.current?.contentWindow?.postMessage(
                { type: "shape-design-apply-preview", styles, key: current.key },
                "*",
            );
            const resolved = target ?? (await resolveElement(current));
            if (!resolved) return;
            setSaved(false);
            try {
                await commands.applyDesignSourcePatch({
                    projectPath: designerRoot,
                    target: resolved,
                    styles,
                });
                setMappingError(null);
            } catch (cause) {
                setMappingError(
                    cause instanceof Error ? cause.message : String(cause),
                );
            } finally {
                setSaved(true);
            }
        },
        [designerRoot, resolveElement, selected, target],
    );

    const patchComponent = useCallback((patch: ComponentOptionPatch) => {
        const frame = iframeRef.current?.contentWindow;
        if (!frame) return;
        setSelected((current) => {
            if (!current?.component) return current;
            const next = { ...current.component };
            if (patch.key === current.key) {
                if (patch.field === "open") next.open = Boolean(patch.value);
                if (patch.field === "label") next.label = String(patch.value);
                if (patch.field === "href" || patch.field === "src") next.href = String(patch.value);
                if (patch.field === "alt") next.label = String(patch.value);
            } else {
                next.items = next.items.map((item) => {
                    if (item.key !== patch.key) return item;
                    if (patch.field === "label") return { ...item, label: String(patch.value) };
                    if (patch.field === "href") return { ...item, href: String(patch.value) };
                    return item;
                });
            }
            return { ...current, component: next };
        });
        if (patch.field === "open") {
            frame.postMessage({ type: "shape-design-set-open", key: patch.key, open: Boolean(patch.value) }, "*");
            return;
        }
        if (patch.field === "label") {
            frame.postMessage({ type: "shape-design-set-text", key: patch.key, text: String(patch.value) }, "*");
            return;
        }
        const attr = patch.field === "alt" ? "alt" : patch.field === "src" ? "src" : "href";
        frame.postMessage(
            { type: "shape-design-set-attr", key: patch.key, name: attr, value: String(patch.value) },
            "*",
        );
    }, []);

    const openSource = useCallback(() => {
        if (!target) return;
        const fullPath = joinProjectPath(designerRoot, target.file);
        void commands.openFile(fullPath, target.file.split("/").pop() ?? target.file).then(onClose);
    }, [designerRoot, onClose, target]);

    const applyStructure = useCallback(
        async (operation: "delete" | "duplicate") => {
            const current = selected;
            const resolved = target ?? (current ? await resolveElement(current) : null);
            if (!resolved) return;
            setSaved(false);
            try {
                await commands.applyDesignSourcePatch({
                    projectPath: designerRoot,
                    target: resolved,
                    operation,
                });
                setSelected(null);
                setTarget(null);
                setReady(false);
                previewReload();
            } catch {
                previewReload();
            } finally {
                setSaved(true);
            }
        },
        [designerRoot, resolveElement, selected, target],
    );

    const exportSelection = useCallback(async (scale: number, format: string) => {
        const frame = iframeRef.current?.contentWindow;
        if (!frame) return;
        const requestId = crypto.randomUUID();
        const result = await new Promise<{ dataUrl?: string; width?: number; height?: number }>((resolve) => {
            const timer = window.setTimeout(() => {
                window.removeEventListener("message", onMessage);
                resolve({});
            }, 12_000);
            const onMessage = (event: MessageEvent) => {
                if (event.source !== frame) return;
                const data = event.data as {
                    type?: string;
                    requestId?: string;
                    dataUrl?: string;
                    width?: number;
                    height?: number;
                };
                if (data.type !== "shape-design-export-result" || data.requestId !== requestId) return;
                window.clearTimeout(timer);
                window.removeEventListener("message", onMessage);
                resolve(data);
            };
            window.addEventListener("message", onMessage);
            frame.postMessage({ type: "shape-design-export", requestId, scale }, "*");
        });
        if (!result.dataUrl) return;
        const image = await loadImage(result.dataUrl);
        const canvas = document.createElement("canvas");
        canvas.width = result.width || image.width;
        canvas.height = result.height || image.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        if (format === "jpg" || format === "pdf") {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(image, 0, 0);
        const mime =
            format === "jpg"
                ? "image/jpeg"
                : format === "webp"
                  ? "image/webp"
                  : format === "avif"
                    ? "image/avif"
                    : "image/png";
        const blob =
            (await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.92)))
            ?? (await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png")));
        if (!blob) return;
        let bytes = new Uint8Array(await blob.arrayBuffer());
        let ext = format === "jpg" ? "jpg" : format === "avif" ? "avif" : format;
        if (format === "pdf") {
            const jpeg =
                (await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92)));
            if (!jpeg) return;
            bytes = jpegToPdf(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height);
            ext = "pdf";
        } else if (blob.type === "image/png" && format !== "png") {
            ext = "png";
        }
        const { save } = await import("@tauri-apps/plugin-dialog");
        const path = await save({
            defaultPath: `export.${ext}`,
            filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
        });
        if (typeof path !== "string") return;
        await commands.saveFileBytes(path, Array.from(bytes));
    }, []);

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
        device.width === "fluid" ? "100%" : device.width;
    const canvasHeight =
        device.height === "fluid" ? "100%" : device.height;
    const selectedKey = selected?.key ?? null;
    const showPanels = ready && !bootError;
    const showBootOverlay = booting || !ready || Boolean(bootError);

    const pickPackageJson = useCallback(async () => {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selectedPath = await open({
            multiple: false,
            defaultPath: bootRoot,
            filters: [{ name: "package.json", extensions: ["json"] }],
        });
        if (typeof selectedPath !== "string") return;
        const base = selectedPath.replace(/[/\\][^/\\]+$/, "");
        if (!base || base === selectedPath) {
            setBootError("Pick a package.json file for the web app you want to preview.");
            return;
        }
        const name = selectedPath.replace(/^.*[/\\]/, "").toLowerCase();
        if (name !== "package.json") {
            setBootError("Pick a package.json file for the web app you want to preview.");
            return;
        }
        setBootError(null);
        setBootRoot(base);
    }, [bootRoot]);

    if (bootError && !iframeSrc) {
        return (
            <div className="relative h-full min-h-0 w-full overflow-hidden bg-editor">
                <LoadingCanvas
                    failed
                    label="Preview did not start"
                    detail={bootError}
                    onPickPackage={() => void pickPackageJson()}
                    onClose={onClose}
                />
            </div>
        );
    }

    return (
        <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-editor">
            {showPanels ? (
                <DesignToolbar
                    onClose={onClose}
                    projectPath={designerRoot}
                    pages={pages}
                    activePage={activePage}
                    onPageChange={changePage}
                    onDeploy={() => setDeployOpen(true)}
                    saved={saved}
                />
            ) : null}
            <div className="flex min-h-0 flex-1">
                {showPanels ? <DesignRail
                    mode={toolMode}
                    onModeChange={setToolMode}
                    onCaptureElement={() => { void exportSelection(2, "png"); }}
                    onCaptureScreen={() => {
                        if (ready && iframeSrc) {
                            void commands.capturePagePreview(iframeSrc).catch(() => {});
                        }
                    }}
                    canCapture={ready && Boolean(iframeSrc)}
                    canCaptureElement={Boolean(selected)}
                /> : null}
                {showPanels ? (
                    <div className="relative h-full shrink-0" style={{ width: leftWidth }}>
                        <DesignLeftPanel
                            layers={layers}
                            selectedKey={selectedKey}
                            onSelectLayer={(key) => {
                                iframeRef.current?.contentWindow?.postMessage(
                                    { type: "shape-design-select-key", key },
                                    "*",
                                );
                            }}
                            onChangeText={(key, text) => {
                                setLayers((current) =>
                                    current.map((layer) => (layer.key === key ? { ...layer, text } : layer)),
                                );
                                iframeRef.current?.contentWindow?.postMessage(
                                    { type: "shape-design-set-text", key, text },
                                    "*",
                                );
                            }}
                            pages={pages}
                            activePage={activePage}
                            onPageChange={changePage}
                            assets={assets}
                            themeTokens={themeTokens}
                            onOpenPath={(relative) => {
                                const fullPath = joinProjectPath(designerRoot, relative);
                                void commands.openFile(fullPath, relative.split("/").pop() ?? relative);
                            }}
                            onReload={() => {
                                setReady(false);
                                previewReload();
                            }}
                            onOpenCode={openSource}
                            canOpenCode={Boolean(target)}
                            selectedElement={selected}
                            onComponentPatch={patchComponent}
                        />
                        <DragEdge
                            side="right"
                            onDrag={(start, dx) => setLeftWidth(Math.min(420, Math.max(180, start + dx)))}
                        />
                    </div>
                ) : null}
                <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-editor">
                    <div className="h-full overflow-hidden">
                    <div
                        className={cn(
                            "flex h-full min-h-90 min-w-full items-stretch justify-center",
                            device.width !== "fluid" && showPanels && "p-5",
                        )}
                    >
                        <div
                            className="relative h-full min-h-80 overflow-hidden bg-white transition-[width,transform] duration-300"
                            style={{
                                width: showPanels ? canvasWidth : "100%",
                                height: showPanels ? canvasHeight : "100%",
                                maxWidth: "100%",
                                maxHeight: "100%",
                                transform: showPanels ? `scale(${zoom / 100})` : undefined,
                                transformOrigin: "center center",
                            }}
                        >
                            {iframeSrc ? (
                                <iframe
                                    key={`${iframeSrc}:${reloadKey}`}
                                    ref={iframeRef}
                                    src={iframeSrc}
                                    title="Design canvas"
                                    className="h-full w-full border-0 bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                            {showBootOverlay ? (
                                <LoadingCanvas
                                    failed={Boolean(bootError)}
                                    label={
                                        bootError
                                            ? "Preview did not start"
                                            : !iframeSrc
                                              ? `Starting ${framework ? framework.replace("-", " + ") : "project"}`
                                              : "Preparing the canvas"
                                    }
                                    detail={
                                        bootError
                                            ?? (iframeSrc
                                                ? "Mapping the live page to source"
                                                : "Waiting for the development server")
                                    }
                                    onPickPackage={bootError ? () => void pickPackageJson() : undefined}
                                    onClose={bootError ? onClose : undefined}
                                />
                            ) : null}
                        </div>
                    </div>
                    {mappingError ? (
                        <div className="absolute left-1/2 top-3 z-30 flex max-w-[min(520px,80%)] -translate-x-1/2 items-center gap-2 rounded-lg border border-border-secondary bg-surface-4/95 px-3 py-2 text-sm text-text-secondary shadow-lg backdrop-blur">
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
                </main>
                {showPanels ? (
                    <div className="relative h-full shrink-0 border-l border-border" style={{ width: rightWidth }}>
                        <DesignStylePanel
                            key={selectedKey ?? "empty"}
                            element={selected}
                            source={target ? { file: target.file, line: target.line } : null}
                            previewUrl={iframeSrc}
                            zoom={zoom}
                            onZoomChange={setZoom}
                            device={device}
                            onDeviceChange={setDevice}
                            onUndo={undoDesign}
                            onRedo={redoDesign}
                            onPreview={previewStyles}
                            onCommit={(styles: Record<string, string>) => void commitStyles(styles)}
                            onOpenSource={openSource}
                            onAlign={(alignment: "center" | "center-x" | "center-y") =>
                                iframeRef.current?.contentWindow?.postMessage(
                                    { type: "shape-design-align", alignment },
                                    "*",
                                )
                            }
                            onDuplicate={() => void applyStructure("duplicate")}
                            onDelete={() => void applyStructure("delete")}
                            onExport={exportSelection}
                            themeTokens={themeTokens}
                            onComponentPatch={patchComponent}
                            className="h-full w-full"
                        />
                        <DragEdge
                            side="left"
                            onDrag={(start, dx) => setRightWidth(Math.min(560, Math.max(280, start - dx)))}
                        />
                    </div>
                ) : null}
            </div>
            <DesignDeploy open={deployOpen} onClose={() => setDeployOpen(false)} projectPath={designerRoot} />
        </div>
    );
}
