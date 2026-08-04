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
import {
    MCP_CATALOG,
    MCP_CATEGORIES,
    McpLogo,
    type McpCatalogEntry,
    type McpCategory,
} from "./catalog";

type EntryState = {
    installed: boolean;
    status?: McpStatusEntry["status"];
    busy?: "adding" | "connecting";
};

const SECTION_PREVIEW = 6;

function CatalogRow({
    entry,
    state,
    onAdd,
    onConnect,
}: {
    entry: McpCatalogEntry;
    state: EntryState;
    onAdd: () => void;
    onConnect: () => void;
}) {
    return (
        <div className="flex items-center gap-3 min-w-0 py-2">
            <McpLogo entry={entry} size={32} />
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-text-primary truncate">{entry.name}</div>
                <p className="text-xs text-text-muted truncate">{entry.description}</p>
            </div>
            {state.busy ? (
                <span className="text-xs text-text-muted shrink-0">
                    {state.busy === "adding" ? "Adding…" : "Connecting…"}
                </span>
            ) : !state.installed ? (
                <Button variant="outline" size="sm" onClick={onAdd}>
                    Add
                </Button>
            ) : state.status === "needs_auth" ? (
                <Button variant="outline" size="sm" onClick={onConnect}>
                    Connect
                </Button>
            ) : (
                <span
                    className={
                        state.status === "error" ? "text-xs text-error shrink-0" : "text-xs text-success shrink-0"
                    }
                >
                    {state.status === "error" ? "Error" : "Added"}
                </span>
            )}
        </div>
    );
}

function DiscoverCard({
    entry,
    state,
    onAdd,
    onConnect,
}: {
    entry: McpCatalogEntry;
    state: EntryState;
    onAdd: () => void;
    onConnect: () => void;
}) {
    return (
        <div className="flex min-w-60 max-w-70 shrink-0 items-start gap-3 rounded-xl border border-border bg-panel p-3.5">
            <McpLogo entry={entry} size={40} />
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-text-primary truncate">{entry.name}</div>
                <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{entry.description}</p>
                <div className="mt-2.5">
                    {state.busy ? (
                        <span className="text-xs text-text-muted">
                            {state.busy === "adding" ? "Adding…" : "Connecting…"}
                        </span>
                    ) : !state.installed ? (
                        <Button variant="outline" size="sm" onClick={onAdd}>
                            Add
                        </Button>
                    ) : state.status === "needs_auth" ? (
                        <Button variant="outline" size="sm" onClick={onConnect}>
                            Connect
                        </Button>
                    ) : (
                        <span className={state.status === "error" ? "text-xs text-error" : "text-xs text-success"}>
                            {state.status === "error" ? "Error" : "Added"}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Settings sub-view: browse curated MCP servers (Discover + categories).
 * OAuth is started automatically when a server needs sign-in.
 */
export function McpLibraryView({ onBack }: { onBack: () => void }) {
    const [query, setQuery] = React.useState("");
    const [categoryFilter, setCategoryFilter] = React.useState<"All" | McpCategory>("All");
    const [servers, setServers] = React.useState<McpServerConfig[]>([]);
    const [statuses, setStatuses] = React.useState<McpStatusEntry[]>([]);
    const [busy, setBusy] = React.useState<Record<string, EntryState["busy"]>>({});
    const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

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

    const stateFor = React.useCallback(
        (entry: McpCatalogEntry): EntryState => {
            const installed = servers.some((s) => s.id === entry.id);
            const status = statuses.find((s) => s.id === entry.id)?.status;
            return { installed, status, busy: busy[entry.id] };
        },
        [servers, statuses, busy],
    );

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
            await saveMcpServers(next);
            setServers(next);
            const status = (await commands.syncMcpServers(next)) as McpStatusEntry[];
            setStatuses(status);

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

    const handleConnect = async (entry: McpCatalogEntry) => {
        setBusy((b) => ({ ...b, [entry.id]: "connecting" }));
        try {
            await commands.mcpStartOAuth(entry.id);
        } catch {
            setBusy((b) => {
                const next = { ...b };
                delete next[entry.id];
                return next;
            });
        }
    };

    const q = query.trim().toLowerCase();
    const filtered = MCP_CATALOG.filter((e) => {
        if (categoryFilter !== "All" && e.category !== categoryFilter) return false;
        if (!q) return true;
        return (
            e.name.toLowerCase().includes(q)
            || e.description.toLowerCase().includes(q)
            || e.id.includes(q)
        );
    });

    const discover = filtered.filter((e) => e.discover);
    const searching = q.length > 0 || categoryFilter !== "All";

    return (
        <div className="flex h-full w-full min-w-0 flex-col overflow-hidden select-none">
            <div className="px-6 pt-5 pb-3 space-y-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors"
                >
                    <Icon name="chevron_left" size={16} className="shrink-0" />
                    Settings
                </button>

                <div className="flex items-center gap-2">
                    <div className="flex h-9 flex-1 items-center rounded-lg border border-border bg-panel px-3">
                        <SearchInput
                            placeholder="Search MCPs…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="flex-1"
                        />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="shrink-0 gap-1 text-text-muted">
                                    {categoryFilter}
                                    <Icon name="expand_more" size={14} className="opacity-60" />
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
                        Manage
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-8 space-y-7">
                {!searching && discover.length > 0 ? (
                    <section>
                        <h2 className="text-sm font-medium text-text-primary mb-3">Discover</h2>
                        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                            {discover.map((entry) => (
                                <DiscoverCard
                                    key={entry.id}
                                    entry={entry}
                                    state={stateFor(entry)}
                                    onAdd={() => void handleAdd(entry)}
                                    onConnect={() => void handleConnect(entry)}
                                />
                            ))}
                        </div>
                    </section>
                ) : null}

                {MCP_CATEGORIES.map((category) => {
                    const items = filtered.filter((e) => e.category === category);
                    if (items.length === 0) return null;
                    const isOpen = expanded[category] || searching;
                    const visible = isOpen ? items : items.slice(0, SECTION_PREVIEW);
                    const remaining = items.length - visible.length;

                    return (
                        <section key={category}>
                            <h2 className="text-sm font-medium text-text-primary mb-1">{category}</h2>
                            <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
                                {visible.map((entry) => (
                                    <CatalogRow
                                        key={entry.id}
                                        entry={entry}
                                        state={stateFor(entry)}
                                        onAdd={() => void handleAdd(entry)}
                                        onConnect={() => void handleConnect(entry)}
                                    />
                                ))}
                            </div>
                            {remaining > 0 ? (
                                <button
                                    type="button"
                                    className="mt-1 text-sm text-text-muted hover:text-text-primary transition-colors"
                                    onClick={() => setExpanded((e) => ({ ...e, [category]: true }))}
                                >
                                    Show {remaining} more
                                </button>
                            ) : null}
                        </section>
                    );
                })}

                {filtered.length === 0 ? (
                    <p className="pt-8 text-center text-sm text-text-muted">No matches</p>
                ) : null}
            </div>
        </div>
    );
}
