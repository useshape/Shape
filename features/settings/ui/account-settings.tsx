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

function UsageBar({
    label,
    detail,
    percent,
}: {
    label: string;
    detail: string;
    percent: number;
}) {
    const clamped = Math.max(0, Math.min(100, percent));
    return (
        <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-text-primary font-medium">{label}</span>
                <span className="text-text-muted text-xs shrink-0">{detail}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-panel-hover overflow-hidden">
                <div
                    className={cn(
                        "h-full rounded-full transition-all",
                        clamped >= 90 ? "bg-warning" : "bg-accent",
                    )}
                    style={{ width: `${clamped}%` }}
                />
            </div>
        </div>
    );
}

export function AccountSettingsPanel() {
    const auth = useShapeAuth();

    const creditPercent = useMemo(() => {
        if (!auth.creditsIncluded || auth.creditsIncluded <= 0) return 0;
        const used = Math.max(0, auth.creditsIncluded - auth.creditsRemaining);
        return Math.round((used / auth.creditsIncluded) * 100);
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
            <SettingSection id="settings-account" title="Plan">
                <div className="px-3.5 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <span className="inline-flex items-center rounded-full bg-panel-hover px-2 py-0.5 text-xs font-medium text-text-secondary">
                                Current plan
                            </span>
                            <div className="mt-2 text-base font-semibold text-text-primary">
                                {tierLabel(auth.tier)}
                            </div>
                            <div className="text-sm text-text-muted mt-0.5 truncate">
                                {auth.name ?? auth.email}
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 shrink-0"
                            onClick={() => openShapeBilling()}
                        >
                            Manage billing
                            <Icon name="open_in_new" size={14} className="text-text-muted" />
                        </Button>
                    </div>
                </div>
            </SettingSection>

            <SettingSection
                title="Usage"
                description="Auto usage resets monthly. Premium credits refresh with your billing period."
            >
                <div className="px-3.5 py-4 space-y-4">
                    <UsageBar
                        label="Auto usage"
                        detail={`${Math.round(freeAutoPercent)}% used this month`}
                        percent={freeAutoPercent}
                    />
                    <UsageBar
                        label="Premium credits"
                        detail={
                            auth.creditsIncluded > 0
                                ? `${auth.creditsRemaining.toLocaleString()} / ${auth.creditsIncluded.toLocaleString()} left · ${creditPercent}% used`
                                : auth.tier === "free"
                                  ? "Upgrade for premium models"
                                  : `${auth.creditsRemaining.toLocaleString()} remaining`
                        }
                        percent={auth.creditsIncluded > 0 ? creditPercent : 0}
                    />
                    <div className="flex items-center justify-between text-sm pt-1 border-t border-border/60">
                        <span className="text-text-primary font-medium">Credits remaining</span>
                        <span className="text-text-muted tabular-nums">
                            {auth.creditsRemaining.toLocaleString()}
                        </span>
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
                <SettingRow title="Open dashboard" description="View billing, usage history, and account settings on the website.">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => void commands.openUrlExternal(`${SHAPE_API_BASE}/dashboard`)}
                    >
                        Open
                        <Icon name="open_in_new" size={14} className="text-text-muted" />
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
