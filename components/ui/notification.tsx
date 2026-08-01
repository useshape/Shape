"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { notificationStore, useNotifications, type Notification } from "@/features/notifications";
import { errorDocsUrl } from "@/lib/errors/catalog";
import { commands } from "@/lib/backend";

const typeIcons: Record<Notification["type"], string> = {
    info: "info",
    success: "check_circle",
    warning: "warning",
    error: "error",
};

const typeIconColor: Record<Notification["type"], string> = {
    info: "text-info",
    success: "text-success",
    warning: "text-warning",
    error: "text-error",
};

function ToastCard({ notification }: { notification: Notification }) {
    const autoHideMs = notification.autoHide === false ? null : 8000;

    React.useEffect(() => {
        if (!autoHideMs) return;
        const timer = window.setTimeout(() => {
            notificationStore.dismissToast(notification.id);
        }, autoHideMs);
        return () => window.clearTimeout(timer);
    }, [autoHideMs, notification.id]);

    const docsUrl = notification.code != null ? errorDocsUrl(notification.code) : null;

    return (
        <div
            className={cn(
                "pointer-events-auto flex w-full max-w-[380px] items-start gap-2.5 rounded-2xl border border-border bg-panel px-3 py-2.5 shadow-lg",
                "animate-in fade-in slide-in-from-bottom-2 duration-200",
            )}
            role="status"
            aria-live="polite"
        >
            <Icon
                name={typeIcons[notification.type]}
                size={16}
                className={cn("mt-0.5 shrink-0", typeIconColor[notification.type])}
            />
            <div className="min-w-0 flex-1 space-y-0.5">
                <div className="text-sm font-medium leading-snug text-text-primary">
                    {notification.message}
                </div>
                {notification.description ? (
                    <div className="whitespace-pre-wrap text-xs leading-relaxed text-text-secondary">
                        {notification.description}
                    </div>
                ) : null}
                {notification.code != null ? (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5 text-xs text-text-muted">
                        <span className="font-mono">Error {notification.code}</span>
                        {docsUrl ? (
                            <button
                                type="button"
                                className="text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
                                onClick={() => void commands.openUrlExternal(docsUrl)}
                            >
                                Learn more
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>
            <button
                type="button"
                onClick={() => notificationStore.dismissToast(notification.id)}
                className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:bg-panel-hover hover:text-text-primary"
                aria-label="Dismiss notification"
            >
                <Icon name="close" size={14} />
            </button>
        </div>
    );
}

function NotificationToasts() {
    const { notifications, toastIds } = useNotifications();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => setMounted(true), []);

    const toasts = toastIds
        .map((id) => notifications.find((n) => n.id === id))
        .filter((n): n is Notification => Boolean(n));

    if (!mounted || toasts.length === 0) return null;

    return createPortal(
        <div className="pointer-events-none fixed bottom-10 right-4 z-notification flex w-full max-w-[400px] flex-col gap-2 outline-none">
            {toasts.map((notification) => (
                <ToastCard key={notification.id} notification={notification} />
            ))}
        </div>,
        document.body,
    );
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}
            <NotificationToasts />
        </>
    );
}
