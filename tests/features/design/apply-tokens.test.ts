import { describe, expect, it } from "vitest";
import {
    cssHasThemeDirective,
    insertCustomProperty,
    patchCustomProperty,
} from "@/features/preview/design-mode/apply/patch-css";

describe("patchCustomProperty", () => {
    it("updates a single declaration", () => {
        const css = `:root {\n  --color-primary: #111;\n}\n`;
        const next = patchCustomProperty(css, "--color-primary", "#fff");
        expect("error" in next).toBe(false);
        if ("error" in next) return;
        expect(next.css).toContain("--color-primary: #fff");
    });

    it("errors when missing or duplicated", () => {
        expect(patchCustomProperty(":root {}", "--missing", "#fff")).toEqual(
            expect.objectContaining({ error: expect.stringMatching(/not declared/i) }),
        );
        const dup = `:root { --a: 1; }\nhtml { --a: 2; }\n`;
        expect(patchCustomProperty(dup, "--a", "3")).toEqual(
            expect.objectContaining({ error: expect.stringMatching(/times/i) }),
        );
    });
});

describe("insertCustomProperty", () => {
    it("defaults to :root", () => {
        const next = insertCustomProperty(":root {\n  --existing: 1;\n}\n", "--color-card", "#abc");
        expect("error" in next).toBe(false);
        if ("error" in next) return;
        expect(next.css).toContain("--color-card: #abc");
        expect(next.css).toMatch(/:root/);
    });

    it("inserts into @theme only when requested", () => {
        const css = `@theme {\n  --color-brand: #000;\n}\n:root {\n  --legacy: 1;\n}\n`;
        expect(cssHasThemeDirective(css)).toBe(true);
        const theme = insertCustomProperty(css, "--color-surface", "#eee", { into: "theme" });
        expect("error" in theme).toBe(false);
        if ("error" in theme) return;
        expect(theme.css).toMatch(/@theme[\s\S]*--color-surface:\s*#eee/);

        const root = insertCustomProperty(css, "--color-surface", "#eee", { into: "root" });
        expect("error" in root).toBe(false);
        if ("error" in root) return;
        expect(root.css).toMatch(/:root[\s\S]*--color-surface:\s*#eee/);
    });

    it("refuses @theme insert when no @theme exists", () => {
        const next = insertCustomProperty(":root { --a: 1; }", "--color-x", "#000", { into: "theme" });
        expect(next).toEqual(expect.objectContaining({ error: expect.stringMatching(/@theme/i) }));
    });
});
