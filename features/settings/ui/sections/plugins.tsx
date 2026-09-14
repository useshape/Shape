"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RiArrowDownSLine, RiArrowLeftLine, RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/ui/icon";
import { PluginLogo } from "@/components/ui/plugin-logo";
import { commands } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { ShapeApiError } from "@/lib/cloud/api";
import { useShapeAuth } from "@/lib/cloud/store";
import {
    updateSettingSection,
    useSettings,
    type AutoRunModeSetting,
} from "@/lib/settings";
import {
    disconnectPlugin,
    fetchPluginTools,
    fetchPlugins,
    invalidatePluginsCache,
    peekPluginsCache,
    startPluginConnect,
    type PluginRow,
    type PluginToolHint,
} from "@/lib/plugins-api";
import {
    cleanPluginActionDescription,
    humanizePluginActionName,
} from "@/lib/plugin-logos";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { SettingRow, SettingSection, SettingSelect } from "../shared/controls";
import { Skeleton } from "@/features/git/ui/shared/skeletons";

const APPROVAL_OPTIONS: Array<{ value: AutoRunModeSetting; label: string }> = [
    { value: "ask", label: "Ask every time" },
    { value: "auto", label: "Auto (safe actions)" },
    { value: "always", label: "Run everything" },
];

const CATEGORY_ORDER = [
    "Chat",
    "Dev",
    "Docs",
    "Design",
    "Work",
    "Business",
    "Data",
    "Support",
    "Social",
] as const;

const POPULAR_TOOLKITS = [
    "github",
    "slack",
    "linear",
    "notion",
    "figma",
    "vercel",
    "stripe",
    "discord",
];

const SHIP_TOOLKITS = [
    "github",
    "gitlab",
    "vercel",
    "netlify",
    "sentry",
    "cloudflare",
    "linear",
];

const COLLAB_TOOLKITS = [
    "slack",
    "discord",
    "microsoft_teams",
    "notion",
    "zoom",
    "linear",
];

function PluginCardSkeleton() {
    return (
        <div className="flex h-full w-full items-start gap-3 rounded-xl border border-border-subtle bg-surface-2 p-4">
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
            </div>
        </div>
    );
}

function PluginsCatalogSkeleton() {
    return (
        <div className="space-y-8" aria-busy aria-label="Loading plugins">
            <section className="space-y-3">
                <Skeleton className="h-4 w-20" />
                <div className="flex gap-3 overflow-hidden">
                    {Array.from({ length: 3 }, (_, i) => (
                        <div key={i} className="w-72 shrink-0">
                            <PluginCardSkeleton />
                        </div>
                    ))}
                </div>
            </section>
            <section className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <div className="flex gap-3 overflow-hidden">
                    {Array.from({ length: 3 }, (_, i) => (
                        <div key={i} className="w-72 shrink-0">
                            <PluginCardSkeleton />
                        </div>
                    ))}
                </div>
            </section>
            <section className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }, (_, i) => (
                        <PluginCardSkeleton key={i} />
                    ))}
                </div>
            </section>
        </div>
    );
}

function PluginActionsSkeleton() {
    return (
        <div aria-busy aria-label="Loading actions">
            {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex items-start justify-between gap-4 px-4 py-3.5">
                    <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-full max-w-80" />
                    </div>
                    <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
                </div>
            ))}
        </div>
    );
}

function pickByToolkit(plugins: PluginRow[], slugs: string[]): PluginRow[] {
    const map = new Map(plugins.map((p) => [p.toolkit, p]));
    return slugs.map((s) => map.get(s)).filter((p): p is PluginRow => Boolean(p));
}

function PluginCard({
    plugin,
    onOpen,
}: {
    plugin: PluginRow;
    onOpen: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className="flex h-full w-full items-start gap-3 rounded-xl border border-border-subtle bg-surface-2 p-4 text-left transition-colors hover:bg-panel-hover"
        >
            <PluginLogo toolkit={plugin.toolkit} name={plugin.name} logo={plugin.logo} size={36} />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <div className="truncate text-md font-medium text-text-primary">{plugin.name}</div>
                    {plugin.connected ? (
                        <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-px text-xs text-accent">
                            Connected
                        </span>
                    ) : null}
                </div>
                <div className="mt-0.5 line-clamp-2 text-sm text-text-muted">{plugin.description}</div>
            </div>
        </button>
    );
}

