import { describe, expect, it } from "vitest";
import { justifyImageRows } from "@/lib/chat/justify-images";

const portrait = { id: "p", w: 400, h: 800 };
const landscape = { id: "l", w: 1600, h: 900 };
const square = { id: "s", w: 800, h: 800 };
const panoramic = { id: "w", w: 2400, h: 600 };

function ratio(image: { w: number; h: number; width: number; height: number }) {
    return image.width / image.height;
}

describe("justifyImageRows", () => {
    it("keeps each photo's aspect ratio", () => {
        const rows = justifyImageRows([portrait, landscape, square, panoramic], 640);
        const flat = rows.flat();
        expect(flat.length).toBe(4);
        for (const image of flat) {
            expect(ratio(image)).toBeCloseTo(image.w / image.h, 2);
        }
    });

    it("wraps mixed photos into rows that fill the width", () => {
        const rows = justifyImageRows([portrait, landscape, square, panoramic], 640, { gap: 6 });
        expect(rows.length).toBe(2);
        for (const row of rows) {
            const used = row.reduce((total, image) => total + image.width, 0) + 6 * (row.length - 1);
            expect(used).toBeCloseTo(640, 0);
            expect(new Set(row.map((image) => Math.round(image.width))).size).toBe(row.length);
        }
        const [first] = rows;
        const placedPortrait = first?.find((image) => image.id === "p");
        const placedLandscape = first?.find((image) => image.id === "l");
        expect(placedLandscape!.width).toBeGreaterThan(placedPortrait!.width);
    });

    it("does not stretch a single portrait to the container width", () => {
        const rows = justifyImageRows([portrait], 640, { targetHeight: 180 });
        const image = rows[0]?.[0];
        expect(image!.width).toBeLessThan(200);
        expect(image!.width / image!.height).toBeCloseTo(0.5, 2);
    });

    it("scales a lone panoramic down instead of cropping it", () => {
        const rows = justifyImageRows([panoramic], 320, { targetHeight: 140 });
        const image = rows[0]?.[0];
        expect(image!.width).toBeLessThanOrEqual(320);
        expect(image!.width / image!.height).toBeCloseTo(4, 1);
    });

    it("returns nothing until the container has a width", () => {
        expect(justifyImageRows([square], 0)).toEqual([]);
    });
});
