import { describe, expect, it } from "vitest";
import { reorderSiblingElements } from "@/features/preview/design/apply/sibling-reorder";

describe("reorderSiblingElements", () => {
    it("swaps two JSX siblings inside a parent", () => {
        const src = `<div className="flex"><button>One</button><button>Two</button><button>Three</button></div>`;
        const result = reorderSiblingElements(src, {
            parentHint: "div",
            fromIndex: 0,
            toIndex: 2,
        });
        if ("error" in result) {
            expect.fail(result.error);
        }
        // [One, Two, Three] → move 0→2 → [Two, Three, One]
        expect(result.content.replace(/\s+/g, "")).toContain("button>Two</button><button>Three</button><button>One</button");
        expect(result.content).toContain("<button>One</button>");
        expect(result.content.indexOf("<button>Two</button>")).toBeLessThan(
            result.content.indexOf("<button>One</button>"),
        );
    });

    it("refuses .map children", () => {
        const src = `<div>{items.map((x) => <span key={x}>{x}</span>)}</div>`;
        const result = reorderSiblingElements(src, {
            parentHint: "div",
            fromIndex: 0,
            toIndex: 1,
        });
        expect(result).toEqual(
            expect.objectContaining({ error: expect.stringMatching(/map|expression/i) }),
        );
    });

    it("no-ops when indices match", () => {
        const src = `<ul><li>a</li><li>b</li></ul>`;
        const result = reorderSiblingElements(src, {
            parentHint: "ul",
            fromIndex: 1,
            toIndex: 1,
        });
        expect(result).toEqual({ content: src });
    });
});
