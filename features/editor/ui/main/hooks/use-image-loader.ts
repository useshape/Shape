import { useState, useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { commands } from "@/lib/backend";
import { notify } from "@/features/notifications";

const LOG = (...args: unknown[]) => console.info("[image-loader]", ...args);

/** Strip any `diff:*:` prefix (staged, unstaged, commit hash, etc.) to get the real file path. */
export function stripDiffPrefix(path: string): string {
    return path.replace(/^diff:[^:]*(?::[a-f0-9]{4,40})?:/, "");
}

function mimeForPath(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    switch (ext) {
        case "png": return "image/png";
        case "jpg":
        case "jpeg": return "image/jpeg";
        case "gif": return "image/gif";
        case "webp": return "image/webp";
        case "bmp": return "image/bmp";
        case "avif": return "image/avif";
        case "svg": return "image/svg+xml";
        case "ico": return "image/x-icon";
        case "tif":
        case "tiff": return "image/tiff";
        default: return "application/octet-stream";
    }
}

function toUint8Array(bytes: unknown): Uint8Array {
    if (bytes instanceof Uint8Array) return bytes;
    if (Array.isArray(bytes)) return new Uint8Array(bytes);
    if (bytes && typeof bytes === "object" && ArrayBuffer.isView(bytes)) {
        const view = bytes as ArrayBufferView;
        return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    }
    throw new Error(`Unexpected bytes type: ${Object.prototype.toString.call(bytes)}`);
}

async function loadViaBlob(path: string): Promise<string> {
    LOG("readFileBytes…", path);
    const raw = await commands.readFileBytes(path);
    const bytes = toUint8Array(raw);
    LOG("bytes ok", { length: bytes.byteLength, mime: mimeForPath(path) });
    if (bytes.byteLength === 0) throw new Error("File is empty (0 bytes)");
    const blob = new Blob([new Uint8Array(bytes)], { type: mimeForPath(path) });
    return URL.createObjectURL(blob);
}

async function loadViaAssetProtocol(path: string): Promise<string> {
    const src = convertFileSrc(path);
    LOG("convertFileSrc →", src);
    // Probe that the URL actually resolves.
    await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            LOG("asset protocol image loaded", { w: img.naturalWidth, h: img.naturalHeight });
            resolve();
        };
        img.onerror = () => reject(new Error(`asset protocol failed to load: ${src}`));
        img.src = src;
    });
    return src;
}

export function useImageLoader(path: string, isImage: boolean) {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [svgContent, setSvgContent] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const blobUrlRef = useRef<string | null>(null);

    useEffect(() => {
        if (!isImage) {
            setImageSrc(null);
            setSvgContent(null);
            setError(null);
            return;
        }

        let cancelled = false;
        const actualPath = stripDiffPrefix(path);
        const ext = actualPath.split(".").pop()?.toLowerCase() ?? "";

        LOG("start", { path, actualPath, ext, isImage });
        setError(null);
        setImageSrc(null);
        setSvgContent(null);

        const adoptSrc = (src: string, via: string) => {
            if (cancelled) {
                if (src.startsWith("blob:")) URL.revokeObjectURL(src);
                return;
            }
            // Revoke previous blob only after adopting the new one.
            if (blobUrlRef.current && blobUrlRef.current !== src) {
                URL.revokeObjectURL(blobUrlRef.current);
            }
            blobUrlRef.current = src.startsWith("blob:") ? src : null;
            setSvgContent(null);
            setImageSrc(src);
            LOG("adopted src via", via, src.slice(0, 120));
        };

        const fail = (err: unknown, stage: string) => {
            const message = err instanceof Error ? err.message : String(err);
            LOG("FAIL", stage, message);
            if (cancelled) return;
            setImageSrc(null);
            setSvgContent(null);
            setError(message);
            notify.error("Image Error", message);
        };

        const run = async () => {
            if (ext === "svg") {
                try {
                    const content = await commands.readFile(actualPath);
                    if (cancelled) return;
                    setSvgContent(content);
                    setImageSrc(null);
                    LOG("svg loaded", content.length);
                } catch (err) {
                    fail(err, "svg-read");
                }
                return;
            }

            // 1) Prefer asset protocol (fast). 2) Fall back to bytes→blob.
            try {
                const src = await loadViaAssetProtocol(actualPath);
                adoptSrc(src, "asset");
                return;
            } catch (assetErr) {
                LOG("asset failed, trying blob…", assetErr);
            }

            try {
                const src = await loadViaBlob(actualPath);
                adoptSrc(src, "blob");
            } catch (blobErr) {
                fail(blobErr, "blob");
            }
        };

        void run();

        return () => {
            cancelled = true;
            LOG("cancel/cleanup", actualPath);
        };
    }, [isImage, path]);

    // Revoke blob on unmount only.
    useEffect(() => {
        return () => {
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, []);

    return { imageSrc, svgContent, error };
}
