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

/** True when the Shape window is in the foreground (Tauri is reliable; document.focus is not in WebView2). */
export async function isAppFocused(): Promise<boolean> {
    try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        if (await getCurrentWindow().isFocused()) return true;
    } catch {
        /* web or unavailable */
    }
    if (typeof document === "undefined") return false;
    return !document.hidden && document.hasFocus();
}

/** OS desktop notification. Respects Settings → Notifications. Never toasts OS-side while Shape is focused. */
export async function showDesktopNotification(
    kind: DesktopNotificationKind,
    title: string,
    body: string,
): Promise<void> {
    if (!isKindEnabled(kind)) return;
    if (typeof window === "undefined") return;
    if (await isAppFocused()) return;

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
