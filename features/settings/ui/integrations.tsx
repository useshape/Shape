"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { loadMcpServersFromFile, saveMcpServers } from "@/lib/mcp-config";
import type { McpServerConfig } from "@/lib/settings";
import { commands } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { initMcpOAuthListener } from "@/lib/mcp-install";

export type IntegrationDef = {
    id: string;
    name: string;
    description: string;
    category: string;
    logo: string;
    popular?: boolean;
    custom?: boolean;
    mcp: {
        transport: "http" | "stdio";
        url?: string;
        command?: string;
        args?: string[];
        auth?: "none" | "oauth";
    };
};

type CatalogFile = {
    version: number;
    integrations: IntegrationDef[];
};

type StatusMap = Record<string, { status: string; error?: string; toolCount?: number }>;

async function loadCatalog(): Promise<IntegrationDef[]> {
    try {
        const res = await fetch("/integrations/catalog.json", { cache: "no-store" });
        if (!res.ok) return [];
        const data = (await res.json()) as CatalogFile;
        return data.integrations ?? [];
    } catch {
        return [];
    }
}

function Logo({ src, name, size = 28 }: { src: string; name: string; size?: number }) {
    const [failed, setFailed] = useState(false);
    if (failed || !src) {
        return (
            <div
                className="flex items-center justify-center rounded-lg bg-surface-3 text-xs font-medium text-text-muted"
                style={{ width: size, height: size }}
            >
                {name.slice(0, 2).toUpperCase()}
            </div>
        );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return (
        <img
            src={src}
            alt=""
            width={size}
            height={size}
            className="rounded-lg object-contain"
            onError={() => setFailed(true)}
        />
    );
}

function statusLabel(status: string | undefined, inFile: boolean): string {
    if (!inFile) return "Not connected";
    switch ((status || "").toLowerCase()) {
        case "connected":
            return "Connected";
        case "needs_auth":
        case "needsauth":
            return "Needs sign-in";
        case "error":
            return "Error";
        case "disabled":
            return "Disabled";
        default:
            return "Not connected";
    }
}

function ConnectMcpModal({
    open,
    onClose,
    onConnect,
}: {
    open: boolean;
    onClose: () => void;
    onConnect: (cfg: { url: string; name: string; token?: string }) => void;
}) {
    const [url, setUrl] = useState("");
    const [name, setName] = useState("");
    const [token, setToken] = useState("");

    useEffect(() => {
        if (!open) {
            setUrl("");
            setName("");
            setToken("");
        }
    }, [open]);

    if (!open || typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
                role="dialog"
                aria-modal
                className="w-full max-w-md overflow-hidden rounded-2xl border border-border-subtle bg-surface-3 shadow-lg"
            >
                <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
                    <h2 className="text-base font-semibold text-text-primary">Connect MCP server</h2>
                    <button
                        type="button"
                        aria-label="Close"
                        onClick={onClose}
                        className="rounded-md p-1 text-text-muted hover:bg-panel-hover hover:text-text-primary"
                    >
                        <Icon name="close" size={16} />
                    </button>
                </div>
                <div className="space-y-4 px-5 py-4">
                    <div className="space-y-1.5">
                        <label className="text-xs text-text-muted">Server URL</label>
                        <Input
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://mcp.example.com/mcp"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs text-text-muted">Display name</label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Linear production"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs text-text-muted">Bearer token (optional)</label>
                        <Input
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder="If the server needs a token"
                            type="password"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => {
                            if (!url.trim()) return;
                            onConnect({
                                url: url.trim(),
                                name: name.trim() || "Custom MCP",
                                token: token.trim() || undefined,
                            });
                            onClose();
                        }}
                    >
                        Connect
                    </Button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

function IntegrationDetail({
    item,
    inFile,
    status,
    busy,
    onBack,
    onConnect,
    onDisconnect,
}: {
    item: IntegrationDef;
    inFile: boolean;
    status?: { status: string; error?: string; toolCount?: number };
    busy: boolean;
    onBack: () => void;
    onConnect: () => void;
    onDisconnect: () => void;
}) {
    const connected = status?.status === "connected";
    const label = statusLabel(status?.status, inFile);

    return (
        <div className="mx-auto w-full max-w-3xl space-y-4 p-6 pb-6">
            <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-panel-hover hover:text-text-primary"
            >
                <Icon name="arrow_back" size={16} />
            </button>

            <div className="flex items-center gap-3 pt-2">
                <Logo src={item.logo} name={item.name} size={36} />
                <div>
                    <h1 className="text-2xl font-semibold text-text-primary">{item.name}</h1>
                    <p className="mt-0.5 text-sm text-text-muted">{item.description}</p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <span
                    className={cn(
                        "inline-flex items-center rounded-full px-3 py-1 text-sm",
                        connected
                            ? "bg-accent-text-bg text-accent-text"
                            : "bg-surface-2 text-text-muted",
                    )}
                >
                    {label}
                    {connected && status?.toolCount != null
                        ? ` · ${status.toolCount} tools`
                        : null}
                </span>
                <Button
                    size="sm"
                    variant={inFile ? "secondary" : "default"}
                    disabled={busy}
                    onClick={() => (inFile ? onDisconnect() : onConnect())}
                >
                    {busy ? "Working…" : inFile ? "Disconnect" : "Connect"}
                </Button>
            </div>

            {status?.error ? (
                <p className="rounded-xl border border-border-subtle bg-surface-2 px-3.5 py-3 text-sm text-warning">
                    {status.error}
                </p>
            ) : null}
        </div>
    );
}

export function IntegrationsView() {
    const [catalog, setCatalog] = useState<IntegrationDef[]>([]);
    const [servers, setServers] = useState<McpServerConfig[]>([]);
    const [statuses, setStatuses] = useState<StatusMap>({});
    const [query, setQuery] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [connectOpen, setConnectOpen] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const refreshStatus = useCallback(async () => {
        try {
            const list = await commands.getMcpStatus();
            const map: StatusMap = {};
            for (const s of list) {
                map[s.id] = {
                    status: String(s.status),
                    error: s.error ?? undefined,
                    toolCount: s.toolCount,
                };
            }
            setStatuses(map);
        } catch {
            /* ignore when not in Tauri */
        }
    }, []);

    const refresh = useCallback(async () => {
        const [cat, mcp] = await Promise.all([loadCatalog(), loadMcpServersFromFile()]);
        setCatalog(cat);
        setServers(mcp);
        await refreshStatus();
    }, [refreshStatus]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        void initMcpOAuthListener(async () => {
            notify.success("MCP", "Connected");
            await refresh();
        }).then((u) => {
            unlisten = u;
        });
        return () => unlisten?.();
    }, [refresh]);

    const syncAndMaybeOAuth = useCallback(
        async (next: McpServerConfig[], focusId: string) => {
            setBusyId(focusId);
            try {
                await saveMcpServers(next);
                setServers(next);
                const statusesOut = await commands.syncMcpServers(next);
                const map: StatusMap = {};
                for (const s of statusesOut) {
                    map[s.id] = {
                        status: String(s.status),
                        error: s.error ?? undefined,
                        toolCount: s.toolCount,
                    };
                }
                setStatuses(map);

                const focus = next.find((s) => s.id === focusId);
                const st = map[focusId];
                const needsAuth =
                    focus?.auth === "oauth" &&
                    (!st ||
                        st.status === "needs_auth" ||
                        st.status === "needsauth" ||
                        st.status === "error");

                if (needsAuth && focus?.auth === "oauth") {
                    try {
                        await commands.mcpStartOAuth(focusId);
                        notify.info("MCP", "Complete sign-in in your browser");
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        // Public MCP — switch to auth none and reconnect instead of erroring.
                        if (msg.includes("PUBLIC_NO_AUTH") || msg.includes("did not request authentication")) {
                            const asPublic = next.map((s) =>
                                s.id === focusId ? { ...s, auth: "none" as const } : s,
                            );
                            await saveMcpServers(asPublic);
                            setServers(asPublic);
                            const again = await commands.syncMcpServers(asPublic);
                            const map2: StatusMap = {};
                            for (const s of again) {
                                map2[s.id] = {
                                    status: String(s.status),
                                    error: s.error ?? undefined,
                                    toolCount: s.toolCount,
                                };
                            }
                            setStatuses(map2);
                            const st2 = map2[focusId];
                            if (st2?.status === "connected") {
                                notify.success("MCP", `${focus?.name ?? focusId} connected`);
                            } else if (st2?.error) {
                                notify.error("MCP", st2.error);
                            }
                        } else {
                            notify.error("MCP", msg);
                            setStatuses((prev) => ({
                                ...prev,
                                [focusId]: { status: "error", error: msg },
                            }));
                        }
                    }
                } else if (st?.status === "connected") {
                    notify.success("MCP", `${focus?.name ?? focusId} connected`);
                } else if (st?.error) {
                    notify.error("MCP", st.error);
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                notify.error("MCP", msg);
            } finally {
                setBusyId(null);
            }
        },
        [],
    );

    const enabledIds = useMemo(
        () => new Set(servers.filter((s) => s.enabled).map((s) => s.id)),
        [servers],
    );

    const selected = catalog.find((c) => c.id === selectedId) ?? null;

    const q = query.trim().toLowerCase();
    const filtered = catalog.filter(
        (c) =>
            !q ||
            c.name.toLowerCase().includes(q) ||
            c.description.toLowerCase().includes(q) ||
            c.category.toLowerCase().includes(q),
    );
    const enabled = filtered.filter((c) => enabledIds.has(c.id));
    const popular = filtered.filter((c) => c.popular && !enabledIds.has(c.id) && !c.custom);
    const rest = filtered.filter((c) => !c.popular && !enabledIds.has(c.id) && !c.custom);

    const enableIntegration = async (item: IntegrationDef) => {
        const existing = await loadMcpServersFromFile();
        const next = existing.filter((s) => s.id !== item.id);
        next.push({
            id: item.id,
            name: item.name,
            transport: item.mcp.transport,
            command: item.mcp.command ?? "",
            args: item.mcp.args ?? [],
            env: {},
            url: item.mcp.url,
            auth: item.mcp.auth ?? (item.mcp.url ? "oauth" : "none"),
            enabled: true,
        });
        await syncAndMaybeOAuth(next, item.id);
    };

    const disableIntegration = async (id: string) => {
        setBusyId(id);
        try {
            const existing = await loadMcpServersFromFile();
            const next = existing.filter((s) => s.id !== id);
            await saveMcpServers(next);
            setServers(next);
            try {
                await commands.mcpClearOAuth(id);
            } catch {
                /* ignore */
            }
            await commands.syncMcpServers(next);
            await refreshStatus();
        } catch (e) {
            notify.error("MCP", e instanceof Error ? e.message : String(e));
        } finally {
            setBusyId(null);
        }
    };

    const connectCustom = async (cfg: { url: string; name: string; token?: string }) => {
        const id =
            cfg.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "") || `custom-${Date.now()}`;
        const existing = await loadMcpServersFromFile();
        const next = existing.filter((s) => s.id !== id);
        next.push({
            id,
            name: cfg.name,
            transport: "http",
            command: "",
            args: [],
            env: cfg.token ? { AUTHORIZATION: `Bearer ${cfg.token}` } : {},
            url: cfg.url,
            auth: cfg.token ? "none" : "oauth",
            enabled: true,
        });
        await syncAndMaybeOAuth(next, id);
    };

    const renderCard = (item: IntegrationDef) => {
        const inFile = enabledIds.has(item.id);
        const st = statuses[item.id];
        const connected = st?.status === "connected";
        return (
            <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border-subtle bg-surface-2 px-4 py-3 text-left hover:bg-surface-3"
            >
                <Logo src={item.logo} name={item.name} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text-primary">{item.name}</div>
                    <div className="truncate text-xs text-text-muted">{item.description}</div>
                </div>
                <span
                    className={cn(
                        "shrink-0 text-xs",
                        connected ? "text-accent-text" : "text-text-muted",
                    )}
                >
                    {statusLabel(st?.status, inFile)}
                </span>
            </button>
        );
    };

    if (selected) {
        return (
            <IntegrationDetail
                item={selected}
                inFile={enabledIds.has(selected.id)}
                status={statuses[selected.id]}
                busy={busyId === selected.id}
                onBack={() => setSelectedId(null)}
                onConnect={() => void enableIntegration(selected)}
                onDisconnect={() => void disableIntegration(selected.id)}
            />
        );
    }

    return (
        <div className="mx-auto w-full max-w-5xl space-y-8 p-6 pb-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-text-primary">Integrations</h1>
                    <p className="mt-1 text-sm text-text-muted">
                        Connect tools Shape can use. OAuth when the server supports it.
                    </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setConnectOpen(true)}>
                    <Icon name="add" size={14} />
                    Add
                </Button>
            </div>

            <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-medium text-text-primary">Enabled</h2>
                <div className="relative w-56">
                    <Icon
                        name="search"
                        size={14}
                        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search"
                        className="h-8 pl-8"
                    />
                </div>
            </div>

            <div className="space-y-2">
                {enabled.length === 0 ? (
                    <p className="text-sm text-text-muted">No integrations connected yet.</p>
                ) : (
                    enabled.map(renderCard)
                )}
            </div>

            {popular.length > 0 ? (
                <div className="space-y-3">
                    <h2 className="text-base font-medium text-text-primary">Popular</h2>
                    <div className="grid gap-2 sm:grid-cols-2">{popular.map(renderCard)}</div>
                </div>
            ) : null}

            {rest.length > 0 ? (
                <div className="space-y-3">
                    <h2 className="text-base font-medium text-text-primary">More</h2>
                    <div className="grid gap-2 sm:grid-cols-2">{rest.map(renderCard)}</div>
                </div>
            ) : null}

            <ConnectMcpModal
                open={connectOpen}
                onClose={() => setConnectOpen(false)}
                onConnect={(cfg) => void connectCustom(cfg)}
            />
        </div>
    );
}
