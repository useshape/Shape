"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Titlebar } from "@/features/workbench";
import { loginShape, cancelLoginShape, useShapeAuth } from "@/lib/shape-auth/store";
import { markOnboardingComplete } from "@/features/onboarding/config";
import { updateSettingSection, useSettings } from "@/lib/settings";
import { normalizeColorTheme, type ColorThemeId } from "@/lib/themes";
import { applyTelemetryPreference } from "@/lib/telemetry";
import { ThemePicker } from "@/features/settings/ui/theme-picker";

type Phase = "intro" | "content";

const CONTENT_STEPS = 3;
const SECURITY_STEP = 1;
const LOGIN_STEP = 2;

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

export default function Onboarding() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [introVisible, setIntroVisible] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [telemetryEnabled, setTelemetryEnabled] = useState(false);
  const [securityAcknowledged, setSecurityAcknowledged] = useState(false);
  const shapeAuth = useShapeAuth();
  const settings = useSettings();
  const theme = normalizeColorTheme(settings.appearance?.colorTheme);

  const isSecurityStep = step === SECURITY_STEP;
  const isLoginStep = step === LOGIN_STEP;
  const canNext = !isSecurityStep || securityAcknowledged;

  const finishOnboarding = async () => {
    setFinishing(true);
    try {
      markOnboardingComplete();
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
    setStep((s) => Math.min(s + 1, CONTENT_STEPS - 1));
  };

  const goPrevious = () => setStep((s) => Math.max(s - 1, 0));

  const onToggleTelemetry = (enabled: boolean) => {
    setTelemetryEnabled(enabled);
    setSecurityAcknowledged(true);
    updateSettingSection("privacy", { telemetryEnabled: enabled });
    void applyTelemetryPreference(enabled);
  };

  const onThemeChange = (next: ColorThemeId) => {
    updateSettingSection("appearance", { colorTheme: next });
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
    }, 1200);

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
      setStep((s) => Math.min(s + 1, CONTENT_STEPS - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, isLoginStep, canNext]);

  if (phase === "intro") {
    return (
      <div
        id="shape-onboarding"
        className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-text-primary select-none"
      >
        <Titlebar onboarding />
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
      <Titlebar onboarding />

      <div
        className={clsx(
          "flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10 transition-opacity duration-500 ease-out custom-scrollbar",
          contentVisible ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="flex w-full max-w-95 flex-col">
          {isLoginStep ? (
            <LoginPanel
              finishing={finishing}
              onSignedIn={() => void finishOnboarding()}
              onSkip={() => void finishOnboarding()}
            />
          ) : isSecurityStep ? (
            <SecurityPanel checked={telemetryEnabled} onChange={onToggleTelemetry} />
          ) : (
            <ThemeStepPanel value={theme} onChange={onThemeChange} />
          )}

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
            {Array.from({ length: CONTENT_STEPS }).map((_, i) => (
              <span
                key={i}
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

function ThemeStepPanel({
  value,
  onChange,
}: {
  value: ColorThemeId;
  onChange: (theme: ColorThemeId) => void;
}) {
  return (
    <div>
      <h1 className="text-center text-xl font-medium tracking-tight text-text-primary">
        Pick a theme
      </h1>
      <p className="mt-1.5 text-center text-sm text-text-muted">
        Change this anytime in Settings.
      </p>
      <div className="mt-6">
        <ThemePicker value={value} onChange={onChange} />
      </div>
    </div>
  );
}

function SecurityPanel({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div>
      <h1 className="mt-4 text-center text-xl font-medium tracking-tight text-text-primary">
        Security &amp; data use
      </h1>
      <p className="mt-1.5 text-center text-sm leading-normal text-text-muted">
      Your code stays private and is only sent to the AI model you choose.

      </p>
      <div className="mt-6 flex items-start gap-3 rounded-xl border border-border p-2.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label="Share anonymous usage data"
          onClick={() => onChange(!checked)}
          className={clsx(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-md border transition-colors",
            checked
              ? "border-accent bg-accent text-accent-fg"
              : "border-text-muted/40 bg-transparent",
          )}
        >
          {checked ? <Icon name="check" size={10} /> : null}
        </button>
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className="flex-1 cursor-pointer text-left text-sm leading-snug text-text-secondary"
        >
          Share anonymous usage data to help improve Shape. Off by default.
        </button>
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
