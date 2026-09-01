"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { loginShape, cancelLoginShape, useShapeAuth } from "@/lib/shape-auth/store";
import { markOnboardingComplete } from "@/features/onboarding/config";
import { updateSettingSection, useSettings } from "@/lib/settings";
import { applyTelemetryPreference } from "@/lib/telemetry";
import { ThemePicker } from "@/features/settings/ui/theme-picker";
import type { ColorThemeId } from "@/lib/themes";
import { normalizeColorTheme } from "@/lib/themes";
import {
    getCatalogDefaultEnabledIds,
    getCatalogModels,
    useShapeCatalog,
} from "@/lib/catalog-store";
import { isModelEnabled } from "@/lib/models";
import { OnboardingWindowChrome } from "./window-chrome";

type Phase = "intro" | "content";

const STEPS = ["privacy", "notifications", "theme", "models", "login"] as const;
type StepId = (typeof STEPS)[number];

function EnterKeyIcon({ size = 14, className }: { size?: number; className?: string }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            aria-hidden
        >
            <path
                d="M13 2.5v5.25A1.75 1.75 0 0 1 11.25 9.5H4.56l1.72 1.72a.75.75 0 1 1-1.06 1.06l-3-3a.75.75 0 0 1 0-1.06l3-3a.75.75 0 0 1 1.06 1.06L4.56 8H11.25a.25.25 0 0 0 .25-.25V2.5a.75.75 0 0 1 1.5 0Z"
                fill="currentColor"
            />
        </svg>
    );
}

