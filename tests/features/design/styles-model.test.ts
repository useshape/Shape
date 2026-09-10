import { describe, expect, it } from "vitest";
import type { CssVariable } from "@/lib/css-variables";
import {
    colorStylesFromVariables,
    formatTypeSubtitle,
    nearestColorToken,
    slugToCssVarName,
    textStylesFromVariables,
} from "@/features/preview/ui/design/styles-model";
import {
    clampWidth,
    parseStoredOpen,
    parseStoredWidth,
    DESIGN_LEFT_MIN,
    DESIGN_LEFT_MAX,
} from "@/features/preview/ui/design/design-layout";

const vars = (rows: Array<Partial<CssVariable> & { name: string; value: string }>): CssVariable[] =>
    rows.map((r) => ({
        name: r.name,
        value: r.value,
        line: r.line ?? 1,
        kind: r.kind ?? "color",
        section: r.section ?? "other",
    }));

describe("styles-model", () => {
    it("groups color styles from CSS variables", () => {
        const colors = colorStylesFromVariables(
            vars([
                { name: "--color-primary", value: "#111", kind: "color" },
                { name: "--surface-card", value: "#eee", kind: "color" },
                { name: "--font-size-lg", value: "18px", kind: "size" },
            ]),
        );
        expect(colors.map((c) => c.cssVar)).toEqual(["--color-primary", "--surface-card"]);
        expect(colors.find((c) => c.cssVar === "--surface-card")?.group).toBe("Surfaces");
    });

    it("builds composite text styles without inventing HIG names", () => {
        const styles = textStylesFromVariables(
            vars([
                { name: "--font-size-body", value: "15px", kind: "size" },
                { name: "--line-height-body", value: "20px", kind: "size" },
                { name: "--font-weight-body", value: "400", kind: "other" },
            ]),
        );
        expect(styles.length).toBeGreaterThan(0);
        expect(styles[0]?.subtitle).toMatch(/Ag Regular · 15\/20/);
        expect(styles.some((s) => /Large Title|Callout/i.test(s.name))).toBe(false);
    });

    it("formats type subtitles", () => {
        expect(formatTypeSubtitle({ fontSize: "15px", lineHeight: "20px", fontWeight: "700" })).toBe(
            "Ag Emphasized · 15/20",
        );
    });

    it("slugs create-style names into CSS vars", () => {
        expect(slugToCssVarName("surface/card", "color")).toBe("--color-surface-card");
        expect(slugToCssVarName("color-brand", "color")).toBe("--color-brand");
    });

    it("snaps to nearest color token within threshold", () => {
        const tokens = colorStylesFromVariables(
            vars([
                { name: "--color-navy", value: "#082d57", kind: "color" },
                { name: "--color-red", value: "#ff0000", kind: "color" },
            ]),
        );
        expect(nearestColorToken("rgb(8, 45, 87)", tokens)?.cssVar).toBe("--color-navy");
        expect(nearestColorToken("#ff0001", tokens, { maxDistance: 8 })?.cssVar).toBe("--color-red");
        expect(nearestColorToken("#00ff00", tokens, { maxDistance: 8 })).toBeNull();
    });
});

describe("design-layout prefs", () => {
    it("clamps and parses panel widths", () => {
        expect(clampWidth(100, DESIGN_LEFT_MIN, DESIGN_LEFT_MAX)).toBe(DESIGN_LEFT_MIN);
        expect(clampWidth(999, DESIGN_LEFT_MIN, DESIGN_LEFT_MAX)).toBe(DESIGN_LEFT_MAX);
        expect(parseStoredWidth("280", 288, DESIGN_LEFT_MIN, DESIGN_LEFT_MAX)).toBe(280);
        expect(parseStoredWidth("nope", 288, DESIGN_LEFT_MIN, DESIGN_LEFT_MAX)).toBe(288);
    });

    it("parses open flags", () => {
        expect(parseStoredOpen("false")).toBe(false);
        expect(parseStoredOpen("true")).toBe(true);
        expect(parseStoredOpen(null)).toBe(true);
    });
});