function ConnectedList({
    plugins,
    onOpen,
}: {
    plugins: PluginRow[];
    onOpen: (plugin: PluginRow) => void;
}) {
    if (plugins.length === 0) return null;
    return (
        <section className="space-y-3">
            <h2 className="text-sm font-medium text-text-muted">Connected</h2>
            <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-2">
                {plugins.map((plugin, index) => (
                    <button
                        key={plugin.id}
                        type="button"
                        onClick={() => onOpen(plugin)}
                        className={cn(
                            "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-panel-hover",
                            index > 0 && "border-t border-border-subtle",
                        )}
                    >
                        <PluginLogo toolkit={plugin.toolkit} name={plugin.name} logo={plugin.logo} size={32} />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-md font-medium text-text-primary">{plugin.name}</div>
                            <div className="truncate text-sm text-text-muted">{plugin.description}</div>
                        </div>
                        <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-px text-xs text-accent">
                            Connected
                        </span>
                    </button>
                ))}
            </div>
        </section>
    );
}

function PluginCarousel({
    title,
    plugins,
    onOpen,
}: {
    title: string;
    plugins: PluginRow[];
    onOpen: (plugin: PluginRow) => void;
}) {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [canPrev, setCanPrev] = useState(false);
    const [canNext, setCanNext] = useState(false);

    const sync = useCallback(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const max = el.scrollWidth - el.clientWidth;
        setCanPrev(el.scrollLeft > 12);
        setCanNext(max > 12 && el.scrollLeft < max - 12);
    }, []);

    useEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        sync();
        el.addEventListener("scroll", sync, { passive: true });
        const observer = new ResizeObserver(sync);
        observer.observe(el);
        return () => {
            el.removeEventListener("scroll", sync);
            observer.disconnect();
        };
    }, [plugins, sync]);

    const scrollByPage = (direction: -1 | 1) => {
        const el = scrollerRef.current;
        if (!el) return;
        el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.8, 280), behavior: "smooth" });
    };

    if (plugins.length === 0) return null;

    return (
        <section className="space-y-3">
            <h2 className="text-sm font-medium text-text-muted">{title}</h2>
            <div className="relative">
                <div
                    ref={scrollerRef}
                    className="no-scrollbar flex gap-3 overflow-x-auto scroll-smooth px-1 pb-1"
                >
                    {plugins.map((plugin) => (
                        <div key={plugin.id} className="w-72 shrink-0">
                            <PluginCard plugin={plugin} onOpen={() => onOpen(plugin)} />
                        </div>
                    ))}
                </div>
                <div
                    className={cn(
                        "pointer-events-none absolute inset-y-0 left-0 w-14 bg-linear-to-r from-panel to-transparent transition-opacity",
                        canPrev ? "opacity-100" : "opacity-0",
                    )}
                />
                <div
                    className={cn(
                        "pointer-events-none absolute inset-y-0 right-0 w-14 bg-linear-to-l from-panel to-transparent transition-opacity",
                        canNext ? "opacity-100" : "opacity-0",
                    )}
                />
                <button
                    type="button"
                    aria-label={`Previous ${title}`}
                    disabled={!canPrev}
                    onClick={() => scrollByPage(-1)}
                    className={cn(
                        "absolute top-1/2 left-1 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border-subtle bg-surface-3 text-text-primary shadow-sm transition-opacity",
                        canPrev ? "opacity-100" : "pointer-events-none opacity-0",
                    )}
                >
                    <Icon icon={RiArrowLeftSLine} />
                </button>
                <button
                    type="button"
                    aria-label={`Next ${title}`}
                    disabled={!canNext}
                    onClick={() => scrollByPage(1)}
                    className={cn(
                        "absolute top-1/2 right-1 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border-subtle bg-surface-3 text-text-primary shadow-sm transition-opacity",
                        canNext ? "opacity-100" : "pointer-events-none opacity-0",
                    )}
                >
                    <Icon icon={RiArrowRightSLine} />
                </button>
            </div>
        </section>
    );
}

