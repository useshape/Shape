"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { McpServerConfig } from "@/lib/settings";

/**
 * Curated MCP server catalog.
 * MCP does not ship branding, so logos for known servers are bundled here.
 */
export type McpCategory = "Featured" | "Infrastructure" | "Data & Analytics" | "Productivity";

export type McpCatalogEntry = {
    id: string;
    name: string;
    description: string;
    category: McpCategory;
    /** Shown in the Discover row at the top of the library. */
    discover?: boolean;
    match?: string[];
    color: string;
    svgPath?: string;
    config: Pick<McpServerConfig, "transport" | "command" | "args" | "env" | "url" | "auth">;
};

const remote = (url: string, auth: "oauth" | "none"): McpCatalogEntry["config"] => ({
    transport: "http",
    command: "",
    args: [],
    env: {},
    url,
    auth,
});

export const MCP_CATEGORIES: McpCategory[] = [
    "Featured",
    "Infrastructure",
    "Data & Analytics",
    "Productivity",
];

export const MCP_CATALOG: McpCatalogEntry[] = [
    {
        id: "github",
        name: "GitHub",
        description: "Repos, issues, PRs, and CI",
        category: "Featured",
        discover: true,
        match: ["githubcopilot"],
        color: "#e6edf3",
        svgPath:
            "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
        config: remote("https://api.githubcopilot.com/mcp/", "oauth"),
    },
    {
        id: "linear",
        name: "Linear",
        description: "Issues and project tracking",
        category: "Productivity",
        discover: true,
        color: "#5E6AD2",
        svgPath:
            "M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.28-2.195.316L.006 11.358a12 12 0 0 1 .316-2.195Zm-.17 5.202 9.483 9.483c-4.799-.784-8.699-4.684-9.483-9.483Z",
        config: remote("https://mcp.linear.app/sse", "oauth"),
    },
    {
        id: "notion",
        name: "Notion",
        description: "Pages and databases",
        category: "Productivity",
        color: "#e6edf3",
        svgPath:
            "M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.886l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.933.653.933 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.448-1.632z",
        config: remote("https://mcp.notion.com/mcp", "oauth"),
    },
    {
        id: "figma",
        name: "Figma",
        description: "Design files and components",
        category: "Featured",
        discover: true,
        color: "#F24E1E",
        svgPath:
            "M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.014-4.49-4.49S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.02 3.019 3.02h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V8.981H8.148zM8.172 24c-2.489 0-4.515-2.014-4.515-4.49s2.014-4.49 4.49-4.49h4.588v4.441c0 2.503-2.047 4.539-4.563 4.539zm-.024-7.51a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.365 3.019 3.044 3.019 1.705 0 3.093-1.376 3.093-3.068v-2.97H8.148zm7.704 0h-.098c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h.098c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.49-4.49 4.49zm-.097-7.509c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h.098c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-.098z",
        config: remote("https://mcp.figma.com/mcp", "oauth"),
    },
    {
        id: "sentry",
        name: "Sentry",
        description: "Errors and performance",
        category: "Infrastructure",
        color: "#a887e0",
        config: remote("https://mcp.sentry.dev/mcp", "oauth"),
    },
    {
        id: "stripe",
        name: "Stripe",
        description: "Payments and customers",
        category: "Data & Analytics",
        color: "#635BFF",
        svgPath:
            "M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z",
        config: remote("https://mcp.stripe.com", "oauth"),
    },
    {
        id: "vercel",
        name: "Vercel",
        description: "Deployments, projects, and logs",
        category: "Infrastructure",
        discover: true,
        color: "#e6edf3",
        svgPath: "M24 22.525H0l12-21.05 12 21.05z",
        config: remote("https://mcp.vercel.com", "oauth"),
    },
    {
        id: "supabase",
        name: "Supabase",
        description: "Postgres, auth, and storage",
        category: "Data & Analytics",
        color: "#3ECF8E",
        svgPath:
            "M21.362 9.354H12V.396a.396.396 0 0 0-.716-.233L2.203 12.424l-.401.562a1.04 1.04 0 0 0 .836 1.659H12v8.959a.396.396 0 0 0 .716.233l9.081-12.261.401-.562a1.04 1.04 0 0 0-.836-1.66z",
        config: remote("https://mcp.supabase.com/mcp", "oauth"),
    },
    {
        id: "neon",
        name: "Neon",
        description: "Serverless Postgres",
        category: "Data & Analytics",
        discover: true,
        color: "#00E599",
        config: remote("https://mcp.neon.tech/mcp", "oauth"),
    },
    {
        id: "atlassian",
        name: "Atlassian",
        description: "Jira and Confluence",
        category: "Productivity",
        match: ["jira", "confluence"],
        color: "#357DE8",
        config: remote("https://mcp.atlassian.com/v1/sse", "oauth"),
    },
    {
        id: "hugging-face",
        name: "Hugging Face",
        description: "Models, datasets, and Spaces",
        category: "Featured",
        match: ["huggingface"],
        color: "#FFD21E",
        config: remote("https://huggingface.co/mcp", "none"),
    },
    {
        id: "context7",
        name: "Context7",
        description: "Up-to-date library docs",
        category: "Featured",
        color: "#8b5cf6",
        config: remote("https://mcp.context7.com/mcp", "none"),
    },
    {
        id: "deepwiki",
        name: "DeepWiki",
        description: "Ask about public GitHub repos",
        category: "Featured",
        color: "#38bdf8",
        config: remote("https://mcp.deepwiki.com/mcp", "none"),
    },
    {
        id: "cloudflare-docs",
        name: "Cloudflare Docs",
        description: "Cloudflare product docs",
        category: "Infrastructure",
        match: ["cloudflare"],
        color: "#F38020",
        config: remote("https://docs.mcp.cloudflare.com/sse", "none"),
    },
    {
        id: "playwright",
        name: "Playwright",
        description: "Browser automation",
        category: "Infrastructure",
        color: "#2EAD33",
        config: {
            transport: "stdio",
            command: "npx",
            args: ["@playwright/mcp@latest"],
            env: {},
            auth: "none",
        },
    },
];

