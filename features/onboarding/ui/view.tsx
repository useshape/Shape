"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { loginShape, cancelLoginShape, useShapeAuth } from "@/lib/shape-auth/store";
import { markOnboardingComplete } from "@/features/onboarding/config";
import { updateSettingSection, useSettings } from "@/lib/settings";
import { applyTelemetryPreference } from "@/lib/telemetry";
import { ThemePicker } from "@/features/settings/ui/theme-picker";
import type { ColorThemeId } from "@/lib/themes";
import { normalizeColorTheme } from "@/lib/themes";

type Phase = "intro" | "content";

const STEPS = ["security", "notifications", "theme", "login"] as const;
type StepId = (typeof STEPS)[number];

/** Keyboard return / enter key glyph. */
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
    onComplete,
}: {
    /** Rendered inside the main window (no separate webview). */
    embedded?: boolean;
    onComplete?: () => void;
}) {
    const [phase, setPhase] = useState<Phase>("intro");
    const [introVisible, setIntroVisible] = useState(false);
    const [contentVisible, setContentVisible] = useState(false);
    const [step, setStep] = useState(0);
    const [dir, setDir] = useState<1 | -1>(1);
    const [finishing, setFinishing] = useState(false);
    const [telemetryEnabled, setTelemetryEnabled] = useState(false);
    const [privacyChosen, setPrivacyChosen] = useState(false);
    const [desktopNotifs, setDesktopNotifs] = useState(true);
    const [importantOnly, setImportantOnly] = useState(false);
    const settings = useSettings();
    const [theme, setTheme] = useState<ColorThemeId>(() =>
        normalizeColorTheme(settings.appearance.colorTheme),
    );
    const shapeAuth = useShapeAuth();

    const stepId: StepId = STEPS[step] ?? "security";
    const isLoginStep = stepId === "login";
    const canNext =
        stepId !== "security" || privacyChosen;

    const finishOnboarding = async () => {
        setFinishing(true);
        try {
            markOnboardingComplete();
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
    }, []);

    useEffect(() => {
        if (isLoginStep && shapeAuth.loggedIn && !finishing) {
            void finishOnboarding();
        }
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
    }, [phase, isLoginStep, canNext, step]);

    if (phase === "intro") {
        return (
            <div
                id="shape-onboarding"
                className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-text-primary select-none"
            >
                <div className="flex flex-1 items-center justify-center">
                    <Image
                        src="/logos/logo.svg"
                        alt="Shape"
                        width={46}
                        height={56}
                        priority
                        style={{ width: 46, height: "auto" }}
                        className={clsx(
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
            <div
                className={clsx(
                    "flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-6 py-10 transition-opacity duration-500 ease-out",
                    contentVisible ? "opacity-100" : "opacity-0",
                )}
            >
                <div className="relative flex w-full max-w-md flex-col overflow-hidden">
                    <div
                        key={stepId}
                        className={clsx(
                            "w-full animate-in fade-in duration-300 ease-[var(--ease-out)] fill-mode-both",
                            dir > 0 ? "slide-in-from-right-6" : "slide-in-from-left-6",
                        )}
                    >
                        {stepId === "security" ? (
                            <SecurityPanel
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

                    <div className="mt-6 flex items-center justify-center gap-1.5" aria-hidden>
                        {STEPS.map((id, i) => (
                            <span
                                key={id}
                                className={clsx(
                                    "h-1.5 rounded-full transition-all duration-300",
                                    i === step ? "w-4 bg-accent" : "w-1.5 bg-text-muted/30",
                                )}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function SecurityPanel({
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
            <h1 className="mt-4 text-center text-xl font-medium tracking-tight text-text-primary">
                Security &amp; data use
            </h1>
            <p className="mt-1.5 text-center text-sm leading-normal text-text-muted">
                Your code stays private and is only sent to the AI model you choose.
            </p>
            <div className="mt-6 flex flex-col gap-2">
                <Button
                    type="button"
                    size="lg"
                    className={clsx(
                        "w-full rounded-full",
                        chosen && enabled && "ring-2 ring-accent",
                    )}
                    onClick={onAllow}
                >
                    Allow anonymous usage data
                </Button>
                <Button
                    type="button"
                    size="lg"
                    variant="ghost"
                    className={clsx(
                        "w-full rounded-full",
                        chosen && !enabled && "ring-2 ring-border",
                    )}
                    onClick={onDeny}
                >
                    Don&apos;t share data
                </Button>
            </div>
            <p className="mt-3 text-center text-xs text-text-muted">
                Choose one to continue. You can change this later in Settings.
            </p>
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
            <h1 className="text-center text-xl font-medium tracking-tight text-text-primary">
                Never miss a moment
            </h1>
            <p className="mt-1.5 text-center text-sm leading-normal text-text-muted">
                Get notified when generations finish or your approval is needed.
            </p>

            <div className="relative mx-auto mt-8 h-28 w-full max-w-xs">
                <div className="absolute inset-x-4 top-6 rounded-2xl bg-surface-3/40 px-3 py-2.5 opacity-40 blur-[0.5px]">
                    <span className="text-xs text-text-muted">Agent finished a task</span>
                </div>
                <div className="absolute inset-x-2 top-3 rounded-2xl bg-surface-3/60 px-3 py-2.5 opacity-70">
                    <span className="text-xs text-text-secondary">Approval required</span>
                </div>
                <div className="absolute inset-x-0 top-0 flex items-center gap-2 rounded-2xl border border-border-subtle bg-surface-2/90 px-3 py-2.5 backdrop-blur-md">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-panel-hover">
                        <Icon name="notifications" size={14} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                        Generation complete
                    </span>
                    <span className="text-xs text-text-muted">now</span>
                </div>
            </div>

            <div className="mt-8 flex flex-col gap-2">
                <NotifRow
                    icon="notifications"
                    label="All notifications"
                    checked={desktop && !important}
                    onCheckedChange={(v) => {
                        if (v) onChange(true, false);
                        else onChange(false, false);
                    }}
                />
                <NotifRow
                    icon="chat"
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
    icon,
    label,
    checked,
    onCheckedChange,
}: {
    icon: string;
    label: string;
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-panel-hover text-text-primary">
                <Icon name={icon} size={16} />
            </span>
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
                Opens your browser. Return here once you&apos;re signed in.
            </p>
            <div className="mt-8 flex flex-col gap-2">
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
                    className="w-full gap-2 rounded-full"
                >
                    {busy ? "Waiting for browser…" : "Sign in with Shape"}
                </Button>
                {busy && !finishing ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="lg"
                        className="w-full gap-2 rounded-full"
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
                        className="mt-3 w-full gap-2 rounded-full"
                        disabled={busy}
                        onClick={onSkip}
                    >
                        Skip for now
                    </Button>
                )}
            </div>
        </div>
    );
}
