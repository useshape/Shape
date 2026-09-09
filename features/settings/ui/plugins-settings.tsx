"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    RiApps2Line,
    RiCalendarLine,
    RiCloudLine,
    RiDiscordLine,
    RiDropboxLine,
    RiGithubLine,
    RiGitlabLine,
    RiGoogleLine,
    RiLineChartLine,
    RiLinkedinLine,
    RiNotionLine,
    RiBankCardLine,
    RiRedditLine,
    RiSlackLine,
    RiTwitterXLine,
    RiYoutubeLine,
} from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { commands } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { ShapeApiError } from "@/lib/shape-auth/api";
import { useShapeAuth } from "@/lib/shape-auth/store";
import {
    disconnectPlugin,
    fetchPlugins,
    startPluginConnect,
    type PluginRow,
} from "@/lib/plugins-api";
import { SettingRow, SettingSection } from "./setting-controls";

const ICONS: Record<string, RemixiconComponentType> = {
    slack: RiSlackLine,
    github: RiGithubLine,
    gitlab: RiGitlabLine,
    discord: RiDiscordLine,
    notion: RiNotionLine,
    googledrive: RiGoogleLine,
    googlecalendar: RiCalendarLine,
    googlesheets: RiGoogleLine,
    googledocs: RiGoogleLine,
    dropbox: RiDropboxLine,
    twitter: RiTwitterXLine,
    linkedin: RiLinkedinLine,
    reddit: RiRedditLine,
    youtube: RiYoutubeLine,
    stripe: RiBankCardLine,
    cloudflare: RiCloudLine,
    posthog: RiLineChartLine,
    mixpanel: RiLineChartLine,
};

function pluginIcon(id: string): RemixiconComponentType {
    return ICONS[id] ?? RiApps2Line;
}

export function PluginsSettings() {
    const auth = useShapeAuth();
    const signedIn = auth.loggedIn;
    const [plugins, setPlugins] = useState<PluginRow[]>([]);
    const [configured, setConfigured] = useState(true);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!signedIn) {
            setLoading(false);
            return;
        }
        try {
            const data = await fetchPlugins();
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
    }, [signedIn]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!busy) return;
        const onFocus = () => {
            void load();
        };
        window.addEventListener("focus", onFocus);
        const id = window.setInterval(() => {
            void load();
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

    const groups = useMemo(() => {
        const map = new Map<string, PluginRow[]>();
        for (const plugin of plugins) {
            const list = map.get(plugin.category) ?? [];
            list.push(plugin);
            map.set(plugin.category, list);
        }
        return [...map.entries()];
    }, [plugins]);

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
            await load();
        } catch (err) {
            const message = err instanceof ShapeApiError ? err.message : "Could not disconnect.";
            notify.error(message);
        } finally {
            setBusy(null);
        }
    }

    if (!signedIn) {
        return (
            <SettingSection
                id="settings-ai-plugins"
                title="Plugins"
                description="Connect Slack, GitHub, Linear, and other apps so the agent can use them. Sign in first."
            >
                <SettingRow title="Sign in" description="Plugins use your Shape account.">
                    <span className="text-sm text-text-muted">Not signed in</span>
                </SettingRow>
            </SettingSection>
        );
    }

    if (!configured) {
        return (
            <SettingSection
                id="settings-ai-plugins"
                title="Plugins"
                description="Connect apps so the agent can send messages, open issues, and more. Composio is not configured on the server yet."
            >
                <SettingRow title="Unavailable" description="Ask the host to set COMPOSIO_API_KEY.">
                    <span className="text-sm text-text-muted">Not configured</span>
                </SettingRow>
            </SettingSection>
        );
    }

    if (loading && plugins.length === 0) {
        return (
            <SettingSection
                id="settings-ai-plugins"
                title="Plugins"
                description="Connect an app, then ask the agent. Paid plans: 0.2 credits per call. Free uses Auto usage instead."
            >
                <SettingRow title="Loading">…</SettingRow>
            </SettingSection>
        );
    }

    return (
        <>
            {groups.map(([category, rows], index) => (
                <SettingSection
                    key={category}
                    id={index === 0 ? "settings-ai-plugins" : undefined}
                    title={index === 0 ? "Plugins" : category}
                    description={
                        index === 0
                            ? "Connect an app, then ask the agent. Paid plans: 0.2 credits per call. Free uses Auto usage instead."
                            : undefined
                    }
                >
                    {rows.map((plugin) => (
                        <div
                            key={plugin.id}
                            className="flex items-start justify-between gap-4 px-4 py-3.5"
                        >
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-1">
                                    <Icon icon={pluginIcon(plugin.id)} className="text-text-muted" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-md font-medium text-text-primary">{plugin.name}</div>
                                    <div className="mt-0.5 text-sm text-text-muted">{plugin.description}</div>
                                </div>
                            </div>
                            <div className="flex items-center shrink-0">
                                {plugin.connected ? (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={busy === plugin.toolkit}
                                        onClick={() => void disconnect(plugin)}
                                    >
                                        Disconnect
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        disabled={busy === plugin.toolkit}
                                        onClick={() => void connect(plugin)}
                                    >
                                        {busy === plugin.toolkit ? "Connecting…" : "Connect"}
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </SettingSection>
            ))}
        </>
    );
}
