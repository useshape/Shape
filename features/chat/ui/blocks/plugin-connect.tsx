"use client";

import { useState } from "react";
import { PluginLogo } from "@/components/ui/plugin-logo";
import { commands } from "@/lib/backend/commands";
import { startPluginConnect } from "@/lib/plugins/api";

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

    return (
        <div
            data-plugin-connect=""
            className="my-1.5 flex w-full max-w-[22rem] items-center gap-3 rounded-2xl bg-surface-3 px-3 py-2.5"
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
                className="h-8 shrink-0 rounded-full border border-border-subtle bg-panel px-3 text-sm text-text-primary hover:bg-panel-hover disabled:opacity-50"
                onClick={() => {
                    setBusy(true);
                    void startPluginConnect(toolkit)
                        .then((res) => commands.openUrlExternal(res.redirectUrl))
                        .catch(() => {})
                        .finally(() => setBusy(false));
                }}
            >
                Authorize
            </button>
        </div>
    );
}
