"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { notificationStore, useNotifications, type Notification } from "@/features/notifications";
import { errorDocsUrl } from "@/lib/errors/catalog";
import { commands } from "@/lib/backend";
import { Button } from "./button";

export const TOAST_AUTO_HIDE_MS = 5500;
const TOAST_EXIT_MS = 380;
/** Sit above the 33px status bar, horizontally centered. */
export const TOAST_STACK_CLASS =
    "pointer-events-none fixed inset-x-0 bottom-[calc(var(--statusbar-height)+12px)] z-notification flex justify-center px-4 outline-none";

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

function runNotificationAction(notification: Notification, actionId: string) {
    const action = notification.actions?.find((a) => a.id === actionId);
    if (!action) return;
    try {
        action.onClick();
    } finally {
        notificationStore.remove(notification.id);
    }
}

function ToastCard({
    notification,
    stackIndex,
    stackCount,
    leaving,
    onDismiss,
}: {
    notification: Notification;
    stackIndex: number;
    stackCount: number;
    leaving: boolean;
    onDismiss: () => void;
}) {
    const requireAction = Boolean(notification.requireAction);
    const autoHideMs = requireAction || notification.autoHide === false ? null : TOAST_AUTO_HIDE_MS;
    const fromFront = stackCount - 1 - stackIndex;
    const isFront = fromFront === 0;
    const [entered, setEntered] = React.useState(false);
    const hasActions = (notification.actions?.length ?? 0) > 0;

    React.useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => setEntered(true));
        });
        return () => window.cancelAnimationFrame(frame);
    }, []);

    React.useEffect(() => {
        if (!autoHideMs || !isFront) return;
        const timer = window.setTimeout(onDismiss, autoHideMs);
        return () => window.clearTimeout(timer);
    }, [autoHideMs, isFront, onDismiss]);

    const clickable =
        !hasActions &&
        (notification.code != null ||
            notification.type === "error" ||
            notification.type === "warning");

    return (
        <div
            className={cn(
                "shape-toast pointer-events-auto absolute inset-x-0 bottom-0 min-h-[72px] w-full origin-bottom rounded-xl border border-border-subtle bg-surface-3 p-3 text-left",
                clickable && "cursor-pointer",
            )}
            data-mounted={entered ? "true" : undefined}
            data-leaving={leaving && isFront ? "true" : undefined}
            role={requireAction ? "alertdialog" : "status"}
            aria-live="polite"
            aria-modal={requireAction ? true : undefined}
            style={{
                zIndex: stackIndex + 1,
                pointerEvents: isFront ? "auto" : "none",
                ["--toast-y" as string]: `${-fromFront * 10}px`,
                ["--toast-scale" as string]: String(Math.max(0.85, 1 - fromFront * 0.06)),
                ["--toast-opacity" as string]: fromFront > 2 ? "0" : "1",
            }}
            title={[notification.message, notification.description].filter(Boolean).join("\n")}
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
            <div className="flex items-start gap-3">
                <div
                    className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-4",
                        typeIconColor[notification.type],
                    )}
                >
                    <Icon name={typeIcons[notification.type]} size={16} />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                    <div className="text-md font-medium leading-snug text-text-primary">
                        {notification.message}
                        {notification.code != null ? (
                            <span className="ml-1 font-medium text-text-secondary">· Error {notification.code}</span>
                        ) : null}
                    </div>
                    {notification.description ? (
                        <div className="mt-0.5 line-clamp-3 text-sm leading-snug text-text-secondary">
                            {notification.description}
                        </div>
                    ) : null}
                    {hasActions ? (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            {notification.actions!.map((action) => (
                                <Button
                                    key={action.id}
                                    type="button"
                                    size="xs"
                                    variant={action.variant ?? "secondary"}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        runNotificationAction(notification, action.id);
                                    }}
                                >
                                    {action.label}
                                </Button>
                            ))}
                        </div>
                    ) : null}
                </div>
                {!requireAction ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDismiss();
                        }}
                        aria-label="Dismiss notification"
                    >
                        <Icon name="close" size={14} />
                    </Button>
                ) : null}
            </div>
        </div>
    );
}

export function NotificationToasts() {
    const { notifications, toastIds } = useNotifications();
    const [mounted, setMounted] = React.useState(false);
    const [leavingId, setLeavingId] = React.useState<string | null>(null);

    React.useEffect(() => setMounted(true), []);

    const toasts = toastIds
        .map((id) => notifications.find((n) => n.id === id))
        .filter((n): n is Notification => Boolean(n));

    const dismiss = React.useCallback((id: string) => {
        const target = notifications.find((n) => n.id === id);
        if (target?.requireAction) return;
        setLeavingId(id);
        window.setTimeout(() => {
            notificationStore.dismissToast(id);
            setLeavingId((cur) => (cur === id ? null : cur));
        }, TOAST_EXIT_MS);
    }, [notifications]);

    if (!mounted || toasts.length === 0) return null;

    const hasActionToast = toasts.some((t) => (t.actions?.length ?? 0) > 0);
    const stackHeight = (hasActionToast ? 118 : 88) + Math.max(0, toasts.length - 1) * 8;

    return createPortal(
        <div className={TOAST_STACK_CLASS} data-toast-stack="">
            <div className="relative w-full max-w-[380px]" style={{ height: stackHeight }}>
                {toasts.map((notification, index) => (
                    <ToastCard
                        key={notification.id}
                        notification={notification}
                        stackIndex={index}
                        stackCount={toasts.length}
                        leaving={leavingId === notification.id}
                        onDismiss={() => dismiss(notification.id)}
                    />
                ))}
            </div>
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
