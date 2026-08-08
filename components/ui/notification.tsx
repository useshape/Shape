"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { notificationStore, useNotifications, type Notification } from "@/features/notifications";
import { errorDocsUrl } from "@/lib/errors/catalog";
import { commands } from "@/lib/backend";

const TOAST_AUTO_HIDE_MS = 5500;
const TOAST_EXIT_MS = 160;

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

function openNotificationTarget(notification: Notification) {
    if (notification.code != null) {
        void commands.openUrlExternal(errorDocsUrl(notification.code));
        return;
    }
    if (notification.type === "error" || notification.type === "warning") {
        window.dispatchEvent(new Event("shape-open-problems"));
    }
}

function ToastCard({ notification }: { notification: Notification }) {
    const [leaving, setLeaving] = React.useState(false);
    const leavingRef = React.useRef(false);
    const autoHideMs = notification.autoHide === false ? null : TOAST_AUTO_HIDE_MS;

    const dismiss = React.useCallback(() => {
        if (leavingRef.current) return;
        leavingRef.current = true;
        setLeaving(true);
        window.setTimeout(() => {
            notificationStore.dismissToast(notification.id);
        }, TOAST_EXIT_MS);
    }, [notification.id]);

    React.useEffect(() => {
        if (!autoHideMs) return;
        const timer = window.setTimeout(dismiss, autoHideMs);
        return () => window.clearTimeout(timer);
    }, [autoHideMs, dismiss]);

    const line =
        notification.code != null
            ? `${notification.message} · Error ${notification.code}`
            : notification.message;
    const title = [notification.message, notification.description].filter(Boolean).join("\n");
    const clickable =
        notification.code != null ||
        notification.type === "error" ||
        notification.type === "warning";

    return (
        <div
            className={cn(
                "shape-toast pointer-events-auto flex h-8 w-full max-w-[360px] items-center gap-2 rounded-lg border border-border bg-panel px-2.5 shadow-lg",
                clickable && "cursor-pointer hover:bg-panel-hover",
            )}
            data-leaving={leaving ? "true" : undefined}
            role="status"
            aria-live="polite"
            title={title}
            onClick={clickable ? () => openNotificationTarget(notification) : undefined}
            onKeyDown={
                clickable
                    ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openNotificationTarget(notification);
                          }
                      }
                    : undefined
            }
            tabIndex={clickable ? 0 : undefined}
        >
            <Icon
                name={typeIcons[notification.type]}
                size={14}
                className={cn("shrink-0", typeIconColor[notification.type])}
            />
            <div className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">
                {line}
            </div>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    dismiss();
                }}
                className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:bg-panel-active hover:text-text-primary"
                aria-label="Dismiss notification"
            >
                <Icon name="close" size={12} />
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
        <div className="pointer-events-none fixed bottom-10 right-4 z-notification flex w-full max-w-[360px] flex-col gap-1.5 outline-none">
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
