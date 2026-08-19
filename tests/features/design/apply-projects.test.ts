import { describe, expect, it } from "vitest";
import { locateJsxByHint, locateJsxBySelector, locateJsxElement, jsxClassExpressionKind, parseCssPathSelector } from "@/features/preview/design-mode/apply/locate-jsx";
import {
    findOpeningTags,
    cssModuleLocal,
} from "@/features/preview/design-mode/apply/locate-html";
import { patchInlineStyles, patchOpeningTag } from "@/features/preview/design-mode/apply/patch-tag";
import { stylesToClassTokens } from "@/features/preview/design-mode/apply/class-tokens";
import { layoutPathsNear } from "@/features/preview/design-mode/apply/source-files";

type Hint = { className?: string; tag?: string; locateText?: string; lineNumber?: number };

function spliceTag(source: string, start: number, end: number, nextTag: string) {
    return source.slice(0, start) + nextTag + source.slice(end);
}

function locateLikeApply(
    source: string,
    fileName: string,
    edit: { tag?: string; className?: string; locateText?: string; selector?: string },
) {
    if (!(edit.className || "").trim() && edit.selector) {
        const bySel = locateJsxBySelector(source, fileName, edit.selector);
        if (bySel.ok) return bySel;
    }
    const byHint = locateJsxByHint(source, fileName, {
        tag: edit.tag,
        className: edit.className,
        locateText: edit.locateText,
    });
    if (byHint.ok) return byHint;
    return locateJsxBySelector(source, fileName, edit.selector);
}
function applyHint(
    source: string,
    fileName: string,
    hint: Hint,
    styles: Record<string, string>,
    mode: "tailwind" | "inline" | "html" = "tailwind",
) {
    const found = locateJsxByHint(source, fileName, hint);
    if (!found.ok) return found;
    const nextTag =
        mode === "tailwind"
            ? patchOpeningTag(found.hit.text, stylesToClassTokens(styles), mode === "html")
            : patchInlineStyles(found.hit.text, styles, mode === "html");
    return {
        ok: true as const,
        source: spliceTag(source, found.hit.start, found.hit.end, nextTag),
        tag: nextTag,
        line: found.hit.line,
        tagName: found.hit.tagName,
    };
}

const FLEX_COLUMN = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "16px",
};

const NEXT_APP_PAGE = `
import Link from "next/link";
import Image from "next/image";

export default function Page() {
  return (
    <main className="page">
      <header className="wrap header-inner">
        <strong className="brand">Valley Prison Portal</strong>
        <nav className="nav">
          <Link className="nav-link" href="/about">About</Link>
          <Link className="nav-link" href="/visit">Visit</Link>
        </nav>
      </header>
      <section className="home-hero">
        <h1 className="hero-title">Find a facility</h1>
        <p className="lede">Public records and visiting hours.</p>
        <div className="hero-actions">
          <a className="btn primary" href="#browse">Browse</a>
          <a className="btn ghost" href="/help">Help</a>
        </div>
      </section>
      <section className="browse">
        <h2>Directory</h2>
        <div className="filters">
          <input className="search" placeholder="Search" />
        </div>
        <ul className="grid cards">
          {facilities.map((item) => (
            <li className="card" key={item.id}>
              <h3 className="card-title">{item.name}</h3>
              <p className="muted">{item.city}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="cta">
        <h2>Need help?</h2>
        <Link className="btn primary" href="/contact">Contact</Link>
      </section>
      <footer className="site-footer">
        <p>Not affiliated with any department of corrections.</p>
      </footer>
    </main>
  );
}
`;

const VITE_APP = `
import clsx from "clsx";
import { cn } from "./lib/utils";

export function App() {
  const dense = false;
  return (
    <div className="app shell">
      <aside className={clsx("sidebar", dense && "sidebar-dense")}>
        <button className="icon-btn" type="button">Menu</button>
        <nav className="stack">
          <a className="row" href="#inbox">Inbox</a>
          <a className="row" href="#sent">Sent</a>
        </nav>
      </aside>
      <main className={cn("canvas", "relative")}>
        <header className="toolbar">
          <h1>Inbox</h1>
          <div className="toolbar-actions">
            <button type="button" className="ghost">Filter</button>
          </div>
        </header>
        <section className="thread">
          <article className="message">
            <strong>Alex</strong>
            <p>Can you review the layout?</p>
          </article>
          <article className="message unread">
            <strong>Sam</strong>
            <p>Updated the spacing.</p>
          </article>
        </section>
      </main>
    </div>
  );
}
`;

