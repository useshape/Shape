import { describe, expect, it } from "vitest";
import { parseEffectsFromStyles } from "@/features/preview/ui/design/parse-effects";
import { ADDABLE_FONTS } from "@/features/preview/ui/design/fonts";
import { DESIGN_BRIDGE_SCRIPT } from "@/features/preview/design-mode/bridge-script";

describe("parseEffectsFromStyles", () => {
    it("seeds drop shadows from computed box-shadow", () => {
        const fx = parseEffectsFromStyles({
            boxShadow: "0px 4px 16px 0px rgb(0 0 0 / 0.25)",
        });
        expect(fx).toHaveLength(1);
        expect(fx[0]?.kind).toBe("drop-shadow");
        expect(fx[0]?.y).toBe(4);
        expect(fx[0]?.blur).toBe(16);
    });

    it("seeds backdrop blur from backdrop-filter", () => {
        const fx = parseEffectsFromStyles({
            backdropFilter: "blur(20px)",
        });
        expect(fx.some((e) => e.kind === "background-blur" && e.blur === 20)).toBe(true);
    });
});

describe("addable fonts", () => {
    it("includes google and web-safe families", () => {
        expect(ADDABLE_FONTS.some((f) => f.name === "Inter" && f.google)).toBe(true);
        expect(ADDABLE_FONTS.some((f) => f.name === "Georgia" && !f.google)).toBe(true);
    });
});

describe("design bridge script", () => {
    it("is valid JavaScript after template escaping", () => {
        expect(() => new Function(DESIGN_BRIDGE_SCRIPT)).not.toThrow();
    });

    it("clears border with none and 0px together", () => {
        expect(DESIGN_BRIDGE_SCRIPT).toContain('styles.borderWidth = "0px"');
        expect(DESIGN_BRIDGE_SCRIPT).toContain('styles.borderStyle = "none"');
    });

    it("applies progressive blur as stacked overlay bands", () => {
        expect(DESIGN_BRIDGE_SCRIPT).toContain("syncProgOverlays");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("shape-prog-");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("bandMask");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("--shape-prog-start");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("snapSize");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("shape-guides");
        expect(DESIGN_BRIDGE_SCRIPT).not.toContain("shape-noise");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("__nextjs_source-map");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("cleanSourcePath");
    });
});
