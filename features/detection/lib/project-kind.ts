import type { RemixiconComponentType } from "@remixicon/react";
import { RiFolder3Fill } from "@remixicon/react";
import { commands } from "@/lib/backend";

export type ProjectKindId =
    | "next"
    | "react"
    | "vue"
    | "angular"
    | "node"
    | "web"
    | "rust"
    | "ruby"
    | "python"
    | "php"
    | "swift"
    | "go"
    | "folder";

export type ProjectKind = {
    id: ProjectKindId;
    label: string;
    icon: RemixiconComponentType;
    color: string;
    mark?: { slug: string; color: string };
};

const KINDS: Record<ProjectKindId, ProjectKind> = {
    next: { id: "next", label: "Next.js", icon: RiFolder3Fill, color: "#ffffff", mark: { slug: "nextdotjs", color: "FFFFFF" } },
    react: { id: "react", label: "React", icon: RiFolder3Fill, color: "#61DAFB", mark: { slug: "react", color: "61DAFB" } },
    vue: { id: "vue", label: "Vue", icon: RiFolder3Fill, color: "#42B883", mark: { slug: "vuedotjs", color: "42B883" } },
    angular: { id: "angular", label: "Angular", icon: RiFolder3Fill, color: "#DD0031", mark: { slug: "angular", color: "DD0031" } },
    node: { id: "node", label: "Node", icon: RiFolder3Fill, color: "#5FA04E", mark: { slug: "nodedotjs", color: "5FA04E" } },
    web: { id: "web", label: "Web", icon: RiFolder3Fill, color: "#F7DF1E", mark: { slug: "javascript", color: "F7DF1E" } },
    rust: { id: "rust", label: "Rust", icon: RiFolder3Fill, color: "#FFFFFF", mark: { slug: "rust", color: "FFFFFF" } },
    ruby: { id: "ruby", label: "Ruby", icon: RiFolder3Fill, color: "#CC342D", mark: { slug: "ruby", color: "CC342D" } },
    python: { id: "python", label: "Python", icon: RiFolder3Fill, color: "#3776AB", mark: { slug: "python", color: "3776AB" } },
    php: { id: "php", label: "PHP", icon: RiFolder3Fill, color: "#777BB4", mark: { slug: "php", color: "777BB4" } },
    swift: { id: "swift", label: "Swift", icon: RiFolder3Fill, color: "#F05138", mark: { slug: "swift", color: "F05138" } },
    go: { id: "go", label: "Go", icon: RiFolder3Fill, color: "#00ADD8", mark: { slug: "go", color: "00ADD8" } },
    folder: { id: "folder", label: "Folder", icon: RiFolder3Fill, color: "#A3A3A3" },
};

const cache = new Map<string, ProjectKind>();

export function fallbackProjectKind(): ProjectKind {
    return KINDS.folder;
}

export async function detectProjectKind(path: string | null | undefined): Promise<ProjectKind> {
    if (!path) return KINDS.folder;
    const cached = cache.get(path);
    if (cached) return cached;
    try {
        const entries = await commands.lsDir(path);
        const names = new Set(entries.map((e) => e.name.toLowerCase()));
        const kind = classify(names);
        cache.set(path, kind);
        return kind;
    } catch {
        return KINDS.folder;
    }
}

function classify(names: Set<string>): ProjectKind {
    if ([...names].some((n) => n.startsWith("next.config"))) return KINDS.next;
    if (names.has("cargo.toml") || names.has("cargo.lock")) return KINDS.rust;
    if (names.has("gemfile") || names.has("gemfile.lock")) return KINDS.ruby;
    if (
        names.has("pyproject.toml") ||
        names.has("requirements.txt") ||
        names.has("pipfile") ||
        names.has("setup.py")
    ) {
        return KINDS.python;
    }
    if (names.has("composer.json")) return KINDS.php;
    if (names.has("package.swift") || names.has("podfile")) return KINDS.swift;
    if (names.has("go.mod") || names.has("go.sum")) return KINDS.go;
    if ([...names].some((n) => n.startsWith("angular.json"))) return KINDS.angular;
    if ([...names].some((n) => n.startsWith("nuxt.config") || n === "app.vue")) return KINDS.vue;
    if (names.has("package.json")) {
        if ([...names].some((n) => n.includes("vue"))) return KINDS.vue;
        if ([...names].some((n) => n.startsWith("vite.config") || n.startsWith("remix.config"))) {
            return KINDS.react;
        }
        return KINDS.node;
    }
    if (names.has("index.html") || names.has("index.htm")) return KINDS.web;
    return KINDS.folder;
}
