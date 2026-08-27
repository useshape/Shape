"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { commands } from "@/lib/backend";
import type { McpStatusEntry } from "@/lib/backend/types";
import { loadMcpServersFromFile, openMcpConfig, saveMcpServers } from "@/lib/mcp-config";
import { initMcpOAuthListener } from "@/lib/mcp-install";
import {
    MCP_CATALOG,
    McpLogo,
    catalogToServerConfig,
    type McpCatalogEntry,
} from "./mcp/catalog";

function statusOf(list: McpStatusEntry[], id: string) {
    return list.find((s) => s.id === id);
}

function IntegrationCard({
    entry,
    status,
    connecting,
    onConnect,
    onRemove,
}: {
    entry: McpCatalogEntry;
    status?: McpStatusEntry;
    connecting: boolean;
    onConnect: () => void;
    onRemove: () => void;
}) {
    const connected = status?.status === "connected";
    const needsAuth = status?.status === "needs_auth" || (!status && entry.config.auth === "oauth");
    const errored = status?.status === "error";

    return (
        <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-2">
            <div className="flex items-start gap-3">
                <div className="relative shrink-0">
                    <McpLogo entry={entry} size={36} className="rounded-xl" />
                    {connected ? (
                        <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-success text-white ring-2 ring-surface-3">
                            <Icon name="check" size={10} />
                        </span>
                    ) : null}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <h3 className="truncate text-md font-medium text-text-primary">{entry.name}</h3>
                        {connected ? (
                            <Icon name="check_circle" size={16} className="shrink-0 text-accent" />
                        ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-text-muted">
                        {connected
                            ? `${status?.toolCount ?? 0} tools connected`
                            : errored && status?.error
                              ? status.error
                              : entry.description}
                    </p>
                </div>
            </div>
            <div className="mt-auto flex items-center gap-2">
                {connected ? (
                    <Button variant="ghost" size="sm" onClick={onRemove}>
                        Remove
                    </Button>
                ) : (
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-8"
                        disabled={connecting}
                        onClick={onConnect}
                    >
                        {connecting ? "Connecting…" : needsAuth ? "Sign in" : "Connect"}
                    </Button>
                )}
            </div>
        </div>
    );
}

function CustomServerCard({
    status,
    connecting,
    onConnect,
    onRemove,
}: {
    status: McpStatusEntry;
    connecting: boolean;
    onConnect: () => void;
    onRemove: () => void;
}) {
    const connected = status.status === "connected";
    return (
        <div className="flex flex-col gap-3 rounded-2xl bg-surface-3 p-4">
            <div className="flex items-start gap-3">
                <div className="relative shrink-0">
                    <McpLogo server={status} size={36} className="rounded-lg" />
                    {connected ? (
                        <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-success text-white ring-2 ring-surface-3">
                            <Icon name="check" size={10} />
                        </span>
                    ) : null}
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-text-primary">{status.name}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-muted">
                        {connected
                            ? `${status.toolCount} tools connected`
                            : status.status === "needs_auth"
                              ? "Sign in required"
                              : status.status === "error" && status.error
                                ? status.error
                                : "Custom MCP server"}
                    </p>
                </div>
            </div>
            <div className="mt-auto flex items-center gap-2">
                {status.status === "needs_auth" ? (
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-8"
                        disabled={connecting}
                        onClick={onConnect}
                    >
                        {connecting ? "Connecting…" : "Sign in"}
                    </Button>
                ) : null}
                <Button variant="ghost" size="sm" className="h-8" onClick={onRemove}>
                    Remove
                </Button>
            </div>
        </div>
    );
}

/** Full-page Integrations grid (separate from the scrolling settings stack). */
export function IntegrationsSettingsPanel() {
    const [mcpStatus, setMcpStatus] = useState<McpStatusEntry[]>([]);
    const [mcpConnecting, setMcpConnecting] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [tab, setTab] = useState<"connected" | "all">("all");

    const syncMcpFromFile = useCallback(async () => {
        try {
            const servers = await loadMcpServersFromFile();
            const status = await commands.syncMcpServers(servers);
            setMcpStatus(status as McpStatusEntry[]);
        } catch {
            /* ignore */
        }
    }, []);

    useEffect(() => {
        void syncMcpFromFile();
    }, [syncMcpFromFile]);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        void initMcpOAuthListener(async () => {
            setMcpConnecting(null);
            await syncMcpFromFile();
        }).then((fn) => {
            unlisten = fn;
        });
        return () => {
            unlisten?.();
        };
    }, [syncMcpFromFile]);

    const handleConnect = async (id: string) => {
        const entry = MCP_CATALOG.find((e) => e.id === id);
        setMcpConnecting(id);
        try {
            if (entry) {
                const list = await loadMcpServersFromFile();
                if (!list.some((s) => s.id === id)) {
                    const next = [...list, catalogToServerConfig(entry)];
                    await saveMcpServers(next);
                    await commands.syncMcpServers(next);
                }
                if (entry.config.auth === "oauth") {
                    await commands.mcpStartOAuth(id);
                    return;
                }
            } else {
                await commands.mcpStartOAuth(id);
                return;
            }
            setMcpConnecting(null);
            await syncMcpFromFile();
        } catch {
            setMcpConnecting(null);
        }
    };

    const handleRemove = async (serverId: string) => {
        try {
            await commands.mcpClearOAuth(serverId).catch(() => { /* ignore */ });
            const list = await loadMcpServersFromFile();
            const next = list.filter((s) => s.id !== serverId);
            await saveMcpServers(next);
            const status = await commands.syncMcpServers(next);
            setMcpStatus(status as McpStatusEntry[]);
        } catch {
            /* keep list */
        }
    };

    const q = query.trim().toLowerCase();
    const filteredCatalog = useMemo(() => {
        return MCP_CATALOG.filter((e) => {
            if (!q) return true;
            return (
                e.name.toLowerCase().includes(q)
                || e.description.toLowerCase().includes(q)
                || e.category.toLowerCase().includes(q)
                || (e.match ?? []).some((m) => m.toLowerCase().includes(q))
            );
        });
    }, [q]);

    const connectedIds = useMemo(
        () => new Set(mcpStatus.filter((s) => s.status === "connected").map((s) => s.id)),
        [mcpStatus],
    );

    const enabledEntries = filteredCatalog.filter((e) => connectedIds.has(e.id));
    const popularEntries = filteredCatalog.filter((e) => !connectedIds.has(e.id));
    const customServers = mcpStatus.filter((s) => !MCP_CATALOG.some((e) => e.id === s.id));

    const showEnabled = tab === "connected" || tab === "all";
    const showPopular = tab === "all";

    return (
        <div className="mx-auto w-full max-w-5xl space-y-8 p-6 pb-24 lg:p-8">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
                        Integrations
                    </h1>
                    <p className="mt-1 max-w-xl text-sm text-text-muted">
                        Connect the tools Shape can use. Sign in here so the agent does not need to ask in chat.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => void syncMcpFromFile()}>
                        Refresh
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => void openMcpConfig()}>
                        Edit mcp.json
                    </Button>
                </div>
            </header>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-lg bg-surface-3 p-0.5">
                    {(
                        [
                            ["all", "Discover"],
                            ["connected", "Connected"],
                        ] as const
                    ).map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setTab(id)}
                            className={cn(
                                "rounded-md px-3 py-1.5 text-sm transition-colors",
                                tab === id
                                    ? "bg-panel-hover text-text-primary"
                                    : "text-text-muted hover:text-text-primary",
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex h-9 w-full max-w-xs items-center gap-2 rounded-lg border border-border bg-transparent px-3">
                    <Icon name="search" size={14} className="shrink-0 text-text-muted" />
                    <Input
                        placeholder="Search integrations"
                        value={query}
                        className="h-auto! bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
            </div>

            {showEnabled && (enabledEntries.length > 0 || customServers.length > 0) ? (
                <section className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-medium text-text-primary">Connected</h2>
                        <span className="text-xs text-text-muted">
                            {enabledEntries.length + customServers.filter((s) => s.status === "connected").length}
                        </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {enabledEntries.map((entry) => (
                            <IntegrationCard
                                key={entry.id}
                                entry={entry}
                                status={statusOf(mcpStatus, entry.id)}
                                connecting={mcpConnecting === entry.id}
                                onConnect={() => void handleConnect(entry.id)}
                                onRemove={() => void handleRemove(entry.id)}
                            />
                        ))}
                        {customServers.map((s) => (
                            <CustomServerCard
                                key={s.id}
                                status={s}
                                connecting={mcpConnecting === s.id}
                                onConnect={() => void handleConnect(s.id)}
                                onRemove={() => void handleRemove(s.id)}
                            />
                        ))}
                    </div>
                </section>
            ) : null}

            {showPopular ? (
                <section className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-medium text-text-primary">
                            {enabledEntries.length > 0 ? "Available" : "Popular"}
                        </h2>
                        <span className="text-xs text-text-muted">{popularEntries.length}</span>
                    </div>
                    {popularEntries.length === 0 ? (
                        <p className="text-sm text-text-muted">No matching integrations.</p>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {popularEntries.map((entry) => (
                                <IntegrationCard
                                    key={entry.id}
                                    entry={entry}
                                    status={statusOf(mcpStatus, entry.id)}
                                    connecting={mcpConnecting === entry.id}
                                    onConnect={() => void handleConnect(entry.id)}
                                    onRemove={() => void handleRemove(entry.id)}
                                />
                            ))}
                        </div>
                    )}
                </section>
            ) : null}

            {tab === "connected" && enabledEntries.length === 0 && customServers.length === 0 ? (
                <div className="rounded-2xl bg-surface-3 px-6 py-10 text-center">
                    <p className="text-sm text-text-primary">No integrations connected yet</p>
                    <p className="mt-1 text-xs text-text-muted">
                        Browse Discover to sign in to GitHub, Neon, Slack, and more.
                    </p>
                    <Button
                        variant="secondary"
                        size="sm"
                        className="mt-4"
                        onClick={() => setTab("all")}
                    >
                        Browse integrations
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
