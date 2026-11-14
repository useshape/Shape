"use client";

import { Open20Regular } from "@fluentui/react-icons/headless/svg/open";
import { useMemo } from "react";
import { freeUsageMeter, paidUsageMeter } from "@/lib/chat/usage-display";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";


import { SettingRow, SettingSection, SettingCard, SETTING_CONTROL_BTN } from "../shared/controls";
import { Skeleton } from "@/features/git/ui/shared/skeletons";
import {
    logoutShape,
    openShapeBilling,
    refreshShapeAuth,
    useShapeAuth,
} from "@/lib/cloud/store";
import { requestShapeLogin } from "@/features/agent/workbench/ui/login-prompt-dialog";
import { SHAPE_API_BASE } from "@/lib/cloud/api";
import { commands } from "@/lib/backend";

function tierLabel(tier: string) {
    return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export function AccountSettingsPanel() {
    const auth = useShapeAuth();

    const paid = paidUsageMeter(auth.creditsRemaining, auth.creditsIncluded);
    const free = freeUsageMeter(auth.freeAutoPercent);
    const resetLabel = useMemo(() => {
        const iso = auth.currentPeriodEnd;
        const date = iso
            ? new Date(iso)
            : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
        if (Number.isNaN(date.getTime())) return "Resets next month";
        return `Resets ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    }, [auth.currentPeriodEnd]);

    if (auth.isLoading) {
        return (
            <div aria-busy aria-label="Loading account">
                <SettingSection id="settings-account" title="Plan">
                    <SettingCard>
                    <div className="px-3.5 py-4 space-y-3">
                        <Skeleton className="h-5 w-24 rounded-full" />
                        <Skeleton className="h-6 w-28" />
                        <Skeleton className="h-4 w-48" />
                    </div>
                    </SettingCard>
                </SettingSection>
                <SettingSection title="Usage">
                    <SettingCard>
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
                    </SettingCard>
                </SettingSection>
                <SettingSection title="Profile">
                    <SettingCard>
                    <div className="space-y-0">
                        {Array.from({ length: 3 }, (_, i) => (
                            <div key={i} className="flex items-center justify-between gap-4 px-3.5 py-3.5">
                                <Skeleton className="h-4 w-28" />
                                <Skeleton className="h-8 w-20 rounded-lg" />
                            </div>
                        ))}
                    </div>
                    </SettingCard>
                </SettingSection>
            </div>
        );
    }

    if (!auth.loggedIn) {
        return (
            <SettingSection id="settings-account" title="Profile">
                <SettingCard>
                <div className="px-3.5 py-3">
                    <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <div className="text-md font-regular text-text-primary">Not signed in</div>
                        </div>
                        <Button
                            size="sm"
                            variant="ghost"
                            className={SETTING_CONTROL_BTN}
                            onClick={() => requestShapeLogin()}
                            disabled={auth.isLoggingIn}
                        >
                            {auth.isLoggingIn ? "Waiting…" : "Sign in"}
                        </Button>
                    </div>
                </div>
                </SettingCard>
            </SettingSection>
        );
    }

    return (
        <>
            <SettingSection id="settings-account" title="Plan">
                <SettingCard>
                <div className="px-3.5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-base font-medium text-text-primary">
                                {tierLabel(auth.tier)}
                            </div>
                            <div className="text-sm text-text-muted mt-0.5 truncate">
                                {auth.name ?? auth.email}
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className={SETTING_CONTROL_BTN}
                            onClick={() => openShapeBilling()}
                        >
                            Manage billing
                            <Icon icon={Open20Regular} className="text-text-muted" />
                        </Button>
                    </div>
                </div>
                </SettingCard>
            </SettingSection>

            <SettingSection title="Usage">
                <SettingCard>
                    <div className="px-3.5 py-3">
                        <div className="text-sm font-medium text-text-primary">{paid.title}</div>
                        <div className="mt-0.5 text-xs text-text-muted">{resetLabel}.</div>
                        {paid.showMeter ? (
                            <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-white/10">
                                <div
                                    className={paid.warn ? "h-full rounded-full bg-warning" : "h-full rounded-full bg-success"}
                                    style={{ width: `${paid.percent}%` }}
                                />
                            </div>
                        ) : null}
                    </div>
                </SettingCard>
                <SettingCard>
                    <div className="px-3.5 py-3">
                        <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <div className="text-sm font-medium text-text-primary">Free usage</div>
                                <div className="mt-0.5 text-xs text-text-muted">{resetLabel}.</div>
                            </div>
                            <span className="text-sm text-text-muted">{free.title}</span>
                        </div>
                        {free.showMeter ? (
                            <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-warning" style={{ width: "100%" }} />
                            </div>
                        ) : null}
                    </div>
                </SettingCard>
            </SettingSection>

            <SettingSection title="Profile">
                <SettingRow title="Email" description={auth.email ?? undefined}>
                    <Button
                        variant="ghost"
                        size="sm"
                        className={SETTING_CONTROL_BTN}
                        onClick={() => void refreshShapeAuth()}
                        disabled={auth.revalidating}
                    >
                        {auth.revalidating ? "Refreshing…" : "Refresh"}
                    </Button>
                </SettingRow>
                <SettingRow title="Open dashboard">
                    <Button
                        variant="ghost"
                        size="sm"
                        className={SETTING_CONTROL_BTN}
                        onClick={() => void commands.openUrlExternal(`${SHAPE_API_BASE}/dashboard`)}
                    >
                        Open
                        <Icon icon={Open20Regular} className="text-text-muted" />
                    </Button>
                </SettingRow>
                <SettingRow title="Sign out">
                    <Button variant="ghost" size="sm" className={SETTING_CONTROL_BTN} onClick={() => void logoutShape()}>
                        Sign out
                    </Button>
                </SettingRow>
            </SettingSection>
        </>
    );
}
