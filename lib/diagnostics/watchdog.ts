"use client";

import { commands } from "@/lib/backend";
import { getSettings, subscribeSettings } from "@/lib/settings";
import { isTauriRuntime } from "@/lib/window/tauri-window";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";
let started = false;

function beat() {
  void commands.diagnosticsHeartbeat(getSettings().privacy.telemetryEnabled, dsn).catch(() => undefined);
}

/** Local pulse so Rust can tell a frozen window from a quiet one. No network. */
export function startDiagnosticsWatchdog(): () => void {
  if (started || !isTauriRuntime()) return () => undefined;
  started = true;
  beat();
  const timer = window.setInterval(beat, 5000);
  const stop = subscribeSettings(beat);
  const onError = (event: ErrorEvent) => {
    const message = event.message || "window error";
    void commands.diagnosticsNote("ui", message).catch(() => undefined);
  };
  const onReject = (event: PromiseRejectionEvent) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "rejection");
    void commands.diagnosticsNote("ui", reason).catch(() => undefined);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onReject);
  return () => {
    window.clearInterval(timer);
    stop();
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onReject);
  };
}
