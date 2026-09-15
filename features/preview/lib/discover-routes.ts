import { commands } from "@/lib/backend";

export type DesignPage = {
    /** URL path, e.g. `/` or `/settings/profile`. View-only screens use `view:<label>`. */
    path: string;
    /** Short label for the Pages list */
    label: string;
    /** Source file relative to project root when known */
    source?: string;
    /** Framework hint */
    kind: "next-app" | "next-pages" | "astro" | "vite" | "remix" | "static" | "view";
    /** Dynamic segment route (e.g. `/blog/[slug]`) */
    dynamic?: boolean;
};

const PAGE_FILES = /^(page|index)\.(tsx|ts|jsx|js|mdx|md)$/i;
const ASTRO_PAGE = /\.(astro)$/i;
const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    "out",
    ".turbo",
    "coverage",
    ".vercel",
    "target",
    "__tests__",
    "test",
    "tests",
]);

function joinPath(a: string, b: string): string {
    const left = a.replace(/[/\\]+$/, "");
    const right = b.replace(/^[/\\]+/, "");
    const sep = a.includes("\\") ? "\\" : "/";
    return `${left}${sep}${right}`;
}

function toPosix(p: string): string {
    return p.replace(/\\/g, "/");
}

/** Relative path from `root` to `filePath` (case-insensitive, Windows-safe). */
export function relFromRoot(filePath: string, root: string): string {
    const file = toPosix(filePath);
    const base = toPosix(root).replace(/\/$/, "");
    if (
        file.length >= base.length
        && file.slice(0, base.length).toLowerCase() === base.toLowerCase()
    ) {
        return file.slice(base.length).replace(/^\//, "");
    }
    return file;
}

function titleFromSegment(seg: string): string {
    if (!seg || seg === "/") return "Home";
    const clean = seg
        .replace(/^\[+\.?\.?\.?/, "")
        .replace(/\]+$/, "")
        .replace(/^_+/, "");
    if (!clean) return seg;
    return clean
        .split(/[-_]/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

export function labelForPath(routePath: string): string {
    if (routePath === "/") return "Home";
    const parts = routePath.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? routePath;
    return titleFromSegment(last);
}

function isDynamic(routePath: string): boolean {
    return /\[|\]|\*/.test(routePath);
}

/** Convert Next app-dir relative folder path to a URL path. */
function appDirToRoute(relDir: string): string | null {
    const parts = toPosix(relDir)
        .split("/")
        .filter(Boolean)
        .filter((p) => !(p.startsWith("(") && p.endsWith(")")))
        .filter((p) => !p.startsWith("@"));
    if (parts.some((p) => p.startsWith("_"))) return null;
    const route = "/" + parts.join("/");
    return route === "/" ? "/" : route.replace(/\/+/g, "/");
}

/** Convert pages-router file path (relative to pages/) to a URL path. */
function pagesFileToRoute(relFile: string): string | null {
    let p = toPosix(relFile);
    p = p.replace(/\.(tsx|ts|jsx|js|mdx|md|astro)$/i, "");
    if (p === "index" || p.endsWith("/index")) {
        p = p.replace(/\/?index$/, "") || "";
    }
    if (
        p.startsWith("api/")
        || p === "api"
        || p.startsWith("_")
        || p.includes("/_")
    ) {
        return null;
    }
    const route = "/" + p;
    return route === "/" ? "/" : route.replace(/\/+/g, "/");
}

async function dirExists(path: string): Promise<boolean> {
    try {
        const entries = await commands.lsDir(path);
        return Array.isArray(entries);
    } catch {
        return false;
    }
}

async function walkFiles(
    root: string,
    maxDepth: number,
    out: { path: string; name: string; is_dir: boolean }[],
    depth = 0,
): Promise<void> {
    if (depth > maxDepth) return;
    let entries: { name: string; path: string; is_dir: boolean }[];
    try {
        entries = await commands.lsDir(root);
    } catch {
        return;
    }
    for (const e of entries) {
        if (e.is_dir) {
            if (SKIP_DIRS.has(e.name.toLowerCase())) continue;
            await walkFiles(e.path, maxDepth, out, depth + 1);
        } else {
            out.push(e);
        }
    }
}

function uniqPages(pages: DesignPage[]): DesignPage[] {
    const map = new Map<string, DesignPage>();
    for (const p of pages) {
        const key = p.path;
        const prev = map.get(key);
        if (!prev || (prev.dynamic && !p.dynamic)) map.set(key, p);
    }
    return [...map.values()].sort((a, b) => {
        if (a.path === "/") return -1;
        if (b.path === "/") return 1;
        return a.path.localeCompare(b.path);
    });
}

async function discoverNextApp(projectRoot: string, appRoot: string): Promise<DesignPage[]> {
    const files: { path: string; name: string; is_dir: boolean }[] = [];
    await walkFiles(appRoot, 12, files);
    const pages: DesignPage[] = [];
    const appPosix = toPosix(appRoot);
    for (const f of files) {
        if (!PAGE_FILES.test(f.name)) continue;
        const filePosix = toPosix(f.path);
        const rel = relFromRoot(filePosix, appPosix);
        const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
        const route = appDirToRoute(dir);
        if (!route) continue;
        pages.push({
            path: route,
            label: labelForPath(route),
            source: toPosix(f.path).slice(toPosix(projectRoot).length).replace(/^\//, ""),
            kind: "next-app",
            dynamic: isDynamic(route),
        });
    }
    return pages;
}

async function discoverPagesDir(
    projectRoot: string,
    pagesRoot: string,
    kind: DesignPage["kind"],
): Promise<DesignPage[]> {
    const files: { path: string; name: string; is_dir: boolean }[] = [];
    await walkFiles(pagesRoot, 12, files);
    const pages: DesignPage[] = [];
    const rootPosix = toPosix(pagesRoot);
    for (const f of files) {
        const ok =
            kind === "astro"
                ? ASTRO_PAGE.test(f.name) || PAGE_FILES.test(f.name)
                : /\.(tsx|ts|jsx|js|mdx|md)$/i.test(f.name);
        if (!ok) continue;
        const filePosix = toPosix(f.path);
        const rel = relFromRoot(filePosix, rootPosix);
        const route = pagesFileToRoute(rel);
        if (!route) continue;
        pages.push({
            path: route,
            label: labelForPath(route),
            source: toPosix(f.path).slice(toPosix(projectRoot).length).replace(/^\//, ""),
            kind,
            dynamic: isDynamic(route),
        });
    }
    return pages;
}

function remixFileToRoute(relativeFile: string): string | null {
    let route = toPosix(relativeFile).replace(/\.(tsx|ts|jsx|js|mdx|md)$/i, "");
    route = route.replace(/\/route$/i, "");
    if (route === "_index" || route === "index") return "/";
    const parts = route
        .split(/[/.]/)
        .filter(Boolean)
        .filter((part) => !part.startsWith("_"))
        .map((part) => {
            const clean = part.replace(/_$/, "");
            if (clean === "$") return "[...splat]";
            if (clean.startsWith("$")) return `[${clean.slice(1)}]`;
            return clean;
        })
        .filter(Boolean);
    return parts.length ? `/${parts.join("/")}` : "/";
}

async function discoverRemixRoutes(projectRoot: string, routesRoot: string): Promise<DesignPage[]> {
    const files: { path: string; name: string; is_dir: boolean }[] = [];
    await walkFiles(routesRoot, 12, files);
    const rootPosix = toPosix(routesRoot);
    const pages: DesignPage[] = [];
    for (const file of files) {
        if (!/\.(tsx|ts|jsx|js|mdx|md)$/i.test(file.name)) continue;
        const relative = relFromRoot(toPosix(file.path), rootPosix);
        const path = remixFileToRoute(relative);
        if (!path) continue;
        pages.push({
            path,
            label: labelForPath(path),
            source: toPosix(file.path).slice(toPosix(projectRoot).length).replace(/^\//, ""),
            kind: "remix",
            dynamic: isDynamic(path),
        });
    }
    return pages;
}

const VIEW_SKIP =
    /^(search|settings|notifications|learn more|see all|browse all|cancel|close|back|edit avatar|edit profile)$/i;

/** Merge filesystem routes with live nav views from the preview iframe. */
export function mergeLiveDesignPages(
    filePages: DesignPage[],
    views: Array<{ label?: string; path?: string }>,
): DesignPage[] {
    const out = [...filePages];
    const seen = new Set(out.map((p) => p.path.toLowerCase()));
    const seenLabel = new Set(out.map((p) => p.label.toLowerCase()));
    for (const v of views) {
        const label = String(v.label || "").replace(/\s+/g, " ").trim();
        if (!label) continue;
        const href = String(v.path || "").trim();
        if (href && href !== "/" && !href.startsWith("view:")) {
            const path = href.startsWith("/") ? href : `/${href}`;
            if (seen.has(path.toLowerCase())) continue;
            seen.add(path.toLowerCase());
            seenLabel.add(label.toLowerCase());
            out.push({ path, label, kind: "static" });
            continue;
        }
        if (VIEW_SKIP.test(label)) continue;
        const key = `view:${label.toLowerCase()}`;
        if (seen.has(key) || seenLabel.has(label.toLowerCase())) continue;
        seen.add(key);
        seenLabel.add(label.toLowerCase());
        out.push({ path: key, label, kind: "view" });
    }
    return uniqPages(out);
}

/**
 * Scan the project for navigable UI routes (Next app/pages, Astro, Vite pages).
 * Dynamic routes are included but marked — clicking them still navigates to the pattern path.
 */
export async function discoverDesignPages(projectRoot: string): Promise<DesignPage[]> {
    if (!projectRoot) return [{ path: "/", label: "Home", kind: "static" }];

    const candidates = [
        { dir: joinPath(projectRoot, "src/app"), kind: "next-app" as const },
        { dir: joinPath(projectRoot, "app"), kind: "next-app" as const },
        { dir: joinPath(projectRoot, "website/src/app"), kind: "next-app" as const },
        { dir: joinPath(projectRoot, "website/app"), kind: "next-app" as const },
        { dir: joinPath(projectRoot, "shape/src/app"), kind: "next-app" as const },
        { dir: joinPath(projectRoot, "shape/app"), kind: "next-app" as const },
        { dir: joinPath(projectRoot, "src/pages"), kind: "next-pages" as const },
        { dir: joinPath(projectRoot, "pages"), kind: "next-pages" as const },
        { dir: joinPath(projectRoot, "website/src/pages"), kind: "next-pages" as const },
        { dir: joinPath(projectRoot, "website/pages"), kind: "next-pages" as const },
        { dir: joinPath(projectRoot, "src/routes"), kind: "vite" as const },
    ];

    const found: DesignPage[] = [];

    for (const c of candidates) {
        if (!(await dirExists(c.dir))) continue;
        if (c.kind === "next-app") {
            found.push(...(await discoverNextApp(projectRoot, c.dir)));
        } else {
            // Prefer Astro if .astro files exist
            const probe: { path: string; name: string; is_dir: boolean }[] = [];
            await walkFiles(c.dir, 3, probe);
            const hasAstro = probe.some((f) => ASTRO_PAGE.test(f.name));
            found.push(
                ...(await discoverPagesDir(
                    projectRoot,
                    c.dir,
                    hasAstro ? "astro" : c.kind,
                )),
            );
        }
    }

    for (const routesRoot of [
        joinPath(projectRoot, "app/routes"),
        joinPath(projectRoot, "src/app/routes"),
    ]) {
        if (await dirExists(routesRoot)) {
            found.push(...(await discoverRemixRoutes(projectRoot, routesRoot)));
        }
    }

    // Fallback: public/*.html as static pages
    if (found.length === 0) {
        const pub = joinPath(projectRoot, "public");
        if (await dirExists(pub)) {
            try {
                const entries = await commands.lsDir(pub);
                for (const e of entries) {
                    if (e.is_dir) continue;
                    if (!/\.html?$/i.test(e.name)) continue;
                    const base = e.name.replace(/\.html?$/i, "");
                    const path = base.toLowerCase() === "index" ? "/" : `/${base}`;
                    found.push({
                        path,
                        label: labelForPath(path),
                        source: `public/${e.name}`,
                        kind: "static",
                    });
                }
            } catch {
                /* ignore */
            }
        }
    }

    const pages = uniqPages(found);
    if (pages.length === 0) {
        return [{ path: "/", label: "Home", kind: "static" }];
    }
    return pages;
}

/** Join preview origin with a route path. */
export function previewUrlForPage(baseUrl: string, pagePath: string): string {
    try {
        const u = new URL(baseUrl);
        const path = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
        u.pathname = path === "/" ? "/" : path.replace(/\/$/, "");
        u.search = "";
        u.hash = "";
        return u.toString();
    } catch {
        const root = baseUrl.replace(/\/$/, "");
        return pagePath === "/" ? `${root}/` : `${root}${pagePath}`;
    }
}
