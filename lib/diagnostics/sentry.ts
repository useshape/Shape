"use client";

import * as Sentry from "@sentry/react";
import { sentryBeforeSend } from "@/lib/diagnostics/scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

function tracesSampler(ctx: { name?: string; inheritOrSampleWith: (rate: number) => number }) {
  const name = (ctx.name ?? "").toLowerCase();
  if (name.includes("/sentry-tunnel") || name.includes("/api/telemetry")) return 0;
  return ctx.inheritOrSampleWith(process.env.NODE_ENV === "production" ? 0.15 : 0.05);
}

export function initDesktopSentry() {
  if (!dsn || typeof window === "undefined") return;
  const production = process.env.NODE_ENV === "production";
  Sentry.init({
    dsn,
    debug: false,
    tracesSampler,
    replaysSessionSampleRate: production ? 0.25 : 0,
    replaysOnErrorSampleRate: 1,
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SHAPE_RELEASE ?? `shape-desktop@${process.env.npm_package_version ?? "0"}`,
    initialScope: {
      tags: { source: "desktop" },
    },
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
        networkCaptureBodies: false,
        networkDetailDenyUrls: [/\/api\/account/, /\/api\/auth/, /clerk/i],
      }),
    ],
    ignoreErrors: ["ResizeObserver loop", "AbortError", "Failed to fetch"],
    beforeSend(event) {
      event.tags = { ...event.tags, source: "desktop" };
      return sentryBeforeSend(event);
    },
  });
}

export function lastSentryEventId(): string | undefined {
  return Sentry.lastEventId();
}
