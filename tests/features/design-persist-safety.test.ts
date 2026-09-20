import {
    isSafeDomAttribute,
    locateJsx,
    patchHtmlOpening,
    patchJsx,
    unknownDomProps,
    wouldReactWarnUnknownProp,
} from "@/features/preview/design/jsx-source";

/**
 * Regression net for https://react.dev/warnings/unknown-prop
 * Visual edits must not put component instance props on host DOM tags.
 */
describe("design persist vs React unknown-prop", () => {
    const headerFile = `export function Header({ cartCount, isOpen }: { cartCount: number; isOpen: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
      <div className="container-page flex h-18 items-center gap-4">
        <Brand />
      </div>
    </header>
  );
}
`;

    const layoutFile = `import { Header } from "./header";
export default function RootLayout() {
  return (
    <html>
      <body>
        <Header cartCount={1} isOpen={false} />
        {children}
      </body>
    </html>
  );
}
`;

    it("treats cartCount / isOpen as unknown DOM props per React docs", () => {
        expect(wouldReactWarnUnknownProp("div", "cartCount")).toBe(true);
        expect(wouldReactWarnUnknownProp("div", "isOpen")).toBe(true);
        expect(wouldReactWarnUnknownProp("div", "showBadge")).toBe(true);
        expect(wouldReactWarnUnknownProp("span", "currentUser")).toBe(true);
        expect(wouldReactWarnUnknownProp("Header", "cartCount")).toBe(false);
        expect(wouldReactWarnUnknownProp("div", "className")).toBe(false);
        expect(wouldReactWarnUnknownProp("div", "tabIndex")).toBe(false);
        expect(wouldReactWarnUnknownProp("div", "data-count")).toBe(false);
        expect(wouldReactWarnUnknownProp("a", "href")).toBe(false);
        expect(wouldReactWarnUnknownProp("button", "onClick")).toBe(false);
        expect(isSafeDomAttribute("div", "cartCount")).toBe(false);
    });

    it("does not write Header props onto the inner header.tsx div (reported crash)", () => {
        expect(() =>
            patchJsx(
                headerFile,
                { tag: "div", classes: ["container-page"], line: 4 },
                { attributes: { cartCount: "3" } },
            ),
        ).toThrow(/cartCount/);
        expect(unknownDomProps(headerFile)).toEqual([]);
    });

    it("still styles the inner div without inventing props", () => {
        const next = patchJsx(
            headerFile,
            { tag: "div", classes: ["container-page"] },
            { styles: { gap: "8px" } },
        );
        expect(next).toMatch(/className="[^"]*gap-/);
        expect(next).not.toMatch(/<(div|header)[^>]*\s(cartCount|isOpen)/);
        expect(unknownDomProps(next)).toEqual([]);
    });

    it("writes instance props at the layout call site, as a number expression", () => {
        const next = patchJsx(
            layoutFile,
            { tag: "Header", line: 6 },
            { attributes: { cartCount: "3", isOpen: "true" } },
        );
        expect(next).toContain("<Header cartCount={3} isOpen");
        expect(next).not.toMatch(/<html[^>]*cartCount/);
        expect(next).not.toMatch(/<body[^>]*cartCount/);
        expect(unknownDomProps(next)).toEqual([]);
    });

    it("rejects the old persist query that mixed Header props with the host div", () => {
        expect(() =>
            patchJsx(
                headerFile,
                {
                    tag: "Header",
                    classes: ["container-page", "flex", "h-18", "items-center", "gap-4"],
                    text: "Brand",
                    line: 4,
                },
                { attributes: { cartCount: "3" } },
            ),
        ).toThrow();
        expect(locateJsx(headerFile, { tag: "Header", line: 4 })).toBeNull();
        expect(locateJsx(headerFile, { tag: "header", line: 3 })).toMatchObject({ tag: "header" });
        expect(locateJsx(layoutFile, { tag: "Header", line: 6 })).toMatchObject({ tag: "Header" });
    });

    it("does not confuse a Header instance with an HTML header tag", () => {
        const source = `export function Page() {
  return (
    <header className="site">
      <Header cartCount={1} />
    </header>
  );
}
`;
        expect(locateJsx(source, { tag: "Header", line: 4 })).toMatchObject({ tag: "Header" });
        expect(locateJsx(source, { tag: "header", line: 3 })).toMatchObject({ tag: "header" });
        const next = patchJsx(source, { tag: "Header", line: 4 }, { attributes: { cartCount: "9" } });
        expect(next).toContain("<Header cartCount={9} />");
        expect(next).not.toMatch(/<header[^>]*cartCount/);
        expect(unknownDomProps(next)).toEqual([]);
    });

    it.each(["isActive", "isLoading", "hasItems", "cartCount", "productId", "variantId"])(
        "never emits %s on a DOM host",
        (name) => {
            const source = `<nav className="bar"><a className="link" href="/">Shop</a></nav>`;
            expect(wouldReactWarnUnknownProp("a", name)).toBe(true);
            expect(() =>
                patchJsx(source, { tag: "a", classes: ["link"] }, { attributes: { [name]: "1" } }),
            ).toThrow();
            expect(unknownDomProps(source)).toEqual([]);
        },
    );
});

