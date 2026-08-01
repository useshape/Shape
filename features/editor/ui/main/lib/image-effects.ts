import type { CSSProperties } from "react";

const SHARPEN_FILTER_ID = "shape-image-sharpen";

export function sharpenFilterId(): string {
    return SHARPEN_FILTER_ID;
}

export function buildSharpenKernel(amount: number): string {
    const strength = amount * 2.5;
    const center = 1 + 4 * strength;
    return `0 -${strength} 0 -${strength} ${center} -${strength} 0 -${strength} 0`;
}

export function buildPreviewFilterChain(colorFilter: string, sharpen: number): string {
    const parts: string[] = [];
    if (sharpen > 0) {
        parts.push(`url(#${SHARPEN_FILTER_ID})`);
    }
    if (colorFilter) {
        parts.push(colorFilter);
    }
    return parts.join(" ") || "none";
}

export function vignetteOverlayStyle(strength: number): CSSProperties | undefined {
    if (strength <= 0) return undefined;
    const alpha = Math.min(0.9, strength * 0.85);
    return {
        background: `radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,${alpha}) 100%)`,
    };
}

export function applySharpenToCanvas(ctx: CanvasRenderingContext2D, amount: number): void {
    if (amount <= 0) return;

    const { width, height } = ctx.canvas;
    const imageData = ctx.getImageData(0, 0, width, height);
    const src = imageData.data;
    const out = new Uint8ClampedArray(src);
    const strength = amount * 2.5;

    const kernel = [
        0, -strength, 0,
        -strength, 1 + 4 * strength, -strength,
        0, -strength, 0,
    ];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            for (let c = 0; c < 3; c++) {
                let sum = 0;
                let ki = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4 + c;
                        sum += src[idx] * kernel[ki];
                        ki++;
                    }
                }
                const outIdx = (y * width + x) * 4 + c;
                out[outIdx] = Math.min(255, Math.max(0, sum));
            }
        }
    }

    imageData.data.set(out);
    ctx.putImageData(imageData, 0, 0);
}

export function applyVignetteToCanvas(ctx: CanvasRenderingContext2D, amount: number): void {
    if (amount <= 0) return;

    const { width, height } = ctx.canvas;
    const cx = width / 2;
    const cy = height / 2;
    const inner = Math.min(width, height) * 0.25;
    const outer = Math.max(width, height) * 0.72;
    const gradient = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${Math.min(0.9, amount * 0.85)})`);

    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
}
