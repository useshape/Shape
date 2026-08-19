import { describe, expect, it } from "vitest";
import { mergeClassTokens, stylesToClassTokens } from "@/features/preview/design-mode/apply/class-tokens";
import {
    openingTagHasTokens,
    patchInlineStyles,
    patchOpeningTag,
    wrapClassLiteral,
} from "@/features/preview/design-mode/apply/patch-tag";
import { validateJsxSource } from "@/features/preview/design-mode/apply/locate-jsx";
import type { DesignComputedStyles } from "@/features/preview/design-mode/types";
import { effectsToStyles, type DesignEffect, type DesignEffectKind } from "@/features/preview/ui/design/fields";
import {
    DESIGN_EXPORT_FORMATS,
    DESIGN_EXPORT_SCALES,
    DESIGN_SECTION_ORDER,
    designFillTarget,
    designFlow,
    formatRadiusCorners,
    isDesignTextElement,
    parseRadiusCorners,
    stylesForFlow,
    type DesignFlow,
} from "@/features/preview/ui/design/panel-layout";

function page(tag: string) {
    return `export default function Page() {\n  return (\n    ${tag}\n  );\n}\n`;
}

function applyTw(tag: string, styles: Record<string, string>) {
    return patchOpeningTag(tag, stylesToClassTokens(styles));
}

function expectParses(tag: string) {
    const name = tag.match(/^<\s*([A-Za-z][\w.]*)/)?.[1] ?? "div";
    const html = /\/\s*>$/.test(tag) ? tag : `${tag}</${name}>`;
    const err = validateJsxSource("app/page.tsx", page(html));
    expect(err, html).toBeNull();
}

/** One representative value for every inspectable style the Design panel can commit. */
const EVERY_STYLE: DesignComputedStyles = {
    color: "#111111",
    backgroundColor: "#202022",
    backgroundImage: "none",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    fontSize: "55px",
    fontWeight: "600",
    fontStyle: "italic",
    lineHeight: "24px",
    letterSpacing: "-0.5px",
    textAlign: "center",
    textDecoration: "underline",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    marginTop: "4px",
    marginRight: "4px",
    marginBottom: "8px",
    marginLeft: "4px",
    paddingTop: "8px",
    paddingRight: "12px",
    paddingBottom: "8px",
    paddingLeft: "12px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#000000",
    borderRadius: "8px",
    opacity: "0.5",
    boxShadow: "0px 4px 16px rgb(0 0 0 / 0.25)",
    display: "flex",
    width: "435px",
    height: "347px",
    gap: "16px",
    columnGap: "16px",
    rowGap: "8px",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    overflow: "hidden",
    position: "relative",
    top: "10px",
    right: "0px",
    bottom: "0px",
    left: "20px",
    mixBlendMode: "multiply",
    filter: "blur(8px)",
    backdropFilter: "blur(20px)",
    maskImage: "none",
    WebkitMaskImage: "none",
};

const STYLE_KEYS = Object.keys(EVERY_STYLE) as (keyof DesignComputedStyles)[];

describe("design panel layout", () => {
    it("orders sections as grouped blocks", () => {
        expect([...DESIGN_SECTION_ORDER]).toEqual([
            "position",
            "layout",
            "appearance",
            "typography",
            "fill",
            "stroke",
            "effects",
            "export",
        ]);
        expect([...DESIGN_EXPORT_FORMATS]).toEqual(["png", "svg", "pdf", "webm"]);
        expect([...DESIGN_EXPORT_SCALES]).toEqual([1, 2, 4]);
    });

    it("routes text fill to color and shape fill to background", () => {
        for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "a", "button", "label", "li"]) {
            expect(isDesignTextElement(tag, "")).toBe(true);
        }
        expect(isDesignTextElement("div", "Hello")).toBe(true);
        expect(isDesignTextElement("div", "")).toBe(false);
        expect(isDesignTextElement("section", "")).toBe(false);
        expect(designFillTarget(true)).toBe("color");
        expect(designFillTarget(false)).toBe("backgroundColor");
    });

    it.each(["block", "row", "column", "grid"] as DesignFlow[])("flow %s writes display tokens that parse", (flow) => {
        expect(designFlow(stylesForFlow(flow).display, stylesForFlow(flow).flexDirection || "row")).toBe(
            flow === "block" ? "block" : flow,
        );
        const tag = applyTw(`<div className="box">`, stylesForFlow(flow));
        expect(tag.length).toBeGreaterThan(10);
        expectParses(tag);
    });

    it("round-trips corner radius shorthands", () => {
        expect(parseRadiusCorners("")).toEqual([0, 0, 0, 0]);
        expect(parseRadiusCorners("8px")).toEqual([8, 8, 8, 8]);
        expect(parseRadiusCorners("8px 4px")).toEqual([8, 4, 8, 4]);
        expect(parseRadiusCorners("8px 4px 2px")).toEqual([8, 4, 2, 4]);
        expect(parseRadiusCorners("8px 4px 2px 1px")).toEqual([8, 4, 2, 1]);
        expect(formatRadiusCorners(8, 8, 8, 8)).toBe("8px");
        expect(formatRadiusCorners(8, 4, 2, 1)).toBe("8px 4px 2px 1px");
        expectParses(applyTw(`<div className="card">`, { borderRadius: formatRadiusCorners(8, 4, 2, 1) }));
    });
});

