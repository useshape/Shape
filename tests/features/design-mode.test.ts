import { describe, expect, it } from "vitest";
import { serializeDesignEdits, upsertDesignPending, clearDesignPending, setDesignSelected } from "@/features/preview/design-mode/store";
import { findLayerPath } from "@/features/preview/design-mode/tree";
import type { DesignLayerNode } from "@/features/preview/design-mode/types";
import {
    historyKey,
    MAX_UNDO,
    pushEntry,
    shouldCoalesce,
    type HistoryEntry,
} from "@/features/preview/design-mode/history";
import {
    stylesToClassTokens,
    patchOpeningTag,
    findOpeningTag,
    classSearchNeedles,
    scoreSourceLine,
    patchInlineStyles,
    mergeClassTokens,
    cssModuleLocal,
} from "@/features/preview/design-mode/apply-to-source";
import { isBundledGeneratedPath, isProjectSourcePath, isResolvedSource, normalizeOriginalSourcePath, pathFromGeneratedChunk, enrichSourceIdentity } from "@/features/preview/design-mode/source-identity";
import { locateJsxByHint, locateJsxElement, locateJsxFromSearchLine } from "@/features/preview/design-mode/apply-jsx";
import { patchCssClass } from "@/features/preview/design-mode/apply-css";
import { formatLinearGradient, parseLinearGradient } from "@/features/preview/design-mode/css";

describe("design mode pending edits", () => {
    it("serializes style and text edits for Apply", () => {
        clearDesignPending();
        upsertDesignPending({
            id: "abc",
            label: "h1.hero",
            styles: { fontSize: "32px", color: "rgb(255,255,255)" },
            text: "Welcome",
        });
        const prompt = serializeDesignEdits();
        expect(prompt).toContain("h1.hero");
        expect(prompt).toContain("fontSize: 32px");
        expect(prompt).toContain("Welcome");
        clearDesignPending();
        setDesignSelected(null);
    });

    it("includes a CSS selector so Apply can map the element after reload", () => {
        clearDesignPending();
        upsertDesignPending({
            id: "tmp",
            selector: "main:nth-of-type(1)>h1",
            label: "h1",
            styles: { fontFamily: "Georgia, serif" },
        });
        const prompt = serializeDesignEdits();
        expect(prompt).toContain("main:nth-of-type(1)>h1");
        expect(prompt).toContain("fontFamily: Georgia, serif");
        clearDesignPending();
    });
});

describe("design history coalescing", () => {
    it("merges rapid edits to the same keys and caps the stack", () => {
        const first: HistoryEntry = {
            at: 1000,
            id: "a",
            label: "div",
            before: { width: "10px" },
            after: { width: "20px" },
        };
        const second: HistoryEntry = {
            at: 1100,
            id: "a",
            label: "div",
            before: { width: "20px" },
            after: { width: "40px" },
        };
        expect(shouldCoalesce(first, second)).toBe(true);
        const merged = pushEntry([first], second);
        expect(merged).toHaveLength(1);
        expect(merged[0]?.after.width).toBe("40px");
        expect(merged[0]?.before.width).toBe("10px");
    });

    it("does not coalesce different properties or ids", () => {
        const a: HistoryEntry = {
            at: 1000,
            id: "a",
            label: "div",
            before: { width: "10px" },
            after: { width: "20px" },
        };
        const b: HistoryEntry = {
            at: 1100,
            id: "a",
            label: "div",
            before: { color: "red" },
            after: { color: "blue" },
        };
        expect(shouldCoalesce(a, b)).toBe(false);
        expect(pushEntry([a], b)).toHaveLength(2);
    });

    it("drops oldest entries past the cap", () => {
        let stack: HistoryEntry[] = [];
        for (let i = 0; i < MAX_UNDO + 5; i++) {
            stack = pushEntry(stack, {
                at: i * 1000,
                id: "n",
                label: "div",
                before: { width: `${i}px` },
                after: { width: `${i + 1}px` },
            });
        }
        expect(stack).toHaveLength(MAX_UNDO);
        expect(stack[0]?.after.width).toBe("6px");
    });

    it("keys unsaved sessions by origin and path", () => {
        expect(historyKey("http://localhost:3000/app?x=1")).toBe("design:http://localhost:3000/app");
    });
});

