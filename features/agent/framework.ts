/** Dependency name → thesvg icon slug. Earlier entries win. */
const DEPENDENCY_SLUGS: readonly [string, string][] = [
    ["next", "nextjs"],
    ["nuxt", "nuxt"],
    ["nuxt3", "nuxt"],
    ["astro", "astro"],
    ["@angular/core", "angular"],
    ["@sveltejs/kit", "svelte"],
    ["svelte", "svelte"],
    ["@remix-run/react", "remix"],
    ["@remix-run/dev", "remix"],
    ["vue", "vue"],
    ["solid-js", "solid"],
    ["@nestjs/core", "nestjs"],
    ["react", "react"],
    ["express", "express"],
    ["@tauri-apps/api", "tauri"],
    ["vite", "vite"],
    ["django", "django"],
    ["flask", "flask"],
];

export function frameworkFromDependencies(
    dependencies: Record<string, unknown> | null | undefined,
): string | null {
    if (!dependencies) return null;
    for (const [name, slug] of DEPENDENCY_SLUGS) {
        if (name in dependencies) return slug;
    }
    return null;
}

function hasEntry(names: string[], prefix: string): boolean {
    return names.some((name) => name === prefix || name.startsWith(`${prefix}.`));
}

/** Marker files when package.json has no known framework dependency. */
export function frameworkFromEntryNames(names: string[]): string | null {
    const lower = names.map((name) => name.toLowerCase());
    if (hasEntry(lower, "next.config")) return "nextjs";
    if (hasEntry(lower, "nuxt.config")) return "nuxt";
    if (hasEntry(lower, "astro.config")) return "astro";
    if (lower.includes("angular.json")) return "angular";
    if (hasEntry(lower, "svelte.config")) return "svelte";
    if (hasEntry(lower, "vite.config")) return "vite";
    if (lower.includes("cargo.toml")) return "rust";
    if (lower.includes("go.mod")) return "go";
    if (lower.includes("manage.py")) return "django";
    if (lower.includes("pyproject.toml") || lower.includes("requirements.txt")) return "python";
    if (lower.includes("composer.json")) return "laravel";
    if (lower.includes("tauri.conf.json")) return "tauri";
    return null;
}

export async function detectProjectFramework(projectPath: string): Promise<string | null> {
    const { commands } = await import("@/lib/backend");
    const entries = await commands.lsDir(projectPath);
    const pkg = entries.find((entry) => entry.name.toLowerCase() === "package.json");
    if (pkg) {
        try {
            const raw = (await commands.readFile(pkg.path)).replace(/^\uFEFF/, "");
            const json = JSON.parse(raw) as {
                dependencies?: Record<string, string>;
                devDependencies?: Record<string, string>;
            };
            const fromDeps = frameworkFromDependencies({
                ...json.devDependencies,
                ...json.dependencies,
            });
            if (fromDeps) return fromDeps;
        } catch {
            /* fall through to filenames */
        }
    }
    return frameworkFromEntryNames(entries.map((entry) => entry.name));
}
