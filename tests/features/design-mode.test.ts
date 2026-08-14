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
import { stylesToClassTokens, patchOpeningTag, findOpeningTag } from "@/features/preview/design-mode/apply-to-source";

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