describe("apply edits to source", () => {
    it("maps CSS properties to Tailwind tokens", () => {
        expect(stylesToClassTokens({ fontSize: "32px", backgroundColor: "#0800FF", fontWeight: "500" })).toEqual([
            "text-[32px]",
            "bg-[#0800ff]",
            "font-medium",
        ]);
    });

    it("keeps responsive variants when replacing a utility", () => {
        expect(mergeClassTokens(["md:bg-[#fff]", "hover:text-[#000]", "hero"], ["bg-[#000]"], "md:")).toEqual([
            "hover:text-[#000]",
            "hero",
            "md:bg-[#000]",
        ]);
    });

    it("does not treat font-family arbitrary tokens as font-weight", () => {
        expect(mergeClassTokens(["font-['Inter']", "font-medium"], ["font-bold"])).toEqual(["font-['Inter']", "font-bold"]);
    });

    it("inserts classes on a JSX opening tag without a className", () => {
        const next = patchOpeningTag('<button type="button">', ["text-[32px]", "bg-[#fff]"]);
        expect(next).toBe('<button type="button" className="text-[32px] bg-[#fff]">');
    });

    it("merges into an existing className string", () => {
        const next = patchOpeningTag('<h1 className="hero title">', ["text-[40px]"]);
        expect(next).toContain("hero");
        expect(next).toContain("text-[40px]");
    });

    it("finds a multiline opening tag near a line number", () => {
        const src = `export function Hero() {\n  return (\n    <h1\n      className="title"\n    >Hello</h1>\n  );\n}\n`;
        const found = findOpeningTag(src, "h1", 4);
        expect(found?.text).toContain("<h1");
        expect(found?.text).toContain("className");
    });

    it("scores a div line by its classes instead of skipping divs", () => {
        const edit = { id: "1", label: "div", tag: "div", className: "hero-card mt-4 flex", styles: {} };
        expect(scoreSourceLine('<div className="hero-card mt-4 flex">', edit)).toBeGreaterThan(
            scoreSourceLine("<span>other</span>", edit),
        );
        expect(classSearchNeedles("hero-card mt-4 flex").some((n) => n.includes("hero-card"))).toBe(true);
        expect(classSearchNeedles("inline-flex !p-0 h-fit group/button")[0]).toBe("!p-0");
        expect(scoreSourceLine("true: 'px-6 py-8'", { id: "1", label: "div", tag: "div", className: "px-6 py-8", styles: {} })).toBeLessThan(
            scoreSourceLine("<Section className='px-6 py-8'>", { id: "1", label: "div", tag: "div", className: "px-6 py-8", styles: {} }),
        );
    });

    it("writes inline CSS when the project is not Tailwind", () => {
        const html = patchInlineStyles("<div>", { color: "red", fontSize: "18px" }, true);
        expect(html).toContain('style="color: red; font-size: 18px"');
        const jsx = patchInlineStyles("<div>", { color: "red" }, false);
        expect(jsx).toContain("style={{ color: \"red\" }}");
    });

    it("replaces conflicting Tailwind utilities instead of stacking them", () => {
        expect(mergeClassTokens(["text-[16px]", "hero", "bg-[#fff]"], ["text-[32px]", "bg-[#000]"])).toEqual([
            "hero",
            "text-[32px]",
            "bg-[#000]",
        ]);
    });

    it("merges into an existing JSX style object instead of skipping it", () => {
        const next = patchInlineStyles('<div style={{ color: "red" }}>', { fontSize: "18px", color: "blue" }, false);
        expect(next).toContain('color: "blue"');
        expect(next).toContain('fontSize: "18px"');
        expect(next).not.toContain('color: "red"');
    });

    it("picks the opening tag closest to the source line, not the first in the file", () => {
        const src = `<div className="a">A</div>\n<section>\n  <div className="hero-card">B</div>\n</section>\n`;
        const found = findOpeningTag(src, "div", 3);
        expect(found?.text).toContain("hero-card");
    });

    it("maps CSS module hashes back to the local class name", () => {
        expect(cssModuleLocal("Hero_title__xK3p")).toBe("title");
        expect(cssModuleLocal("flex")).toBeNull();
    });

    it("does not treat a bare tag name as enough to locate an element", () => {
        const edit = { id: "1", label: "div", tag: "div", className: "", styles: {} };
        expect(scoreSourceLine("<div>", edit)).toBeLessThan(8);
    });

    it("locates a unique JSX node from a source line and refuses overlapping tags", () => {
        const src = `export function Hero() {\n  return (\n    <h1 className="title">Hello</h1>\n  );\n}\n`;
        const found = locateJsxElement(src, "Hero.tsx", { lineNumber: 3, columnNumber: 6 });
        expect(found.ok).toBe(true);
        if (found.ok) expect(found.hit.tagName).toBe("h1");
        const ambiguous = locateJsxElement(
            `export function X() {\n  return (\n    <span className="a" /><span className="b" />\n  );\n}\n`,
            "X.tsx",
            { lineNumber: 3, columnNumber: 1 },
        );
        expect(ambiguous.ok).toBe(false);
    });

    it("treats Next chunks and empty component names as unresolved source identity", () => {
        expect(isBundledGeneratedPath("/_next/static/chunks/src_01u.he5._.js")).toBe(true);
        expect(isProjectSourcePath("/_next/static/chunks/src_01u.he5._.js")).toBe(false);
        expect(isResolvedSource({ fileName: "", lineNumber: 0, componentName: "Hero" })).toBe(false);
        expect(isResolvedSource({ fileName: "exports.jsx", lineNumber: 1 })).toBe(false);
        expect(pathFromGeneratedChunk("app_page_tsx_1s_43kl._.js")).toBe("app/page.tsx");
        expect(enrichSourceIdentity({
            fileName: "page.tsx",
            lineNumber: 1353,
            mapped: false,
            generated: { fileName: "app_page_tsx_1s_43kl._.js", lineNumber: 1353, columnNumber: 231 },
        })?.fileName).toBe("app/page.tsx");
        expect(isResolvedSource({ fileName: "src/components/view-animation.tsx", lineNumber: 41 })).toBe(true);
        expect(normalizeOriginalSourcePath("webpack://portfolio/./src/components/view-animation.tsx")).toBe(
            "src/components/view-animation.tsx",
        );
        expect(normalizeOriginalSourcePath("http://localhost:5173/src/App.tsx?t=123")).toBe("src/App.tsx");
        expect(isResolvedSource({ fileName: "http://localhost:5173/src/App.tsx", lineNumber: 12 })).toBe(true);
    });

    it("maps a cva string hit to the JSX that consumes it, and a Link override to that JSX", () => {
        const button = `const buttonVariants = cva(\n  "group/button inline-flex",\n  { variants: {} }\n)\nfunction Button() {\n  return (\n    <Comp className={cn(buttonVariants({ variant: "link" }))} />\n  )\n}\n`;
        const fromCva = locateJsxFromSearchLine(button, "button.tsx", 2);
        expect(fromCva.ok).toBe(true);
        if (fromCva.ok) expect(fromCva.hit.tagName).toBe("Comp");

        const about = `export default function About() {\n  return (\n    <div className="space-y-4">\n      <p className="text-lg">I'm Anirudh, a full-stack developer</p>\n      <Link className={cn(buttonVariants({ variant: "link" }), "!p-0 h-fit")} href="/about">Learn More</Link>\n    </div>\n  )\n}\n`;
        const link = locateJsxByHint(about, "about.tsx", { className: "group/button inline-flex !p-0 h-fit", tag: "a", locateText: "Learn More" });
        expect(link.ok).toBe(true);
        if (link.ok) expect(link.hit.tagName).toBe("Link");
        const p = locateJsxByHint(about, "about.tsx", { className: "text-lg", tag: "p", locateText: "I'm Anirudh, a full-stack developer" });
        expect(p.ok).toBe(true);
        if (p.ok) expect(p.hit.tagName).toBe("p");

        const wrongLine = locateJsxByHint(about, "about.tsx", {
            className: "text-lg",
            tag: "p",
            locateText: "I'm Anirudh, a full-stack developer",
            lineNumber: 1,
        });
        expect(wrongLine.ok).toBe(true);
        if (wrongLine.ok) expect(wrongLine.hit.tagName).toBe("p");
    });

    it("patches a CSS class with PostCSS without flattening @media siblings", () => {
        const css = `.card { color: red; }\n@media (min-width: 768px) {\n  .card { color: blue; }\n}\n`;
        const result = patchCssClass(css, "card", [{ prop: "color", value: "green" }], { media: "(min-width: 768px)" });
        expect("css" in result).toBe(true);
        if ("css" in result) {
            expect(result.css).toContain("green");
            expect(result.css).toContain("color: red");
        }
    });

    it("round-trips a linear gradient", () => {
        const css = formatLinearGradient(90, [
            { pos: 7, color: "#A3F0FF" },
            { pos: 93, color: "#FFFFFF" },
        ]);
        const parsed = parseLinearGradient(css);
        expect(parsed?.angle).toBe(90);
        expect(parsed?.stops).toHaveLength(2);
        expect(parsed?.stops[0]?.color).toBe("#A3F0FF");
    });
});

describe("design layers tree", () => {
    it("finds the ancestor path so the selected node can be expanded", () => {
        const tree: DesignLayerNode[] = [
            {
                id: "root",
                tag: "body",
                label: "body",
                children: [
                    {
                        id: "main",
                        tag: "main",
                        label: "main",
                        children: [{ id: "btn", tag: "button", label: "button.cta", children: [] }],
                    },
                ],
            },
        ];
        expect(findLayerPath(tree, "btn")).toEqual(["root", "main", "btn"]);
        expect(findLayerPath(tree, "missing")).toBeNull();
    });
});
