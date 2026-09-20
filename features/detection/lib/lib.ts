import { commands } from "@/lib/backend";
import type { PackageManager } from "@/lib/workspace/package-manager";
import { resolvePackageManager } from "@/lib/workspace/package-manager";

const WEB_MARKERS = [
    "package.json",
    "pnpm-workspace.yaml",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
    "bun.lock",
    "package-lock.json",
    "deno.json",
    "deno.jsonc",
    "composer.json",
];

const ENTRY_FILES = [
    "index.html",
    "index.htm",
    "main.js",
    "main.ts",
    "main.jsx",
    "main.tsx",
    "app.js",
    "app.ts",
    "app.jsx",
    "app.tsx",
];

const CONFIG_PREFIXES = [
    "vite.config",
    "next.config",
    "nuxt.config",
    "astro.config",
    "remix.config",
    "svelte.config",
    "webpack.config",
    "rspack.config",
    "parcel.config",
    "rollup.config",
    "esbuild.config",
    "tailwind.config",
    "postcss.config",
    "gatsby-config",
    "vue.config",
    "angular.json",
    "ember-cli-build",
    "wxt.config",
    "expo",
    "capacitor.config",
    "quasar.config",
];

const DIR_MARKERS = [
    "src",
    "public",
    "www",
    "dist",
    "web",
    "pages",
    "app",
    "apps",
    "client",
    "frontend",
    "packages",
];

function matchesConfig(name: string): boolean {
    return CONFIG_PREFIXES.some(
        (p) => name === p || name.startsWith(`${p}.`) || name.startsWith(`${p}-`),
    );
}

function hasWebExtension(name: string): boolean {
    return /\.(html?|css|scss|sass|less|jsx?|tsx?|vue|svelte|astro|mjs|cjs)$/i.test(name);
}

/**
 * Detect whether `path` is a web / frontend project.
 * Scans the root (and common monorepo child folders) for package markers,
 * framework configs, and HTML/JS entry points.
 */
export async function isWebProject(path: string): Promise<boolean> {
    try {
        const entries = await commands.lsDir(path);
        if (entries.length === 0) return true;
        const names = entries.map((e) => e.name.toLowerCase());

        if (WEB_MARKERS.some((m) => names.includes(m))) return true;
        if (ENTRY_FILES.some((f) => names.includes(f))) return true;
        if (names.some(matchesConfig)) return true;
        if (names.includes("apps") || names.includes("packages") || names.includes("frontend")) {
            const nested = await scanNestedWebRoots(path, entries);
            if (nested) return true;
        }

        const subdirs = entries.filter(
            (e) => e.is_dir && DIR_MARKERS.includes(e.name.toLowerCase()),
        );
        if (subdirs.length > 0 && names.some(hasWebExtension)) return true;

        if (names.some((n) => n.endsWith(".html") || n.endsWith(".htm"))) return true;

        return false;
    } catch (e) {
        console.error("Failed to detect project type:", e);
        return true;
    }
}

async function scanNestedWebRoots(
    root: string,
    entries: { name: string; path: string; is_dir: boolean }[],
): Promise<boolean> {
    const candidates = entries.filter(
        (e) =>
            e.is_dir
            && ["apps", "packages", "frontend", "web", "client", "site"].includes(
                e.name.toLowerCase(),
            ),
    );
    for (const dir of candidates.slice(0, 4)) {
        try {
            const kids = await commands.lsDir(dir.path);
            for (const kid of kids.slice(0, 12)) {
                if (!kid.is_dir) {
                    const n = kid.name.toLowerCase();
                    if (n === "package.json" || matchesConfig(n) || n === "index.html") {
                        return true;
                    }
                    continue;
                }
                try {
                    const nested = await commands.lsDir(kid.path);
                    const nestedNames = nested.map((e) => e.name.toLowerCase());
                    if (
                        nestedNames.includes("package.json")
                        || nestedNames.some(matchesConfig)
                        || nestedNames.includes("index.html")
                    ) {
                        return true;
                    }
                } catch {
                    /* skip */
                }
            }
        } catch {
            /* skip */
        }
    }
    void root;
    return false;
}

export type DevCommandInfo = {
    command: string;
    script: string | null;
    packageManager: PackageManager;
    label: string;
    urlHint: string;
};

const SCRIPT_PRIORITY = [
    "dev",
    "start:dev",
    "develop",
    "serve",
    "start",
    "preview",
    "dev:web",
    "web",
];

const URL_HINTS: Record<string, string> = {
    next: "http://localhost:3000/",
    vite: "http://localhost:5173/",
    nuxt: "http://localhost:3000/",
    astro: "http://localhost:4321/",
    remix: "http://localhost:3000/",
    gatsby: "http://localhost:8000/",
    angular: "http://localhost:4200/",
    svelte: "http://localhost:5173/",
    default: "http://localhost:3000/",
};

function detectLockfilePm(names: string[]): PackageManager | null {
    // Prefer npm when both locks exist — common on Windows and matches package-lock installs.
    if (names.includes("package-lock.json")) return "npm";
    if (names.includes("bun.lockb") || names.includes("bun.lock")) return "bun";
    if (names.includes("pnpm-lock.yaml") || names.includes("pnpm-workspace.yaml")) return "pnpm";
    if (names.includes("yarn.lock")) return "yarn";
    return null;
}