export function findCatalogEntry(server: {
    id?: string;
    name?: string;
    url?: string;
}): McpCatalogEntry | undefined {
    const haystack = [server.id, server.name, server.url]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    if (!haystack) return undefined;
    return MCP_CATALOG.find((entry) => {
        const needles = [entry.id, entry.name.toLowerCase(), ...(entry.match ?? [])];
        return needles.some((n) => haystack.includes(n.toLowerCase()));
    });
}

const MONOGRAM_FALLBACK = "text-text-muted";

/** Logo tile for an MCP server: brand glyph when known, monogram otherwise. */
export function McpLogo({
    server,
    entry,
    size = 28,
    className,
}: {
    server?: { id?: string; name?: string; url?: string };
    entry?: McpCatalogEntry;
    size?: number;
    className?: string;
}) {
    const resolved = entry ?? (server ? findCatalogEntry(server) : undefined);
    const label = resolved?.name ?? server?.name ?? server?.id ?? "?";
    const color = resolved?.color;

    return (
        <span
            className={cn(
                "inline-flex items-center justify-center rounded-xl bg-surface-3 shrink-0 select-none",
                className,
            )}
            style={{ width: size, height: size }}
            aria-hidden
        >
            {resolved?.svgPath && color ? (
                <svg
                    viewBox="0 0 24 24"
                    style={{ width: size * 0.55, height: size * 0.55 }}
                    fill={color}
                    role="img"
                >
                    <path d={resolved.svgPath} />
                </svg>
            ) : (
                <span
                    className={cn("font-semibold leading-none", MONOGRAM_FALLBACK)}
                    style={{
                        fontSize: Math.round(size * 0.45),
                        color: color || undefined,
                    }}
                >
                    {label.trim().charAt(0).toUpperCase() || "?"}
                </span>
            )}
        </span>
    );
}
