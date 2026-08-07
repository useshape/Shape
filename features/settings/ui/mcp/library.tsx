"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SearchInput } from "@/components/ui/search";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { commands } from "@/lib/backend";
import type { McpStatusEntry } from "@/lib/backend/types";
import type { McpServerConfig } from "@/lib/settings";
import { loadMcpServersFromFile, saveMcpServers, openMcpConfig } from "@/lib/mcp-config";
import { SettingSection } from "../setting-controls";
import {
    MCP_CATALOG,
    MCP_CATEGORIES,
    McpLogo,
    type McpCatalogEntry,
    type McpCategory,
} from "./catalog";

type BusyKind = "adding" | "removing" | "connecting";

function statusLabel(status?: McpStatusEntry["status"]): string {
    switch (status) {
        case "connected":
            return "Connected";
        case "needs_auth":
            return "Sign in required";
        case "error":
            return "Error";
        case "disabled":
            return "Disabled";
        default:
            return "Installed";
    }
}

function ServerRow({
    name,
    description,
    logo,
    trailing,
}: {
    name: string;
    description: string;
    logo: React.ReactNode;
    trailing: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-3 px-3.5 py-2.5">
            {logo}
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-text-primary truncate">{name}</div>
                <p className="text-sm text-text-muted mt-0.5 truncate" title={description}>
                    {description}
                </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">{trailing}</div>
        </div>
    );
}

/**
 * Settings sub-view: manage installed MCP servers and browse the catalog.
 */
