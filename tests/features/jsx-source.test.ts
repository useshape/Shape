import { isSafeDomAttribute, locateJsx, patchHtmlOpening, patchJsx, reorderJsx, stylesToTailwind } from "@/features/preview/design/jsx-source";

describe("jsx-source", () => {
    it("writes Tailwind classes instead of inline styles", () => {
        const source = `export function Btn({ n }: { n: number }) {
  return <button className="primary" onClick={() => n > 0}>Go</button>;
}
`;
        const next = patchJsx(
            source,
            { tag: "button", classes: ["primary"], text: "Go" },
            { styles: { width: "120px" } },
        );
        expect(next).toContain("w-[120px]");
        expect(next).not.toContain("style={{");
        expect(next).toContain("onClick={() => n > 0}");
        expect(next).toContain("className=");
    });

    it("replaces rounded-md with the new radius utility", () => {
        const source = `<a className="inline-flex h-9 rounded-md bg-brand px-4">Start building free</a>`;
        const next = patchJsx(
            source,
            { tag: "a", classes: ["rounded-md"], text: "Start building free" },
            { styles: { "border-radius": "100px" } },
        );
        expect(next).toContain("rounded-[100px]");
        expect(next).not.toContain("rounded-md");
        expect(next).not.toContain("style=");
        expect(stylesToTailwind({ "border-radius": "100px" })).toBe("rounded-[100px]");
    });

    it("finds the matching class when two tags share a file", () => {
        const source = `export function App() {
  return (
    <>
      <main className="first">A</main>
      <main className="second">B</main>
    </>
  );
}
`;
        expect(locateJsx(source, { tag: "main", classes: ["second"] })).toMatchObject({
            tag: "main",
        });
        const next = patchJsx(
            source,
            { tag: "main", classes: ["second"] },
            { styles: { display: "flex" } },
        );
        const beforeSecond = next.slice(0, next.indexOf("second"));
        const afterSecond = next.slice(next.indexOf("second"));
        expect(afterSecond).toContain("flex");
        expect(beforeSecond).not.toMatch(/\bflex\b/);
    });

    it("keeps the first utility when a second property is patched later", () => {
        const source = `export function Btn() {
  return <button className="primary">Go</button>;
}
`;
        const once = patchJsx(
            source,
            { tag: "button", classes: ["primary"], text: "Go" },
            { styles: { width: "120px" } },
        );
        const twice = patchJsx(
            once,
            { tag: "button", classes: ["primary", "w-[120px]"], text: "Go" },
            { styles: { height: "40px" } },
        );
        expect(twice).toContain("w-[120px]");
        expect(twice).toContain("h-[40px]");
        expect(twice).not.toContain("style={{");
    });

    it("patches HTML class attributes used by Astro", () => {
        const source = `<a href="/login" class="inline-flex h-9 rounded-md bg-brand px-4">Start</a>`;
        const start = source.indexOf("<a");
        const end = source.indexOf(">") + 1;
        const next = patchHtmlOpening(source, start, end, { "border-radius": "100px" });
        expect(next).toContain('class="inline-flex h-9 bg-brand px-4 rounded-[100px]"');
        expect(next).not.toContain("style=");
    });

    it("reorders flex siblings without rewriting the rest of the file", () => {
        const source = `export function Row() {
  return (
    <div className="flex">
      <a className="first">A</a>
      <a className="second">B</a>
      <a className="third">C</a>
    </div>
  );
}
`;
        const next = reorderJsx(
            source,
            { tag: "a", classes: ["third"], text: "C" },
            { tag: "a", classes: ["first"], text: "A" },
        );
        expect(next.indexOf("third")).toBeLessThan(next.indexOf("first"));
        expect(next).toContain('className="flex"');
    });

    it("writes instance props onto the component, not an inner div", () => {
        const source = `export default function Root() {
  return (
    <html>
      <body>
        <Header cartCount={1} />
      </body>
    </html>
  );
}
function Header({ cartCount }: { cartCount: number }) {
  return <div className="container-page flex h-18 items-center gap-4">Hi {cartCount}</div>;
}
`;
        const next = patchJsx(
            source,
            { tag: "Header", line: 5 },
            { attributes: { cartCount: "3" } },
        );
        expect(next).toContain("<Header cartCount={3} />");
        expect(next).not.toMatch(/<div[^>]*cartCount/);
    });

    it("refuses camelCase props on DOM elements", () => {
        const source = `<div className="container-page flex h-18 items-center gap-4">Nav</div>`;
        expect(() =>
            patchJsx(source, { tag: "div", classes: ["container-page"] }, { attributes: { cartCount: "3" } }),
        ).toThrow(/Header|component instance|cartCount/i);
        expect(isSafeDomAttribute("div", "cartCount")).toBe(false);
        expect(isSafeDomAttribute("Header", "cartCount")).toBe(true);
        expect(isSafeDomAttribute("div", "href")).toBe(true);
    });

    it("keeps CSS variables as Tailwind arbitrary values", () => {
        expect(stylesToTailwind({ "background-color": "var(--background)" })).toBe("bg-[var(--background)]");
        expect(stylesToTailwind({ color: "var(--foreground)" })).toBe("text-[var(--foreground)]");
    });

    it("does not match a Header query to a nearby div", () => {
        const source = `export function Page() {
  return (
    <>
      <Header />
      <div className="container-page">x</div>
    </>
  );
}
`;
        expect(locateJsx(source, { tag: "Header", line: 6 })).toMatchObject({ tag: "Header" });
    });
});
