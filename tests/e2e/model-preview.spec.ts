import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const fixture = path.resolve("tests/e2e/fixtures/cube.glb");

test.describe("3D chat viewer", () => {
    test("loads a GLB, orbits, and downloads original bytes", async ({ page }) => {
        test.skip(!fs.existsSync(fixture), "cube.glb fixture missing — run cargo test write_e2e_model_fixture");
        await page.goto("/tests/e2e/static/index.html");
        const webgl = await page.evaluate(() => (window as Window & { __shapeWebgl?: boolean }).__shapeWebgl);
        test.skip(webgl === false, "WebGL unavailable");

        const canvas = page.locator("[data-model-canvas]");
        await expect(canvas).toBeVisible({ timeout: 20_000 });
        await page.waitForFunction(
            () => Boolean((window as Window & { __shapeModelCamera?: unknown }).__shapeModelCamera),
            null,
            { timeout: 20_000 },
        );
        const pixels = await canvas.evaluate((node) => {
            const el = node as HTMLCanvasElement;
            const probe = document.createElement("canvas");
            probe.width = el.width;
            probe.height = el.height;
            const ctx = probe.getContext("2d");
            if (!ctx) return 0;
            ctx.drawImage(el, 0, 0);
            const data = ctx.getImageData(Math.floor(el.width / 2), Math.floor(el.height / 2), 1, 1).data;
            return data[0] + data[1] + data[2] + data[3];
        });
        expect(pixels).toBeGreaterThan(0);

        const before = await page.evaluate(
            () => (window as Window & { __shapeModelCamera?: { azimuth: number } }).__shapeModelCamera?.azimuth ?? 0,
        );
        const box = await canvas.boundingBox();
        expect(box).toBeTruthy();
        await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
        await page.mouse.down();
        await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y + box!.height / 2, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(200);
        const after = await page.evaluate(
            () => (window as Window & { __shapeModelCamera?: { azimuth: number } }).__shapeModelCamera?.azimuth ?? 0,
        );
        expect(Math.abs(after - before)).toBeGreaterThan(0.02);

        await page.mouse.wheel(0, 400);
        const downloadPromise = page.waitForEvent("download");
        await page.locator("#download").click();
        const download = await downloadPromise;
        const dest = path.join(test.info().outputDir, "cube.glb");
        await download.saveAs(dest);
        const bytes = fs.readFileSync(dest);
        expect(bytes.subarray(0, 4).toString()).toBe("glTF");
    });
});