const CSS_MODULE_HERO = `
import styles from "./Hero.module.css";

export function Hero({ featured }: { featured: boolean }) {
  return (
    <section className={featured ? styles.heroFeatured : styles.hero}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Launch</h1>
        <button className={styles.cta} type="button">Start</button>
      </div>
    </section>
  );
}
`;

const SHADCN_CARD = `
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export function Pricing({ highlight }: { highlight: boolean }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
      <article className={cn("rounded-xl border p-6", highlight && "ring-2")}>
        <h2 className="text-lg font-medium">Starter</h2>
        <p className="text-sm text-muted-foreground">For side projects.</p>
        <a className={cn(buttonVariants({ variant: "outline" }), "mt-4")} href="/start">
          Choose
        </a>
      </article>
      <article className="rounded-xl border p-6 bg-zinc-950 text-white">
        <h2 className="text-lg font-medium">Pro</h2>
        <p className="text-sm opacity-80">For teams.</p>
        <a className={cn(buttonVariants({ size: "sm" }))} href="/pro">Upgrade</a>
      </article>
      <article className="rounded-xl border p-6">
        <h2 className="text-lg font-medium">Enterprise</h2>
        <p className="text-sm text-muted-foreground">Custom contracts.</p>
      </article>
    </div>
  );
}
`;

const STATIC_HTML = `
<!doctype html>
<html>
  <body>
    <header class="top">
      <h1 class="logo">Cafe Luna</h1>
    </header>
    <section class="menu">
      <article class="item">
        <h2>Espresso</h2>
      </article>
      <article class="item special">
        <h2>Cortado</h2>
      </article>
    </section>
    <section class="hours">
      <p>Open daily</p>
    </section>
  </body>
</html>
`;

const CLASSLESS_WRAP = `
export default function Page() {
  return (
    <main className="page">
      <section className="browse">
        <div>
          <h2>Directory</h2>
          <p>All facilities in the region.</p>
        </div>
        <div className="filters">
          <input className="search" placeholder="Search" />
        </div>
      </section>
      <section className="cta">
        <div>
          <h2>Need help?</h2>
        </div>
      </section>
    </main>
  );
}
`;

const REMIX_ROUTE = `
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

export default function Product() {
  const product = useLoaderData<typeof loader>();
  return (
    <div className="product">
      <section className="gallery">
        {product.images.map((src: string) => (
          <img key={src} className="thumb" src={src} alt="" />
        ))}
      </section>
      <section className="buy">
        <h1>{product.title}</h1>
        <form method="post" className="buy-form">
          <button className="add-to-cart" type="submit">Add to cart</button>
        </form>
      </section>
    </div>
  );
}
`;

describe("layout CSS → Tailwind tokens", () => {
    it("covers flex, grid, spacing, type, and chrome the inspector actually writes", () => {
        expect(
            stylesToClassTokens({
                display: "flex",
                flexDirection: "column",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "stretch",
                gap: "12px",
                paddingTop: "8px",
                paddingRight: "8px",
                paddingBottom: "8px",
                paddingLeft: "8px",
                borderRadius: "19px",
                backgroundColor: "#dddddd",
                backgroundImage: "none",
                borderStyle: "none",
                borderWidth: "0px",
                fontSize: "18px",
                fontWeight: "600",
                textAlign: "center",
                overflow: "hidden",
            }),
        ).toEqual(
            expect.arrayContaining([
                "flex",
                "flex-col",
                "flex-wrap",
                "justify-between",
                "items-stretch",
                "gap-[12px]",
                "pt-[8px]",
                "rounded-[19px]",
                "bg-[#dddddd]",
                "bg-none",
                "border-0",
                "border-[0px]",
                "text-[18px]",
                "font-semibold",
                "text-center",
                "overflow-hidden",
            ]),
        );
        expect(stylesToClassTokens({ display: "grid", gridTemplateColumns: "1fr 1fr" })).toContain("grid");
        expect(stylesToClassTokens({ display: "none" })).toEqual(["hidden"]);
        expect(stylesToClassTokens({ columnGap: "10px", rowGap: "4px" })).toEqual(["gap-x-[10px]", "gap-y-[4px]"]);
        expect(stylesToClassTokens({ gap: "10px", columnGap: "10px", rowGap: "10px" })).toEqual(["gap-[10px]"]);
    });
});

