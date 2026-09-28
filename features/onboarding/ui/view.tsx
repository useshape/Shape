"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useShapeAuth } from "@/lib/cloud/store";
import { markOnboardingComplete } from "@/features/onboarding/config";
import { updateSettingSection, useSettings } from "@/lib/settings";
import { applyTelemetryPreference } from "@/lib/telemetry";
import { ThemePicker } from "@/features/settings/ui/theme/picker";
import type { ColorThemeId } from "@/lib/settings/themes";
import { normalizeColorTheme } from "@/lib/settings/themes";
import { OnboardingWindowChrome } from "./window-chrome";
import { LoginPanel } from "./login-panel";
import { commands } from "@/lib/backend/commands";
import { Checkmark } from "@/components/ui/checkmark";
import {
    applyKeybindingPreset,
    getActiveKeybindingPreset,
    listKeybindingPresets,
    type KeybindingPresetId,
} from "@/lib/ui/shortcuts";

type Phase = "intro" | "login" | "shortcuts" | "ready";

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

    const [phase, setPhase] = useState<Phase>(loginOnly ? "login" : "intro");
    const [introVisible, setIntroVisible] = useState(false);
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

    useEffect(() => {
        setShortcutPreset(getActiveKeybindingPreset());
    }, []);

    useEffect(() => {
        if (loginOnly) return;
        const t1 = window.setTimeout(() => setIntroVisible(true), 40);
        const t2 = window.setTimeout(() => {
            setPhase(loggedInRef.current ? "shortcuts" : "login");
            setContentVisible(true);
        }, 900);
        return () => {
            window.clearTimeout(t1);
            window.clearTimeout(t2);
        };
    }, [loginOnly]);

    if (phase === "intro") {
        return (
            <div
                id="shape-onboarding"
                className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-text-primary select-none"
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
            className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-text-primary select-none"
        >
            <OnboardingWindowChrome />
            <div
                className={cn(
                    "flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-8 py-10 transition-opacity duration-500 ease-out",
                    contentVisible ? "opacity-100" : "opacity-0",
                )}
            >
                {phase === "login" ? (
                    <div className="flex w-full max-w-sm flex-col">
                        <h1 className="text-2xl font-medium tracking-tight text-text-primary">
                            Sign in to Shape
                        </h1>
                        <p className="mt-1 text-sm text-text-muted">
                            Sync your account, or skip and continue locally.
                        </p>
                        <div className="mt-6">
                            <LoginPanel
                                finishing={finishing}
                                onSignedIn={() => {
                                    if (loginOnly) void finishOnboarding(true);
                                    else setPhase("shortcuts");
                                }}
                            />
                        </div>
                        <div className="mt-4 flex gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                size="md"
                                disabled={finishing}
                                onClick={() => {
                                    if (loginOnly) void finishOnboarding(false);
                                    else setPhase("shortcuts");
                                }}
                            >
                                Skip for now
                            </Button>
                        </div>
                    </div>
                ) : null}

                {phase === "shortcuts" ? (
                    <div className="flex w-full max-w-md flex-col">
                        <h1 className="text-2xl font-medium tracking-tight text-text-primary">
                            Keyboard shortcuts
                        </h1>
                        <p className="mt-1 text-sm text-text-muted">
                            Pick the layout you already know.
                        </p>
                        <div className="mt-6 rounded-xl bg-surface-1 p-1">
                            {listKeybindingPresets().map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => choosePreset(preset.id)}
                                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-panel-hover"
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
                        <div className="mt-8 flex justify-end gap-2">
                            {!shapeAuth.loggedIn ? (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="md"
                                    onClick={() => setPhase("login")}
                                >
                                    Back
                                </Button>
                            ) : null}
                            <Button type="button" size="md" onClick={() => setPhase("ready")}>
                                Continue
                            </Button>
                        </div>
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
                        <h1 className="mt-4 text-center text-2xl font-medium tracking-tight text-text-primary">
                            You&apos;re all set!
                        </h1>
                        <p className="mt-1 text-center text-sm text-text-muted">
                            A few choices before you start building.
                        </p>

                        <div className="mt-6 flex w-full flex-col gap-3">
                            <div className="rounded-xl bg-surface-1 p-3">
                                <div className="text-sm font-medium text-text-primary">
                                    Customize appearance
                                </div>
                                <div className="mt-3">
                                    <ThemePicker
                                        value={theme}
                                        onChange={applyTheme}
                                        className="justify-start"
                                    />
                                </div>
                            </div>

                            <div className="rounded-xl bg-surface-1 p-1">
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={pinTaskbar}
                                    onClick={() => setPin(!pinTaskbar)}
                                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-panel-hover"
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
                                            Keep Shape one click away
                                        </div>
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={telemetryEnabled}
                                    onClick={() => setTelemetry(!telemetryEnabled)}
                                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-panel-hover"
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
                                            Anonymous usage data only
                                        </div>
                                    </div>
                                </button>
                            </div>
                        </div>

                        <div className="mt-8 flex items-center gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                size="md"
                                onClick={() => setPhase("shortcuts")}
                            >
                                Back
                            </Button>
                            <Button
                                type="button"
                                size="md"
                                disabled={finishing}
                                onClick={() => void finishOnboarding(false)}
                            >
                                Get started
                            </Button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
