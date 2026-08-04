"use client";

import { getSettings } from "@/lib/settings";

export type DesktopNotificationKind = "generationComplete" | "approvalRequired";

function isKindEnabled(kind: DesktopNotificationKind): boolean {
    const n = getSettings().notifications;
    if (!n?.desktopEnabled) return false;
    if (kind === "generationComplete") return n.onGenerationComplete !== false;
    return n.onApprovalRequired !== false;
}

async function ensureTauriPermission(): Promise<boolean> {
    try {
        const {
            isPermissionGranted,
            requestPermission,
        } = await import("@tauri-apps/plugin-notification");
        if (await isPermissionGranted()) return true;
        return (await requestPermission()) === "granted";
    } catch {
        return false;
    }
}

/** Prefer native Tauri toasts; Web Notification is unreliable in WebView2. */
export async function ensureNotificationPermission(): Promise<boolean> {
    if (await ensureTauriPermission()) return true;

    if (typeof window === "undefined" || typeof Notification === "undefined") {
        return false;
    }
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    try {
        const result = await Notification.requestPermission();
        return result === "granted";
    } catch {
        return false;
    }
}

/** OS desktop notification. Respects Settings → Notifications. */
export async function showDesktopNotification(
    kind: DesktopNotificationKind,
    title: string,
    body: string,
): Promise<void> {
    if (!isKindEnabled(kind)) return;
    if (typeof window === "undefined") return;

    // Generation-done is most useful when Shape is in the background.
    if (kind === "generationComplete" && !document.hidden && document.hasFocus()) {
        return;
    }

    const cleanBody = body.replace(/\u2014/g, "-").replace(/\s+/g, " ").trim();
    const cleanTitle = title.trim() || "Shape";

    try {
        const { commands } = await import("@/lib/backend");
        await commands.showDesktopNotification(cleanTitle, cleanBody);
        return;
    } catch {
        /* fall through */
    }

    try {
        const {
            isPermissionGranted,
            requestPermission,
            sendNotification,
        } = await import("@tauri-apps/plugin-notification");
        let granted = await isPermissionGranted();
        if (!granted) {
            granted = (await requestPermission()) === "granted";
        }
        if (granted) {
            sendNotification({ title: cleanTitle, body: cleanBody });
        }
    } catch {
        /* ignore */
    }
}
