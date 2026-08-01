export type LspLaunch = {
    command: string;
    args: string[];
    /** When true, spawn outside the project so npm overrides can't break npx. */
    isolateNpx?: boolean;
};

const SEP = "\\";

function join(...parts: string[]): string {
    return parts.join(SEP).replace(/\\+/g, "\\");
}

/** Prefer isolated npx packages over project-local language servers. */
const NPX_PACKAGES: Record<string, { package: string; args: string[] }> = {
    typescript: {
        package: "typescript-language-server",
        args: ["typescript-language-server", "--stdio"],
    },
    json: {
        package: "vscode-langservers-extracted",
        args: ["vscode-json-language-server", "--stdio"],
    },
    html: {
        package: "vscode-langservers-extracted",
        args: ["vscode-html-language-server", "--stdio"],
    },
    css: {
        package: "vscode-langservers-extracted",
        args: ["vscode-css-language-server", "--stdio"],
    },
    tailwindcss: {
        package: "@tailwindcss/language-server",
        args: ["tailwindcss-language-server", "--stdio"],
    },
    vue: {
        package: "@vue/language-server",
        args: ["vue-language-server", "--stdio"],
    },
    svelte: {
        package: "svelte-language-server",
        args: ["svelteserver", "--stdio"],
    },
    markdown: {
        package: "remark-language-server",
        args: ["remark-language-server", "--stdio"],
    },
    graphql: {
        package: "graphql-language-service-cli",
        args: ["graphql-lsp", "server", "-m", "stream"],
    },
    prisma: {
        package: "@prisma/language-server",
        args: ["prisma-language-server", "--stdio"],
    },
    python: {
        package: "pyright",
        args: ["pyright-langserver", "--stdio"],
    },
};

function npxLaunch(language: string, fallback: LspLaunch): LspLaunch {
    const spec = NPX_PACKAGES[language];
    if (!spec) {
        return {
            ...fallback,
            isolateNpx: fallback.command === "npx",
        };
    }
    return {
        command: "npx",
        args: ["--yes", "--prefer-offline", `--package=${spec.package}`, "--", ...spec.args],
        isolateNpx: true,
    };
}

/**
 * Always use isolated npx. Do not prefer project-local language servers.
 */
export async function resolveLspLaunch(
    language: string,
    _packageRoot: string,
    fallback: LspLaunch,
    _readFile: (path: string) => Promise<string>,
): Promise<LspLaunch> {
    return npxLaunch(language, fallback);
}

export async function readTypescriptVersion(
    packageRoot: string,
    readFile: (path: string) => Promise<string>,
): Promise<string | null> {
    const paths = [
        join(packageRoot, "node_modules", "typescript", "package.json"),
        join(packageRoot, "package.json"),
    ];
    for (const pkgPath of paths) {
        try {
            const pkg = JSON.parse(await readFile(pkgPath)) as {
                version?: string;
                dependencies?: Record<string, string>;
                devDependencies?: Record<string, string>;
            };
            if (pkgPath.includes(`${SEP}typescript${SEP}package.json`) && pkg.version) {
                return pkg.version;
            }
            const ver = pkg.dependencies?.typescript ?? pkg.devDependencies?.typescript;
            if (ver) return ver.replace(/^[\^~>=<]*/, "");
        } catch {
            /* continue */
        }
    }
    return null;
}
