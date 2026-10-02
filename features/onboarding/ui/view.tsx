"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useShapeAuth } from "@/lib/cloud/store";
import { markOnboardingComplete } from "@/features/onboarding/config";
import { updateSettingSection, useSettings } from "@/lib/settings";
import { applyTelemetryPreference } from "@/lib/telemetry";
import { SettingSelect } from "@/features/settings/ui/shared/controls";
import type { ColorThemeId } from "@/lib/settings/themes";
import { COLOR_THEME_ORDER, COLOR_THEMES, normalizeColorTheme } from "@/lib/settings/themes";
import { OnboardingWindowChrome } from "./window-chrome";
import { LoginPanel } from "./login-panel";
import { OnboardingSplash } from "./splash";
import {
    MarketVisual,
    OnboardingHero,
    OnboardingNav,
    OnboardingPricing,
} from "./market";
import { commands } from "@/lib/backend/commands";
import { Checkmark } from "@/components/ui/checkmark";
import { SHAPE_API_BASE } from "@/lib/cloud/api";
import {
    applyKeybindingPreset,
    getActiveKeybindingPreset,
    listKeybindingPresets,
    type KeybindingPresetId,
} from "@/lib/ui/shortcuts";

type Phase =
    | "launch"
    | "login"
    | "multiwork"
    | "browser"
    | "pricing"
    | "shortcuts"
    | "ready";

const LAUNCH_MS = 10_000;

