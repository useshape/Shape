"use client";

import { Button } from "@/components/ui/button";

export function OnboardingHero({
    title,
    subtitle,
}: {
    title: string;
    subtitle: string;
}) {
    return (
        <div className="mb-6">
            <h1 className="font-brand text-3xl font-medium tracking-tight text-text-primary">
                {title}
            </h1>
            <p className="mt-2 text-sm leading-5 text-text-muted">{subtitle}</p>
        </div>
    );
}

export function OnboardingNav({
    onBack,
    onSkip,
    onContinue,
    continueLabel = "Continue",
    skipLabel = "Skip",
    disableContinue,
}: {
    onBack?: () => void;
    onSkip?: () => void;
    onContinue: () => void;
    continueLabel?: string;
    skipLabel?: string;
    disableContinue?: boolean;
}) {
    return (
        <div className="mt-8 flex items-center justify-between gap-2">
            {onBack ? (
                <Button type="button" variant="secondary" size="md" onClick={onBack}>
                    Back
                </Button>
            ) : (
                <span />
            )}
            <div className="flex gap-2">
                {onSkip ? (
                    <Button type="button" variant="ghost" size="md" onClick={onSkip}>
                        {skipLabel}
                    </Button>
                ) : null}
                <Button type="button" size="md" disabled={disableContinue} onClick={onContinue}>
                    {continueLabel}
                </Button>
            </div>
        </div>
    );
}

export function MarketVisual({
    title,
    subtitle,
    image,
}: {
    title: string;
    subtitle: string;
    image: string;
}) {
    return (
        <div className="flex items-center gap-4 overflow-hidden rounded-2xl bg-surface-1 p-4">
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-text-primary">{title}</div>
                <p className="mt-1 text-xs leading-4 text-text-muted">{subtitle}</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="h-28 w-44 shrink-0 rounded-xl object-cover" />
        </div>
    );
}

export function OnboardingPricing({
    onOpenSite,
}: {
    onOpenSite: (path: string) => void;
}) {
    const plans = [
        { name: "Free", price: "$0", note: "Auto usage included", path: "/pricing" },
        { name: "Plus", price: "$20/mo", note: "Claude, GPT, Gemini, Grok", path: "/checkout?tier=plus", featured: true },
        { name: "Pro", price: "$40/mo", note: "Larger credit pool", path: "/checkout?tier=pro" },
    ];
    return (
        <div className="flex flex-col gap-2">
            {plans.map((plan) => (
                <button
                    key={plan.name}
                    type="button"
                    onClick={() => onOpenSite(plan.path)}
                    className="flex w-full items-center justify-between rounded-2xl bg-surface-1 px-4 py-3 text-left hover:bg-panel-hover"
                >
                    <div>
                        <div className="text-sm font-medium text-text-primary">{plan.name}</div>
                        <div className="text-xs text-text-muted">{plan.note}</div>
                    </div>
                    <div className="text-sm tabular-nums text-text-secondary">{plan.price}</div>
                </button>
            ))}
        </div>
    );
}
