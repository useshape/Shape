// VS Code file/folder icons via @iconify-json/vscode-icons (vscode-icons set).

import iconsData from "@iconify-json/vscode-icons/icons.json";

type IconifyIcon = { body: string; width?: number; height?: number };

const ICONIFY = iconsData as {
    width: number;
    height: number;
    icons: Record<string, IconifyIcon>;
};

const dataUrlCache = new Map<string, string>();

/** Pale greys designed for dark chrome — rewrite for light themes when no -light icon exists. */
const LIGHT_FILL_REWRITES: Array<[RegExp, string]> = [
    [/fill="#c5c5c5"/gi, 'fill="#6b6b6b"'],
    [/fill="#c6c6c6"/gi, 'fill="#6b6b6b"'],
    [/fill="#cccccc"/gi, 'fill="#6b6b6b"'],
    [/fill="#d4d4d4"/gi, 'fill="#6b6b6b"'],
    [/fill="#e0e0e0"/gi, 'fill="#6b6b6b"'],
    [/fill="#e5e5e5"/gi, 'fill="#6b6b6b"'],
    [/fill="#f0f0f0"/gi, 'fill="#6b6b6b"'],
];

/** Prefer vscode-icons `*-light-*` variants on light chrome when present. */
function resolveThemedIconId(iconId: string, light: boolean): string {
    if (!light) return iconId;
    if (iconId.startsWith("file-type-") && !iconId.startsWith("file-type-light-")) {
        const candidate = `file-type-light-${iconId.slice("file-type-".length)}`;
        if (ICONIFY.icons[candidate]) return candidate;
    }
    if (iconId.startsWith("folder-type-") && !iconId.startsWith("folder-type-light-")) {
        const candidate = `folder-type-light-${iconId.slice("folder-type-".length)}`;
        if (ICONIFY.icons[candidate]) return candidate;
    }
    return iconId;
}

function rewriteBodyForLight(body: string): string {
    let next = body;
    for (const [re, replacement] of LIGHT_FILL_REWRITES) {
        next = next.replace(re, replacement);
    }
    return next;
}

function iconDataUrl(iconId: string, light = false): string {
    const themedId = resolveThemedIconId(iconId, light);
    const cacheKey = `${light ? "L" : "D"}:${themedId}`;
    const cached = dataUrlCache.get(cacheKey);
    if (cached) return cached;

    const icon = ICONIFY.icons[themedId] ?? ICONIFY.icons[iconId] ?? ICONIFY.icons["default-file"];
    const width = icon.width ?? ICONIFY.width ?? 32;
    const height = icon.height ?? ICONIFY.height ?? 32;
    const body = light && themedId === iconId ? rewriteBodyForLight(icon.body) : icon.body;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
    const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    dataUrlCache.set(cacheKey, url);
    return url;
}

/** Current document is on the light color theme. Always false — Shape is dark-only. */
export function isDocumentLightTheme(): boolean {
    return false;
}

const FILE_NAME_ICONS: Record<string, string> = {
    "package.json": "file-type-npm",
    "package-lock.json": "file-type-npm",
    "pnpm-lock.yaml": "file-type-pnpm",
    "yarn.lock": "file-type-yarn",
    "bun.lock": "file-type-bun",
    "bun.lockb": "file-type-bun",
    "cargo.toml": "file-type-cargo",
    "cargo.lock": "file-type-cargo",
    "go.mod": "file-type-go",
    "go.sum": "file-type-go",
    "go.work": "file-type-go",
    "tsconfig.json": "file-type-tsconfig",
    "jsconfig.json": "file-type-jsconfig",
    "vite.config.ts": "file-type-vite",
    "vite.config.js": "file-type-vite",
    "vite.config.mjs": "file-type-vite",
    "next.config.ts": "file-type-next",
    "next.config.js": "file-type-next",
    "next.config.mjs": "file-type-next",
    "tailwind.config.ts": "file-type-tailwind",
    "tailwind.config.js": "file-type-tailwind",
    "postcss.config.js": "file-type-postcss",
    "postcss.config.mjs": "file-type-postcss",
    "webpack.config.js": "file-type-webpack",
    "dockerfile": "file-type-docker",
    "docker-compose.yml": "file-type-docker",
    "docker-compose.yaml": "file-type-docker",
    "compose.yml": "file-type-docker",
    "compose.yaml": "file-type-docker",
    ".dockerignore": "file-type-docker",
    ".gitignore": "file-type-git",
    ".gitattributes": "file-type-git",
    ".gitmodules": "file-type-git",
    ".eslintrc": "file-type-eslint",
    ".eslintrc.js": "file-type-eslint",
    ".eslintrc.cjs": "file-type-eslint",
    ".eslintrc.json": "file-type-eslint",
    "eslint.config.js": "file-type-eslint",
    "eslint.config.mjs": "file-type-eslint",
    ".prettierrc": "file-type-prettier",
    ".prettierrc.json": "file-type-prettier",
    ".prettierrc.js": "file-type-prettier",
    "prettier.config.js": "file-type-prettier",
    "biome.json": "file-type-biome",
    "biome.jsonc": "file-type-biome",
    ".editorconfig": "file-type-editorconfig",
    ".env": "file-type-dotenv",
    ".env.local": "file-type-dotenv",
    ".env.development": "file-type-dotenv",
    ".env.production": "file-type-dotenv",
    "makefile": "file-type-cmake",
    "cmakelists.txt": "file-type-cmake",
    "readme.md": "file-type-markdown",
    "license": "file-type-license",
    "license.md": "file-type-license",
    "vercel.json": "file-type-vercel",
    "netlify.toml": "file-type-netlify",
    "prisma.schema": "file-type-prisma",
    "schema.prisma": "file-type-prisma",
};