export default function Onboarding({
    embedded = false,
    loginOnly = false,
    onComplete,
}: {
    embedded?: boolean;
    loginOnly?: boolean;
    onComplete?: () => void;
}) {
    const shapeAuth = useShapeAuth();
    const loggedInRef = useRef(shapeAuth.loggedIn);
    loggedInRef.current = shapeAuth.loggedIn;

    const [phase, setPhase] = useState<Phase>(loginOnly ? "login" : "launch");
    const [contentVisible, setContentVisible] = useState(loginOnly);
    const [finishing, setFinishing] = useState(false);
    const [telemetryEnabled, setTelemetryEnabled] = useState(false);
    const [pinTaskbar, setPinTaskbar] = useState(false);
    const [shortcutPreset, setShortcutPreset] = useState<KeybindingPresetId | "custom">("default");
    const settings = useSettings();
    const [theme, setTheme] = useState<ColorThemeId>(() =>
        normalizeColorTheme(settings.appearance.colorTheme),
    );

    const finishOnboarding = async (requireLogin: boolean) => {
        if (requireLogin && !shapeAuth.loggedIn) return;
        setFinishing(true);
        try {
            if (!loginOnly) {
                updateSettingSection("appearance", { colorTheme: theme });
                updateSettingSection("privacy", { telemetryEnabled });
                void applyTelemetryPreference(telemetryEnabled);
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

    const applyTheme = (id: ColorThemeId) => {
        setTheme(id);
        updateSettingSection("appearance", { colorTheme: id });
    };

    const setTelemetry = (enabled: boolean) => {
        setTelemetryEnabled(enabled);
        updateSettingSection("privacy", { telemetryEnabled: enabled });
        void applyTelemetryPreference(enabled);
    };

    const setPin = (enabled: boolean) => {
        setPinTaskbar(enabled);
        if (enabled) void commands.pinToTaskbar().catch(() => {});
    };

    const choosePreset = (id: KeybindingPresetId) => {
        applyKeybindingPreset(id);
        setShortcutPreset(id);
    };

    const openSite = (path: string) => {
        const url = path.startsWith("http") ? path : `${SHAPE_API_BASE}${path}`;
        void commands.openUrlExternal(url).catch(() => {});
    };

    useEffect(() => {
        setShortcutPreset(getActiveKeybindingPreset());
    }, []);

    useEffect(() => {
        if (loginOnly) return;
        const t = window.setTimeout(() => {
            setPhase(loggedInRef.current ? "multiwork" : "login");
            setContentVisible(true);
        }, LAUNCH_MS);
        return () => window.clearTimeout(t);
    }, [loginOnly]);

    const shell = (child: ReactNode) => (
        <div
            id="shape-onboarding"
            className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-text-primary select-none"
        >
            <OnboardingWindowChrome />
            {child}
        </div>
    );

    if (phase === "launch") {
        return shell(<OnboardingSplash />);
    }

    return shell(
        <div
            className={cn(
                "flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-8 py-10 transition-opacity duration-500 ease-out",
                contentVisible ? "opacity-100" : "opacity-0",
            )}
        >
            {phase === "login" ? (
                <div className="flex w-full max-w-sm flex-col">
                    <OnboardingHero
                        title="Sign in to Shape"
                        subtitle="Sync your account, or skip and continue locally."
                    />
                    <LoginPanel
                        finishing={finishing}
                        onSignedIn={() => {
                            if (loginOnly) void finishOnboarding(true);
                            else setPhase("multiwork");
                        }}
                    />
                    <OnboardingNav
                        onSkip={() => {
                            if (loginOnly) void finishOnboarding(false);
                            else setPhase("multiwork");
                        }}
                        skipLabel="Skip for now"
                        onContinue={() => {
                            if (loginOnly) void finishOnboarding(Boolean(shapeAuth.loggedIn));
                            else setPhase("multiwork");
                        }}
                        disableContinue={finishing}
                    />
                </div>
            ) : null}

            {phase === "multiwork" ? (
                <div className="flex w-full max-w-lg flex-col">
                    <OnboardingHero title="Multiwork" subtitle="Several agents on one request." />
                    <MarketVisual
                        title="Multiwork"
                        subtitle="Split a job across workers."
                        image="/marketing/multiwork.png"
                    />
                    <OnboardingNav
                        onBack={() => setPhase("login")}
                        onSkip={() => setPhase("browser")}
                        onContinue={() => setPhase("browser")}
                    />
                </div>
            ) : null}

            {phase === "browser" ? (
                <div className="flex w-full max-w-lg flex-col">
                    <OnboardingHero title="Browser" subtitle="Open a page beside chat." />
                    <MarketVisual
                        title="In-app browser"
                        subtitle="The agent can read and click through."
                        image="/marketing/browser.png"
                    />
                    <OnboardingNav
                        onBack={() => setPhase("multiwork")}
                        onSkip={() => setPhase("pricing")}
                        onContinue={() => setPhase("pricing")}
                    />
                </div>
            ) : null}

            {phase === "pricing" ? (
                <div className="flex w-full max-w-lg flex-col">
                    <OnboardingHero
                        title="Pick a plan later"
                        subtitle="Free is enough to start. Plus and Pro add credits for the models you already know."
                    />
                    <OnboardingPricing onOpenSite={openSite} />
                    <OnboardingNav
                        onBack={() => setPhase("browser")}
                        onSkip={() => setPhase("shortcuts")}
                        onContinue={() => setPhase("shortcuts")}
                        continueLabel="Continue"
                    />
                </div>
            ) : null}

            {phase === "shortcuts" ? (
                <div className="flex w-full max-w-md flex-col">
                    <OnboardingHero
                        title="Keyboard shortcuts"
                        subtitle="Pick the layout you already know."
                    />
                    <div className="rounded-2xl bg-surface-1 p-1">
                        {listKeybindingPresets().map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                onClick={() => choosePreset(preset.id)}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-panel-hover"
                            >
                                <Checkmark
                                    checked={shortcutPreset === preset.id}
                                    onCheckedChange={() => choosePreset(preset.id)}
                                />
                                <span className="text-sm font-medium text-text-primary">
                                    {preset.label}
                                </span>
                            </button>
                        ))}
                    </div>
                    <OnboardingNav
                        onBack={() => setPhase("pricing")}
                        onContinue={() => setPhase("ready")}
                    />
                </div>
            ) : null}

            {phase === "ready" ? (
                <div className="flex w-full max-w-lg flex-col items-center">
                    <Image
                        src="/logos/logo.svg"
                        alt=""
                        width={28}
                        height={34}
                        style={{ width: 28, height: "auto" }}
                        className="logo-invert"
                    />
                    <h1 className="font-brand mt-4 text-center text-3xl font-medium tracking-tight text-text-primary">
                        You&apos;re all set
                    </h1>
                    <p className="mt-1 text-center text-sm text-text-muted">
                        A few choices before you start building.
                    </p>

                    <div className="mt-6 flex w-full flex-col gap-3">
                        <div className="flex items-center gap-4 rounded-2xl bg-surface-1 px-4 py-3">
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-text-primary">Theme</div>
                            </div>
                            <SettingSelect
                                value={theme}
                                options={COLOR_THEME_ORDER.map((id) => ({
                                    value: id,
                                    label: COLOR_THEMES[id].label,
                                }))}
                                onChange={applyTheme}
                            />
                        </div>

                        <div className="rounded-2xl bg-surface-1 p-1">
                            <button
                                type="button"
                                role="checkbox"
                                aria-checked={pinTaskbar}
                                onClick={() => setPin(!pinTaskbar)}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-panel-hover"
                            >
                                <Checkmark
                                    checked={pinTaskbar}
                                    onCheckedChange={(v) => setPin(v === true)}
                                />
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-text-primary">
                                        Pin to taskbar
                                    </div>
                                    <div className="text-xs text-text-muted">
                                        Keep Shape one click away. You can switch back anytime.
                                    </div>
                                </div>
                            </button>
                            <button
                                type="button"
                                role="checkbox"
                                aria-checked={telemetryEnabled}
                                onClick={() => setTelemetry(!telemetryEnabled)}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-panel-hover"
                            >
                                <Checkmark
                                    checked={telemetryEnabled}
                                    onCheckedChange={(v) => setTelemetry(v === true)}
                                />
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-text-primary">
                                        Help improve Shape
                                    </div>
                                    <div className="text-xs text-text-muted">
                                        Crash reports and anonymous usage. Password data stays local.
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="mt-8">
                        <Button
                            type="button"
                            size="md"
                            disabled={finishing}
                            onClick={() => void finishOnboarding(false)}
                        >
                            Get started
                        </Button>
                    </div>
                    <button
                        type="button"
                        className="mt-3 text-sm text-text-muted hover:text-text-primary"
                        onClick={() => setPhase("shortcuts")}
                    >
                        Back
                    </button>
                </div>
            ) : null}
        </div>,
    );
}