const FRAMEWORK_DEV_RE = /\b(?:next|vite|astro|remix)\s+dev\b/i;
const PROCESS_RUNNER_RE = /^(run-p|run-s|npm-run-all|concurrently|turbo|nx|wireit)\b/i;

function isFrameworkDevScript(body: string): boolean {
    return FRAMEWORK_DEV_RE.test(body) && !PROCESS_RUNNER_RE.test(body.trim());
}

/** Pick the script that actually starts the framework, not a process-runner wrapper. */
export function pickDevScript(scripts: Record<string, string>): string | null {
    for (const key of SCRIPT_PRIORITY) {
        const body = scripts[key];
        if (body && isFrameworkDevScript(body)) return key;
    }
    const frameworkKey = Object.keys(scripts).find((key) => isFrameworkDevScript(scripts[key] ?? ""));
    if (frameworkKey) return frameworkKey;
    for (const key of SCRIPT_PRIORITY) {
        if (scripts[key]) return key;
    }
    return Object.keys(scripts).find((key) => /^(dev|start|serve|preview)(:|$)/i.test(key)) ?? null;
}

export function portFromScript(body: string): string | null {
    const match = body.match(/--port(?:=|\s+)(\d+)/i) ?? body.match(/(?:^|\s)-p(?:=|\s+)(\d+)/);
    return match?.[1] ?? null;
}

function runScript(pm: PackageManager, script: string): string {
    switch (pm) {
        case "yarn":
            return `yarn ${script}`;
        case "pnpm":
            return `pnpm ${script}`;
        case "bun":
            return `bun run ${script}`;
        default:
            return `npm run ${script}`;
    }
}

/** Prefer the script body so we start Next/Vite directly — not `pnpm`/`npm`, which can install a workspace. */
function commandForScript(body: string, pm: PackageManager, key: string): string {
    const trimmed = body.trim();
    if (isFrameworkDevScript(trimmed)) return trimmed;
    return runScript(pm, key);
}

function guessUrlHint(
    pkg: Record<string, unknown>,
    script: string | null,
    scripts: Record<string, string>,
): string {
    const deps = {
        ...(typeof pkg.dependencies === "object" && pkg.dependencies
            ? (pkg.dependencies as Record<string, string>)
            : {}),
        ...(typeof pkg.devDependencies === "object" && pkg.devDependencies
            ? (pkg.devDependencies as Record<string, string>)
            : {}),
    };
    let base = URL_HINTS.default!;
    if (deps.next) base = URL_HINTS.next!;
    else if (deps.nuxt || deps["nuxt3"]) base = URL_HINTS.nuxt!;
    else if (deps.astro) base = URL_HINTS.astro!;
    else if (deps.vite || deps["@vitejs/plugin-react"] || deps["@vitejs/plugin-vue"]) {
        base = URL_HINTS.vite!;
    } else if (deps["@remix-run/dev"] || deps["@remix-run/react"]) {
        base = URL_HINTS.remix!;
    } else if (deps.gatsby) base = URL_HINTS.gatsby!;
    else if (deps["@angular/core"]) base = URL_HINTS.angular!;
    else if (deps["@sveltejs/kit"] || deps.svelte) base = URL_HINTS.svelte!;
    else if (script && scripts[script]?.includes("vite")) base = URL_HINTS.vite!;
    const port = script ? portFromScript(scripts[script] ?? "") : null;
    if (!port) return base;
    try {
        const url = new URL(base);
        url.port = port;
        return url.toString();
    } catch {
        return `http://localhost:${port}/`;
    }
}

/**
 * Resolve the best local run / start command for a project root.
 * Prefers package.json scripts (`dev` → `start` …), then framework CLIs.
 */
export async function detectDevCommand(path: string): Promise<DevCommandInfo | null> {
    try {
        const entries = await commands.lsDir(path);
        const names = entries.map((e) => e.name.toLowerCase());
        const lockPm = detectLockfilePm(names);

        const pkgEntry = entries.find((e) => e.name.toLowerCase() === "package.json");
        if (!pkgEntry) {
            if (names.some((n) => n.startsWith("vite.config"))) {
                return {
                    command: "npx vite",
                    script: null,
                    packageManager: lockPm ?? "npm",
                    label: "vite",
                    urlHint: URL_HINTS.vite!,
                };
            }
            return null;
        }

        const raw = await commands.readFile(pkgEntry.path);
        const pkg = JSON.parse(raw) as Record<string, unknown>;
        const scripts =
            typeof pkg.scripts === "object" && pkg.scripts
                ? (pkg.scripts as Record<string, string>)
                : {};
        const pm = resolvePackageManager(
            path,
            typeof pkg.packageManager === "string" ? pkg.packageManager : undefined,
        );
        const resolvedPm = lockPm ?? pm;
        const key = pickDevScript(scripts);
        if (!key) return null;
        const body = scripts[key] ?? "";

        return {
            command: commandForScript(body, resolvedPm, key),
            script: key,
            packageManager: resolvedPm,
            label: key,
            urlHint: guessUrlHint(pkg, key, scripts),
        };
    } catch (e) {
        console.error("Failed to detect run command:", e);
        return null;
    }
}