const EXTENSION_ICONS: Record<string, string> = {
    ts: "file-type-typescript",
    cts: "file-type-typescript",
    mts: "file-type-typescript",
    tsx: "file-type-reactts",
    js: "file-type-js",
    cjs: "file-type-js",
    mjs: "file-type-js",
    jsx: "file-type-reactjs",
    json: "file-type-json",
    jsonc: "file-type-json",
    json5: "file-type-json",
    md: "file-type-markdown",
    mdx: "file-type-markdown",
    css: "file-type-css",
    scss: "file-type-scss",
    sass: "file-type-sass",
    less: "file-type-less",
    html: "file-type-html",
    htm: "file-type-html",
    py: "file-type-python",
    pyw: "file-type-python",
    rs: "file-type-rust",
    go: "file-type-go",
    java: "file-type-java",
    kt: "file-type-kotlin",
    kts: "file-type-kotlin",
    rb: "file-type-ruby",
    php: "file-type-php",
    swift: "file-type-swift",
    c: "file-type-c",
    h: "file-type-cheader",
    cpp: "file-type-cpp",
    cc: "file-type-cpp",
    cxx: "file-type-cpp",
    hpp: "file-type-cppheader",
    hh: "file-type-cppheader",
    cs: "file-type-csharp",
    vue: "file-type-vue",
    svelte: "file-type-svelte",
    astro: "file-type-astro",
    yaml: "file-type-yaml",
    yml: "file-type-yaml",
    toml: "file-type-toml",
    xml: "file-type-xml",
    svg: "file-type-svg",
    png: "file-type-image",
    jpg: "file-type-image",
    jpeg: "file-type-image",
    gif: "file-type-image",
    webp: "file-type-webp",
    ico: "file-type-image",
    bmp: "file-type-image",
    sql: "file-type-sql",
    graphql: "file-type-graphql",
    gql: "file-type-graphql",
    lua: "file-type-lua",
    dart: "file-type-dartlang",
    zig: "file-type-zig",
    wasm: "file-type-wasm",
    map: "file-type-map",
    zip: "file-type-zip",
    tar: "file-type-zip",
    gz: "file-type-zip",
    tgz: "file-type-zip",
    rar: "file-type-zip",
    "7z": "file-type-zip",
    sh: "file-type-shell",
    bash: "file-type-shell",
    zsh: "file-type-shell",
    fish: "file-type-shell",
    ps1: "file-type-powershell",
    bat: "file-type-bat",
    cmd: "file-type-bat",
    ini: "file-type-ini",
    conf: "file-type-config",
    cfg: "file-type-config",
    env: "file-type-dotenv",
    log: "file-type-log",
    diff: "file-type-diff",
    patch: "file-type-patch",
    txt: "file-type-text",
    csv: "file-type-text",
    tsv: "file-type-text",
    pdf: "file-type-pdf2",
    lock: "file-type-yarn",
    prisma: "file-type-prisma",
    proto: "file-type-protobuf",
    tf: "file-type-terraform",
    hcl: "file-type-terraform",
    nix: "file-type-nix",
    r: "file-type-r",
    scala: "file-type-scala",
    hs: "file-type-haskell",
    ex: "file-type-elixir",
    exs: "file-type-elixir",
    erl: "file-type-erlang",
    clj: "file-type-clojure",
    cljs: "file-type-clojure",
    ml: "file-type-ocaml",
    mli: "file-type-ocaml-intf",
    ipynb: "file-type-jupyter",
    cmake: "file-type-cmake",
    woff: "file-type-font",
    woff2: "file-type-font",
    ttf: "file-type-font",
    otf: "file-type-font",
    eot: "file-type-font",
    mp3: "file-type-audio",
    wav: "file-type-audio",
    mp4: "file-type-video",
    webm: "file-type-video",
    mov: "file-type-video",
};

