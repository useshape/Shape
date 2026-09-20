"use client";

import { RiAlertLine, RiCloseLine } from "@remixicon/react";
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
import { insertCssVariableInContent, setCachedGlobalsCssContent } from "@/lib/ui/css-variables";
import { invalidateGlobalsCssCache, resolveGlobalsCss } from "@/lib/ui/css-variables-loader";
import { cn } from "@/lib/utils";
import { discoverDesignPages, type DesignPage } from "../lib/discover-routes";
import {
    getPreviewCurrentUrl,
    inferPreviewUrlFromPerformance,
    isLocalPreviewUrl,
    navigatePreview,
    previewReload,
    recordPreviewLocation,
    resetPreviewState,
    setPreviewUrlBar,
    usePreviewStore,
} from "../store";
import {
    DESIGN_BRIDGE_SCRIPT,
    type DesignElementSnapshot,
    type DesignLayerSnapshot,
} from "./bridge";
import { DEFAULT_DEVICE, type DesignDevice } from "./devices";
import { guessSourceFromChunkUrl, isUserSourcePath, isUtilityClass } from "./library";
import { locateJsx, patchHtmlOpening, patchJsx, reorderJsx, isSafeDomAttribute } from "./jsx-source";
import { DesignStylePanel } from "./panel";
import type { ComponentOptionPatch } from "./panel/options";
import { DesignThemeContext } from "./panel/tokens";
import { DragEdge } from "./resize";
import { DesignToolbar, createBrowserTab, faviconFromUrl, pushTabUrl, tabTitleFromUrl, type BrowserTab } from "./toolbar";
import { DesignSelectionPrompt } from "./selection-prompt";
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

function CanvasLoadBar() {
    return <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 bg-accent animate-pulse" />;
}

function joinProjectPath(root: string, relative: string) {
    const separator = root.includes("\\") ? "\\" : "/";
    return `${root.replace(/[/\\]+$/, "")}${separator}${relative.replace(/[/\\]/g, separator)}`;
}

let persistQueue: Promise<void> = Promise.resolve();

