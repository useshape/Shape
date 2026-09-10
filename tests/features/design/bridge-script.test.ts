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

    it("posts marquee, move, resize, reorder, text edit, and live CSS var messages", () => {
        expect(DESIGN_BRIDGE_SCRIPT).toContain('type: "shape-design-area"');
        expect(DESIGN_BRIDGE_SCRIPT).toContain('type: "shape-design-moved"');
        expect(DESIGN_BRIDGE_SCRIPT).toContain('type: "shape-design-resized"');
        expect(DESIGN_BRIDGE_SCRIPT).toContain('type: "shape-design-reordered"');
        expect(DESIGN_BRIDGE_SCRIPT).toContain('type: "shape-design-text-edited"');
        expect(DESIGN_BRIDGE_SCRIPT).toContain('data.type === "shape-design-set-var"');
        expect(DESIGN_BRIDGE_SCRIPT).toContain('data.type === "shape-design-reselect"');
        expect(DESIGN_BRIDGE_SCRIPT).toContain('mode: "marquee"');
        expect(DESIGN_BRIDGE_SCRIPT).toContain('mode: "reorder"');
        expect(DESIGN_BRIDGE_SCRIPT).toContain("promoteToRelative");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("contentEditable");
        expect(DESIGN_BRIDGE_SCRIPT).toContain('e.key === "ArrowLeft"');
        expect(DESIGN_BRIDGE_SCRIPT).toContain("document.documentElement.style.setProperty");
    });

    it("starts move on selected or descendant hits and promotes static", () => {
        expect(DESIGN_BRIDGE_SCRIPT).toContain("selected.contains(hit)");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("promoteToRelative");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("isFlowParent");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("shouldReorder");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("snapMove");
        expect(DESIGN_BRIDGE_SCRIPT).toContain('left: "0px"');
        expect(DESIGN_BRIDGE_SCRIPT).toContain("isPageRoot");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("isPageShell");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("refineHit");
    });
});
