"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cancelLoginShape, useShapeAuth } from "@/lib/shape-auth/store";
import { markOnboardingComplete } from "@/features/onboarding/config";
import { updateSettingSection, useSettings } from "@/lib/settings";
import { applyTelemetryPreference } from "@/lib/telemetry";
import { ThemePicker } from "@/features/settings/ui/theme-picker";
import type { ColorThemeId } from "@/lib/themes";
import { normalizeColorTheme } from "@/lib/themes";
import { isCatalogServerReachable } from "@/lib/catalog";
import {
    getCatalogDefaultEnabledIds,
    getCatalogModels,
    useShapeCatalog,
} from "@/lib/catalog-store";
import { isModelEnabled } from "@/lib/models";
import { providerIcon } from "@/lib/ui/provider-icon";
import { OnboardingWindowChrome } from "./window-chrome";
import { OnboardingInset } from "./inset";
import { LoginPanel } from "./login-panel";
import {
    applyKeybindingPreset,
    getActiveKeybindingPreset,
    listKeybindingPresets,
    type KeybindingPresetId,
} from "@/lib/ui/shortcuts";

type Phase = "intro" | "content";

const ALL_STEPS = ["privacy", "notifications", "theme", "keybinds", "models", "login"] as const;
type StepId = (typeof ALL_STEPS)[number];

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
    const [stepId, setStepId] = useState<StepId>(loginOnly ? "login" : "privacy");
    const [catalogLive, setCatalogLive] = useState(false);
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
    const [keybindPreset, setKeybindPreset] = useState<KeybindingPresetId>(() => {
        const active = getActiveKeybindingPreset();
        return active === "custom" ? "default" : active;
    });
    const shapeAuth = useShapeAuth();

    const steps = useMemo((): StepId[] => {
        if (loginOnly) return ["login"];
        if (catalogLive) return [...ALL_STEPS];
        return ALL_STEPS.filter((id) => id !== "models");
    }, [loginOnly, catalogLive]);

    const stepIndex = Math.max(0, steps.indexOf(stepId));
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
        if (stepId === "keybinds") {
            applyKeybindingPreset(keybindPreset);
        }
        setDir(1);
        const next = steps[stepIndex + 1];
        if (next) setStepId(next);
    };

    const goPrevious = () => {
        setDir(-1);
        const prev = steps[stepIndex - 1];
        if (prev) setStepId(prev);
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
        if (loginOnly) return;
        let cancelled = false;
        void isCatalogServerReachable().then((ok) => {
            if (!cancelled) setCatalogLive(ok);
        });
        return () => {
            cancelled = true;
        };
    }, [loginOnly]);

    useEffect(() => {
        if (steps.includes(stepId)) return;
        setStepId(steps[Math.min(stepIndex, steps.length - 1)] ?? "privacy");
    }, [steps, stepId, stepIndex]);

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
    }, [phase, isLoginStep, canNext, stepId]);

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
                    "relative flex min-h-0 flex-1 overflow-hidden transition-opacity duration-500 ease-out",
                    contentVisible ? "opacity-100" : "opacity-0",
                    isLoginStep ? "flex-row" : "flex-col items-center justify-center px-6 py-10 pb-16",
                )}
            >
                {isLoginStep ? (
                    <>
                        <div className="relative z-10 flex h-full min-h-0 w-[min(100%,24rem)] shrink-0 flex-col bg-background">
                            <div className="flex min-h-0 flex-1 flex-col justify-center px-10">
                                <LoginPanel
                                    finishing={finishing}
                                    onSignedIn={() => void finishOnboarding()}
                                />
                            </div>
                            <div className="shrink-0 px-10 pb-6">
                                {loginOnly ? null : (
                                    <div
                                        className="mb-4 flex items-center justify-center gap-1.5"
                                        aria-hidden
                                    >
                                        {steps.map((id, i) => (
                                            <span
                                                key={id}
                                                className={cn(
                                                    "h-1.5 rounded-full transition-all duration-300",
                                                    i === stepIndex
                                                        ? "w-4 bg-accent"
                                                        : "w-1.5 bg-text-muted/30",
                                                )}
                                            />
                                        ))}
                                    </div>
                                )}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="px-0 text-text-muted hover:bg-transparent hover:text-text-primary"
                                    disabled={finishing}
                                    onClick={() => {
                                        cancelLoginShape();
                                        void finishOnboarding();
                                    }}
                                >
                                    Skip
                                </Button>
                            </div>
                        </div>
                        <div className="pointer-events-none absolute inset-y-0 right-0 w-[min(72%,52rem)] overflow-hidden">
                            <OnboardingInset
                                tour
                                workspace
                                x={40}
                                className="h-full min-h-0"
                            />
                        </div>
                    </>
                ) : (
                    <div className="relative flex w-full max-w-xl flex-col items-center overflow-hidden">
                        <div
                            key={stepId}
                            className={cn(
                                "w-full animate-in fade-in duration-300 ease-[var(--ease-out)] fill-mode-both",
                                stepId === "theme" ? "max-w-xl" : "max-w-md",
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
                            {stepId === "keybinds" ? (
                                <KeybindsPanel
                                    selected={keybindPreset}
                                    onSelect={(id) => {
                                        setKeybindPreset(id);
                                        applyKeybindingPreset(id);
                                    }}
                                />
                            ) : null}
                            {stepId === "models" ? (
                                <ModelsPanel
                                    enabledModels={enabledModels}
                                    onChange={setEnabledModels}
                                />
                            ) : null}
                        </div>

                        <div className="mt-8 grid w-full max-w-md grid-cols-2 gap-2">
                            <Button
                                type="button"
                                onClick={goPrevious}
                                disabled={finishing || stepIndex === 0}
                                size="lg"
                                variant="outline"
                                className="min-w-0 w-full"
                            >
                                Previous
                            </Button>
                            <Button
                                onClick={goNext}
                                size="lg"
                                className="min-w-0 w-full gap-2"
                                disabled={!canNext}
                            >
                                Next
                                <EnterKeyIcon size={14} className="opacity-80" />
                            </Button>
                        </div>
                    </div>
                )}

                {loginOnly || isLoginStep ? null : (
                    <div
                        className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex items-center justify-center gap-1.5"
                        aria-hidden
                    >
                        {steps.map((id, i) => (
                            <span
                                key={id}
                                className={cn(
                                    "h-1.5 rounded-full transition-all duration-300",
                                    i === stepIndex ? "w-4 bg-accent" : "w-1.5 bg-text-muted/30",
                                )}
                            />
                        ))}
                    </div>
                )}
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
            <h1 className="text-center text-xl font-medium text-text-primary">
                Privacy
            </h1>
            <div className="px-1 pt-3 flex flex-col gap-2" role="radiogroup" aria-label="Privacy">
                <button
                    type="button"
                    role="radio"
                    aria-checked={chosen && enabled}
                    onClick={onAllow}
                    className={cn(
                        "w-full rounded-lg px-4 py-3 text-left transition-colors",
                        chosen && enabled
                            ? "bg-surface-4"
                            : "bg-card ring-2 ring-border hover:bg-panel-hover",
                    )}
                >
                    <div className="text-sm font-medium text-text-primary">
                        Allow anonymous usage data
                    </div>
                    <div className="mt-0.5 text-xs font-medium text-text-muted">
                        Never includes your code.
                    </div>
                </button>
                <button
                    type="button"
                    role="radio"
                    aria-checked={chosen && !enabled}
                    onClick={onDeny}
                    className={cn(
                        "w-full rounded-lg px-4 py-3  text-left transition-colors",
                        chosen && !enabled
                            ? "bg-surface-4"
                            : "bg-card ring-2 ring-border hover:bg-panel-hover",
                    )}
                >
                    <div className="text-sm font-medium text-text-primary">Don&apos;t share data</div>
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
            <h1 className="text-center text-xl font-medium text-text-primary">
                Notifications
            </h1>
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
        <div className="flex items-center gap-3 rounded-lg bg-surface-4 px-3 py-2.5">
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
            <div className="mt-6 flex justify-center">
                <ThemePicker value={theme} onChange={onChange} className="justify-center" />
            </div>
        </div>
    );
}

