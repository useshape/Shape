"use client";

import { RiExternalLinkLine } from "@remixicon/react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SettingRow, SettingSection } from "../shared/controls";
import { Skeleton } from "@/features/git/ui/shared/skeletons";
import {
    logoutShape,
    openShapeBilling,
    refreshShapeAuth,
    useShapeAuth,
} from "@/lib/cloud/store";
import { requestShapeLogin } from "@/features/workbench/ui/login-prompt-dialog";
import { SHAPE_API_BASE } from "@/lib/cloud/api";
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
                <span className="text-text-primary font-medium text-md">{label}</span>
                <span className="text-text-muted text-sm shrink-0">{detail}</span>
            </div>
            <div className="h-3 w-ful bg-panel-hover overflow-hidden">
                <div
                    className={cn(
                        "h-full rounded-xs transition-all",
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
            <div aria-busy aria-label="Loading account">
                <SettingSection id="settings-account" title="Plan">
                    <div className="px-3.5 py-4 space-y-3">
                        <Skeleton className="h-5 w-24 rounded-full" />
                        <Skeleton className="h-6 w-28" />
                        <Skeleton className="h-4 w-48" />
                    </div>
                </SettingSection>
                <SettingSection title="Usage">
                    <div className="px-3.5 py-4 space-y-4">
                        <div className="space-y-1.5">
                            <div className="flex justify-between">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-4 w-32" />
                            </div>
                            <Skeleton className="h-3 w-full rounded-xs" />
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-4 w-40" />
                            </div>
                            <Skeleton className="h-3 w-full rounded-xs" />
                        </div>
                    </div>
                </SettingSection>
                <SettingSection title="Profile">
                    <div className="space-y-0">
                        {Array.from({ length: 3 }, (_, i) => (
                            <div key={i} className="flex items-center justify-between gap-4 px-3.5 py-3.5">
                                <Skeleton className="h-4 w-28" />
                                <Skeleton className="h-8 w-20 rounded-lg" />
                            </div>
                        ))}
                    </div>
                </SettingSection>
            </div>
        );
    }

    if (!auth.loggedIn) {
        return (
            <SettingSection id="settings-account" title="Profile">
                <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <div className="text-md font-regular text-text-primary">Not signed in</div>
                        </div>
                        <Button
                            size="sm"
                            onClick={() => requestShapeLogin()}
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
                            <Icon icon={RiExternalLinkLine} className="text-text-muted" />
                        </Button>
                    </div>
                </div>
            </SettingSection>

            <SettingSection title="Usage">
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

            <SettingSection title="Profile">
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
                <SettingRow title="Open dashboard">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => void commands.openUrlExternal(`${SHAPE_API_BASE}/dashboard`)}
                    >
                        Open
                        <Icon icon={RiExternalLinkLine} className="text-text-muted" />
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