function enqueuePersist<T>(work: () => Promise<T>): Promise<T> {
    const run = persistQueue.then(work, work);
    persistQueue = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
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
    onClose: _onClose,
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
    const [toolMode, setToolMode] = useState<DesignToolMode>("normal");
    const [tabs, setTabs] = useState<BrowserTab[]>([]);
    const [activeTabId, setActiveTabId] = useState("tab-1");
    const [promptOpen, setPromptOpen] = useState(false);
    const [device, setDevice] = useState<DesignDevice>(DEFAULT_DEVICE);
    const [rightWidth, setRightWidth] = useState(300);
    const [themeTokens, setThemeTokens] = useState<Array<{ name: string; value: string }>>([]);
    const injectedBridge = useRef("");
    const toolModeRef = useRef(toolMode);
    const designerRootRef = useRef(designerRoot);
    toolModeRef.current = toolMode;
    designerRootRef.current = designerRoot;

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

    useEffect(() => {
        if (tabs.length) return;
        const url = currentUrl || iframeSrc || "";
        if (!url) return;
        const tab = createBrowserTab(url);
        setTabs([tab]);
        setActiveTabId(tab.id);
    }, [currentUrl, iframeSrc, tabs.length]);

    const activeTabIdRef = useRef(activeTabId);
    activeTabIdRef.current = activeTabId;

    const applyTabLocation = useCallback((raw: string, meta?: { title?: string; favicon?: string | null }) => {
        if (!raw || !isLocalPreviewUrl(raw)) return;
        recordPreviewLocation(raw);
        const id = activeTabIdRef.current;
        setTabs((prev) =>
            prev.map((tab) => {
                if (tab.id !== id) return tab;
                const next = pushTabUrl(tab, raw);
                return {
                    ...next,
                    title: meta?.title?.trim() || next.title || tabTitleFromUrl(raw),
                    favicon: meta?.favicon || next.favicon || faviconFromUrl(raw),
                };
            }),
        );
    }, []);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            const data = event.data;
            if (!data || typeof data !== "object") return;
            if ((data as { type?: string }).type !== "shape-preview-navigate") return;
            const url = (data as { url?: string }).url;
            if (typeof url !== "string" || !url.trim()) return;
            applyTabLocation(url);
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [applyTabLocation]);

    useEffect(() => {
        if (typeof PerformanceObserver === "undefined") return;
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                const name = entry.name;
                if (!isLocalPreviewUrl(name)) continue;
                if (/\.(js|css|map|png|jpe?g|gif|svg|woff2?|ttf|ico)(\?|$)/i.test(name)) continue;
                const rt = entry as PerformanceResourceTiming;
                if (rt.initiatorType === "iframe" || rt.initiatorType === "other" || rt.initiatorType === "") {
                    applyTabLocation(name);
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
    }, [applyTabLocation]);

    const resolveElement = useCallback(
        async (element: DesignElementSnapshot) => {
            const files: string[] = [];
            const pushFile = (raw?: string | null) => {
                if (!raw) return;
                let fileName = raw;
                if (!isUserSourcePath(fileName)) {
                    const guessed = guessSourceFromChunkUrl(fileName, designerRoot);
                    if (!guessed) return;
                    fileName = guessed.fileName;
                }
                const normalized = fileName.replace(/\\/g, "/").replace(/^\.?\//, "");
                if (!normalized || !isUserSourcePath(normalized) || files.includes(normalized)) return;
                files.push(normalized);
            };
            pushFile(element.source?.fileName);
            const page = pages.find((item) => item.path === activePage);
            pushFile(page?.source);
            for (const item of pages) pushFile(item.source);

            const query = {
                tag: element.tag,
                classes: (element.classes || []).filter((name) => !isUtilityClass(name)).slice(0, 6),
                text: element.text || null,
                line: element.source?.lineNumber || null,
                column: element.source?.columnNumber || null,
            };
            if (!query.classes.length) query.classes = (element.classes || []).slice(0, 4);

            for (const file of files) {
                try {
                    const source = await commands.readFileFromDisk(joinProjectPath(designerRoot, file));
                    const hit = locateJsx(source, query);
                    if (!hit) continue;
                    const next = {
                        file,
                        tag: hit.tag,
                        openingStart: 0,
                        openingEnd: 1,
                        nodeStart: 0,
                        nodeEnd: 1,
                        line: hit.line,
                        confidence: 80,
                    };
                    setTarget(next);
                    return next;
                } catch {
                    /* try the next file */
                }
            }

            if (element.source?.fileName && isUserSourcePath(element.source.fileName)) {
                const matches = await commands.resolveDesignElement(designerRoot, {
                    tag: element.tag,
                    id: element.id,
                    classes: element.classes,
                    text: element.text || null,
                    sourceFile: element.source.fileName,
                    sourceLine: element.source.lineNumber,
                    sourceColumn: element.source.columnNumber,
                });
                const next = matches[0] ?? null;
                setTarget(next);
                return next;
            }
            setTarget(null);
            return null;
        },
        [activePage, designerRoot, pages],
    );

    const resolveInstance = useCallback(
        async (element: DesignElementSnapshot) => {
            const tag = element.component?.tag;
            if (!tag) return null;
            const files: string[] = [];
            const pushFile = (raw?: string | null) => {
                if (!raw) return;
                let fileName = raw;
                if (!isUserSourcePath(fileName)) {
                    const guessed = guessSourceFromChunkUrl(fileName, designerRoot);
                    if (!guessed) return;
                    fileName = guessed.fileName;
                }
                const normalized = fileName.replace(/\\/g, "/").replace(/^\.?\//, "");
                if (!normalized || !isUserSourcePath(normalized) || files.includes(normalized)) return;
                files.push(normalized);
            };
            pushFile(element.component?.source?.fileName);
            const page = pages.find((item) => item.path === activePage);
            pushFile(page?.source);
            for (const item of pages) pushFile(item.source);
            const query = {
                tag,
                line: element.component?.source?.lineNumber || null,
                column: element.component?.source?.columnNumber || null,
            };
            for (const file of files) {
                try {
                    const source = await commands.readFileFromDisk(joinProjectPath(designerRoot, file));
                    const hit = locateJsx(source, query);
                    if (!hit || hit.tag !== tag) continue;
                    return {
                        file,
                        tag: hit.tag,
                        openingStart: 0,
                        openingEnd: 1,
                        nodeStart: 0,
                        nodeEnd: 1,
                        line: hit.line,
                        confidence: 90,
                    };
                } catch {
                    /* next file */
                }
            }
            return null;
        },
        [activePage, designerRoot, pages],
    );

    const persistJsx = useCallback(
        async (
            element: DesignElementSnapshot,
            patch: { styles?: Record<string, string>; text?: string | null; attributes?: Record<string, string> },
            opts?: { instance?: boolean },
        ) => {
            return enqueuePersist(async () => {
                const instance =
                    Boolean(opts?.instance) ||
                    Boolean(
                        patch.attributes &&
                            element.component &&
                            Object.keys(patch.attributes).some(
                                (name) => !isSafeDomAttribute(element.tag, name),
                            ),
                    );
                const resolved = instance
                    ? await resolveInstance(element)
                    : await resolveElement(element);
                if (!resolved) {
                    throw new Error("Could not find this element in the project source.");
                }
                if (!isUserSourcePath(resolved.file)) {
                    throw new Error("Shape will not edit third-party or generated files.");
                }
                const abs = joinProjectPath(designerRoot, resolved.file);
                if (resolved.file.replace(/\\/g, "/").toLowerCase().endsWith(".astro")) {
                    if (instance) {
                        throw new Error("Could not find this element in the project source.");
                    }
                    const before = await commands.readFileFromDisk(abs);
                    let after = before;
                    if (patch.styles && Object.keys(patch.styles).length) {
                        after = patchHtmlOpening(before, resolved.openingStart, resolved.openingEnd, patch.styles);
                    }
                    if (patch.text != null || patch.attributes) {
                        await commands.applyDesignSourcePatch({
                            projectPath: designerRoot,
                            target: resolved,
                            text: patch.text,
                            attributes: patch.attributes,
                        });
                        commands.invalidateFileCache(abs);
                        return;
                    }
                    if (after === before) return;
                    await commands.applyDesignSourcePatch({
                        projectPath: designerRoot,
                        target: resolved,
                        content: after,
                    });
                    commands.primeFileCache(abs, after);
                    return;
                }
                const before = await commands.readFileFromDisk(abs);
                const after = patchJsx(
                    before,
                    instance
                        ? {
                              tag: element.component?.tag || resolved.tag,
                              line: element.component?.source?.lineNumber || resolved.line,
                              column: element.component?.source?.columnNumber || null,
                          }
                        : {
                              tag: element.tag,
                              classes: element.classes,
                              text: element.text || null,
                              line: resolved.line || element.source?.lineNumber || null,
                              column: element.source?.columnNumber || null,
                          },
                    patch,
                );
                if (after === before) return;
                await commands.applyDesignSourcePatch({
                    projectPath: designerRoot,
                    target: resolved,
                    content: after,
                });
                commands.primeFileCache(abs, after);
            });
        },
        [designerRoot, resolveElement, resolveInstance],
    );

    const persistReorder = useCallback(
        async (element: DesignElementSnapshot, before: DesignElementSnapshot | null) => {
            return enqueuePersist(async () => {
                const resolved = await resolveElement(element);
                if (!resolved) throw new Error("Could not find this element in the project source.");
                if (!isUserSourcePath(resolved.file)) {
                    throw new Error("Shape will not edit third-party or generated files.");
                }
                const abs = joinProjectPath(designerRoot, resolved.file);
                const source = await commands.readFileFromDisk(abs);
                const query = {
                    tag: element.tag,
                    classes: (element.classes || []).filter((name) => !isUtilityClass(name)).slice(0, 6),
                    text: element.text || null,
                    line: resolved.line || element.source?.lineNumber || null,
                    column: element.source?.columnNumber || null,
                };
                const beforeQuery = before
                    ? {
                          tag: before.tag,
                          classes: (before.classes || []).filter((name) => !isUtilityClass(name)).slice(0, 6),
                          text: before.text || null,
                          line: before.source?.lineNumber || null,
                          column: before.source?.columnNumber || null,
                      }
                    : null;
                const after = reorderJsx(source, query, beforeQuery);
                if (after === source) return;
                await commands.applyDesignSourcePatch({
                    projectPath: designerRoot,
                    target: resolved,
                    content: after,
                });
                commands.primeFileCache(abs, after);
            });
        },
        [designerRoot, resolveElement],
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
        if (!ready) return;
        if (injectedBridge.current === DESIGN_BRIDGE_SCRIPT) return;
        const first = injectedBridge.current === "";
        injectedBridge.current = DESIGN_BRIDGE_SCRIPT;
        void commands.registerDesignBridge(DESIGN_BRIDGE_SCRIPT).then(() => {
            if (!first) previewReload();
        });
    }, [ready]);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (event.source !== iframeRef.current?.contentWindow) return;
            const data = event.data as {
                type?: string;
                element?: DesignElementSnapshot;
                addToChat?: boolean;
                before?: DesignElementSnapshot | null;
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
                iframeRef.current?.contentWindow?.postMessage(
                    { type: "shape-design-set-mode", mode: toolModeRef.current, projectRoot: designerRootRef.current },
                    "*",
                );
            } else if (data.type === "shape-design-tokens" && Array.isArray(data.themeTokens)) {
                setThemeTokens(data.themeTokens);
            } else if (data.type === "shape-design-tree" && Array.isArray(data.layers)) {
                setLayers(data.layers);
            } else if (data.type === "shape-design-selection") {
                if (data.element) {
                    setSelected(data.element);
                    setPromptOpen(false);
                    void resolveElement(data.element);
                    if (data.addToChat) {
                        const label = data.element.component?.name || data.element.component?.tag || data.element.tag;
                        window.dispatchEvent(
                            new CustomEvent("shape-composer-insert-mention", {
                                detail: { kind: "design", id: data.element.key, label },
                            }),
                        );
                        window.dispatchEvent(new Event("shape-chat-focus-input"));
                    }
                } else {
                    setSelected(null);
                    setTarget(null);
                    setPromptOpen(false);
                }
            } else if (data.type === "shape-design-commit-styles" && data.element && data.styles) {
                setSelected(data.element);
                void (async () => {
                    setSaved(false);
                    try {
                        await persistJsx(data.element!, { styles: data.styles });
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
                    setSaved(false);
                    try {
                        await persistJsx(data.element!, { text: data.text ?? "" });
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
                    setSaved(false);
                    try {
                        await persistJsx(data.element!, { attributes: data.attributes });
                        setMappingError(null);
                    } catch (cause) {
                        setMappingError(
                            cause instanceof Error ? cause.message : String(cause),
                        );
                    } finally {
                        setSaved(true);
                    }
                })();
            } else if (data.type === "shape-design-reorder" && data.element) {
                void (async () => {
                    setSaved(false);
                    try {
                        await persistReorder(data.element!, data.before ?? null);
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
                    if (!resolved) {
                        setMappingError(
                            "Could not map this element to a source file. Select it again, then retry.",
                        );
                        return;
                    }
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
    }, [designerRoot, persistJsx, persistReorder, resolveElement]);

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

    const applyHistoryResult = useCallback(
        (result: { changed: boolean; file: string | null; content: string | null }) => {
            if (!result.changed) return;
            if (result.file && result.content != null) {
                commands.primeFileCache(result.file, result.content);
            }
            iframeRef.current?.contentWindow?.postMessage({ type: "shape-design-refresh" }, "*");
        },
        [],
    );

    const undoDesign = useCallback(() => {
        void enqueuePersist(async () => {
            applyHistoryResult(await commands.undoDesignSourcePatch());
        });
    }, [applyHistoryResult]);

    const redoDesign = useCallback(() => {
        void enqueuePersist(async () => {
            applyHistoryResult(await commands.redoDesignSourcePatch());
        });
    }, [applyHistoryResult]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "d") {
                event.preventDefault();
                setToolMode((mode) => (mode === "normal" ? "select" : "normal"));
                return;
            }
            const key = event.key.toLowerCase();
            if (!(event.ctrlKey || event.metaKey) || (key !== "z" && key !== "y")) return;
            const target = event.target as HTMLElement | null;
            if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
            event.preventDefault();
            if (key === "y" || (key === "z" && event.shiftKey)) redoDesign();
            else undoDesign();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [redoDesign, undoDesign]);

    useEffect(() => {
        if (toolMode === "normal") setPromptOpen(false);
    }, [toolMode]);

    useEffect(() => {
        const onToggleInspect = () => {
            setToolMode((mode) => (mode === "normal" ? "select" : "normal"));
        };
        window.addEventListener("shape-toggle-browser-design-mode", onToggleInspect);
        return () => window.removeEventListener("shape-toggle-browser-design-mode", onToggleInspect);
    }, []);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "l") return;
            if (toolMode === "normal" || !selected) return;
            const targetEl = event.target as HTMLElement | null;
            if (targetEl && (targetEl.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(targetEl.tagName))) return;
            event.preventDefault();
            setPromptOpen(true);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selected, toolMode]);

    const commitStyles = useCallback(
        async (styles: Record<string, string>) => {
            const current = selected;
            if (!current) return;
            // Keep the canvas updated even if source mapping fails.
            iframeRef.current?.contentWindow?.postMessage(
                { type: "shape-design-apply-preview", styles, key: current.key },
                "*",
            );
            setSaved(false);
            try {
                await persistJsx(current, { styles });
                setMappingError(null);
            } catch (cause) {
                setMappingError(
                    cause instanceof Error ? cause.message : String(cause),
                );
            } finally {
                setSaved(true);
            }
        },
        [persistJsx, selected],
    );

    const createToken = useCallback(
        async (name: string, value: string) => {
            const resolved = await resolveGlobalsCss(designerRoot);
            if (!resolved.path) {
                throw new Error("Could not find a theme CSS file to store this token.");
            }
            const before = resolved.content || (await commands.readFileFromDisk(resolved.path));
            const next = insertCssVariableInContent(before, name, value);
            await commands.saveFile(resolved.path, next);
            invalidateGlobalsCssCache();
            setCachedGlobalsCssContent(next);
            setThemeTokens((now) => {
                const index = now.findIndex((token) => token.name === name);
                if (index >= 0) {
                    return now.map((token, i) => (i === index ? { name, value } : token));
                }
                return [...now, { name, value }];
            });
        },
        [designerRoot],
    );

    const commitText = useCallback(
        async (text: string) => {
            const current = selected;
            if (!current) return;
            iframeRef.current?.contentWindow?.postMessage(
                { type: "shape-design-set-text", key: current.key, text },
                "*",
            );
            setSelected({ ...current, text });
            setSaved(false);
            try {
                await persistJsx(current, { text });
                setMappingError(null);
            } catch (cause) {
                setMappingError(cause instanceof Error ? cause.message : String(cause));
            } finally {
                setSaved(true);
            }
        },
        [persistJsx, selected],
    );

    const commitAttr = useCallback(
        async (name: string, value: string) => {
            const current = selected;
            if (!current) return;
            iframeRef.current?.contentWindow?.postMessage(
                { type: "shape-design-set-attr", key: current.key, name, value },
                "*",
            );
            setSelected({
                ...current,
                attributes: { ...current.attributes, [name]: value },
            });
            setSaved(false);
            try {
                await persistJsx(current, { attributes: { [name]: value } });
                setMappingError(null);
            } catch (cause) {
                setMappingError(cause instanceof Error ? cause.message : String(cause));
            } finally {
                setSaved(true);
            }
        },
        [persistJsx, selected],
    );

    const patchComponent = useCallback((patch: ComponentOptionPatch) => {
        const frame = iframeRef.current?.contentWindow;
        const current = selected;
        if (!current?.component) return;
        setSelected((now) => {
            if (!now?.component) return now;
            const properties = now.component.properties.map((property) => {
                if (patch.attr && property.attr !== patch.attr) return property;
                if (!patch.attr && property.kind === "text" && !property.attr && patch.field === "text") {
                    return { ...property, value: String(patch.value) };
                }
                if (patch.field === "attr" && property.attr === patch.attr) {
                    return { ...property, value: String(patch.value) };
                }
                return property;
            });
            return { ...now, component: { ...now.component, properties } };
        });
        if (patch.field === "text") {
            frame?.postMessage({ type: "shape-design-set-text", key: patch.key, text: String(patch.value) }, "*");
            void persistJsx(current, { text: String(patch.value) });
            return;
        }
        if (patch.field === "attr" && patch.attr) {
            void persistJsx(current, { attributes: { [patch.attr]: String(patch.value) } }, { instance: true });
        }
    }, [persistJsx, selected]);

    const openSource = useCallback(() => {
        if (!target) return;
        const fullPath = joinProjectPath(designerRoot, target.file);
        void commands.openFile(fullPath, target.file.split("/").pop() ?? target.file).then(_onClose);
    }, [designerRoot, _onClose, target]);

    const applyStructure = useCallback(
        async (operation: "delete" | "duplicate") => {
            const current = selected;
            const resolved = target ?? (current ? await resolveElement(current) : null);
            if (!resolved) {
                setMappingError(
                    "Could not map this element to a source file. Select it again, then retry.",
                );
                return;
            }
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

    const selectedKey = selected?.key ?? null;
    const canvasBusy = booting || !ready;

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

    const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

    return (
        <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-editor">
            <DesignToolbar
                tabs={tabs.length ? tabs : [createBrowserTab(currentUrl || "")]}
                activeTabId={activeTabId}
                onSelectTab={(id) => {
                    const tab = tabs.find((item) => item.id === id);
                    if (!tab) return;
                    setActiveTabId(id);
                    if (tab.url) void navigatePreview(tab.url, { replace: true });
                }}
                onCloseTab={(id) => {
                    setTabs((prev) => {
                        if (prev.length <= 1) return prev;
                        const next = prev.filter((tab) => tab.id !== id);
                        if (id === activeTabId) {
                            const fallback = next[next.length - 1];
                            if (fallback) {
                                setActiveTabId(fallback.id);
                                if (fallback.url) void navigatePreview(fallback.url, { replace: true });
                            }
                        }
                        return next;
                    });
                }}
                onNewTab={() => {
                    const url = currentUrl || iframeSrc || "http://localhost:3000";
                    const tab = createBrowserTab(url);
                    setTabs((prev) => [...prev, tab]);
                    setActiveTabId(tab.id);
                    if (url) void navigatePreview(url, { replace: true });
                }}
                url={urlBar || activeTab?.url || currentUrl || ""}
                onUrlChange={setPreviewUrlBar}
                onNavigate={(value) => {
                    void navigatePreview(value);
                    applyTabLocation(value);
                }}
                onReload={() => {
                    setReady(false);
                    previewReload();
                }}
                onBack={() => {
                    if (!activeTab || activeTab.index <= 0) return;
                    const index = activeTab.index - 1;
                    const url = activeTab.history[index];
                    if (!url) return;
                    setTabs((prev) =>
                        prev.map((tab) =>
                            tab.id === activeTab.id ? { ...tab, index, url } : tab,
                        ),
                    );
                    void navigatePreview(url, { replace: true });
                }}
                onForward={() => {
                    if (!activeTab || activeTab.index < 0 || activeTab.index >= activeTab.history.length - 1) return;
                    const index = activeTab.index + 1;
                    const url = activeTab.history[index];
                    if (!url) return;
                    setTabs((prev) =>
                        prev.map((tab) =>
                            tab.id === activeTab.id ? { ...tab, index, url } : tab,
                        ),
                    );
                    void navigatePreview(url, { replace: true });
                }}
                canBack={Boolean(activeTab && activeTab.index > 0)}
                canForward={Boolean(activeTab && activeTab.index >= 0 && activeTab.index < activeTab.history.length - 1)}
                onUndo={undoDesign}
                mode={toolMode}
                onModeChange={setToolMode}
            />
            <div className="flex min-h-0 flex-1">
                <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-white">
                    <div className="relative h-full overflow-hidden">
                            {iframeSrc ? (
                                <iframe
                                    key={`${activeTabId}::${iframeSrc}::${reloadKey}`}
                                    ref={iframeRef}
                                    src={iframeSrc}
                                    title="Browser"
                                    className="h-full w-full border-0 bg-white"
                                    sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"
                                    referrerPolicy="no-referrer"
                                    onLoad={() => {
                                        window.setTimeout(() => {
                                            const frame = iframeRef.current?.contentWindow;
                                            frame?.postMessage(
                                                {
                                                    type: "shape-design-set-mode",
                                                    mode: toolModeRef.current,
                                                    projectRoot: designerRootRef.current,
                                                },
                                                "*",
                                            );
                                            frame?.postMessage({ type: "shape-design-refresh" }, "*");
                                            try {
                                                const href = frame?.location?.href;
                                                if (href && href !== "about:blank") {
                                                    const iconLink = frame.document.querySelector('link[rel*="icon"]') as HTMLLinkElement | null;
                                                    applyTabLocation(href, {
                                                        title: frame.document.title?.trim(),
                                                        favicon: iconLink?.href || faviconFromUrl(href),
                                                    });
                                                }
                                            } catch {
                                                const inferred = inferPreviewUrlFromPerformance();
                                                if (inferred) applyTabLocation(inferred);
                                            }
                                        }, 80);
                                    }}
                                />
                            ) : null}
                            {canvasBusy ? <CanvasLoadBar /> : null}
                            {bootError ? (
                                <div className="absolute inset-x-0 top-0.5 z-20 flex items-center gap-2 border-b border-border bg-surface-4 px-3 py-2 text-sm text-text-secondary">
                                    <Icon icon={RiAlertLine} className="text-warning" />
                                    <span className="min-w-0 flex-1 truncate">{bootError}</span>
                                    <Button variant="ghost" size="sm" onClick={() => void pickPackageJson()}>
                                        Choose package.json
                                    </Button>
                                </div>
                            ) : null}
                            {selected && toolMode !== "normal" ? (
                                <DesignSelectionPrompt
                                    selected={selected}
                                    file={target?.file}
                                    open={promptOpen}
                                    onOpen={() => setPromptOpen(true)}
                                    onClose={() => setPromptOpen(false)}
                                />
                            ) : null}
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
                {toolMode !== "normal" ? (
                <div className="relative h-full shrink-0 border-l border-border" style={{ width: rightWidth }}>
                        <DesignThemeContext.Provider
                            value={{
                                tokens: themeTokens,
                                onPick: (property, cssValue) => {
                                    previewStyles({ [property]: cssValue });
                                    void commitStyles({ [property]: cssValue });
                                },
                            }}
                        >
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
                            onCommitText={(text) => void commitText(text)}
                            onCommitAttr={(name, value) => void commitAttr(name, value)}
                            onCreateToken={(name, value) => void createToken(name, value)}
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
                            chrome={false}
                            className="h-full w-full"
                        />
                        </DesignThemeContext.Provider>
                        <DragEdge
                            side="left"
                            onDrag={(start, dx) => setRightWidth(Math.min(480, Math.max(240, start - dx)))}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
}
