"use client";

import { useState } from "react";
import { PluginLogo } from "@/components/ui/plugin-logo";
import { commands } from "@/lib/backend/commands";
import { useShapeAuth } from "@/lib/cloud/store";
import { startPluginConnect } from "@/lib/plugins/api";
import { ComposioHandoff } from "@/features/settings/ui/sections/composio-handoff";

export function PluginConnectCard({
    toolkit,
    name,
    logo,
    botName = "Shape",
}: {
    toolkit: string;
    name?: string;
    logo?: string | null;
    botName?: string;
}) {
    const label = name?.trim() || toolkit.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const [busy, setBusy] = useState(false);
    const [url, setUrl] = useState<string | null>(null);
    const auth = useShapeAuth();

    return (
        <div
            data-plugin-connect=""
            className="flex w-full max-w-[25rem] items-center gap-3 squircle-2xl border border-border bg-transparent px-3 py-2.5"
        >
            <PluginLogo toolkit={toolkit} name={label} logo={logo} size={32} />
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-text-primary">{label}</div>
                <div className="truncate text-xs text-text-muted">
                    Let {botName} use {label}
                </div>
            </div>
            <button
                type="button"
                disabled={busy}
                className="h-8 shrink-0 rounded-full border border-border-subtle bg-accent px-4 text-md text-text-primary hover:bg-panel-hover disabled:opacity-50"
                onClick={() => {
                    setBusy(true);
                    void startPluginConnect(toolkit)
                        .then((res) => setUrl(res.redirectUrl))
                        .catch(() => {})
                        .finally(() => setBusy(false));
                }}
            >
                Authorize
            </button>
            <ComposioHandoff
                open={Boolean(url)}
                pluginName={label}
                userId={auth.userId}
                name={auth.name}
                email={auth.email}
                offline={auth.offline}
                onCancel={() => setUrl(null)}
                onContinue={() => {
                    if (!url) return;
                    void commands.openUrlExternal(url);
                    setUrl(null);
                }}
            />
        </div>
    );
}