describe("Next.js app router page with several similar sections", () => {
    it("applies flex to browse without rewriting home-hero or cta", () => {
        const result = applyHint(NEXT_APP_PAGE, "app/page.tsx", { tag: "section", className: "browse" }, FLEX_COLUMN);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.tag).toContain('className="browse');
        expect(result.tag).toContain("flex");
        expect(result.tag).toContain("flex-col");
        expect(result.tag).toContain("gap-[16px]");
        expect(result.source).toContain('className="home-hero"');
        expect(result.source).toMatch(/<section className="home-hero">/);
        expect(result.source).not.toMatch(/<section className="home-hero[^"]*flex/);
        expect(result.source).toContain('className="cta"');
        expect(result.source.match(/flex-col/g)?.length).toBe(1);
    });

    it("does not use a generic flex class to pick a node when many rows share it", () => {
        const src = `
export function List() {
  return (
    <ul>
      <li className="flex items-center gap-2"><span>Invoice #1042 — overdue</span></li>
      <li className="flex items-center gap-2"><span>Invoice #2088 — paid</span></li>
      <li className="flex items-center gap-2"><span>Invoice #3301 — draft</span></li>
    </ul>
  );
}
`;
        const byClass = locateJsxByHint(src, "list.tsx", { tag: "li", className: "flex items-center gap-2" });
        expect(byClass.ok).toBe(false);
        const byText = locateJsxByHint(src, "list.tsx", {
            tag: "li",
            className: "flex items-center gap-2",
            locateText: "Invoice #2088 — paid",
        });
        expect(byText.ok).toBe(true);
        if (byText.ok) {
            expect(src.slice(byText.hit.end, byText.hit.end + 80)).toContain("Invoice #2088");
        }
    });

    it("locates Link by visible text when several nav-links exist", () => {
        const visit = locateJsxByHint(NEXT_APP_PAGE, "app/page.tsx", {
            tag: "a",
            className: "nav-link",
            locateText: "Visit",
        });
        expect(visit.ok).toBe(true);
        if (visit.ok) expect(visit.hit.tagName).toBe("Link");
        const ambiguous = locateJsxByHint(NEXT_APP_PAGE, "app/page.tsx", { tag: "a", className: "nav-link" });
        expect(ambiguous.ok).toBe(false);
        const uniqueH1 = locateJsxByHint(NEXT_APP_PAGE, "app/page.tsx", { tag: "h1" });
        expect(uniqueH1.ok).toBe(true);
        if (uniqueH1.ok) expect(uniqueH1.hit.tagName).toBe("h1");
    });

    it("picks the literal h1 when another heading interpolates the same title", () => {
        const src = `export default function Home() {
  return (
    <main>
      <h1 className="text-left line-through">Valley Prison</h1>
      <PageHeading title="Valley Prison" />
    </main>
  );
}
function PageHeading({ title }: { title: string }) {
  return <h1>{title}</h1>;
}
`;
        const found = locateJsxByHint(src, "page.tsx", {
            tag: "h1",
            className: "text-left line-through",
            locateText: "Valley Prison",
        });
        expect(found.ok).toBe(true);
        if (found.ok) expect(found.hit.text).toContain("line-through");
        const byPhrase = locateJsxByHint(src, "page.tsx", { tag: "h1", locateText: "Valley Prison" });
        expect(byPhrase.ok).toBe(true);
        if (byPhrase.ok) expect(byPhrase.hit.text).toContain("line-through");
    });

    it("resolves app/layout next to a page file even when the IDE root is elsewhere", () => {
        expect(layoutPathsNear("/work/valley-prison-portal/app/page.tsx")).toEqual(
            expect.arrayContaining(["/work/valley-prison-portal/app/layout.tsx"]),
        );
    });

    it("patches mapped source lines instead of the first matching tag", () => {
        const lines = NEXT_APP_PAGE.split("\n");
        const browseLine = lines.findIndex((l) => l.includes('className="browse"')) + 1;
        const byLine = locateJsxElement(NEXT_APP_PAGE, "app/page.tsx", { lineNumber: browseLine, columnNumber: 8 });
        expect(byLine.ok).toBe(true);
        if (byLine.ok) expect(byLine.hit.text).toContain("browse");
    });

    it("refuses to guess when two sections share the same class", () => {
        const dup = NEXT_APP_PAGE.replace('className="cta"', 'className="browse"');
        const found = locateJsxByHint(dup, "app/page.tsx", { tag: "section", className: "browse" });
        expect(found.ok).toBe(false);
    });

    it("still finds a card in a .map() list only with extra identity", () => {
        const onlyClass = locateJsxByHint(NEXT_APP_PAGE, "app/page.tsx", { tag: "li", className: "card" });
        expect(onlyClass.ok).toBe(true);
        if (onlyClass.ok) expect(onlyClass.hit.text).toContain("card");
        const twoLists = NEXT_APP_PAGE.replace(
            "</main>",
            `      <ul className="related">{related.map((item) => <li className="card" key={item}>{item}</li>)}</ul>\n    </main>`,
        );
        expect(locateJsxByHint(twoLists, "app/page.tsx", { tag: "li", className: "card" }).ok).toBe(false);
    });
});

