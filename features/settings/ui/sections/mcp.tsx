"use client";

import { ArrowLeft20Regular } from "@fluentui/react-icons/headless/svg/arrow-left";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SearchInput } from "@/components/ui/search";
import { Textarea } from "@/components/ui/textarea";
import { commands } from "@/lib/backend";
import type { McpStatusEntry, McpToolInfo } from "@/lib/backend/types";
import { notify } from "@/features/notifications";
import { fetchComposioSkillHint } from "@/lib/mcp/composio-skill";
import { openMcpConfig } from "@/lib/mcp/config";
import { humanizeToolName } from "@/lib/mcp/oauth";
import { parseMcpPaste } from "@/lib/mcp/parse";
import {
    addUiMcpServer,
    listMcpServers,
    removeUiMcpServer,
    syncActiveMcpServers,
    updateUiMcpServer,
    type ListedMcpServer,
} from "@/lib/mcp/registry";
import { useSettings } from "@/lib/settings";
import type { McpServerConfig } from "@/lib/settings";
import { isDarkColorTheme, normalizeColorTheme } from "@/lib/settings/themes";
import { mcpServerBrandCandidates } from "@/lib/plugins/logos";
import { cn } from "@/lib/utils";
import {
    AlertDialog,
    AlertDialogBody,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SettingCard, SettingRow, SettingSection, SettingSwitch, SETTING_CONTROL_BTN } from "../shared/controls";

function statusLabel(status: McpStatusEntry["status"] | undefined): string {
    if (status === "connected") return "Connected";
    if (status === "needs_auth") return "Sign in";
    if (status === "disabled") return "Off";
    if (status === "error") return "Error";
    return "Not connected";
}

function ServerMark({ name, url }: { name: string; url?: string }) {
    const dark = isDarkColorTheme(normalizeColorTheme(useSettings().appearance.colorTheme));
    const [failedAt, setFailedAt] = useState(0);
    const candidates = mcpServerBrandCandidates(name, url, dark);
    const src = candidates[Math.min(failedAt, candidates.length - 1)] ?? "/integrations/logos/mcp.svg";
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt=""
            className="size-9 shrink-0 rounded-lg bg-surface-3 object-contain p-1.5"
            onError={() => setFailedAt((n) => n + 1)}
        />
    );
}

function ServerCard({
    server,
    status,
    onOpen,
}: {
    server: ListedMcpServer;
    status?: McpStatusEntry;
    onOpen: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className="flex h-full w-full items-start gap-3 squircle-2xl bg-surface-4 p-3 text-left transition-colors hover:bg-panel-hover"
        >
            <ServerMark name={server.name} url={server.url} />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <div className="truncate text-md font-medium text-text-primary">{server.name}</div>
                    <span className="shrink-0 rounded-md border border-border bg-panel-hover px-1.5 text-xs">
                        {server.origin === "file" ? "mcp.json" : statusLabel(status?.status)}
                    </span>
                </div>
                <div className="line-clamp-1 text-sm text-text-muted">
                    {server.url || server.command || "Local server"}
                </div>
            </div>
        </button>
    );
}

