"use client";

import * as React from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";

type CaptureRequestPayload = {
    requestId: string;
    htmlPath?: string;
    url?: string;
    width: number;
    height: number;
    pngPath: string;
};

type ActiveCapture = {
    req: CaptureRequestPayload;
    iframe: HTMLIFrameElement;
    settled: boolean;
    timeoutId: ReturnType<typeof setTimeout>;
};

/** Slightly under Rust's own 15-30s wait so we always resolve first when possible. */
const CAPTURE_READY_TIMEOUT_MS = 14_000;

async function copyComputedTree(from: Element, to: Element) {
    if (!(from instanceof HTMLElement) || !(to instanceof HTMLElement)) return;
    const computed = getComputedStyle(from);
    let cssText = "";
    for (let i = 0; i < computed.length; i++) {
        const prop = computed[i];
        cssText += `${prop}:${computed.getPropertyValue(prop)};`;
    }
    to.setAttribute("style", cssText);
    const fromKids = from.children;
    const toKids = to.children;
    for (let j = 0; j < fromKids.length && j < toKids.length; j++) {
        const childFrom = fromKids[j];
        const childTo = toKids[j];
        if (childFrom && childTo) await copyComputedTree(childFrom, childTo);
    }
}

function collectFontCss(doc: Document): string {
    let css = "";
    try {
        const sheets = doc.styleSheets;
        for (let i = 0; i < sheets.length; i++) {
            let rules: CSSRuleList | undefined;
            try {
                rules = sheets[i]?.cssRules ?? undefined;
            } catch {
                continue;
            }
            if (!rules) continue;
            for (let j = 0; j < rules.length; j++) {
                const rule = rules[j];
                if (rule && rule.constructor.name === "CSSFontFaceRule") css += `${rule.cssText}\n`;
            }
        }
    } catch {
        /* ignore */
    }
    return css;
}

