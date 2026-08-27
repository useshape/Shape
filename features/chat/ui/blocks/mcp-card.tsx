"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { commands } from "@/lib/backend";
import { loadMcpServersFromFile, saveMcpServers } from "@/lib/mcp-config";
import { initMcpOAuthListener } from "@/lib/mcp-install";
import { catalogToServerConfig, findCatalogEntry, McpLogo, MCP_CATALOG } from "@/features/settings/ui/mcp/catalog";
import { ActionPhrase } from "./chat-card";
import { ServiceChip } from "./service-chip";

export function McpCallCard({
    serverId,
    serverName,
    title,
    content,
}: {
    serverId?: string;
    serverName?: string;
    title: string;
    content?: string;
}) {
    const expandable = Boolean(content?.trim());
    return (
        <ServiceChip
            leading={
                <McpLogo
                    server={{ id: serverId, name: serverName }}
                    size={16}
                    className="rounded-md"
                />
            }
            title={title}
            expandable={expandable}
        >
            <pre className="max-h-56 overflow-auto text-xs leading-relaxed text-text-muted whitespace-pre-wrap break-all custom-scrollbar">
                {content}
            </pre>
        </ServiceChip>
    );
}

export function McpAuthCard({
    serverId,
    serverName,
}: {
    serverId?: string;
    serverName?: string;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const label = serverName || findCatalogEntry({ id: serverId })?.name || "this service";

    React.useEffect(() => {
        let unlisten: (() => void) | undefined;
        void initMcpOAuthListener(() => {
            setBusy(false);
            setError(null);
        }).then((fn) => {
            unlisten = fn;
        });
        return () => {
            unlisten?.();
        };
    }, []);

    const connect = async () => {
        if (!serverId) return;
        setBusy(true);
        setError(null);
        try {
            const entry = MCP_CATALOG.find((e) => e.id === serverId) ?? findCatalogEntry({ id: serverId });
            const list = await loadMcpServersFromFile();
            if (!list.some((s) => s.id === serverId) && entry) {
                const next = [...list, catalogToServerConfig(entry)];
                await saveMcpServers(next);
                await commands.syncMcpServers(next);
            }
            await commands.mcpStartOAuth(serverId);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setBusy(false);
        }
    };

    return (
        <div className="my-1 flex w-max max-w-full flex-col items-start gap-1">
            <div className="inline-flex max-w-full items-center gap-2 rounded-lg bg-surface-3 px-2 py-1">
                <McpLogo
                    server={{ id: serverId, name: serverName }}
                    size={16}
                    className="shrink-0 rounded-md"
                />
                <span className="min-w-0 truncate text-sm">
                    <ActionPhrase verb="Connect" detail={label} />
                </span>
                <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={busy || !serverId}
                    onClick={() => void connect()}
                >
                    {busy ? "Connecting…" : "Sign in"}
                </Button>
            </div>
            {error ? <p className="text-xs text-error">{error}</p> : null}
        </div>
    );
}