function PluginDetail({
    plugin,
    busy,
    onBack,
    onConnect,
    onDisconnect,
}: {
    plugin: PluginRow;
    busy: boolean;
    onBack: () => void;
    onConnect: () => void;
    onDisconnect: () => void;
}) {
    const settings = useSettings();
    const mode: AutoRunModeSetting =
        settings.ai.pluginApprovals?.[plugin.toolkit] ?? settings.ai.pluginApprovalDefault ?? "ask";
    const disabled = new Set(settings.ai.pluginDisabledActions?.[plugin.toolkit] ?? []);
    const [tools, setTools] = useState<PluginToolHint[]>([]);
    const [toolsLoading, setToolsLoading] = useState(false);

    useEffect(() => {
        if (!plugin.connected) {
            setTools([]);
            return;
        }
        let cancelled = false;
        setToolsLoading(true);
        void fetchPluginTools(plugin.toolkit)
            .then((list) => {
                if (!cancelled) setTools(list);
            })
            .catch(() => {
                if (!cancelled) setTools([]);
            })
            .finally(() => {
                if (!cancelled) setToolsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [plugin.connected, plugin.toolkit]);

    function setMode(value: AutoRunModeSetting) {
        updateSettingSection("ai", {
            pluginApprovals: { ...settings.ai.pluginApprovals, [plugin.toolkit]: value },
        });
    }

    function setActionEnabled(slug: string, enabled: boolean) {
        const current = settings.ai.pluginDisabledActions?.[plugin.toolkit] ?? [];
        const next = enabled
            ? current.filter((s) => s !== slug)
            : [...new Set([...current, slug])];
        updateSettingSection("ai", {
            pluginDisabledActions: {
                ...settings.ai.pluginDisabledActions,
                [plugin.toolkit]: next,
            },
        });
    }

    function enableAll() {
        updateSettingSection("ai", {
            pluginDisabledActions: {
                ...settings.ai.pluginDisabledActions,
                [plugin.toolkit]: [],
            },
        });
    }

    return (
        <div className="mx-auto w-full max-w-3xl">
            <button
                type="button"
                onClick={onBack}
                className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary"
            >
                <Icon icon={RiArrowLeftLine} />
                Back
            </button>
            <div className="flex items-start gap-4">
                <PluginLogo toolkit={plugin.toolkit} name={plugin.name} logo={plugin.logo} size={48} />
                <div className="min-w-0 flex-1">
                    <h1 className="text-2xl font-medium text-text-primary">{plugin.name}</h1>
                    <p className="mt-1 text-sm text-text-muted">{plugin.description}</p>
                </div>
                {plugin.connected ? (
                    <Button variant="secondary" size="sm" disabled={busy} onClick={onDisconnect}>
                        Disconnect
                    </Button>
                ) : (
                    <Button size="sm" disabled={busy} onClick={onConnect}>
                        {busy ? "Connecting…" : "Connect"}
                    </Button>
                )}
            </div>

            <div className="mt-8">
                <SettingSection
                    title="Approval"
                    description="Same modes as the terminal. Default for every plugin is ask every time."
                >
                    <SettingRow title="When the agent uses this plugin" description="Read-only discovery never asks. This applies to actions that run against the connected app.">
                        <SettingSelect
                            value={mode}
                            options={APPROVAL_OPTIONS}
                            onChange={(v) => setMode(v as AutoRunModeSetting)}
                        />
                    </SettingRow>
                </SettingSection>

            {plugin.connected ? (
                <SettingSection
                    title="Actions"
                    description="Turn off anything you do not want the agent to call."
                    action={
                        tools.length > 0 ? (
                            <button
                                type="button"
                                className="text-sm text-text-muted hover:text-text-primary"
                                onClick={enableAll}
                            >
                                Enable all
                            </button>
                        ) : null
                    }
                >
                    {toolsLoading && tools.length === 0 ? (
                        <PluginActionsSkeleton />
                    ) : tools.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-text-muted">
                            Connect and wait a moment, then reopen to load actions.
                        </div>
                    ) : (
                        tools.map((tool, index) => (
                            <SettingRow
                                key={`${tool.slug}-${index}`}
                                title={humanizePluginActionName(tool.slug, tool.name)}
                                description={cleanPluginActionDescription(tool.description)}
                            >
                                <Switch
                                    checked={!disabled.has(tool.slug)}
                                    onCheckedChange={(on) => setActionEnabled(tool.slug, on)}
                                />
                            </SettingRow>
                        ))
                    )}
                </SettingSection>
            ) : null}
            </div>
        </div>
    );
}

export function PluginsSettingsView() {
    const auth = useShapeAuth();
    const pluginsAvailable = auth.loggedIn && !auth.offline;
    const cached = peekPluginsCache();
    const [plugins, setPlugins] = useState<PluginRow[]>(cached?.plugins ?? []);
    const [configured, setConfigured] = useState(cached?.configured ?? true);
    const [loading, setLoading] = useState(!cached);
    const [busy, setBusy] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("all");
    const [openToolkit, setOpenToolkit] = useState<string | null>(null);

    const load = useCallback(
        async (force = false) => {
            if (!pluginsAvailable) {
                setLoading(false);
                return;
            }
            try {
                const data = await fetchPlugins({ force });
                setPlugins(data.plugins);
                setConfigured(data.configured);
                setBusy((current) => {
                    if (!current) return current;
                    if (data.plugins.some((p) => p.toolkit === current && p.connected)) return null;
                    return current;
                });
            } catch (err) {
                const message = err instanceof ShapeApiError ? err.message : "Could not load plugins.";
                notify.error(message);
            } finally {
                setLoading(false);
            }
        },
        [pluginsAvailable],
    );

    useEffect(() => {
        void load(false);
    }, [load]);

    useEffect(() => {
        if (!busy) return;
        const onFocus = () => {
            invalidatePluginsCache();
            void load(true);
        };
        window.addEventListener("focus", onFocus);
        const id = window.setInterval(() => {
            void load(true);
        }, 2500);
        const stop = window.setTimeout(() => {
            setBusy(null);
            window.clearInterval(id);
        }, 90_000);
        return () => {
            window.removeEventListener("focus", onFocus);
            window.clearInterval(id);
            window.clearTimeout(stop);
        };
    }, [busy, load]);

    const categories = useMemo(() => {
        const present = new Set(plugins.map((p) => p.category).filter(Boolean));
        const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
        const extra = [...present].filter((c) => !CATEGORY_ORDER.includes(c as (typeof CATEGORY_ORDER)[number])).sort();
        return [...ordered, ...extra];
    }, [plugins]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return plugins.filter((p) => {
            if (category !== "all" && p.category !== category) return false;
            if (!q) return true;
            return (
                p.name.toLowerCase().includes(q)
                || p.description.toLowerCase().includes(q)
                || p.category.toLowerCase().includes(q)
            );
        });
    }, [plugins, query, category]);

    const browsing = category === "all" && !query.trim();
    const connected = useMemo(() => plugins.filter((p) => p.connected), [plugins]);
    const popular = useMemo(() => pickByToolkit(plugins, POPULAR_TOOLKITS), [plugins]);
    const ship = useMemo(() => pickByToolkit(plugins, SHIP_TOOLKITS), [plugins]);
    const collab = useMemo(() => pickByToolkit(plugins, COLLAB_TOOLKITS), [plugins]);

    const openPlugin = openToolkit ? plugins.find((p) => p.toolkit === openToolkit) : undefined;
    const categoryLabel = category === "all" ? "All" : category;

    async function connect(plugin: PluginRow) {
        setBusy(plugin.toolkit);
        try {
            const { redirectUrl } = await startPluginConnect(plugin.toolkit);
            await commands.openUrlExternal(redirectUrl);
            notify.info(`Finish connecting ${plugin.name} in the browser.`);
        } catch (err) {
            setBusy(null);
            const message = err instanceof ShapeApiError ? err.message : "Could not start connect.";
            notify.error(message);
        }
    }

    async function disconnect(plugin: PluginRow) {
        setBusy(plugin.toolkit);
        try {
            await disconnectPlugin(plugin.toolkit);
            notify.success(`${plugin.name} disconnected.`);
            await load(true);
        } catch (err) {
            const message = err instanceof ShapeApiError ? err.message : "Could not disconnect.";
            notify.error(message);
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-8 pb-8 lg:px-8">
                {openPlugin ? (
                    <PluginDetail
                        plugin={openPlugin}
                        busy={busy === openPlugin.toolkit}
                        onBack={() => setOpenToolkit(null)}
                        onConnect={() => void connect(openPlugin)}
                        onDisconnect={() => void disconnect(openPlugin)}
                    />
                ) : (
                    <div className="mx-auto w-full max-w-5xl">
                        <h1 className="text-2xl font-medium text-text-primary">Plugins</h1>
                        <p className="mt-1 text-sm text-text-muted">
                            Connect apps so the agent can use them. Each plugin has its own approval mode.
                        </p>
                        <div className="mt-4 flex items-center gap-2">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        type="button"
                                        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-border-subtle bg-input-bg px-3 text-sm text-text-primary"
                                    >
                                        {categoryLabel}
                                        <Icon icon={RiArrowDownSLine} className="text-text-muted" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="min-w-40">
                                    <DropdownMenuRadioGroup value={category} onValueChange={setCategory}>
                                        <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
                                        {categories.map((c) => (
                                            <DropdownMenuRadioItem key={c} value={c}>
                                                {c}
                                            </DropdownMenuRadioItem>
                                        ))}
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <SearchInput
                                placeholder="Search plugins"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="min-w-0 flex-1"
                            />
                        </div>

                        <div className="mt-6 space-y-8">
                            {!pluginsAvailable ? (
                                <div className="rounded-xl border border-border-subtle bg-surface-2 px-4 py-10 text-center text-sm text-text-muted">
                                    {auth.loggedIn
                                        ? "Connect to Shape to manage cloud plugins. Local MCP servers still work under MCP."
                                        : "Sign in to Shape to connect plugins. Local MCP servers still work under MCP."}
                                </div>
                            ) : !configured ? (
                                <div className="rounded-xl border border-border-subtle bg-surface-2 px-4 py-10 text-center text-sm text-text-muted">
                                    Plugins are not configured on the server.
                                </div>
                            ) : loading && plugins.length === 0 ? (
                                <PluginsCatalogSkeleton />
                            ) : filtered.length === 0 ? (
                                <div className="rounded-xl border border-border-subtle bg-surface-2 px-4 py-10 text-center text-sm text-text-muted">
                                    No plugins match
                                </div>
                            ) : (
                                <>
                                    {browsing ? (
                                        <>
                                            <ConnectedList
                                                plugins={connected}
                                                onOpen={(p) => setOpenToolkit(p.toolkit)}
                                            />
                                            <PluginCarousel
                                                title="Popular"
                                                plugins={popular}
                                                onOpen={(p) => setOpenToolkit(p.toolkit)}
                                            />
                                            <PluginCarousel
                                                title="Ship code"
                                                plugins={ship}
                                                onOpen={(p) => setOpenToolkit(p.toolkit)}
                                            />
                                            <PluginCarousel
                                                title="Stay in the loop"
                                                plugins={collab}
                                                onOpen={(p) => setOpenToolkit(p.toolkit)}
                                            />
                                        </>
                                    ) : null}
                                    <section className="space-y-3">
                                        <h2 className="text-sm font-medium text-text-muted">
                                            {browsing ? "All plugins" : categoryLabel}
                                        </h2>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                            {filtered.map((plugin) => (
                                                <PluginCard
                                                    key={plugin.id}
                                                    plugin={plugin}
                                                    onOpen={() => setOpenToolkit(plugin.toolkit)}
                                                />
                                            ))}
                                        </div>
                                    </section>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
