"use client";

import { getSettings, subscribeSettings } from "@/lib/settings";
import { getShapeDeviceId } from "@/lib/device-id";
import { getShapeAccessToken } from "@/lib/shape-auth/store";
import { SHAPE_API_BASE } from "@/lib/shape-auth/api";
import {
  sanitizeError,
  sanitizeTelemetryProperties,
} from "@/lib/telemetry-sanitize";
import { isSuppressedRejection, isSuppressedWindowError } from "@/lib/editor/benign-errors";

async function telemetryFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = getShapeAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const deviceId = await getShapeDeviceId();
  if (deviceId) headers.set("X-Shape-Device-Id", deviceId);

  await fetch(`${SHAPE_API_BASE}/api/telemetry${path}`, {
    ...init,
    headers,
  }).catch(() => {
    /* best-effort */
  });
}

async function syncTelemetryOptIn(enabled: boolean) {
  const token = getShapeAccessToken();
  if (!token) return;
  try {
    await fetch(`${SHAPE_API_BASE}/api/account/telemetry`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ enabled }),
    });
  } catch {
    /* best-effort */
  }
}

let initialized = false;
let errorHandlersInstalled = false;

export async function applyTelemetryPreference(enabled: boolean) {
  void syncTelemetryOptIn(enabled);
}

export async function initTelemetry() {
  if (initialized) return;
  initialized = true;

  subscribeSettings(() => {
    void applyTelemetryPreference(getSettings().privacy.telemetryEnabled);
  });

  initErrorTelemetry();
}

export async function captureTelemetry(
  event: string,
  properties?: Record<string, unknown>,
) {
  if (!getSettings().privacy.telemetryEnabled) return;
  const safe = sanitizeTelemetryProperties(properties);
  await telemetryFetch("/events", {
    method: "POST",
    body: JSON.stringify({ event, properties: safe }),
  });
}

export async function captureTelemetryError(
  err: unknown,
  context?: Record<string, unknown>,
) {
  if (!getSettings().privacy.telemetryEnabled) return;
  await captureTelemetry("app_error", {
    ...sanitizeError(err),
    ...context,
  });
}

export async function identifyTelemetryUser(
  userId: string,
  properties?: Record<string, unknown>,
) {
  if (!getSettings().privacy.telemetryEnabled) return;
  const deviceId = await getShapeDeviceId();
  const safe = sanitizeTelemetryProperties(properties);
  await telemetryFetch("/identify", {
    method: "POST",
    body: JSON.stringify({ properties: safe, deviceId }),
  });
}

/** Global error + rejection capture — skips known benign IDE noise. */
export function initErrorTelemetry() {
  if (typeof window === "undefined" || errorHandlersInstalled) return;
  errorHandlersInstalled = true;

  window.addEventListener(
    "error",
    (event) => {
      if (isSuppressedWindowError(event)) return;
      void captureTelemetryError(event.error ?? event.message, {
        surface: "window",
        filename: event.filename ? event.filename.split("/").pop() : undefined,
        lineno: event.lineno || undefined,
      });
    },
    true,
  );

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      if (isSuppressedRejection(event.reason)) return;
      void captureTelemetryError(event.reason, { surface: "promise" });
    },
    true,
  );
}