export default function Onboarding({
    embedded = false,
    loginOnly = false,
    onComplete,
}: {
    embedded?: boolean;
    loginOnly?: boolean;
    onComplete?: () => void;
}) {
    const [phase, setPhase] = useState<Phase>(loginOnly ? "content" : "intro");
    const [introVisible, setIntroVisible] = useState(false);
    const [contentVisible, setContentVisible] = useState(loginOnly);
    const [step, setStep] = useState(loginOnly ? STEPS.indexOf("login") : 0);
    const [dir, setDir] = useState<1 | -1>(1);
    const [finishing, setFinishing] = useState(false);
    const [telemetryEnabled, setTelemetryEnabled] = useState(false);
    const [privacyChosen, setPrivacyChosen] = useState(false);
    const [desktopNotifs, setDesktopNotifs] = useState(true);
    const [importantOnly, setImportantOnly] = useState(false);
    const settings = useSettings();
    useShapeCatalog();
    const [theme, setTheme] = useState<ColorThemeId>(() =>
        normalizeColorTheme(settings.appearance.colorTheme),
    );
    const [enabledModels, setEnabledModels] = useState<string[]>(() =>
        settings.ai.enabledModels.length > 0
            ? [...settings.ai.enabledModels]
            : getCatalogDefaultEnabledIds(),
    );
    const shapeAuth = useShapeAuth();

    const stepId: StepId = STEPS[step] ?? "privacy";
    const isLoginStep = stepId === "login";
    const canNext = stepId !== "privacy" || privacyChosen;

    const finishOnboarding = async () => {
        setFinishing(true);
        try {
            if (!loginOnly) {
                updateSettingSection("ai", { enabledModels });
                markOnboardingComplete();
            }
            if (embedded) {
                onComplete?.();
                window.dispatchEvent(new CustomEvent("shape-onboarding-complete"));
                return;
            }
            const { emit } = await import("@tauri-apps/api/event");
            await emit("onboarding-complete");
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await new Promise((r) => setTimeout(r, 200));
            await getCurrentWindow().close();
        } catch (e) {
            console.error("Failed to finish onboarding:", e);
            setFinishing(false);
        }
    };

    const goNext = () => {
        if (!canNext || isLoginStep) return;
        if (stepId === "models") {
            updateSettingSection("ai", { enabledModels });
        }
        setDir(1);
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
    };

    const goPrevious = () => {
        setDir(-1);
        setStep((s) => Math.max(s - 1, 0));
    };

    const choosePrivacy = (enabled: boolean) => {
        setTelemetryEnabled(enabled);
        setPrivacyChosen(true);
        updateSettingSection("privacy", { telemetryEnabled: enabled });
        void applyTelemetryPreference(enabled);
    };

    const applyNotifs = (desktop: boolean, important: boolean) => {
        setDesktopNotifs(desktop);
        setImportantOnly(important);
        updateSettingSection("notifications", {
            desktopEnabled: desktop,
            onGenerationComplete: desktop,
            onApprovalRequired: desktop && !important ? true : desktop,
        });
    };

    const applyTheme = (id: ColorThemeId) => {
        setTheme(id);
        updateSettingSection("appearance", { colorTheme: id });
    };

    useEffect(() => {
        if (loginOnly) {
            setPhase("content");
            setContentVisible(true);
            return;
        }
        let cancelled = false;
        let t1: number | undefined;
        let t2: number | undefined;

        const fadeIn = requestAnimationFrame(() => {
            if (!cancelled) setIntroVisible(true);
        });

        t1 = window.setTimeout(() => {
            if (cancelled) return;
            setIntroVisible(false);
            t2 = window.setTimeout(() => {
                if (cancelled) return;
                setPhase("content");
                requestAnimationFrame(() => {
                    if (!cancelled) setContentVisible(true);
                });
            }, 450);
        }, 1000);

        return () => {
            cancelled = true;
            cancelAnimationFrame(fadeIn);
            if (t1 !== undefined) window.clearTimeout(t1);
            if (t2 !== undefined) window.clearTimeout(t2);
        };
    }, [loginOnly]);

    useEffect(() => {
        if (isLoginStep && shapeAuth.loggedIn && !finishing) {
            void finishOnboarding();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- finish once on login
    }, [isLoginStep, shapeAuth.loggedIn, finishing]);

    useEffect(() => {
        if (phase !== "content") return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Enter" || isLoginStep || !canNext) return;
            e.preventDefault();
            goNext();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, isLoginStep, canNext, step]);

    if (phase === "intro") {
        return (
            <div
                id="shape-onboarding"
                className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-text-primary select-none"
            >
                <OnboardingWindowChrome />
                <div className="flex flex-1 items-center justify-center">
                    <Image
                        src="/logos/logo.svg"
                        alt="Shape"
                        width={46}
                        height={56}
                        priority
                        style={{ width: 46, height: "auto" }}
                        className={cn(
                            "logo-invert transition-opacity duration-500 ease-out",
                            introVisible ? "opacity-100" : "opacity-0",
                        )}
                    />
                </div>
            </div>
        );
    }

    return (
        <div
            id="shape-onboarding"
            className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-text-primary select-none"
        >
            <OnboardingWindowChrome />
            <div
                className={cn(
                    "flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-6 py-10 transition-opacity duration-500 ease-out",
                    contentVisible ? "opacity-100" : "opacity-0",
                )}
            >
                <div className="relative flex w-full max-w-md flex-col overflow-hidden">
                    <div
                        key={stepId}
                        className={cn(
                            "w-full animate-in fade-in duration-300 ease-[var(--ease-out)] fill-mode-both",
                            dir > 0 ? "slide-in-from-right-6" : "slide-in-from-left-6",
                        )}
                    >
                        {stepId === "privacy" ? (
                            <PrivacyPanel
                                chosen={privacyChosen}
                                enabled={telemetryEnabled}
                                onAllow={() => choosePrivacy(true)}
                                onDeny={() => choosePrivacy(false)}
                            />
                        ) : null}
                        {stepId === "notifications" ? (
                            <NotificationsPanel
                                desktop={desktopNotifs}
                                important={importantOnly}
                                onChange={applyNotifs}
                            />
                        ) : null}
                        {stepId === "theme" ? (
                            <ThemeStep theme={theme} onChange={applyTheme} />
                        ) : null}
                        {stepId === "models" ? (
                            <ModelsPanel
                                enabledModels={enabledModels}
                                onChange={setEnabledModels}
                            />
                        ) : null}
                        {stepId === "login" ? (
                            <LoginPanel
                                finishing={finishing}
                                onSignedIn={() => void finishOnboarding()}
                                onSkip={() => void finishOnboarding()}
                            />
                        ) : null}
                    </div>

                    {!isLoginStep ? (
                        <Button
                            onClick={goNext}
                            size="lg"
                            className="mt-8 w-full gap-2 rounded-full"
                            disabled={!canNext}
                        >
                            Next
                            <EnterKeyIcon size={14} className="opacity-80" />
                        </Button>
                    ) : null}

                    {step > 0 && !isLoginStep ? (
                        <Button
                            type="button"
                            onClick={goPrevious}
                            disabled={finishing}
                            size="lg"
                            variant="ghost"
                            className="mt-3 w-full gap-2 rounded-full"
                        >
                            Previous
                        </Button>
                    ) : null}

                    {loginOnly ? null : (
                        <div className="mt-6 flex items-center justify-center gap-1.5" aria-hidden>
                            {STEPS.map((id, i) => (
                                <span
                                    key={id}
                                    className={cn(
                                        "h-1.5 rounded-full transition-all duration-300",
                                        i === step ? "w-4 bg-accent" : "w-1.5 bg-text-muted/30",
                                    )}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function PrivacyPanel({
    chosen,
    enabled,
    onAllow,
    onDeny,
}: {
    chosen: boolean;
    enabled: boolean;
    onAllow: () => void;
    onDeny: () => void;
}) {
    return (
        <div>
            <div className="mx-auto mb-5 w-full max-w-xs text-text-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/onboarding/privacy.svg" alt="" className="h-auto w-full" />
            </div>
            <h1 className="text-center text-xl font-medium tracking-tight text-text-primary">
                Privacy
            </h1>
            <p className="mt-1.5 text-center text-sm leading-normal text-text-muted">
                Your code stays private and is only sent to the model you pick.
            </p>
            <div className="mt-6 flex flex-col gap-2" role="radiogroup" aria-label="Privacy">
                <button
                    type="button"
                    role="radio"
                    aria-checked={chosen && enabled}
                    onClick={onAllow}
                    className={cn(
                        "w-full rounded-2xl border px-4 py-3 text-left transition-colors",
                        chosen && enabled
                            ? "border-accent bg-accent/10"
                            : "border-border-subtle bg-surface-2 hover:bg-panel-hover",
                    )}
                >
                    <div className="text-sm font-medium text-text-primary">
                        Allow anonymous usage data
                    </div>
                    <div className="mt-0.5 text-xs text-text-muted">
                        Helps improve Shape. Never includes your code.
                    </div>
                </button>
                <button
                    type="button"
                    role="radio"
                    aria-checked={chosen && !enabled}
                    onClick={onDeny}
                    className={cn(
                        "w-full rounded-2xl border px-4 py-3 text-left transition-colors",
                        chosen && !enabled
                            ? "border-accent bg-accent/10"
                            : "border-border-subtle bg-surface-2 hover:bg-panel-hover",
                    )}
                >
                    <div className="text-sm font-medium text-text-primary">Don&apos;t share data</div>
                    <div className="mt-0.5 text-xs text-text-muted">
                        You can change this later in Settings.
                    </div>
                </button>
            </div>
        </div>
    );
}

function NotificationsPanel({
    desktop,
    important,
    onChange,
}: {
    desktop: boolean;
    important: boolean;
    onChange: (desktop: boolean, important: boolean) => void;
}) {
    return (
        <div>
            <div className="mx-auto mb-5 w-full max-w-xs text-text-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/onboarding/notifications.svg" alt="" className="h-auto w-full" />
            </div>
            <h1 className="text-center text-xl font-medium tracking-tight text-text-primary">
                Notifications
            </h1>
            <p className="mt-1.5 text-center text-sm leading-normal text-text-muted">
                Get notified when generations finish or approval is needed.
            </p>
            <div className="mt-8 flex flex-col gap-2">
                <NotifRow
                    label="All notifications"
                    checked={desktop && !important}
                    onCheckedChange={(v) => {
                        if (v) onChange(true, false);
                        else onChange(false, false);
                    }}
                />
                <NotifRow
                    label="Only important"
                    checked={desktop && important}
                    onCheckedChange={(v) => {
                        if (v) onChange(true, true);
                        else onChange(true, false);
                    }}
                />
            </div>
        </div>
    );
}

function NotifRow({
    label,
    checked,
    onCheckedChange,
}: {
    label: string;
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5">
            <span className="min-w-0 flex-1 text-sm text-text-primary">{label}</span>
            <Switch checked={checked} onCheckedChange={onCheckedChange} />
        </div>
    );
}

function ThemeStep({
    theme,
    onChange,
}: {
    theme: ColorThemeId;
    onChange: (id: ColorThemeId) => void;
}) {
    return (
        <div>
            <h1 className="text-center text-xl font-medium tracking-tight text-text-primary">
                Pick a look
            </h1>
            <p className="mt-1.5 text-center text-sm leading-normal text-text-muted">
                You can change this anytime in Settings.
            </p>
            <div className="mt-6">
                <ThemePicker value={theme} onChange={onChange} />
            </div>
        </div>
    );
}

function ModelsPanel({
    enabledModels,
    onChange,
}: {
    enabledModels: string[];
    onChange: (ids: string[]) => void;
}) {
    const models = useMemo(() => getCatalogModels().slice(0, 12), []);

    const toggle = (id: string) => {
        const allIds = models.map((m) => m.id);
        const base = enabledModels.length === 0 ? allIds : [...enabledModels];
        const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
        onChange(next);
    };

    return (
        <div>
            <h1 className="text-center text-xl font-medium tracking-tight text-text-primary">
                Models
            </h1>
            <p className="mt-1.5 text-center text-sm leading-normal text-text-muted">
                Choose which models show up in chat. Toggle anytime in Settings.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
                {models.map((model) => {
                    const on = isModelEnabled(model.id, enabledModels);
                    return (
                        <button
                            key={model.id}
                            type="button"
                            onClick={() => toggle(model.id)}
                            className={cn(
                                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                                on
                                    ? "border-accent bg-accent/15 text-text-primary"
                                    : "border-border-subtle bg-surface-2 text-text-muted hover:text-text-secondary",
                            )}
                        >
                            {model.name}
                        </button>
                    );
                })}
            </div>
            {models.length === 0 ? (
                <p className="mt-6 text-center text-sm text-text-muted">
                    Model catalog loads after launch — you can enable models in Settings.
                </p>
            ) : null}
        </div>
    );
}

function LoginPanel({
    finishing,
    onSignedIn,
    onSkip,
}: {
    finishing: boolean;
    onSignedIn: () => void;
    onSkip: () => void;
}) {
    const shapeAuth = useShapeAuth();
    const [waiting, setWaiting] = useState(false);
    const busy = waiting || shapeAuth.isLoggingIn || finishing;

    useEffect(() => {
        if (!shapeAuth.isLoggingIn) setWaiting(false);
    }, [shapeAuth.isLoggingIn]);

    return (
        <div>
            <div className="mb-5 flex justify-center">
                <Image
                    src="/logos/logo.svg"
                    alt="Shape"
                    width={46}
                    height={56}
                    priority
                    style={{ width: 40, height: "auto" }}
                    className="logo-invert"
                />
            </div>
            <h1 className="text-center text-xl font-medium tracking-tight text-text-primary">
                Sign in with Shape
            </h1>
            <p className="mt-1.5 text-center text-sm leading-normal text-text-muted">
                Opens your browser. Come back here when you&apos;re done.
            </p>
            <div className="mt-8 flex items-center gap-2">
                <Button
                    onClick={async () => {
                        setWaiting(true);
                        try {
                            if (await loginShape()) onSignedIn();
                        } finally {
                            setWaiting(false);
                        }
                    }}
                    disabled={busy || shapeAuth.loggedIn}
                    size="lg"
                    className="min-w-0 flex-[1.6] gap-2 rounded-full"
                >
                    <Image
                        src="/logos/logo.svg"
                        alt=""
                        width={16}
                        height={16}
                        className="logo-invert size-4 shrink-0"
                    />
                    {busy ? "Waiting…" : "Sign in"}
                </Button>
                {busy && !finishing ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="lg"
                        className="shrink-0 rounded-full px-4"
                        onClick={() => {
                            cancelLoginShape();
                            setWaiting(false);
                        }}
                    >
                        Cancel
                    </Button>
                ) : (
                    <Button
                        type="button"
                        variant="ghost"
                        size="lg"
                        className="shrink-0 rounded-full px-4"
                        disabled={busy}
                        onClick={onSkip}
                    >
                        Skip
                    </Button>
                )}
            </div>
        </div>
    );
}
