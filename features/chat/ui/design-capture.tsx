"use client";

import * as React from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";

type CaptureRequestPayload = {
    requestId: string;
    htmlPath: string;
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

async function rasterizeIframe(iframe: HTMLIFrameElement, width: number, height: number): Promise<Uint8Array> {
    const doc = iframe.contentDocument;
    if (!doc?.documentElement) {
        throw new Error("Preview document is not accessible for capture");
    }

    const clone = doc.documentElement.cloneNode(true) as HTMLElement;
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    const serialized = new XMLSerializer().serializeToString(clone);
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
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Failed to encode preview capture as PNG");
    return new Uint8Array(await blob.arrayBuffer());
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
            if (!event.data || event.data.type !== "shape-preview-ready") return;
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