export function McpLibraryView({ onBack }: { onBack: () => void }) {
    const [query, setQuery] = React.useState("");
    const [categoryFilter, setCategoryFilter] = React.useState<"All" | McpCategory>("All");
    const [servers, setServers] = React.useState<McpServerConfig[]>([]);
    const [statuses, setStatuses] = React.useState<McpStatusEntry[]>([]);
    const [busy, setBusy] = React.useState<Record<string, BusyKind>>({});

    const refresh = React.useCallback(async () => {
        try {
            const list = await loadMcpServersFromFile();
            setServers(list);
            const status = await commands.syncMcpServers(list);
            setStatuses(status as McpStatusEntry[]);
        } catch {
            /* empty */
        }
    }, []);

    React.useEffect(() => {
        void refresh();
    }, [refresh]);

    React.useEffect(() => {
        let unlisten: (() => void) | undefined;
        void import("@/lib/mcp-install").then(({ initMcpOAuthListener }) => {
            void initMcpOAuthListener(async () => {
                setBusy({});
                await refresh();
            }).then((fn) => {
                unlisten = fn;
            });
        });
        return () => unlisten?.();
    }, [refresh]);

    const statusFor = (id: string) => statuses.find((s) => s.id === id);

    const persist = async (next: McpServerConfig[]) => {
        await saveMcpServers(next);
        setServers(next);
        const status = (await commands.syncMcpServers(next)) as McpStatusEntry[];
        setStatuses(status);
        return status;
    };

    const handleAdd = async (entry: McpCatalogEntry) => {
        setBusy((b) => ({ ...b, [entry.id]: "adding" }));
        try {
            const existing = await loadMcpServersFromFile();
            const next = existing.filter((s) => s.id !== entry.id);
            next.push({
                id: entry.id,
                name: entry.name,
                enabled: true,
                ...entry.config,
            });
            const status = await persist(next);
            const added = status.find((s) => s.id === entry.id);
            if (added?.status === "needs_auth") {
                setBusy((b) => ({ ...b, [entry.id]: "connecting" }));
                await commands.mcpStartOAuth(entry.id);
                return;
            }
        } catch {
            /* leave as Add */
        }
        setBusy((b) => {
            const next = { ...b };
            delete next[entry.id];
            return next;
        });
    };

    const handleRemove = async (id: string) => {
        setBusy((b) => ({ ...b, [id]: "removing" }));
        try {
            const existing = await loadMcpServersFromFile();
            await persist(existing.filter((s) => s.id !== id));
        } catch {
            /* keep installed */
        }
        setBusy((b) => {
            const next = { ...b };
            delete next[id];
            return next;
        });
    };

    const handleConnect = async (id: string) => {
        setBusy((b) => ({ ...b, [id]: "connecting" }));
        try {
            await commands.mcpStartOAuth(id);
        } catch {
            setBusy((b) => {
                const next = { ...b };
                delete next[id];
                return next;
            });
        }
    };

    const q = query.trim().toLowerCase();
    const installedIds = new Set(servers.map((s) => s.id));

    const installedRows = servers
        .map((server) => {
            const entry = MCP_CATALOG.find((e) => e.id === server.id);
            return { server, entry, status: statusFor(server.id) };
        })
        .filter(({ server, entry }) => {
            if (!q) return true;
            const name = (entry?.name ?? server.name).toLowerCase();
            const desc = (entry?.description ?? "").toLowerCase();
            return name.includes(q) || desc.includes(q) || server.id.toLowerCase().includes(q);
        });

    const available = MCP_CATALOG.filter((e) => {
        if (installedIds.has(e.id)) return false;
        if (categoryFilter !== "All" && e.category !== categoryFilter) return false;
        if (!q) return true;
        return (
            e.name.toLowerCase().includes(q)
            || e.description.toLowerCase().includes(q)
            || e.id.includes(q)
        );
    });

    const availableByCategory = MCP_CATEGORIES.map((category) => ({
        category,
        items: available.filter((e) => e.category === category),
    })).filter((g) => g.items.length > 0);

    return (
        <div className="flex h-full w-full min-w-0 flex-col overflow-hidden select-none">
            <div className="px-6 pt-5 pb-4 space-y-4">
                <button
                    type="button"
                    onClick={onBack}
                    className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors"
                >
                    <Icon name="chevron_left" size={16} className="shrink-0" />
                    Settings
                </button>

                <div>
                    <h1 className="text-lg font-medium text-text-primary">MCP Library</h1>
                    <p className="text-sm text-text-muted mt-1">
                        Add tools for the agent, or remove ones you no longer need.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex h-9 flex-1 items-center rounded-lg border border-border bg-panel px-3">
                        <SearchInput
                            placeholder="Search servers…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="flex-1"
                        />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="shrink-0 gap-1 text-text-muted">
                                    {categoryFilter}
                                    <Icon name="expand_more" size={14} className="text-text-muted" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-40">
                                {(["All", ...MCP_CATEGORIES] as const).map((c) => (
                                    <DropdownMenuCheckboxItem
                                        key={c}
                                        checked={categoryFilter === c}
                                        onCheckedChange={() => setCategoryFilter(c)}
                                    >
                                        {c}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => void openMcpConfig()}>
                        Edit mcp.json
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-10">
                <SettingSection
                    title="Installed"
                    description={
                        installedRows.length === 0
                            ? "Nothing installed yet. Add a server from the catalog below."
                            : undefined
                    }
                >
                    {installedRows.length === 0 ? (
                        <div className="px-3.5 py-6 text-center text-sm text-text-muted">
                            No MCP servers installed
                        </div>
                    ) : (
                        installedRows.map(({ server, entry, status }) => {
                            const id = server.id;
                            const name = entry?.name ?? server.name;
                            const description =
                                status?.status === "error" && status.error
                                    ? status.error
                                    : entry?.description ?? statusLabel(status?.status);
                            const busyKind = busy[id];

                            return (
                                <ServerRow
                                    key={id}
                                    name={name}
                                    description={description}
                                    logo={<McpLogo entry={entry} server={server} size={30} />}
                                    trailing={
                                        busyKind ? (
                                            <span className="text-xs text-text-muted">
                                                {busyKind === "removing"
                                                    ? "Removing…"
                                                    : busyKind === "connecting"
                                                      ? "Connecting…"
                                                      : "Working…"}
                                            </span>
                                        ) : (
                                            <>
                                                {status?.status === "needs_auth" ? (
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => void handleConnect(id)}
                                                    >
                                                        Connect
                                                    </Button>
                                                ) : (
                                                    <span
                                                        className={
                                                            status?.status === "error"
                                                                ? "text-xs text-error"
                                                                : status?.status === "connected"
                                                                  ? "text-xs text-success"
                                                                  : "text-xs text-text-muted"
                                                        }
                                                    >
                                                        {statusLabel(status?.status)}
                                                    </span>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => void handleRemove(id)}
                                                >
                                                    Remove
                                                </Button>
                                            </>
                                        )
                                    }
                                />
                            );
                        })
                    )}
                </SettingSection>

                {availableByCategory.map(({ category, items }) => (
                    <SettingSection key={category} title={category}>
                        {items.map((entry) => {
                            const busyKind = busy[entry.id];
                            return (
                                <ServerRow
                                    key={entry.id}
                                    name={entry.name}
                                    description={entry.description}
                                    logo={<McpLogo entry={entry} size={30} />}
                                    trailing={
                                        busyKind === "adding" || busyKind === "connecting" ? (
                                            <span className="text-xs text-text-muted">
                                                {busyKind === "connecting" ? "Connecting…" : "Adding…"}
                                            </span>
                                        ) : (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => void handleAdd(entry)}
                                            >
                                                Add
                                            </Button>
                                        )
                                    }
                                />
                            );
                        })}
                    </SettingSection>
                ))}

                {available.length === 0 && installedRows.length > 0 && q ? (
                    <p className="pt-4 text-center text-sm text-text-muted">No matching servers to add</p>
                ) : null}

                {available.length === 0 && installedRows.length === 0 && q ? (
                    <p className="pt-4 text-center text-sm text-text-muted">No matches</p>
                ) : null}
            </div>
        </div>
    );
}
