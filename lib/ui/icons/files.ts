import bodies from "./vscode-bodies.json";

const EXT: Record<string, keyof typeof bodies> = {
    ts: "file-type-typescript",
    mts: "file-type-typescript",
    cts: "file-type-typescript",
    tsx: "file-type-reactts",
    js: "file-type-js",
    mjs: "file-type-js",
    cjs: "file-type-js",
    jsx: "file-type-reactjs",
    json: "file-type-json",
    jsonc: "file-type-json",
    md: "file-type-markdown",
    mdx: "file-type-markdown",
    css: "file-type-css",
    scss: "file-type-css",
    sass: "file-type-css",
    less: "file-type-css",
    html: "file-type-html",
    htm: "file-type-html",
    rs: "file-type-rust",
    py: "file-type-python",
    toml: "file-type-toml",
    yml: "file-type-yaml",
    yaml: "file-type-yaml",
    png: "file-type-image",
    jpg: "file-type-image",
    jpeg: "file-type-image",
    gif: "file-type-image",
    webp: "file-type-image",
    ico: "file-type-image",
    svg: "file-type-svg",
    xml: "file-type-xml",
    go: "file-type-go",
    java: "file-type-java",
    sh: "file-type-shell",
    bash: "file-type-shell",
    zsh: "file-type-shell",
    ps1: "file-type-powershell",
    sql: "file-type-sql",
    vue: "file-type-vue",
    svelte: "file-type-svelte",
    pdf: "file-type-pdf",
    zip: "file-type-zip",
    gz: "file-type-zip",
    php: "file-type-php",
    cpp: "file-type-cpp",
    cc: "file-type-cpp",
    cxx: "file-type-cpp",
    c: "file-type-c",
    h: "file-type-c",
    cs: "file-type-csharp",
    kt: "file-type-kotlin",
    swift: "file-type-swift",
    rb: "file-type-ruby",
    lua: "file-type-lua",
    graphql: "file-type-graphql",
    gql: "file-type-graphql",
    prisma: "file-type-prisma",
    wasm: "file-type-wasm",
    log: "file-type-log",
    mp3: "file-type-audio",
    wav: "file-type-audio",
    mp4: "file-type-video",
    mov: "file-type-video",
    ttf: "file-type-font",
    otf: "file-type-font",
    woff: "file-type-font",
    woff2: "file-type-font",
    txt: "file-type-text",
    env: "file-type-dotenv",
};

const NAME: Record<string, keyof typeof bodies> = {
    "package.json": "file-type-npm",
    "package-lock.json": "file-type-npm",
    "pnpm-lock.yaml": "file-type-npm",
    "yarn.lock": "file-type-npm",
    "tsconfig.json": "file-type-tsconfig",
    "cargo.toml": "file-type-cargo",
    "cargo.lock": "file-type-cargo",
    dockerfile: "file-type-docker",
    "docker-compose.yml": "file-type-docker",
    "docker-compose.yaml": "file-type-docker",
    ".gitignore": "file-type-git",
    ".gitattributes": "file-type-git",
    ".gitmodules": "file-type-git",
    license: "file-type-license",
    "license.md": "file-type-license",
    ".env": "file-type-dotenv",
};

const uriCache = new Map<string, string>();

function uri(id: keyof typeof bodies): string {
    const hit = uriCache.get(id);
    if (hit) return hit;
    const body = bodies[id] || bodies["default-file"];
    const svg = `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32">${body}</svg>`,
    )}`;
    uriCache.set(id, svg);
    return svg;
}

export function isDocumentLightTheme(): boolean {
    if (typeof document === "undefined") return false;
    return document.documentElement.getAttribute("data-theme") === "light";
}

export function getFolderIconPath(_name: string, _isOpen = false, _light = false): string {
    return uri("default-file");
}

export function getIconPath(name: string, _light = false): string {
    const base = name.split(/[\\/]/).pop()?.toLowerCase() || name.toLowerCase();
    if (NAME[base]) return uri(NAME[base]);
    if (base.startsWith(".env")) return uri("file-type-dotenv");
    const ext = base.includes(".") ? base.split(".").pop()! : "";
    return uri(EXT[ext] ?? "default-file");
}
