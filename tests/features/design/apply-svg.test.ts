import { describe, expect, it } from "vitest";
import {
    isSvgIntrinsicTag,
    jsxNameMatchesDomTag,
    locateJsxByHint,
    locateJsxBySelector,
    locateJsxElement,
    selectorAtSvgRoot,
} from "@/features/preview/design-mode/apply/locate-jsx";
import { patchOpeningTag } from "@/features/preview/design-mode/apply/patch-tag";
import { stylesToClassTokens } from "@/features/preview/design-mode/apply/class-tokens";

/**
 * Clicking an icon in the preview selects the rendered <svg> (or a <path> inside it),
 * but the authored source only ever contains the component that renders it.
 */
const ICON_PAGE = `import { Search, Gamepad2 } from "lucide-react";

export default function Page() {
    return (
        <main className="page">
            <header className="topbar">
                <button className="search-btn" type="button">
                    <Search className="w-4 h-4" />
                </button>
            </header>
            <section className="games">
                <Gamepad2 className="w-6 h-6 text-blue" />
                <svg className="badge-icon" viewBox="0 0 24 24">
                    <path d="M4 4h16v16H4z" />
                </svg>
            </section>
        </main>
    );
}
`;

describe("svg tag aliasing", () => {
    it("knows which tags are svg internals", () => {
        expect(isSvgIntrinsicTag("svg")).toBe(true);
        expect(isSvgIntrinsicTag("path")).toBe(true);
        expect(isSvgIntrinsicTag("circle")).toBe(true);
        expect(isSvgIntrinsicTag("div")).toBe(false);
        expect(isSvgIntrinsicTag("button")).toBe(false);
        expect(isSvgIntrinsicTag("")).toBe(false);
    });

    it("lets an svg DOM node match the component that renders it", () => {
        expect(jsxNameMatchesDomTag("Search", "svg")).toBe(true);
        expect(jsxNameMatchesDomTag("Icon", "path")).toBe(true);
        expect(jsxNameMatchesDomTag("Lucide.Search", "svg")).toBe(true);
        expect(jsxNameMatchesDomTag("svg", "svg")).toBe(true);
    });

    it("still refuses unrelated tags", () => {
        expect(jsxNameMatchesDomTag("Search", "div")).toBe(false);
        expect(jsxNameMatchesDomTag("button", "svg")).toBe(false);
        expect(jsxNameMatchesDomTag("span", "div")).toBe(false);
    });

    it("accepts the owning component by name even when the tag is unrelated", () => {
        expect(jsxNameMatchesDomTag("Avatar", "span", "Avatar")).toBe(true);
        expect(jsxNameMatchesDomTag("Avatar", "span", "Badge")).toBe(false);
    });
});

describe("selectorAtSvgRoot", () => {
    it("trims svg internals off the end of a css path", () => {
        expect(selectorAtSvgRoot("button.search-btn>svg>path:nth-of-type(1)")).toBe("button.search-btn>svg");
        expect(selectorAtSvgRoot("main>section>svg>g>circle")).toBe("main>section>svg");
    });

    it("returns nothing when there is no svg or nothing below it", () => {
        expect(selectorAtSvgRoot("main.page>section.games")).toBeUndefined();
        expect(selectorAtSvgRoot("button.search-btn>svg")).toBeUndefined();
        expect(selectorAtSvgRoot(undefined)).toBeUndefined();
    });
});

describe("locating an icon clicked at svg depth", () => {
    it("resolves the mapped line to the icon component", () => {
        const found = locateJsxElement(ICON_PAGE, "app/page.tsx", { lineNumber: 8 });
        expect(found.ok).toBe(true);
        if (!found.ok) return;
        expect(found.hit.tagName).toBe("Search");
        expect(jsxNameMatchesDomTag(found.hit.tagName, "svg")).toBe(true);
    });

    it("finds the icon by component name when the dom reports svg", () => {
        const found = locateJsxByHint(ICON_PAGE, "app/page.tsx", {
            tag: "svg",
            className: "w-6 h-6 text-blue",
            componentName: "Gamepad2",
            lineNumber: 12,
        });
        expect(found.ok).toBe(true);
        if (found.ok) expect(found.hit.tagName).toBe("Gamepad2");
    });

    it("finds the icon by component name even with no usable className", () => {
        const found = locateJsxByHint(ICON_PAGE, "app/page.tsx", {
            tag: "svg",
            className: "",
            componentName: "Search",
            lineNumber: 8,
        });
        expect(found.ok).toBe(true);
        if (found.ok) expect(found.hit.tagName).toBe("Search");
    });

    it("walks a selector down to the icon component", () => {
        const found = locateJsxBySelector(ICON_PAGE, "app/page.tsx", "main.page>header.topbar>button.search-btn>svg");
        expect(found.ok).toBe(true);
        if (found.ok) expect(found.hit.tagName).toBe("Search");
    });

    it("reaches the icon from a selector that descends into svg internals", () => {
        const raw = "main.page>header.topbar>button.search-btn>svg>path:nth-of-type(1)";
        const direct = locateJsxBySelector(ICON_PAGE, "app/page.tsx", raw);
        expect(direct.ok).toBe(true);
        if (direct.ok) expect(direct.hit.tagName).toBe("Search");

        const trimmed = selectorAtSvgRoot(raw);
        expect(trimmed).toBe("main.page>header.topbar>button.search-btn>svg");
        const viaTrim = locateJsxBySelector(ICON_PAGE, "app/page.tsx", trimmed);
        expect(viaTrim.ok).toBe(true);
        if (viaTrim.ok) expect(viaTrim.hit.tagName).toBe("Search");
    });

    it("patches the icon usage rather than failing", () => {
        const found = locateJsxByHint(ICON_PAGE, "app/page.tsx", {
            tag: "svg",
            className: "w-4 h-4",
            componentName: "Search",
            lineNumber: 8,
        });
        expect(found.ok).toBe(true);
        if (!found.ok) return;
        const next = patchOpeningTag(found.hit.text, stylesToClassTokens({ color: "#ff0000" }));
        expect(next).toContain("Search");
        expect(next).toContain("w-4");
        expect(next).toContain("text-[#ff0000]");
    });
});

describe("inline svg still resolves to itself", () => {
    it("prefers the literal svg element over a component", () => {
        const found = locateJsxByHint(ICON_PAGE, "app/page.tsx", {
            tag: "svg",
            className: "badge-icon",
            lineNumber: 13,
        });
        expect(found.ok).toBe(true);
        if (found.ok) expect(found.hit.tagName).toBe("svg");
    });

    it("resolves a literal svg by selector", () => {
        const found = locateJsxBySelector(ICON_PAGE, "app/page.tsx", "main.page>section.games>svg.badge-icon");
        expect(found.ok).toBe(true);
        if (found.ok) expect(found.hit.tagName).toBe("svg");
    });
});

describe("svg aliasing does not loosen ordinary matching", () => {
    it("does not let a bare svg tag pick an arbitrary component", () => {
        expect(locateJsxByHint(ICON_PAGE, "app/page.tsx", { tag: "svg" }).ok).toBe(false);
    });

    it("does not let a div match a component", () => {
        expect(locateJsxByHint(ICON_PAGE, "app/page.tsx", { tag: "div", componentName: "Search" }).ok).toBe(false);
    });
});
