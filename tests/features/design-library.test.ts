import { describe, expect, it } from "vitest";
import { DESIGN_BRIDGE_SCRIPT } from "@/features/preview/design/bridge";
import {
    guessSourceFromChunkUrl,
    groupThemeTokens,
    isEditableText,
    isUserSourcePath,
    isUtilityClass,
    layerKind,
    layerTitle,
    libraryGroup,
    normalizeSourcePath,
} from "@/features/preview/design/library";

describe("layer titles", () => {
    it("does not name a wrapper after Tailwind utilities", () => {
        expect(
            layerTitle({
                tag: "div",
                classes: ["flex", "w-full", "items-center", "gap-2", "hero-banner"],
                text: "",
            }),
        ).toBe("Hero banner");
        expect(
            layerTitle({
                tag: "div",
                classes: ["flex", "relative", "min-h-screen"],
                text: "",
            }),
        ).toBe("Frame");
    });

    it("prefers visible copy over the raw tag", () => {
        expect(layerTitle({ tag: "p", text: "Get started today" })).toBe("Get started today");
        expect(layerTitle({ tag: "a", text: "Pricing", classes: ["text-sm"] })).toBe("Pricing");
        expect(layerTitle({ tag: "h1", text: "" })).toBe("Heading 1");
        expect(layerTitle({ tag: "img", alt: "Team photo", classes: ["w-full"] })).toBe("Team photo");
    });

    it("classifies nodes for the tree icons", () => {
        expect(layerKind({ tag: "p", text: "Hi" })).toBe("text");
        expect(layerKind({ tag: "div", text: "Hi" })).toBe("frame");
        expect(layerKind({ tag: "svg" })).toBe("vector");
        expect(isEditableText({ tag: "p", text: "Hello" })).toBe(true);
        expect(isEditableText({ tag: "div", text: "Hello" })).toBe(false);
        expect(isUtilityClass("flex")).toBe(true);
        expect(isUtilityClass("hero-banner")).toBe(false);
    });
});

describe("source mapping from Next chunks", () => {
    it("maps a real app router chunk URL to app/page.tsx", () => {
        expect(
            guessSourceFromChunkUrl("http://127.0.0.1:3000/_next/static/chunks/app/page.js"),
        ).toEqual({ fileName: "app/page.tsx", lineNumber: 1, columnNumber: 1 });
        expect(
            guessSourceFromChunkUrl(
                "http://127.0.0.1:3000/_next/static/chunks/app/page-0a1b2c3d.js",
            ),
        ).toEqual({ fileName: "app/page.tsx", lineNumber: 1, columnNumber: 1 });
    });

    it("refuses runtime bundles that are not project files", () => {
        expect(guessSourceFromChunkUrl("http://127.0.0.1:3000/_next/static/chunks/main-app.js")).toBeNull();
        expect(guessSourceFromChunkUrl("http://127.0.0.1:3000/_next/static/chunks/webpack.js")).toBeNull();
        expect(isUserSourcePath("/_next/static/chunks/app/page.js")).toBe(false);
        expect(isUserSourcePath("app/page.tsx")).toBe(true);
        expect(isUserSourcePath("node_modules/@radix-ui/react-dialog/dist/index.mjs")).toBe(false);
        expect(isUserSourcePath("src/components/header.tsx")).toBe(true);
        expect(isUserSourcePath(".next/server/app/page.js")).toBe(false);
        expect(isUserSourcePath("dist/assets/index.js")).toBe(false);
        expect(DESIGN_BRIDGE_SCRIPT).toContain("function unknownDomAttr");
        expect(
            normalizeSourcePath("webpack://_N_E/./src/components/Hero.tsx"),
        ).toBe("src/components/Hero.tsx");
    });
});

describe("library grouping", () => {
    it("puts CSS variables in the groups a designer would look in", () => {
        const groups = groupThemeTokens([
            { name: "--background", value: "oklch(0.14 0 0)" },
            { name: "--font-sans", value: "Inter, ui-sans-serif" },
            { name: "--link", value: "#3b82f6" },
            { name: "--radius", value: "8px" },
        ]);
        expect(groups.color.map((token) => token.name)).toContain("--background");
        expect(groups.text.map((token) => token.name)).toContain("--font-sans");
        expect(groups.link.map((token) => token.name)).toContain("--link");
        expect(groups.other.map((token) => token.name)).toContain("--radius");
        expect(groups.color.map((token) => token.name)).not.toContain("--font-sans");
    });

    it("buckets project files the way the library sidebar does", () => {
        expect(libraryGroup("components/ui/button.tsx", "component")).toBe("components");
        expect(libraryGroup("app/globals.css", "style")).toBe("styles");
        expect(libraryGroup("public/logo.svg", "vector")).toBe("vectors");
        expect(libraryGroup("lib/utils.ts", "code")).toBe("code");
        expect(libraryGroup("public/hero.png", "image")).toBe("media");
    });
});

describe("design bridge payload", () => {
    it("still ships the fields the host tree editor reads", () => {
        expect(DESIGN_BRIDGE_SCRIPT).toContain("ariaLabel");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("shape-design-set-text");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("guessFromChunk");
        expect(DESIGN_BRIDGE_SCRIPT).not.toContain("This element has no source mapping");
    });
});
