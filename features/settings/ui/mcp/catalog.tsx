"use client";

import React, { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { faviconUrl } from "@/lib/favicon";
import { cn } from "@/lib/utils";
import type { McpServerConfig } from "@/lib/settings";

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
    /** Official product site used to fetch the live brand favicon. */
    iconDomain: string;
    /** Simple Icons slug when a high-quality brand SVG is available. */
    iconSlug?: string;
    config: Pick<McpServerConfig, "transport" | "command" | "args" | "env" | "url" | "auth">;
};

export function catalogToServerConfig(entry: McpCatalogEntry): McpServerConfig {
    return {
        id: entry.id,
        name: entry.name,
        transport: entry.config.transport,
        command: entry.config.command,
        args: entry.config.args,
        env: entry.config.env,
        url: entry.config.url,
        auth: entry.config.auth,
        enabled: true,
    };
}

const remote = (url: string, auth: "oauth" | "none"): McpCatalogEntry["config"] => ({
    transport: "http",
    command: "",
    args: [],
    env: {},
    url,
    auth,
});

const stdio = (command: string, args: string[]): McpCatalogEntry["config"] => ({
    transport: "stdio",
    command,
    args,
    env: {},
    auth: "none",
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
        iconDomain: "github.com",
        iconSlug: "github",
        config: remote("https://api.githubcopilot.com/mcp/", "oauth"),
    },
    {
        id: "linear",
        name: "Linear",
        description: "Issues and project tracking",
        category: "Productivity",
        discover: true,
        color: "#5E6AD2",
        iconDomain: "linear.app",
        iconSlug: "linear",
        config: remote("https://mcp.linear.app/sse", "oauth"),
    },
    {
        id: "notion",
        name: "Notion",
        description: "Pages and databases",
        category: "Productivity",
        color: "#e6edf3",
        iconDomain: "notion.so",
        iconSlug: "notion",
        config: remote("https://mcp.notion.com/mcp", "oauth"),
    },
    {
        id: "figma",
        name: "Figma",
        description: "Design files and components",
        category: "Featured",
        discover: true,
        color: "#F24E1E",
        iconDomain: "figma.com",
        iconSlug: "figma",
        config: remote("https://mcp.figma.com/mcp", "oauth"),
    },
    {
        id: "sentry",
        name: "Sentry",
        description: "Errors and performance",
        category: "Infrastructure",
        color: "#a887e0",
        iconDomain: "sentry.io",
        iconSlug: "sentry",
        config: remote("https://mcp.sentry.dev/mcp", "oauth"),
    },
    {
        id: "stripe",
        name: "Stripe",
        description: "Payments and customers",
        category: "Data & Analytics",
        color: "#635BFF",
        iconDomain: "stripe.com",
        iconSlug: "stripe",
        config: remote("https://mcp.stripe.com", "oauth"),
    },
    {
        id: "vercel",
        name: "Vercel",
        description: "Deployments, projects, and logs",
        category: "Infrastructure",
        discover: true,
        color: "#e6edf3",
        iconDomain: "vercel.com",
        iconSlug: "vercel",
        config: remote("https://mcp.vercel.com", "oauth"),
    },
    {
        id: "supabase",
        name: "Supabase",
        description: "Postgres, auth, and storage",
        category: "Data & Analytics",
        color: "#3ECF8E",
        iconDomain: "supabase.com",
        iconSlug: "supabase",
        config: remote("https://mcp.supabase.com/mcp", "oauth"),
    },
    {
        id: "neon",
        name: "Neon",
        description: "Serverless Postgres",
        category: "Data & Analytics",
        discover: true,
        color: "#00E599",
        iconDomain: "neon.tech",
        iconSlug: "neon",
        config: remote("https://mcp.neon.tech/mcp", "oauth"),
    },
    {
        id: "atlassian",
        name: "Atlassian",
        description: "Jira and Confluence",
        category: "Productivity",
        match: ["jira", "confluence"],
        color: "#357DE8",
        iconDomain: "atlassian.com",
        iconSlug: "atlassian",
        config: remote("https://mcp.atlassian.com/v1/sse", "oauth"),
    },
    {
        id: "hugging-face",
        name: "Hugging Face",
        description: "Models, datasets, and Spaces",
        category: "Featured",
        match: ["huggingface"],
        color: "#FFD21E",
        iconDomain: "huggingface.co",
        iconSlug: "huggingface",
        config: remote("https://huggingface.co/mcp", "none"),
    },
    {
        id: "context7",
        name: "Context7",
        description: "Up-to-date library docs",
        category: "Featured",
        color: "#8b5cf6",
        iconDomain: "context7.com",
        config: remote("https://mcp.context7.com/mcp", "none"),
    },
    {
        id: "deepwiki",
        name: "DeepWiki",
        description: "Ask about public GitHub repos",
        category: "Featured",
        color: "#38bdf8",
        iconDomain: "deepwiki.com",
        config: remote("https://mcp.deepwiki.com/mcp", "none"),
    },
    {
        id: "cloudflare-docs",
        name: "Cloudflare Docs",
        description: "Cloudflare product docs",
        category: "Infrastructure",
        match: ["cloudflare"],
        color: "#F38020",
        iconDomain: "cloudflare.com",
        iconSlug: "cloudflare",
        config: remote("https://docs.mcp.cloudflare.com/sse", "none"),
    },
    {
        id: "playwright",
        name: "Playwright",
        description: "Browser automation",
        category: "Infrastructure",
        color: "#2EAD33",
        iconDomain: "playwright.dev",
        iconSlug: "playwright",
        config: stdio("npx", ["@playwright/mcp@latest"]),
    },
    {
        id: "datadog",
        name: "Datadog",
        description: "Logs, traces, metrics, and monitors",
        category: "Infrastructure",
        discover: true,
        color: "#632CA6",
        iconDomain: "datadoghq.com",
        iconSlug: "datadog",
        config: remote("https://mcp.datadoghq.com/v1/mcp", "oauth"),
    },
    {
        id: "posthog",
        name: "PostHog",
        description: "Product analytics, flags, and replays",
        category: "Data & Analytics",
        discover: true,
        color: "#F54E00",
        iconDomain: "posthog.com",
        iconSlug: "posthog",
        config: remote("https://mcp.posthog.com/mcp", "oauth"),
    },
    {
        id: "firebase",
        name: "Firebase",
        description: "Projects, Auth, Firestore, and docs",
        category: "Infrastructure",
        discover: true,
        color: "#FFCA28",
        iconDomain: "firebase.google.com",
        iconSlug: "firebase",
        config: stdio("npx", ["-y", "firebase-tools@latest", "mcp"]),
    },
    {
        id: "slack",
        name: "Slack",
        description: "Channels, messages, and search",
        category: "Productivity",
        discover: true,
        color: "#E01E5A",
        iconDomain: "slack.com",
        iconSlug: "slack",
        config: remote("https://mcp.slack.com/mcp", "oauth"),
    },
    {
        id: "hubspot",
        name: "HubSpot",
        description: "CRM contacts, deals, and tickets",
        category: "Data & Analytics",
        color: "#FF7A59",
        iconDomain: "hubspot.com",
        iconSlug: "hubspot",
        config: remote("https://mcp.hubspot.com", "oauth"),
    },
    {
        id: "amplitude",
        name: "Amplitude",
        description: "Product analytics and charts",
        category: "Data & Analytics",
        color: "#1D64F2",
        iconDomain: "amplitude.com",
        iconSlug: "amplitude",
        config: remote("https://mcp.amplitude.com/mcp", "oauth"),
    },
    {
        id: "mixpanel",
        name: "Mixpanel",
        description: "Events, funnels, and cohorts",
        category: "Data & Analytics",
        color: "#7856FF",
        iconDomain: "mixpanel.com",
        iconSlug: "mixpanel",
        config: remote("https://mcp.mixpanel.com/mcp", "oauth"),
    },
    {
        id: "asana",
        name: "Asana",
        description: "Tasks, projects, and comments",
        category: "Productivity",
        color: "#F06A6A",
        iconDomain: "asana.com",
        iconSlug: "asana",
        config: remote("https://mcp.asana.com/mcp", "oauth"),
    },
    {
        id: "monday",
        name: "Monday.com",
        description: "Boards, items, and updates",
        category: "Productivity",
        match: ["monday.com"],
        color: "#FF3D57",
        iconDomain: "monday.com",
        iconSlug: "mondaydotcom",
        config: remote("https://mcp.monday.com/mcp", "oauth"),
    },
    {
        id: "intercom",
        name: "Intercom",
        description: "Conversations and contacts",
        category: "Productivity",
        color: "#6AFDEF",
        iconDomain: "intercom.com",
        iconSlug: "intercom",
        config: remote("https://mcp.intercom.com/sse", "oauth"),
    },
    {
        id: "launchdarkly",
        name: "LaunchDarkly",
        description: "Feature flags and AI configs",
        category: "Infrastructure",
        color: "#405BFF",
        iconDomain: "launchdarkly.com",
        iconSlug: "launchdarkly",
        config: remote("https://mcp.launchdarkly.com/mcp/launchdarkly", "oauth"),
    },
    {
        id: "webflow",
        name: "Webflow",
        description: "CMS collections and sites",
        category: "Productivity",
        color: "#146EF5",
        iconDomain: "webflow.com",
        iconSlug: "webflow",
        config: remote("https://mcp.webflow.com/sse", "oauth"),
    },
    {
        id: "canva",
        name: "Canva",
        description: "Designs, folders, and assets",
        category: "Featured",
        color: "#00C4CC",
        iconDomain: "canva.com",
        iconSlug: "canva",
        config: remote("https://mcp.canva.com/mcp", "oauth"),
    },
    {
        id: "pagerduty",
        name: "PagerDuty",
        description: "Incidents, services, and on-call",
        category: "Infrastructure",
        color: "#06AC38",
        iconDomain: "pagerduty.com",
        iconSlug: "pagerduty",
        config: remote("https://mcp.pagerduty.com/mcp", "oauth"),
    },
    {
        id: "prisma",
        name: "Prisma",
        description: "Postgres schemas and queries",
        category: "Data & Analytics",
        color: "#5A67D8",
        iconDomain: "prisma.io",
        iconSlug: "prisma",
        config: remote("https://mcp.prisma.io/mcp", "oauth"),
    },
    {
        id: "mongodb",
        name: "MongoDB",
        description: "Clusters, collections, and queries",
        category: "Data & Analytics",
        color: "#00ED64",
        iconDomain: "mongodb.com",
        iconSlug: "mongodb",
        config: remote("https://mcp.mongodb.com/mcp", "oauth"),
    },
    {
        id: "paypal",
        name: "PayPal",
        description: "Payments, invoices, and disputes",
        category: "Data & Analytics",
        color: "#003087",
        iconDomain: "paypal.com",
        iconSlug: "paypal",
        config: remote("https://mcp.paypal.com/mcp", "oauth"),
    },
    {
        id: "clickup",
        name: "ClickUp",
        description: "Tasks, docs, and spaces",
        category: "Productivity",
        color: "#7B68EE",
        iconDomain: "clickup.com",
        iconSlug: "clickup",
        config: remote("https://mcp.clickup.com/mcp", "oauth"),
    },
    {
        id: "gitlab",
        name: "GitLab",
        description: "Repos, MRs, issues, and CI",
        category: "Infrastructure",
        color: "#FC6D26",
        iconDomain: "gitlab.com",
        iconSlug: "gitlab",
        config: remote("https://gitlab.com/api/v4/mcp", "oauth"),
    },
    {
        id: "shopify",
        name: "Shopify",
        description: "Store, products, and Admin API",
        category: "Data & Analytics",
        color: "#96BF48",
        iconDomain: "shopify.com",
        iconSlug: "shopify",
        config: stdio("npx", ["-y", "@shopify/dev-mcp@latest"]),
    },
    {
        id: "circleci",
        name: "CircleCI",
        description: "Pipelines, jobs, and logs",
        category: "Infrastructure",
        color: "#343434",
        iconDomain: "circleci.com",
        iconSlug: "circleci",
        config: stdio("npx", ["-y", "@circleci/mcp-server-circleci@latest"]),
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

function simpleIconUrl(slug: string) {
    return `https://cdn.simpleicons.org/${encodeURIComponent(slug)}`;
}

/** Live brand mark from the product site (favicon) with Simple Icons as backup. */
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
    const fav = resolved?.iconDomain ? faviconUrl(resolved.iconDomain, Math.max(size * 2, 64)) : null;
    const brand = resolved?.iconSlug ? simpleIconUrl(resolved.iconSlug) : null;
    const sources = [fav, brand].filter((s): s is string => Boolean(s));
    const [sourceIndex, setSourceIndex] = useState(0);
    useEffect(() => {
        setSourceIndex(0);
    }, [resolved?.id, fav, brand]);
    const src = sources[sourceIndex];

    return (
        <span
            className={cn(
                "inline-flex items-center justify-center rounded-xl bg-surface-3 shrink-0 select-none overflow-hidden",
                className,
            )}
            style={{ width: size, height: size }}
            aria-hidden
        >
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={src}
                    alt=""
                    width={Math.round(size * 0.72)}
                    height={Math.round(size * 0.72)}
                    className="object-contain"
                    onError={() => setSourceIndex((i) => i + 1)}
                />
            ) : (
                <Icon name="public" size={Math.max(12, Math.round(size * 0.55))} className="text-text-muted" />
            )}
        </span>
    );
}