describe("Vite SPA with clsx / cn", () => {
    it("turns a toolbar into a row without touching the sidebar stack", () => {
        const result = applyHint(
            VITE_APP,
            "src/App.tsx",
            { tag: "header", className: "toolbar" },
            { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" },
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.tag).toContain("justify-between");
        expect(result.source).toContain('className="stack"');
        expect(result.source).not.toMatch(/sidebar[^>]*(justify-between)/);
    });

    it("merges utilities into an existing cn() call", () => {
        const result = applyHint(
            VITE_APP,
            "src/App.tsx",
            { tag: "main", className: "canvas relative" },
            { overflow: "hidden", borderRadius: "12px" },
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.tag).toMatch(/cn\(/);
        expect(result.tag).toContain("overflow-hidden");
        expect(result.tag).toContain("rounded-[12px]");
    });

    it("distinguishes two articles that share message but not unread", () => {
        const unread = applyHint(
            VITE_APP,
            "src/App.tsx",
            { tag: "article", className: "message unread" },
            { backgroundColor: "#fff3cd" },
        );
        expect(unread.ok).toBe(true);
        if (!unread.ok) return;
        expect(unread.tag).toContain("unread");
        expect(unread.tag).toContain("bg-[#fff3cd]");
        expect(unread.source.match(/bg-\[#fff3cd\]/g)?.length).toBe(1);
    });
});

describe("CSS modules (Create React App / Next modules)", () => {
    it("can locate styles.hero but will not rewrite a module className expression", () => {
        const found = locateJsxByHint(CSS_MODULE_HERO, "src/Hero.tsx", { tag: "section", className: "hero" });
        expect(found.ok).toBe(true);
        if (!found.ok) return;
        expect(jsxClassExpressionKind(found.hit.text)).toBe("expression");
        const patched = patchOpeningTag(found.hit.text, stylesToClassTokens(FLEX_COLUMN));
        expect(patched).toBe(found.hit.text);
    });

    it("maps a runtime CSS module hash back to a local name, which is not the hashed string in source", () => {
        expect(cssModuleLocal("Hero_title__xK3p")).toBe("title");
        const hashed = locateJsxByHint(CSS_MODULE_HERO, "src/Hero.tsx", {
            tag: "h1",
            className: "Hero_title__xK3p",
        });
        expect(hashed.ok).toBe(false);
        const local = locateJsxByHint(CSS_MODULE_HERO, "src/Hero.tsx", { tag: "h1", className: "title" });
        expect(local.ok).toBe(true);
        if (local.ok) {
            expect(jsxClassExpressionKind(local.hit.text)).toBe("module");
            expect(patchOpeningTag(local.hit.text, ["flex"])).toBe(local.hit.text);
        }
    });
});

describe("shadcn / CVA class merging", () => {
    it("does not treat three similar pricing cards as interchangeable", () => {
        const generic = locateJsxByHint(SHADCN_CARD, "pricing.tsx", {
            tag: "article",
            className: "rounded-xl border p-6",
        });
        expect(generic.ok).toBe(false);
        const pro = locateJsxByHint(SHADCN_CARD, "pricing.tsx", {
            tag: "article",
            className: "rounded-xl border p-6 bg-zinc-950 text-white",
        });
        expect(pro.ok).toBe(true);
        if (pro.ok) expect(pro.hit.text).toContain("bg-zinc-950");
    });

    it("adds flex tokens beside a cn(buttonVariants()) expression", () => {
        const result = applyHint(
            SHADCN_CARD,
            "pricing.tsx",
            { tag: "a", className: "mt-4", locateText: "Choose" },
            { display: "inline-flex", alignItems: "center", gap: "6px" },
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.tag).toMatch(/cn\(/);
        expect(result.tag).toContain("inline-flex");
        expect(result.tag).toContain("gap-[6px]");
        expect(result.source).toContain('href="/pro"');
        expect(result.source.match(/gap-\[6px\]/g)?.length).toBe(1);
    });
});

describe("static HTML (no JSX runtime)", () => {
    it("patches class= on a unique section", () => {
        const menu = findOpeningTags(STATIC_HTML, "section").find((hit) => /\bclass="menu"/.test(hit.text));
        expect(menu).toBeTruthy();
        const next = patchOpeningTag(menu!.text, stylesToClassTokens({ display: "grid", gap: "24px" }), true);
        expect(next).toContain('class="menu');
        expect(next).toContain("grid");
        expect(next).toContain("gap-[24px]");
        const hours = findOpeningTags(STATIC_HTML, "section").find((hit) => /\bclass="hours"/.test(hit.text));
        expect(hours?.text).not.toContain("grid");
    });

    it("needs the special class to tell two menu articles apart", () => {
        const items = findOpeningTags(STATIC_HTML, "article");
        expect(items).toHaveLength(2);
        const special = items.find((hit) => hit.text.includes("special"));
        const plain = items.find((hit) => hit.text.includes("item") && !hit.text.includes("special"));
        expect(special?.text).toContain("special");
        expect(plain?.text).toContain("item");
        expect(plain?.text).not.toContain("special");
    });
});

describe("Remix product route", () => {
    it("flexes the buy column and leaves the gallery thumbs alone", () => {
        const result = applyHint(REMIX_ROUTE, "app/routes/product.tsx", { tag: "section", className: "buy" }, FLEX_COLUMN);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.tag).toContain("buy");
        expect(result.tag).toContain("flex-col");
        expect(result.source).toContain('className="thumb"');
        expect(result.source).not.toMatch(/className="thumb[^"]*flex-col/);
    });

    it("applies inline styles when the file is not using Tailwind utilities", () => {
        const result = applyHint(
            REMIX_ROUTE,
            "app/routes/product.tsx",
            { tag: "button", className: "add-to-cart" },
            { display: "flex", justifyContent: "center" },
            "inline",
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.tag).toContain("style={{");
        expect(result.tag).toContain('display: "flex"');
        expect(result.tag).toContain('justifyContent: "center"');
        expect(result.tag).toContain("add-to-cart");
    });
});

describe("classless wrappers (the Apply log case)", () => {
    it("cannot locate a bare div by tag alone when the page has several", () => {
        expect(locateLikeApply(CLASSLESS_WRAP, "app/page.tsx", { tag: "div", className: "" }).ok).toBe(false);
    });

    it("locates the classless browse wrapper via the DOM selector, not the filters div", () => {
        const found = locateLikeApply(CLASSLESS_WRAP, "app/page.tsx", {
            tag: "div",
            className: "",
            selector: "main.page>section.browse>div:nth-of-type(1)",
        });
        expect(found.ok).toBe(true);
        if (!found.ok) return;
        expect(found.hit.tagName).toBe("div");
        expect(found.hit.text).not.toContain("filters");
        const next = patchOpeningTag(found.hit.text, stylesToClassTokens({ display: "flex", paddingTop: "8px" }));
        expect(next).toContain("flex");
        expect(next).toContain("pt-[8px]");
        const filters = locateLikeApply(CLASSLESS_WRAP, "app/page.tsx", {
            tag: "div",
            className: "filters",
            selector: "main.page>section.browse>div.filters",
        });
        expect(filters.ok).toBe(true);
        if (filters.ok) expect(filters.hit.text).toContain("filters");
    });

    it("does not apply the browse wrapper selector to the cta wrapper", () => {
        const browse = locateJsxBySelector(CLASSLESS_WRAP, "app/page.tsx", "main.page>section.browse>div:nth-of-type(1)");
        const cta = locateJsxBySelector(CLASSLESS_WRAP, "app/page.tsx", "main.page>section.cta>div:nth-of-type(1)");
        expect(browse.ok && cta.ok).toBe(true);
        if (browse.ok && cta.ok) {
            expect(browse.hit.start).not.toBe(cta.hit.start);
            expect(CLASSLESS_WRAP.slice(browse.hit.end, browse.hit.end + 40)).toContain("Directory");
            expect(CLASSLESS_WRAP.slice(cta.hit.end, cta.hit.end + 40)).toContain("Need help");
        }
    });

    it("ignores Next #__next wrappers and still patches the classless browse div", () => {
        expect(parseCssPathSelector("body>div#__next>main.page>section.browse>div:nth-of-type(1)").map((p) => `${p.tag}${p.className ? "." + p.className : ""}:${p.nth}`)).toEqual([
            "main.page:1",
            "section.browse:1",
            "div:1",
        ]);
        const found = locateLikeApply(CLASSLESS_WRAP, "app/page.tsx", {
            tag: "div",
            className: "",
            selector: "body>div#__next>main.page>section.browse>div:nth-of-type(1)",
        });
        expect(found.ok).toBe(true);
        if (!found.ok) return;
        expect(found.hit.tagName).toBe("div");
        expect(found.hit.text).not.toContain("filters");
        const next = patchOpeningTag(found.hit.text, stylesToClassTokens({ display: "flex", paddingTop: "8px" }));
        expect(next).toContain("flex");
        expect(next).toContain("pt-[8px]");
    });

    it("does not treat a mapped:false Next chunk as a reason to skip the classless node", () => {
        const found = locateLikeApply(CLASSLESS_WRAP, "app/page.tsx", {
            tag: "div",
            className: "",
            locateText: "Directory All facilities in the region.",
            selector: "main.page>section.browse>div:nth-of-type(1)",
        });
        expect(found.ok).toBe(true);
        if (found.ok) expect(CLASSLESS_WRAP.slice(found.hit.end, found.hit.end + 30)).toContain("Directory");
    });
});

describe("cross-cutting locate failures", () => {
    it("does not accept a bare tag in a file full of that tag", () => {
        expect(locateJsxByHint(NEXT_APP_PAGE, "app/page.tsx", { tag: "section" }).ok).toBe(false);
        expect(locateJsxByHint(VITE_APP, "src/App.tsx", { tag: "div" }).ok).toBe(false);
        expect(locateJsxByHint(SHADCN_CARD, "pricing.tsx", { tag: "p" }).ok).toBe(false);
    });

    it("does not patch the wrong file just because a class exists somewhere", () => {
        const inVite = locateJsxByHint(VITE_APP, "src/App.tsx", { tag: "section", className: "browse" });
        expect(inVite.ok).toBe(false);
        const inNext = locateJsxByHint(NEXT_APP_PAGE, "app/page.tsx", { tag: "aside", className: "sidebar" });
        expect(inNext.ok).toBe(false);
    });
});
