/**
 * Maps file paths to Monaco language ids. Language packs are bundled via
 * `registerBundledMonacoLanguages` (Monaco Monarch) — no extension installs.
 */
import { isLspLanguageEnabled } from "@/lib/settings";

export function getMonacoLanguage(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const basename = filePath.split(/[\\/]/).pop()?.toLowerCase() || "";

    switch (basename) {
        case "dockerfile":
        case "dockerfile.dev":
        case "dockerfile.prod":
            return "dockerfile";
        case "makefile":
        case "gnumakefile":
            return "ini";
        case "cmakelists.txt":
            return "ini";
        case "cmakecache.txt":
            return "ini";
        case ".eslintrc":
        case ".prettierrc":
        case ".babelrc":
        case ".stylelintrc":
        case "tsconfig.json":
        case "jsconfig.json":
        case "package.json":
        case "package-lock.json":
        case "composer.json":
            return "json";
        case "cargo.toml":
        case "pyproject.toml":
        case "netlify.toml":
        case "poetry.lock":
            return "ini";
        case ".env":
        case ".env.local":
        case ".env.development":
        case ".env.production":
        case ".env.test":
            return "ini";
        case "go.mod":
        case "go.sum":
            return "go";
        case "gemfile":
        case "rakefile":
            return "ruby";
        case "podfile":
            return "ruby";
        case "vagrantfile":
            return "ruby";
        case "jenkinsfile":
            return "java";
        case "procfile":
            return "ini";
        case "readme":
        case "changelog":
        case "license":
            return "plaintext";
        case "readme.md":
        case "changelog.md":
        case "license.md":
            return "markdown";
    }

    switch (ext) {
        // TypeScript / JavaScript
        case "ts":
        case "mts":
        case "cts":
            return "typescript";
        case "tsx":
            return "typescript";
        case "js":
        case "mjs":
        case "cjs":
            return "javascript";
        case "jsx":
            return "javascript";
        case "coffee":
        case "litcoffee":
            return "coffee";

        // Web
        case "html":
        case "htm":
        case "xhtml":
            return "html";
        case "css":
            return "css";
        case "scss":
        case "sass":
            return "scss";
        case "less":
            return "less";
        case "json":
        case "jsonc":
        case "json5":
        case "webmanifest":
        case "geojson":
        case "har":
            return "json";
        case "vue":
            return "html";
        case "svelte":
            return "html";
        case "astro":
            return "html";
        case "handlebars":
        case "hbs":
            return "handlebars";
        case "pug":
        case "jade":
            return "pug";
        case "twig":
            return "twig";
        case "liquid":
            return "liquid";
        case "ejs":
        case "njk":
        case "nunjucks":
            return "html";
        case "razor":
        case "cshtml":
            return "razor";

        // Docs / data
        case "md":
        case "markdown":
        case "mdown":
        case "mkd":
            return "markdown";
        case "mdx":
            return "mdx";
        case "rst":
            return "restructuredtext";
        case "tex":
        case "latex":
        case "ltx":
            return "plaintext";
        case "yaml":
        case "yml":
            return "yaml";
        case "xml":
        case "xsl":
        case "xslt":
        case "svg":
        case "xsd":
        case "plist":
        case "csproj":
        case "fsproj":
        case "vbproj":
        case "resx":
            return "xml";
        case "graphql":
        case "gql":
            return "graphql";
        case "toml":
            return "ini";
        case "ini":
        case "cfg":
        case "conf":
        case "env":
        case "editorconfig":
        case "gitconfig":
        case "npmrc":
        case "dockerignore":
        case "gitignore":
        case "gitattributes":
            return "ini";
        case "properties":
            return "ini";

        // Shell / scripts
        case "sh":
        case "bash":
        case "zsh":
        case "ksh":
        case "fish":
        case "command":
            return "shell";
        case "bat":
        case "cmd":
            return "bat";
        case "ps1":
        case "psm1":
        case "psd1":
            return "powershell";

        // Systems / backends
        case "rs":
            return "rust";
        case "go":
            return "go";
        case "py":
        case "pyw":
        case "pyi":
            return "python";
        case "java":
            return "java";
        case "groovy":
        case "gradle":
            return "java";
        case "c":
        case "h":
            return "c";
        case "cpp":
        case "cxx":
        case "cc":
        case "hpp":
        case "hh":
        case "hxx":
        case "ino":
            return "cpp";
        case "cs":
            return "csharp";
        case "fs":
        case "fsi":
        case "fsx":
            return "fsharp";
        case "vb":
        case "vbs":
            return "vb";
        case "php":
        case "phtml":
            return "php";
        case "rb":
        case "erb":
        case "rake":
            return "ruby";
        case "swift":
            return "swift";
        case "kt":
        case "kts":
            return "kotlin";
        case "dart":
            return "dart";
        case "scala":
        case "sc":
            return "scala";
        case "clj":
        case "cljs":
        case "cljc":
        case "edn":
            return "clojure";
        case "ex":
        case "exs":
            return "elixir";
        case "lua":
            return "lua";
        case "r":
            return "r";
        case "jl":
            return "julia";
        case "m":
            return "objective-c";
        case "mm":
            return "objective-c";
        case "pl":
        case "pm":
        case "t":
            return "perl";
        case "proto":
            return "protobuf";
        case "sol":
            return "solidity";
        case "wgsl":
            return "wgsl";
        case "tsp":
            return "typespec";
        case "scm":
        case "ss":
            return "scheme";
        case "lisp":
        case "el":
            return "scheme";
        case "tcl":
            return "tcl";
        case "v":
        case "sv":
        case "svh":
            return "systemverilog";
        case "pas":
        case "pp":
            return "pascal";
        case "zig":
        case "zon":
            return "rust";
        case "nim":
        case "nims":
            return "python";
        case "hs":
        case "lhs":
            return "plaintext";
        case "ml":
        case "mli":
            return "plaintext";
        case "erl":
        case "hrl":
            return "plaintext";
        case "elm":
            return "javascript";
        case "d":
            return "plaintext";
        case "f":
        case "for":
        case "f90":
        case "f95":
            return "plaintext";

        // SQL / data
        case "sql":
            return "sql";
        case "mysql":
            return "mysql";
        case "pgsql":
        case "psql":
            return "pgsql";
        case "prisma":
            return "graphql";
        case "cql":
            return "cypher";
        case "cypher":
            return "cypher";
        case "sparql":
            return "sparql";
        case "redis":
            return "redis";

        // Infra
        case "dockerfile":
            return "dockerfile";
        case "tf":
        case "tfvars":
        case "hcl":
            return "hcl";
        case "bicep":
            return "bicep";
        case "nginx":
            return "ini";
        case "cmake":
            return "ini";
        case "makefile":
        case "mk":
            return "ini";

        // Extra Monaco Monarch packs
        case "abap":
            return "abap";
        case "apex":
        case "cls":
        case "trigger":
            return "apex";
        case "azcli":
            return "azcli";
        case "csp":
            return "csp";
        case "ecl":
            return "ecl";
        case "ftl":
        case "ftlh":
        case "ftlx":
            return "freemarker2";
        case "flow":
            return "flow9";
        case "lex":
        case "lexon":
            return "lexon";
        case "ligo":
            return "pascaligo";
        case "mligo":
            return "cameligo";
        case "m3":
        case "i3":
        case "ig":
        case "mg":
            return "m3";
        case "s":
        case "asm":
        case "mips":
            return "mips";
        case "dax":
        case "msdax":
            return "msdax";
        case "pla":
            return "pla";
        case "dats":
        case "sats":
        case "hats":
            return "postiats";
        case "pq":
        case "pqm":
            return "powerquery";
        case "qs":
            return "qsharp";
        case "sb":
            return "sb";
        case "aes":
            return "sophia";
        case "st":
        case "iecst":
            return "st";
        case "vhd":
        case "vhdl":
            return "systemverilog";

        case "diff":
        case "patch":
            return "plaintext";
        case "log":
            return "plaintext";

        default:
            return "plaintext";
    }
}

