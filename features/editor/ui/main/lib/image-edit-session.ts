import type { ImageAdjustments } from "../ui/image-tools";
import { applySharpenToCanvas, applyVignetteToCanvas } from "./image-effects";

export function cloneAdjustments(adj: ImageAdjustments): ImageAdjustments {
    return { ...adj };
}

export function parseSvgDimensions(svg: string): { width: number; height: number } {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svg, "image/svg+xml");
        const el = doc.documentElement;
        const widthAttr = el.getAttribute("width");
        const heightAttr = el.getAttribute("height");
        const w = widthAttr ? parseFloat(widthAttr.replace(/px$/, "")) : 0;
        const h = heightAttr ? parseFloat(heightAttr.replace(/px$/, "")) : 0;
        if (w > 0 && h > 0) return { width: Math.round(w), height: Math.round(h) };

        const viewBox = el.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
        if (viewBox && viewBox.length >= 4 && viewBox[2] > 0 && viewBox[3] > 0) {
            return { width: Math.round(viewBox[2]), height: Math.round(viewBox[3]) };
        }
    } catch {
        // fall through
    }
    return { width: 512, height: 512 };
}

/**
 * Export at the image's true natural pixel size only.
 * Never crops, never forces an aspect ratio — that was corrupting files.
 */
export async function renderRasterToPngDataUrl(
    src: string,
    filterStyle: string,
    effects?: { sharpen: number; vignette: number },
): Promise<string> {
    const img = await loadImage(src);
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (!width || !height) {
        throw new Error("Image has no dimensions");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.filter = filterStyle || "none";
    // Draw the full source into a same-size canvas — no crop, no rescale.
    ctx.drawImage(img, 0, 0, width, height);
    ctx.filter = "none";

    applySharpenToCanvas(ctx, effects?.sharpen ?? 0);
    applyVignetteToCanvas(ctx, effects?.vignette ?? 0);

    return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = src;
    });
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
    const base64 = dataUrl.split(",")[1] ?? "";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