const FOLDER_ICONS: Record<string, string> = {
    src: "folder-type-src",
    source: "folder-type-src",
    app: "folder-type-app",
    apps: "folder-type-app",
    components: "folder-type-component",
    component: "folder-type-component",
    lib: "folder-type-library",
    libs: "folder-type-library",
    library: "folder-type-library",
    libraries: "folder-type-library",
    public: "folder-type-public",
    dist: "folder-type-dist",
    build: "folder-type-dist",
    out: "folder-type-dist",
    docs: "folder-type-docs",
    doc: "folder-type-docs",
    documentation: "folder-type-docs",
    test: "folder-type-test",
    tests: "folder-type-test",
    __tests__: "folder-type-test",
    spec: "folder-type-test",
    specs: "folder-type-test",
    config: "folder-type-config",
    configs: "folder-type-config",
    configuration: "folder-type-config",
    scripts: "folder-type-script",
    script: "folder-type-script",
    assets: "folder-type-asset",
    asset: "folder-type-asset",
    images: "folder-type-images",
    img: "folder-type-images",
    icons: "folder-type-images",
    styles: "folder-type-style",
    css: "folder-type-style",
    fonts: "folder-type-fonts",
    node_modules: "folder-type-node",
    ".github": "folder-type-github",
    ".git": "folder-type-git",
    ".vscode": "folder-type-vscode",
    ".cursor": "folder-type-cursor",
    ".next": "folder-type-next",
    api: "folder-type-api",
    apis: "folder-type-api",
    hooks: "folder-type-hook",
    utils: "folder-type-helper",
    util: "folder-type-helper",
    helpers: "folder-type-helper",
    types: "folder-type-typescript",
    typings: "folder-type-typescript",
    "@types": "folder-type-typescript",
    docker: "folder-type-docker",
    prisma: "folder-type-prisma",
    database: "folder-type-db",
    db: "folder-type-db",
    migrations: "folder-type-db",
    pages: "folder-type-view",
    views: "folder-type-view",
    layouts: "folder-type-view",
    layout: "folder-type-view",
    middleware: "folder-type-middleware",
    store: "folder-type-redux",
    stores: "folder-type-redux",
    redux: "folder-type-redux",
    i18n: "folder-type-locale",
    locales: "folder-type-locale",
    locale: "folder-type-locale",
    themes: "folder-type-theme",
    theme: "folder-type-theme",
    vendor: "folder-type-library",
    packages: "folder-type-package",
    package: "folder-type-package",
};

function resolveFileIconId(name: string): string {
    const base = name.split(/[\\/]/).pop() || name;
    const lower = base.toLowerCase();

    const byName = FILE_NAME_ICONS[lower];
    if (byName && ICONIFY.icons[byName]) return byName;

    const parts = lower.split(".");
    if (parts.length > 2) {
        const compound = parts.slice(-2).join(".");
        const byCompound = EXTENSION_ICONS[compound];
        if (byCompound && ICONIFY.icons[byCompound]) return byCompound;
    }

    const ext = parts.pop() || "";
    const byExt = EXTENSION_ICONS[ext];
    if (byExt && ICONIFY.icons[byExt]) return byExt;

    const guessed = `file-type-${ext}`;
    if (ext && ICONIFY.icons[guessed]) return guessed;

    return "default-file";
}

function resolveFolderIconId(name: string, isOpen: boolean): string {
    const base = name.split(/[\\/]/).pop()?.toLowerCase() || name.toLowerCase();
    const mapped = FOLDER_ICONS[base];
    if (mapped) {
        const openId = `${mapped}-opened`;
        if (isOpen && ICONIFY.icons[openId]) return openId;
        if (ICONIFY.icons[mapped]) return mapped;
    }
    return isOpen ? "default-folder-opened" : "default-folder";
}

/** @deprecated Kept for callers that still pass a type id; maps to VS Code default. */
export const VALID_FILE_TYPES = new Set(["default-file"]);

export function getIconPathForType(_type: string, light = isDocumentLightTheme()): string {
    return iconDataUrl("default-file", light);
}

export const getIconPath = (name: string, light = isDocumentLightTheme()) =>
    iconDataUrl(resolveFileIconId(name), light);

export function getFolderIconPath(name: string, isOpen = false, light = isDocumentLightTheme()): string {
    return iconDataUrl(resolveFolderIconId(name, isOpen), light);
}