function KeybindsPanel({
    selected,
    onSelect,
}: {
    selected: KeybindingPresetId;
    onSelect: (id: KeybindingPresetId) => void;
}) {
    const presets = useMemo(() => listKeybindingPresets(), []);

    return (
        <div>
            <h1 className="text-center text-xl font-medium text-text-primary">
                Keyboard shortcuts
            </h1>
            <div className="mt-6 flex flex-col gap-2 p-1" role="radiogroup" aria-label="Keyboard shortcuts">
                {presets.map((p) => (
                    <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={selected === p.id}
                        onClick={() => onSelect(p.id)}
                        className={cn(
                            "w-full rounded-lg px-4 py-3 text-left transition-colors",
                            selected === p.id
                                ? "bg-surface-4"
                                : "bg-card ring-2 ring-border hover:bg-panel-hover",
                        )}
                    >
                        <div className="text-sm font-medium text-text-primary">{p.label}</div>
                    </button>
                ))}
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
    const { catalog } = useShapeCatalog();
    const models = useMemo(() => getCatalogModels().slice(0, 12), [catalog]);

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
            <div className="mt-6 flex flex-wrap justify-center gap-2">
                {models.map((model) => {
                    const on = isModelEnabled(model.id, enabledModels);
                    return (
                        <button
                            key={model.id}
                            type="button"
                            onClick={() => toggle(model.id)}
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                                on
                                    ? "border-accent bg-accent/15 text-text-primary"
                                    : "border-border-subtle bg-surface-2 text-text-muted hover:text-text-secondary",
                            )}
                        >
                            {providerIcon(model.id, 14)}
                            <span>{model.name}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