async function rasterizeIframe(iframe: HTMLIFrameElement, width: number, height: number): Promise<Uint8Array> {
    const doc = iframe.contentDocument;
    if (!doc?.documentElement) {
        throw new Error("Preview document is not accessible for capture");
    }
    if (doc.fonts?.ready) {
        await doc.fonts.ready.catch(() => undefined);
    }

    const clone = doc.documentElement.cloneNode(true) as HTMLElement;
    await copyComputedTree(doc.documentElement, clone);
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    const wrap = doc.createElement("div");
    wrap.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    wrap.setAttribute(
        "style",
        `background:transparent;font-family:${getComputedStyle(doc.documentElement).fontFamily || "system-ui,sans-serif"};`,
    );
    const fontStyle = doc.createElement("style");
    fontStyle.textContent = collectFontCss(doc);
    wrap.appendChild(fontStyle);
    wrap.appendChild(clone);
    const serialized = new XMLSerializer().serializeToString(wrap);
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
        `<foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;

    const img = new Image();
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to rasterize preview document"));
        img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable for preview capture");
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Failed to encode preview capture as PNG");
    return new Uint8Array(await blob.arrayBuffer());
}

async function dataUrlToJpegBytes(dataUrl: string, maxWidth: number): Promise<Uint8Array> {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to decode page screenshot"));
        img.src = dataUrl;
    });
    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable for page capture");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("Failed to encode page capture as JPEG");
    return new Uint8Array(await blob.arrayBuffer());
}

async function captureLivePage(req: CaptureRequestPayload, container: HTMLDivElement) {
    const url = req.url!.trim();
    const iframe = document.createElement("iframe");
    iframe.width = String(req.width);
    iframe.height = String(req.height);
    iframe.style.border = "0";
    iframe.style.width = `${req.width}px`;
    iframe.style.height = `${req.height}px`;
    iframe.setAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-forms allow-modals allow-popups",
    );

    let done = false;
    let asked = false;
    let onMessage: ((event: MessageEvent) => void) | null = null;

    const report = (result: { pngPath?: string; error?: string }) => {
        if (done) return;
        done = true;
        if (onMessage) window.removeEventListener("message", onMessage);
        void emit("design-preview-capture-result", {
            requestId: req.requestId,
            pngPath: result.pngPath ?? null,
            error: result.error ?? null,
        }).catch(() => {});
        iframe.remove();
    };

    const timeoutId = setTimeout(() => {
        report({ error: "Page capture timed out waiting for the preview to render" });
    }, CAPTURE_READY_TIMEOUT_MS);

    const finish = async (dataUrl: string) => {
        try {
            const bytes = await dataUrlToJpegBytes(dataUrl, 960);
            const { commands } = await import("@/lib/backend");
            await commands.saveFileBytes(req.pngPath, Array.from(bytes));
            clearTimeout(timeoutId);
            report({ pngPath: req.pngPath });
        } catch (err) {
            clearTimeout(timeoutId);
            report({ error: err instanceof Error ? err.message : String(err) });
        }
    };

    const ask = () => {
        if (asked || done) return;
        asked = true;
        window.setTimeout(() => {
            try {
                iframe.contentWindow?.postMessage(
                    {
                        source: "shape-design-host",
                        type: "shape-preview-screenshot",
                        req: req.requestId,
                        maxWidth: req.width,
                        maxHeight: req.height,
                    },
                    "*",
                );
            } catch {
                /* ignore */
            }
        }, 2200);
    };

    onMessage = (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow) return;
        const data = event.data;
        if (!data || typeof data !== "object") return;
        const type = (data as { type?: string }).type;
        if (type === "shape-preview-screenshot-result" && (data as { req?: string }).req === req.requestId) {
            const err = (data as { error?: string }).error;
            const dataUrl = (data as { dataUrl?: string }).dataUrl;
            if (err || !dataUrl) {
                clearTimeout(timeoutId);
                report({ error: err || "Page sent no screenshot" });
                return;
            }
            void finish(dataUrl);
            return;
        }
        if (type === "shape-design-ready" || type === "shape-preview-ready") {
            ask();
        }
    };
    window.addEventListener("message", onMessage);
    iframe.addEventListener("load", () => ask());

    try {
        const { commands } = await import("@/lib/backend");
        const info = await commands.startDesignProxy(url, "");
        iframe.src = info.src;
        container.appendChild(iframe);
    } catch (err) {
        clearTimeout(timeoutId);
        report({ error: err instanceof Error ? err.message : String(err) });
    }
}

/**
 * Listens for `design-preview-capture` requests emitted by
 * `capture_html_preview` (src-tauri/src/commands/preview_render.rs), renders
 * the requested HTML in an offscreen iframe, rasterizes it once the document
 * signals readiness, and writes the resulting PNG back so the Rust-side
 * oneshot in `PreviewCaptureState` resolves.
 *
 * Before this host existed nothing answered `design-preview-capture`, so
 * every request just hung until Rust's own timeout fired. On
 * `design-preview-capture-abort` (emitted by `stop_chat_message` before it
 * kills the PTY) every in-flight iframe is torn down immediately instead of
 * being abandoned mid-paint, which is what produced "invalid window handle"
 * errors on Windows.
 */
export function DesignPreviewCaptureHost() {
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const activeRef = React.useRef<Map<string, ActiveCapture>>(new Map());

    const settle = React.useCallback((requestId: string, result: { pngPath?: string; error?: string }) => {
        const entry = activeRef.current.get(requestId);
        if (!entry || entry.settled) return;
        entry.settled = true;
        clearTimeout(entry.timeoutId);
        activeRef.current.delete(requestId);
        try {
            entry.iframe.remove();
        } catch {
            /* WebView2 logs PostMessage/invalid handle if the iframe HWND is already gone */
        }
        void emit("design-preview-capture-result", {
            requestId,
            pngPath: result.pngPath ?? null,
            error: result.error ?? null,
        }).catch(() => {
            /* Rust side may have already timed out and stopped listening - fine to drop. */
        });
    }, []);

    const handleReady = React.useCallback(
        async (requestId: string) => {
            const entry = activeRef.current.get(requestId);
            if (!entry || entry.settled) return;
            try {
                const bytes = await rasterizeIframe(entry.iframe, entry.req.width, entry.req.height);
                const { commands } = await import("@/lib/backend");
                await commands.saveFileBytes(entry.req.pngPath, Array.from(bytes));
                settle(requestId, { pngPath: entry.req.pngPath });
            } catch (err) {
                settle(requestId, { error: err instanceof Error ? err.message : String(err) });
            }
        },
        [settle],
    );

    React.useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (!event.data || (event.data.type !== "shape-preview-ready" && event.data.type !== "shape-design-ready")) return;
            for (const [requestId, entry] of activeRef.current) {
                if (!entry.settled && entry.iframe.contentWindow === event.source) {
                    void handleReady(requestId);
                    return;
                }
            }
        };
        window.addEventListener("message", onMessage);

        const unlistenCapture = listen<CaptureRequestPayload>("design-preview-capture", (event) => {
            const req = event.payload;
            const container = containerRef.current;
            if (!container || activeRef.current.has(req.requestId)) return;

            if (req.url?.trim()) {
                void captureLivePage(req, container);
                return;
            }
            if (!req.htmlPath) {
                settle(req.requestId, { error: "Preview capture missing htmlPath or url" });
                return;
            }

            const iframe = document.createElement("iframe");
            iframe.src = convertFileSrc(req.htmlPath);
            iframe.width = String(req.width);
            iframe.height = String(req.height);
            iframe.style.border = "0";
            iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
            container.appendChild(iframe);

            const timeoutId = setTimeout(() => {
                settle(req.requestId, { error: "Preview capture timed out waiting for the document to render" });
            }, CAPTURE_READY_TIMEOUT_MS);

            activeRef.current.set(req.requestId, { req, iframe, settled: false, timeoutId });
        });

        const unlistenAbort = listen("design-preview-capture-abort", () => {
            const ids = [...activeRef.current.keys()];
            for (const id of ids) {
                settle(id, { error: "Preview capture aborted" });
            }
        });

        return () => {
            window.removeEventListener("message", onMessage);
            void unlistenCapture.then((fn) => fn()).catch(() => { });
            void unlistenAbort.then((fn) => fn()).catch(() => { });
            for (const entry of activeRef.current.values()) {
                clearTimeout(entry.timeoutId);
                entry.iframe.remove();
            }
            activeRef.current.clear();
        };
    }, [handleReady, settle]);

    return (
        <div
            ref={containerRef}
            aria-hidden
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: 0,
                height: 0,
                overflow: "hidden",
                opacity: 0,
                pointerEvents: "none",
            }}
        />
    );
}
