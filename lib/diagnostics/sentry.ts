"use client";

import * as Sentry from "@sentry/react";
import { sentryBeforeSend } from "@/lib/diagnostics/scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

export function initDesktopSentry() {
  if (!dsn || typeof window === "undefined") return;
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SHAPE_RELEASE ?? `shape-desktop@${process.env.npm_package_version ?? "0"}`,
    initialScope: {
      tags: { source: "desktop" },
    },
    beforeSend(event) {
      event.tags = { ...event.tags, source: "desktop" };
      return sentryBeforeSend(event);
    },
  });
}

export function lastSentryEventId(): string | undefined {
  return Sentry.lastEventId();
}