/**
 * Language server executable mapping. Servers still launch via npx when needed;
 * syntax highlighting does not depend on them (bundled Monarch).
 */
export interface LspServerMapping {
    language: string;
    command: string;
    args: string[];
    documentSelector: string[];
}

export function getLspServersForProject(frameworks: {
    hasReact: boolean;
    hasVue: boolean;
    hasAngular: boolean;
    hasSvelte: boolean;
    hasNextjs: boolean;
    hasTailwind: boolean;
    hasTypescript: boolean;
}): LspServerMapping[] {
    const servers: LspServerMapping[] = [];

    servers.push({
        language: "typescript",
        command: "npx",
        args: [
            "--yes",
            "--prefer-offline",
            "--package=typescript-language-server",
            "--",
            "typescript-language-server",
            "--stdio",
        ],
        documentSelector: ["typescript", "typescriptreact", "javascript", "javascriptreact"],
    });

    servers.push({
        language: "html",
        command: "npx",
        args: [
            "--yes",
            "--prefer-offline",
            "--package=vscode-langservers-extracted",
            "--",
            "vscode-html-language-server",
            "--stdio",
        ],
        documentSelector: ["html", "handlebars", "razor"],
    });

    servers.push({
        language: "css",
        command: "npx",
        args: [
            "--yes",
            "--prefer-offline",
            "--package=vscode-langservers-extracted",
            "--",
            "vscode-css-language-server",
            "--stdio",
        ],
        documentSelector: ["css", "scss", "less"],
    });

    servers.push({
        language: "json",
        command: "npx",
        args: [
            "--yes",
            "--prefer-offline",
            "--package=vscode-langservers-extracted",
            "--",
            "vscode-json-language-server",
            "--stdio",
        ],
        documentSelector: ["json", "jsonc"],
    });

    if (frameworks.hasVue) {
        servers.push({
            language: "vue",
            command: "npx",
            args: [
                "--yes",
                "--prefer-offline",
                "--package=@vue/language-server",
                "--",
                "vue-language-server",
                "--stdio",
            ],
            documentSelector: ["vue"],
        });
    }

    if (frameworks.hasSvelte) {
        servers.push({
            language: "svelte",
            command: "npx",
            args: [
                "--yes",
                "--prefer-offline",
                "--package=svelte-language-server",
                "--",
                "svelteserver",
                "--stdio",
            ],
            documentSelector: ["svelte"],
        });
    }

    if (frameworks.hasTailwind) {
        servers.push({
            language: "tailwindcss",
            command: "npx",
            args: [
                "--yes",
                "--prefer-offline",
                "--package=@tailwindcss/language-server",
                "--",
                "tailwindcss-language-server",
                "--stdio",
            ],
            documentSelector: [
                "html",
                "css",
                "javascript",
                "typescript",
                "vue",
                "svelte",
                "javascriptreact",
                "typescriptreact",
            ],
        });
    }

    servers.push({
        language: "python",
        command: "npx",
        args: ["--yes", "--prefer-offline", "--package=pyright", "--", "pyright-langserver", "--stdio"],
        documentSelector: ["python"],
    });

    servers.push({
        language: "markdown",
        command: "npx",
        args: [
            "--yes",
            "--prefer-offline",
            "--package=remark-language-server",
            "--",
            "remark-language-server",
            "--stdio",
        ],
        documentSelector: ["markdown"],
    });

    servers.push({
        language: "graphql",
        command: "npx",
        args: [
            "--yes",
            "--prefer-offline",
            "--package=graphql-language-service-cli",
            "--",
            "graphql-lsp",
            "server",
            "-m",
            "stream",
        ],
        documentSelector: ["graphql"],
    });

    servers.push({
        language: "prisma",
        command: "npx",
        args: [
            "--yes",
            "--prefer-offline",
            "--package=@prisma/language-server",
            "--",
            "prisma-language-server",
            "--stdio",
        ],
        documentSelector: ["prisma"],
    });

    return servers;
}

export function filterLspServersBySettings(servers: LspServerMapping[]): LspServerMapping[] {
    return servers.filter((server) => isLspLanguageEnabled(server.language));
}