describe("design persist across stacks Shape does not control", () => {
    it("allows third-party call sites in user files, not package sources", () => {
        const page = `import { Button } from "@radix-ui/themes";
export default function Page() {
  return <Button variant="solid">Buy</Button>;
}
`;
        const next = patchJsx(page, { tag: "Button", line: 3 }, { attributes: { variant: "soft" } });
        expect(next).toContain('<Button variant="soft">');
        expect(unknownDomProps(next)).toEqual([]);
    });

    it("treats motion.div / styled hosts as components, HTML as DOM", () => {
        expect(wouldReactWarnUnknownProp("motion.div", "animate")).toBe(false);
        expect(wouldReactWarnUnknownProp("styled.div", "as")).toBe(false);
        expect(wouldReactWarnUnknownProp("div", "layoutId")).toBe(true);
        const source = `import { motion } from "framer-motion";
export function Hero() {
  return <motion.div className="hero" animate="show">Hi</motion.div>;
}
`;
        const next = patchJsx(
            source,
            { tag: "motion.div", classes: ["hero"] },
            { styles: { display: "flex" } },
        );
        expect(next).toMatch(/className="[^"]*flex/);
        expect(() =>
            patchJsx(`export function X(){return <div className="hero">Hi</div>}`, { tag: "div" }, {
                attributes: { layoutId: "hero" },
            }),
        ).toThrow(/layoutId/);
    });

    it("does not overwrite CSS module or class:list bindings", () => {
        expect(() =>
            patchJsx(
                `import styles from "./x.module.css";
export function Card(){return <section className={styles.hero}>Hi</section>}`,
                { tag: "section", text: "Hi" },
                { styles: { display: "flex" } },
            ),
        ).toThrow(/dynamic className/);
        expect(() => {
            const astro = `<section class:list={["hero"]}>Hi</section>`;
            patchHtmlOpening(astro, 0, astro.indexOf(">") + 1, { display: "flex" });
        }).toThrow(/dynamic class/);
    });

    it("appends utilities onto cn/clsx without inventing inline styles", () => {
        const source = `import { cn } from "@/lib/utils";
export function Row(){return <div className={cn("flex", props.className)}>Hi</div>}`;
        const next = patchJsx(source, { tag: "div", text: "Hi" }, { styles: { gap: "8px" } });
        expect(next).toMatch(/cn\([\s\S]*gap-/);
        expect(next).not.toContain("style={{");
    });

    it("keeps SVG presentation attributes and custom elements", () => {
        expect(wouldReactWarnUnknownProp("svg", "viewBox")).toBe(false);
        expect(wouldReactWarnUnknownProp("shop-cart", "cartCount")).toBe(false);
        const svg = `export function Icon(){return <svg viewBox="0 0 24 24" className="icon"><path d="M1" /></svg>}`;
        const next = patchJsx(svg, { tag: "svg", classes: ["icon"] }, { styles: { width: "24px" } });
        expect(next).toContain('viewBox="0 0 24 24"');
        expect(next).toMatch(/w-\[24px\]|w-6/);
        const web = patchJsx(
            `export function X(){return <shop-cart cartCount="1"></shop-cart>}`,
            { tag: "shop-cart" },
            { attributes: { cartCount: "2" } },
        );
        expect(web).toContain("cartCount={2}");
    });

    it("refuses to style a component that is only a CSS-in-JS template", () => {
        expect(() =>
            patchJsx(
                `import styled from "styled-components";
const Box = styled.div\`display:flex\`;
export function X(){return <Box>Hi</Box>}`,
                { tag: "div", text: "Hi" },
                { styles: { display: "grid" } },
            ),
        ).toThrow();
    });

    it("leaves spreads and nested generated text alone", () => {
        expect(() =>
            patchJsx(
                `export function X(props: object){return <div {...props} className="host">Hi</div>}`,
                { tag: "div", classes: ["host"] },
                { attributes: { cartCount: "1" } },
            ),
        ).toThrow(/cartCount/);
        expect(() =>
            patchJsx(
                `export function X(){return <p className="copy">{label}</p>}`,
                { tag: "p", classes: ["copy"] },
                { text: "Hello" },
            ),
        ).toThrow(/dynamic content|nested/);
    });
});
