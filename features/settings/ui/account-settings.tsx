"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SettingRow, SettingSection } from "./setting-controls";
import {
    loginShape,
    logoutShape,
    openShapeBilling,
    refreshShapeAuth,
    useShapeAuth,
} from "@/lib/shape-auth/store";
import { SHAPE_API_BASE } from "@/lib/shape-auth/api";
import { commands } from "@/lib/backend";
import { cn } from "@/lib/utils";

function tierLabel(tier: string) {
    return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function UsageMeter({
    label,
    primary,
    secondary,
    percent,
    invert,
}: {
    label: string;
    primary: string;
    secondary?: string;
    /** 0–100 fill amount shown on the bar */
    percent: number;
    /** When true, high fill means healthy remaining (mint); else high fill means heavy usage */
    invert?: boolean;
}) {
    const clamped = Math.max(0, Math.min(100, percent));
    const warn = invert ? clamped <= 10 : clamped >= 90;
    return (
        <div className="space-y-2">
            <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs text-text-muted">{label}</p>
                    <p className="mt-0.5 text-sm font-medium text-text-primary tabular-nums truncate">
                        {primary}
                    </p>
                </div>
                {secondary ? (
                    <span
                        className={cn(
                            "shrink-0 rounded-md px-1.5 py-0.5 text-xs tabular-nums",
                            warn ? "bg-warning/15 text-warning" : "bg-panel-hover text-text-muted",
                        )}
                    >
                        {secondary}
                    </span>
                ) : null}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-panel-hover">
                <div
                    className={cn(
                        "h-full rounded-full transition-[width] duration-300",
                        warn ? "bg-warning" : invert ? "bg-success" : "bg-accent",
                    )}
                    style={{ width: `${clamped}%` }}
                />
            </div>
        </div>
    );
}

export function AccountSettingsPanel() {
    const auth = useShapeAuth();

    const creditRemainingPercent = useMemo(() => {
        if (!auth.creditsIncluded || auth.creditsIncluded <= 0) return 0;
        return Math.round((auth.creditsRemaining / auth.creditsIncluded) * 100);
    }, [auth.creditsIncluded, auth.creditsRemaining]);

    const freeAutoPercent = auth.freeAutoPercent ?? 0;

    if (auth.isLoading) {
        return (
            <SettingSection id="settings-account" title="Account">
                <div className="px-3.5 py-4 text-sm text-text-muted">Loading account…</div>
            </SettingSection>
        );
    }

    if (!auth.loggedIn) {
        return (
            <SettingSection id="settings-account" title="Account" description="Sign in to manage your plan and usage.">
                <div className="px-3.5 py-4 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <div className="text-sm font-medium text-text-primary">Not signed in</div>
                            <div className="text-sm text-text-muted mt-1">
                                Connect your Shape account to sync plan, credits, and usage.
                            </div>
                        </div>
                        <Button
                            size="sm"
                            onClick={() => void loginShape()}
                            disabled={auth.isLoggingIn}
                        >
                            {auth.isLoggingIn ? "Waiting…" : "Sign in"}
                        </Button>
                    </div>
                </div>
            </SettingSection>
        );
    }

    return (
        <>
            <SettingSection id="settings-account" title="Plan & usage">
                <div className="px-3.5 py-4 space-y-5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-xs text-text-muted">Current plan</p>
                            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="text-lg font-semibold text-text-primary">
                                    {tierLabel(auth.tier)}
                                </span>
                                {auth.creditsIncluded > 0 ? (
                                    <span className="text-sm text-text-muted">
                                        ({auth.creditsIncluded.toLocaleString()} credits / month)
                                    </span>
                                ) : null}
                            </div>
                            <div className="mt-0.5 text-sm text-text-muted truncate">
                                {auth.name ?? auth.email}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 rounded-xl bg-panel/40 px-3.5 py-3.5">
                        {auth.creditsIncluded > 0 ? (
                            <UsageMeter
                                label="Premium credits"
                                primary={`${auth.creditsRemaining.toLocaleString()} / ${auth.creditsIncluded.toLocaleString()} remaining`}
                                secondary={`${creditRemainingPercent}% left`}
                                percent={creditRemainingPercent}
                                invert
                            />
                        ) : (
                            <UsageMeter
                                label="Premium credits"
                                primary={
                                    auth.tier === "free"
                                        ? "Upgrade for premium models"
                                        : `${auth.creditsRemaining.toLocaleString()} remaining`
                                }
                                percent={0}
                                invert
                            />
                        )}
                        <UsageMeter
                            label="Auto usage"
                            primary={`${Math.round(freeAutoPercent)}% used this month`}
                            secondary={`${Math.round(100 - freeAutoPercent)}% left`}
                            percent={Math.max(0, 100 - freeAutoPercent)}
                            invert
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" onClick={() => openShapeBilling()}>
                            {auth.tier === "free"
                                ? "Upgrade to paid plan"
                                : "Manage billing"}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => void commands.openUrlExternal(`${SHAPE_API_BASE}/dashboard`)}
                        >
                            Dashboard
                            <Icon name="open_in_new" size={14} className="text-text-muted" />
                        </Button>
                    </div>
                </div>
            </SettingSection>

            <SettingSection title="Account">
                <SettingRow title="Email" description={auth.email ?? undefined}>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void refreshShapeAuth()}
                        disabled={auth.revalidating}
                    >
                        {auth.revalidating ? "Refreshing…" : "Refresh"}
                    </Button>
                </SettingRow>
                <SettingRow title="Sign out">
                    <Button variant="secondary" size="sm" onClick={() => void logoutShape()}>
                        Sign out
                    </Button>
                </SettingRow>
            </SettingSection>
        </>
    );
}
