/** Brand mark rendered through simple-icons (`FrameworkMark`). */
export type ProjectBrandIcon = {
    slug: string;
    color: string;
    invert?: boolean;
};

export type ProjectPreset = {
    /** Passed to `scaffold_web_project`. Keep in sync with the Rust scaffolder. */
    id: string;
    label: string;
    description: string;
    icon: ProjectBrandIcon;
};

export type ProjectCategory = {
    id: string;
    label: string;
    description: string;
    icon: ProjectBrandIcon;
    presets: ProjectPreset[];
};

export const PROJECT_CATEGORIES: ProjectCategory[] = [
    {
        id: "web",
        label: "Web",
        description: "Sites and web apps",
        icon: { slug: "react", color: "61DAFB" },
        presets: [
            {
                id: "next",
                label: "Next.js",
                description: "App Router, TypeScript, Tailwind",
                icon: { slug: "nextdotjs", color: "000000", invert: true },
            },
            {
                id: "vite",
                label: "Vite + React",
                description: "React and TypeScript",
                icon: { slug: "react", color: "61DAFB" },
            },
            {
                id: "vite-vue",
                label: "Vite + Vue",
                description: "Vue and TypeScript",
                icon: { slug: "vuedotjs", color: "4FC08D" },
            },
            {
                id: "vite-svelte",
                label: "Vite + Svelte",
                description: "Svelte and TypeScript",
                icon: { slug: "svelte", color: "FF3E00" },
            },
            {
                id: "vite-solid",
                label: "Vite + Solid",
                description: "Solid and TypeScript",
                icon: { slug: "solid", color: "2C4F7C" },
            },
            {
                id: "astro",
                label: "Astro",
                description: "Minimal TypeScript starter",
                icon: { slug: "astro", color: "FF5D01" },
            },
            {
                id: "sveltekit",
                label: "SvelteKit",
                description: "SvelteKit and TypeScript",
                icon: { slug: "svelte", color: "FF3E00" },
            },
            {
                id: "nuxt",
                label: "Nuxt",
                description: "Nuxt and TypeScript",
                icon: { slug: "nuxtdotjs", color: "00DC82" },
            },
            {
                id: "tanstack",
                label: "TanStack Start",
                description: "React, file routes, Tailwind",
                icon: { slug: "react", color: "61DAFB" },
            },
            {
                id: "react-router",
                label: "React Router",
                description: "Framework mode and TypeScript",
                icon: { slug: "reactrouter", color: "CA4245" },
            },
            {
                id: "remix",
                label: "Remix",
                description: "Remix and TypeScript",
                icon: { slug: "remix", color: "FFFFFF" },
            },
        ],
    },
    {
        id: "server",
        label: "Server",
        description: "APIs and backends",
        icon: { slug: "nodedotjs", color: "5FA04E" },
        presets: [
            {
                id: "hono",
                label: "Hono",
                description: "Node.js and TypeScript",
                icon: { slug: "hono", color: "E36002" },
            },
            {
                id: "nest",
                label: "NestJS",
                description: "NestJS and TypeScript",
                icon: { slug: "nestjs", color: "E0234E" },
            },
            {
                id: "fastify",
                label: "Fastify",
                description: "Fastify and TypeScript",
                icon: { slug: "fastify", color: "000000", invert: true },
            },
            {
                id: "express",
                label: "Express",
                description: "Express and JavaScript",
                icon: { slug: "express", color: "000000", invert: true },
            },
        ],
    },
    {
        id: "docs",
        label: "Documentation",
        description: "Docs sites",
        icon: { slug: "markdown", color: "000000", invert: true },
        presets: [
            {
                id: "fumadocs",
                label: "Fumadocs",
                description: "Next.js MDX docs",
                icon: { slug: "nextdotjs", color: "000000", invert: true },
            },
            {
                id: "starlight",
                label: "Starlight",
                description: "Astro docs site",
                icon: { slug: "astro", color: "FF5D01" },
            },
            {
                id: "docusaurus",
                label: "Docusaurus",
                description: "React docs site",
                icon: { slug: "docusaurus", color: "3ECC5F" },
            },
            {
                id: "vitepress",
                label: "VitePress",
                description: "Vite and Markdown",
                icon: { slug: "vitepress", color: "5C73E7" },
            },
        ],
    },
    {
        id: "desktop",
        label: "Desktop",
        description: "Desktop apps",
        icon: { slug: "tauri", color: "24C8DB" },
        presets: [
            {
                id: "tauri",
                label: "Tauri",
                description: "React, TypeScript, and Tauri",
                icon: { slug: "tauri", color: "24C8DB" },
            },
            {
                id: "electron",
                label: "Electron",
                description: "React and electron-vite",
                icon: { slug: "electron", color: "47848F" },
            },
        ],
    },
    {
        id: "mobile",
        label: "Mobile",
        description: "Mobile apps",
        icon: { slug: "expo", color: "FFFFFF" },
        presets: [
            {
                id: "expo",
                label: "Expo",
                description: "TypeScript app",
                icon: { slug: "expo", color: "FFFFFF" },
            },
        ],
    },
    {
        id: "library",
        label: "Library",
        description: "Packages and libraries",
        icon: { slug: "typescript", color: "3178C6" },
        presets: [
            {
                id: "ts-lib",
                label: "TypeScript",
                description: "Package compiled with tsc",
                icon: { slug: "typescript", color: "3178C6" },
            },
            {
                id: "svelte-lib",
                label: "Svelte library",
                description: "Component package",
                icon: { slug: "svelte", color: "FF3E00" },
            },
        ],
    },
];

export const PROJECT_PRESETS: ProjectPreset[] = PROJECT_CATEGORIES.flatMap((category) => category.presets);

export type ScaffoldKind = (typeof PROJECT_PRESETS)[number]["id"];

export function findProjectPreset(id: string): ProjectPreset | undefined {
    return PROJECT_PRESETS.find((preset) => preset.id === id);
}

export function findProjectCategory(id: string): ProjectCategory | undefined {
    return PROJECT_CATEGORIES.find((category) => category.id === id);
}