describe("every Design style key maps to a class token and a valid JSX patch", () => {
    it("covers every key on DesignComputedStyles", () => {
        expect(STYLE_KEYS.sort()).toEqual(
            [
                "alignItems",
                "backdropFilter",
                "backgroundColor",
                "backgroundImage",
                "borderColor",
                "borderRadius",
                "borderStyle",
                "borderWidth",
                "bottom",
                "boxShadow",
                "color",
                "columnGap",
                "display",
                "filter",
                "flexDirection",
                "flexWrap",
                "fontFamily",
                "fontSize",
                "fontStyle",
                "fontWeight",
                "gap",
                "height",
                "justifyContent",
                "left",
                "letterSpacing",
                "lineHeight",
                "marginBottom",
                "marginLeft",
                "marginRight",
                "marginTop",
                "maskImage",
                "mixBlendMode",
                "opacity",
                "overflow",
                "paddingBottom",
                "paddingLeft",
                "paddingRight",
                "paddingTop",
                "position",
                "right",
                "rowGap",
                "textAlign",
                "textDecoration",
                "textOverflow",
                "textTransform",
                "top",
                "whiteSpace",
                "width",
                "WebkitMaskImage",
            ].sort(),
        );
    });

    it.each(STYLE_KEYS)("%s produces at least one token", (key) => {
        const tokens = stylesToClassTokens({ [key]: EVERY_STYLE[key] });
        expect(tokens.length, `${key} → ${JSON.stringify(tokens)}`).toBeGreaterThan(0);
        expect(tokens.join(" ")).not.toMatch(/font-\['/);
    });

    it.each(STYLE_KEYS)("%s className patch still parses", (key) => {
        const tag = applyTw(`<div className="node">`, { [key]: EVERY_STYLE[key] });
        expect(tag).toContain("className=");
        expectParses(tag);
    });

    it.each(STYLE_KEYS)("%s inline style patch still parses", (key) => {
        const tag = patchInlineStyles(`<div className="node">`, { [key]: EVERY_STYLE[key] }, false);
        expect(tag).toContain("style={{");
        expectParses(tag);
    });

    it("applies the full style set in one className patch", () => {
        const tag = applyTw(`<section className="browse">`, EVERY_STYLE);
        expect(tag).toContain("font-semibold");
        expect(tag).toContain("font-[Inter]");
        expectParses(tag);
    });
});

describe("typography option matrix", () => {
    it.each(["100", "200", "300", "400", "500", "600", "700", "800", "900"] as const)("fontWeight %s", (w) => {
        const tokens = stylesToClassTokens({ fontWeight: w });
        expect(tokens).toHaveLength(1);
        expectParses(applyTw(`<p className="t">`, { fontWeight: w }));
    });

    it.each(["left", "center", "right", "justify"] as const)("textAlign %s", (align) => {
        expect(stylesToClassTokens({ textAlign: align })).toEqual([`text-${align}`]);
        expectParses(applyTw(`<p className="t">`, { textAlign: align }));
    });

    it.each([
        ["italic", "italic"],
        ["normal", "not-italic"],
    ] as const)("fontStyle %s", (value, token) => {
        expect(stylesToClassTokens({ fontStyle: value })).toEqual([token]);
    });

    it.each([
        ["underline", "underline"],
        ["line-through", "line-through"],
        ["none", "no-underline"],
    ] as const)("textDecoration %s", (value, token) => {
        expect(stylesToClassTokens({ textDecoration: value })).toEqual([token]);
    });

    it.each([
        ["uppercase", "uppercase"],
        ["lowercase", "lowercase"],
        ["capitalize", "capitalize"],
        ["none", "normal-case"],
    ] as const)("textTransform %s", (value, token) => {
        expect(stylesToClassTokens({ textTransform: value })).toEqual([token]);
    });

    it("does not nest quotes in font-family tokens", () => {
        expect(stylesToClassTokens({ fontFamily: "Inter, sans-serif" })).toEqual(["font-[Inter]"]);
        expect(stylesToClassTokens({ fontFamily: '"IBM Plex Mono", monospace' })).toEqual(["font-[IBM_Plex_Mono]"]);
    });

    it("keeps weight and family in different conflict groups", () => {
        const next = mergeClassTokens(["hero-title", "font-medium"], ["font-semibold", "font-[Inter]"]);
        expect(next).toEqual(expect.arrayContaining(["hero-title", "font-semibold", "font-[Inter]"]));
        expect(next).not.toContain("font-medium");
    });

    it("patches quoted className variants without breaking JSX", () => {
        expectParses(applyTw(`<div className="hero-title">`, { fontWeight: "600" }));
        expectParses(applyTw(`<div className='hero-title'>`, { fontWeight: "600", fontFamily: "Inter, sans-serif" }));
        expectParses(applyTw(`<div className={'lede'}>`, { fontWeight: "600" }));
        const already = `<div className="lede font-semibold">`;
        expect(patchOpeningTag(already, ["font-semibold"])).toBe(already);
        expect(openingTagHasTokens(already, ["font-semibold"])).toBe(true);
        expect(wrapClassLiteral(`foo font-['Inter']`, "string")).toBe(`"foo font-['Inter']"`);
        expectParses(patchOpeningTag(`<div className='lede'>`, ["font-['Inter']"]));
    });
});

describe("layout, fill, stroke, and clip options", () => {
    it.each([
        ["flex-start", "justify-start"],
        ["center", "justify-center"],
        ["flex-end", "justify-end"],
        ["space-between", "justify-between"],
        ["space-around", "justify-around"],
        ["space-evenly", "justify-evenly"],
    ] as const)("justifyContent %s", (value, token) => {
        expect(stylesToClassTokens({ justifyContent: value })).toEqual([token]);
    });

    it.each([
        ["flex-start", "items-start"],
        ["center", "items-center"],
        ["flex-end", "items-end"],
        ["stretch", "items-stretch"],
        ["baseline", "items-baseline"],
    ] as const)("alignItems %s", (value, token) => {
        expect(stylesToClassTokens({ alignItems: value })).toEqual([token]);
    });

    it.each(["solid", "dashed", "dotted", "none"] as const)("borderStyle %s", (value) => {
        const tokens = stylesToClassTokens({ borderStyle: value });
        expect(tokens.length).toBeGreaterThan(0);
        expectParses(applyTw(`<div className="box">`, { borderStyle: value, borderWidth: "1px", borderColor: "#000000" }));
    });

    it("clip content, constrain size, and position", () => {
        expect(stylesToClassTokens({ overflow: "hidden" })).toEqual(["overflow-hidden"]);
        expect(stylesToClassTokens({ overflow: "visible" })).toEqual(["overflow-visible"]);
        expect(stylesToClassTokens({ width: "100%" })).toEqual(["w-full"]);
        expect(stylesToClassTokens({ opacity: "1" })).toEqual(["opacity-100"]);
        expect(stylesToClassTokens({ opacity: "0.4" })).toEqual(["opacity-40"]);
        expectParses(applyTw(`<div className="box">`, { left: "20px", top: "10px", position: "relative" }));
        expectParses(applyTw(`<div className="box">`, { backgroundColor: "#202022" }));
        expectParses(applyTw(`<p className="t">`, { color: "#ffffff" }));
    });
});

describe("effects options", () => {
    const sample = (kind: DesignEffectKind): DesignEffect => ({
        id: kind,
        kind,
        blur: 8,
        x: 0,
        y: 4,
        spread: 0,
        opacity: 0.25,
        color: "rgb(0 0 0 / 0.25)",
    });

    it.each(["drop-shadow", "inner-shadow", "layer-blur", "background-blur"] as DesignEffectKind[])(
        "%s writes CSS that class/inline apply can parse",
        (kind) => {
            const css = effectsToStyles([sample(kind)]);
            if (kind === "drop-shadow" || kind === "inner-shadow") {
                expect(css.boxShadow).not.toBe("none");
            }
            if (kind === "layer-blur") {
                expect(css.filter).not.toBe("none");
            }
            if (kind === "background-blur") {
                expect(css.backdropFilter).not.toBe("none");
            }
            const styles = Object.fromEntries(Object.entries(css).filter(([, v]) => v && v !== "none")) as Record<string, string>;
            expectParses(applyTw(`<div className="card">`, styles));
            expectParses(patchInlineStyles(`<div className="card">`, styles, false));
        },
    );

    it("progressive blur uses a stacked falloff token, not a uniform mask on the element", () => {
        const css = effectsToStyles([
            { id: "b", kind: "layer-blur", blur: 12, startBlur: 2, progressive: true, progressiveAngle: 180 },
        ]);
        expect(css.filter).toBe("none");
        expect(css["--shape-prog-blur"]).toBe("12px");
        expect(css["--shape-prog-start"]).toBe("2px");
        expect(css["--shape-prog-angle"]).toBe("180deg");
        expect(css.maskImage).toBe("none");
    });
});

describe("inline fallback quoting", () => {
    it("quotes a comma-separated fontFamily in style={{}}", () => {
        const tag = patchInlineStyles(`<div className="lede">`, { fontFamily: "Inter, ui-sans-serif, sans-serif" }, false);
        expect(tag).toContain('fontFamily: "Inter, ui-sans-serif, sans-serif"');
        expectParses(tag);
    });

    it("spreads style={base} and does not eat className={styles.hero}", () => {
        expectParses(patchInlineStyles(`<div style={base}>`, { fontWeight: "600" }, false));
        const tag = patchInlineStyles(`<div className={styles.hero}>`, { fontWeight: "600" }, false);
        expect(tag).toContain("className={styles.hero}");
        expectParses(tag);
    });
});