function AddMcpDialog({
    open,
    onClose,
    onAdded,
}: {
    open: boolean;
    onClose: () => void;
    onAdded: (id: string) => void;
}) {
    const [paste, setPaste] = useState("");
    const [busy, setBusy] = useState(false);
    const parsed = useMemo(() => (paste.trim() ? parseMcpPaste(paste) : { servers: [] as McpServerConfig[] }), [paste]);
    const preview = parsed.servers[0];

    useEffect(() => {
        if (!open) {
            setPaste("");
            setBusy(false);
        }
    }, [open]);

    async function connect() {
        if (!preview || parsed.error) {
            notify.error(parsed.error || "Paste a server URL or JSON config.");
            return;
        }
        if (parsed.servers.length > 1) {
            notify.error("Paste one server. Put the rest in mcp.json.");
            return;
        }
        setBusy(true);
        try {
            await addUiMcpServer(preview);
            try {
                if (preview.auth === "oauth" && preview.url) {
                    await commands.mcpStartOAuth(preview.id);
                }
                notify.success(`${preview.name} added.`);
            } catch (err) {
                notify.error(err instanceof Error ? err.message : "Saved, but sign-in did not finish.");
            }
            onAdded(preview.id);
        } catch (err) {
            notify.error(err instanceof Error ? err.message : "Could not add that server.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
            <AlertDialogContent sizeClassName="max-w-[520px]">
                <AlertDialogHeader>
                    <AlertDialogTitle>Add MCP server</AlertDialogTitle>
                    <AlertDialogDescription>
                        Paste a server URL or a JSON config. This stays in Shape and is not written to mcp.json.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogBody>
                    <Textarea
                        value={paste}
                        onChange={(event) => setPaste(event.target.value)}
                        placeholder={'https://example.com/mcp\n\nor\n\n{ "url": "https://example.com/mcp" }'}
                        className="min-h-32 font-mono text-sm"
                    />
                    {parsed.error && paste.trim() ? (
                        <p className="text-sm text-error">{parsed.error}</p>
                    ) : null}
                    {preview && !parsed.error ? (
                        <div className="flex items-start gap-3 squircle-2xl bg-surface-3 p-3">
                            <ServerMark name={preview.name} url={preview.url} />
                            <div className="min-w-0">
                                <div className="text-md font-medium text-text-primary">{preview.name}</div>
                                <div className="mt-1 text-sm text-text-muted">
                                    {preview.transport === "http" ? preview.url : `${preview.command} ${preview.args.join(" ")}`.trim()}
                                </div>
                                <div className="mt-1 text-sm text-text-muted">
                                    {preview.auth === "oauth" ? "Signs in with the server’s OAuth flow" : "No sign-in"}
                                </div>
                            </div>
                        </div>
                    ) : null}
                </AlertDialogBody>
                <AlertDialogFooter>
                    <AlertDialogCancel asChild>
                        <Button type="button" variant="ghost" size="sm" className={SETTING_CONTROL_BTN} disabled={busy}>
                            Cancel
                        </Button>
                    </AlertDialogCancel>
                    <Button
                        type="button"
                        size="sm"
                        disabled={busy || !preview || Boolean(parsed.error)}
                        onClick={() => void connect()}
                    >
                        {busy ? "Connecting…" : "Connect"}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function ServerDetail({
    server,
    status,
    busy,
    onBack,
    onChanged,
}: {
    server: ListedMcpServer;
    status?: McpStatusEntry;
    busy: boolean;
    onBack: () => void;
    onChanged: () => void;
}) {
    const [tools, setTools] = useState<McpToolInfo[]>([]);
    const [guidance, setGuidance] = useState("");
    const [working, setWorking] = useState(false);

    const loadTools = useCallback(async () => {
        try {
            const all = await commands.getMcpTools();
            setTools(all.filter((tool) => tool.serverId === server.id));
        } catch {
            setTools([]);
        }
    }, [server.id]);

    useEffect(() => {
        void loadTools();
        let cancelled = false;
        void fetchComposioSkillHint(server.name).then((body) => {
            if (!cancelled && body) setGuidance(body);
        });
        return () => {
            cancelled = true;
        };
    }, [server.id, server.name, status?.status, loadTools]);

    async function signIn() {
        setWorking(true);
        try {
            await commands.mcpStartOAuth(server.id);
            notify.success(`${server.name} connected.`);
            onChanged();
            await loadTools();
        } catch (err) {
            notify.error(err instanceof Error ? err.message : "Sign-in failed. Try again.");
            onChanged();
        } finally {
            setWorking(false);
        }
    }

    async function reconnect() {
        setWorking(true);
        try {
            await commands.restartMcpServer(server.id);
            onChanged();
            await loadTools();
        } catch (err) {
            notify.error(err instanceof Error ? err.message : "Could not reconnect.");
        } finally {
            setWorking(false);
        }
    }

    async function remove() {
        try {
            await removeUiMcpServer(server.id);
            notify.success(`${server.name} removed.`);
            onBack();
        } catch (err) {
            notify.error(err instanceof Error ? err.message : "Could not remove that server.");
        }
    }

    function setToolEnabled(name: string, enabled: boolean) {
        const current = server.disabledTools ?? [];
        const disabledTools = enabled ? current.filter((tool) => tool !== name) : [...new Set([...current, name])];
        updateUiMcpServer(server.id, { disabledTools });
        void syncActiveMcpServers().then(() => onChanged());
    }

    const disabled = new Set(server.disabledTools ?? []);

    return (
        <div className="mx-auto w-full max-w-5xl">
            <Button type="button" onClick={onBack} variant="ghost" size="sm" className={cn(SETTING_CONTROL_BTN, "mb-10 w-auto")}>
                <Icon icon={ArrowLeft20Regular} />
                Back
            </Button>
            <div className="flex items-start gap-4">
                <ServerMark name={server.name} url={server.url} />
                <div className="min-w-0 flex-1">
                    <h1 className="text-2xl font-medium text-text-primary">{server.name}</h1>
                    <p className="mt-1 text-sm text-text-muted">
                        {server.url || server.command || "Local server"}
                    </p>
                    {status?.error ? <p className="mt-2 text-sm text-error">{status.error}</p> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                    {status?.status === "needs_auth" ? (
                        <Button size="sm" disabled={busy || working} onClick={() => void signIn()}>
                            {working ? "Waiting for the browser…" : "Sign in"}
                        </Button>
                    ) : (
                        <Button variant="ghost" size="sm" className={SETTING_CONTROL_BTN} disabled={busy || working} onClick={() => void reconnect()}>
                            {working ? "Reconnecting…" : "Reconnect"}
                        </Button>
                    )}
                    {server.origin === "ui" ? (
                        <Button variant="ghost" size="sm" className={SETTING_CONTROL_BTN} disabled={busy || working} onClick={() => void remove()}>
                            Remove
                        </Button>
                    ) : (
                        <Button variant="ghost" size="sm" className={SETTING_CONTROL_BTN} onClick={() => void openMcpConfig()}>
                            Edit mcp.json
                        </Button>
                    )}
                </div>
            </div>

            <div className="mt-8">
                {guidance ? (
                    <SettingSection title="Guidance">
                        <p className="px-3.5 py-3 text-sm text-text-muted">{guidance}</p>
                    </SettingSection>
                ) : null}
                <SettingSection title="Tools">
                    <SettingCard>
                        {tools.length === 0 ? (
                            <div className="px-3.5 py-6 text-center text-sm text-text-muted">
                                {status?.status === "needs_auth"
                                    ? "Sign in to load this server’s tools."
                                    : status?.status === "connected"
                                      ? "This server did not publish tools."
                                      : "Connect the server to load its tools."}
                            </div>
                        ) : (
                            tools.map((tool) => (
                                <SettingRow
                                    key={tool.qualifiedName}
                                    title={humanizeToolName(tool.name)}
                                    description={tool.description}
                                >
                                    {server.origin === "ui" ? (
                                        <SettingSwitch
                                            checked={!disabled.has(tool.name)}
                                            onChange={(on) => setToolEnabled(tool.name, on)}
                                        />
                                    ) : (
                                        <span className="text-xs text-text-muted">On</span>
                                    )}
                                </SettingRow>
                            ))
                        )}
                    </SettingCard>
                </SettingSection>
            </div>
        </div>
    );
}

export function McpSettingsView() {
    const [servers, setServers] = useState<ListedMcpServer[]>([]);
    const [statuses, setStatuses] = useState<McpStatusEntry[]>([]);
    const [query, setQuery] = useState("");
    const [openId, setOpenId] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const listed = await listMcpServers();
            setServers(listed);
            const next = await syncActiveMcpServers();
            setStatuses(next);
        } catch (err) {
            notify.error(err instanceof Error ? err.message : "Could not load MCP servers.");
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return servers;
        return servers.filter((server) =>
            server.name.toLowerCase().includes(q)
            || (server.url ?? "").toLowerCase().includes(q)
            || server.command.toLowerCase().includes(q),
        );
    }, [servers, query]);

    const statusFor = (id: string) => statuses.find((status) => status.id === id);
    const open = openId ? servers.find((server) => server.id === openId) : undefined;

    return (
        <div className="relative h-full min-h-0 bg-panel">
            <div className="absolute inset-0 overflow-y-auto px-6 pt-8 pb-8">
                {open ? (
                    <ServerDetail
                        server={open}
                        status={statusFor(open.id)}
                        busy={busy}
                        onBack={() => setOpenId(null)}
                        onChanged={() => {
                            setBusy(false);
                            void refresh();
                        }}
                    />
                ) : (
                    <div className="mx-auto w-full max-w-5xl">
                        <div className="flex items-center justify-between gap-3">
                            <h1 className="text-2xl font-medium text-text-primary">MCP</h1>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" className={SETTING_CONTROL_BTN} onClick={() => void openMcpConfig()}>
                                    Open mcp.json
                                </Button>
                                <Button size="sm" onClick={() => setAdding(true)}>
                                    Add server
                                </Button>
                            </div>
                        </div>
                        <div className="mt-4">
                            <SearchInput
                                placeholder="Search servers"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                className="min-w-0 flex-1"
                            />
                        </div>
                        <div className="mt-6">
                            {filtered.length === 0 ? (
                                <div className="squircle-2xl bg-surface-2 px-4 py-10 text-center text-sm text-text-muted">
                                    {servers.length === 0
                                        ? "No MCP servers yet. Add one here, or put a server in mcp.json."
                                        : "No servers match"}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                    {filtered.map((server) => (
                                        <ServerCard
                                            key={`${server.origin}-${server.id}`}
                                            server={server}
                                            status={statusFor(server.id)}
                                            onOpen={() => {
                                                setBusy(false);
                                                setOpenId(server.id);
                                            }}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            <AddMcpDialog
                open={adding}
                onClose={() => setAdding(false)}
                onAdded={(id) => {
                    setAdding(false);
                    setOpenId(id);
                    void refresh();
                }}
            />
        </div>
    );
}
