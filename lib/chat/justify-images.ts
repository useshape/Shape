export type ImageRatio = { w: number; h: number };

export type PlacedImage<T extends ImageRatio> = T & { width: number; height: number };

function aspectOf(image: ImageRatio): number {
    return image.w / image.h;
}

function placeRow<T extends ImageRatio>(
    items: T[],
    containerWidth: number,
    gap: number,
    maxHeight: number,
): PlacedImage<T>[] {
    const sum = items.reduce((total, image) => total + aspectOf(image), 0);
    const gaps = gap * Math.max(0, items.length - 1);
    let height = (containerWidth - gaps) / sum;
    let fill = true;
    if (height > maxHeight) {
        height = maxHeight;
        fill = false;
    }
    let placed: PlacedImage<T>[] = items.map((image) => {
        const aspect = aspectOf(image);
        return { ...image, width: height * aspect, height };
    });
    if (fill) {
        const content = placed.reduce((total, image) => total + image.width, 0);
        const scale = (containerWidth - gaps) / content;
        placed = placed.map((image) => ({
            ...image,
            width: image.width * scale,
            height: image.height * scale,
        }));
    }
    return placed;
}

/**
 * Packs photos into rows that share edges.
 * Three or more photos wrap at two per row so a portrait and a landscape
 * keep different widths, and each full row spans the container.
 * A leftover photo stays at its own ratio instead of being stretched.
 */
export function justifyImageRows<T extends ImageRatio>(
    images: T[],
    containerWidth: number,
    options?: { gap?: number; targetHeight?: number },
): PlacedImage<T>[][] {
    const gap = options?.gap ?? 6;
    const width = Math.max(0, containerWidth);
    const valid = images.filter((image) => image.w > 0 && image.h > 0);
    if (width < 32 || valid.length === 0) return [];

    const maxHeight = options?.targetHeight ?? Math.min(240, width * 0.62);
    const perRow = valid.length >= 3 ? 2 : valid.length;
    const rows: PlacedImage<T>[][] = [];

    for (let index = 0; index < valid.length; index += perRow) {
        const slice = valid.slice(index, index + perRow);
        const cap = slice.length === 1 ? Math.min(maxHeight, width * 0.5) : Number.POSITIVE_INFINITY;
        rows.push(placeRow(slice, width, gap, cap));
    }
    return rows;
}
