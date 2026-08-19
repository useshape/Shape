import { useSyncExternalStore } from "react";
import { formatCommandError } from "@/lib/format-error";

export type NotificationType = "info" | "warning" | "error" | "success";

export type NotifyOptions = {
    autoHide?: boolean;
    /** Numeric Shape error code, shown as "Error N" with a docs link. */
    code?: number;
};

export interface Notification {
    id: string;
    type: NotificationType;
    message: string;
    description?: string;
    timestamp: number;
    autoHide?: boolean;
    code?: number;
}

interface NotificationState {
    notifications: Notification[];
    toastIds: string[];
    lastViewedAt: number;
}

let state: NotificationState = {
    notifications: [],
    toastIds: [],
    lastViewedAt: Date.now(),
};

const listeners = new Set<() => void>();
const MAX_HISTORY = 50;
const MAX_TOASTS = 3;
/** Drop from the bell menu after this (toasts dismiss sooner via autoHide). */
const HISTORY_TTL_MS = 5 * 60 * 1000;

function pruneExpired(now = Date.now()): NotificationState {
    const notifications = state.notifications.filter(
        (n) => now - n.timestamp < HISTORY_TTL_MS,
    );
    const ids = new Set(notifications.map((n) => n.id));
    const toastIds = state.toastIds.filter((id) => ids.has(id));
    if (
        notifications.length === state.notifications.length
        && toastIds.length === state.toastIds.length
    ) {
        return state;
    }
    return { ...state, notifications, toastIds };
}

function emitChange() {
    listeners.forEach((listener) => listener());
}

export const notificationStore = {
    add: (
        message: string,
        type: NotificationType = "info",
        description?: string,
        options?: NotifyOptions,
    ) => {
        const id = Math.random().toString(36).substring(2, 9);
        const autoHide = options?.autoHide ?? true;
        const notification: Notification = {
            id,
            type,
            message,
            description,
            timestamp: Date.now(),
            autoHide,
            code: options?.code,
        };

        const pruned = pruneExpired();
        const notifications = [...pruned.notifications, notification].slice(-MAX_HISTORY);
        // Always show as a toast. autoHide defaults on; callers can pass autoHide: false to stick.
        const toastIds = [...pruned.toastIds, id].slice(-MAX_TOASTS);

        state = { notifications, toastIds, lastViewedAt: pruned.lastViewedAt };
        emitChange();
        return id;
    },

    remove: (id: string) => {
        state = {
            notifications: state.notifications.filter((n) => n.id !== id),
            toastIds: state.toastIds.filter((toastId) => toastId !== id),
            lastViewedAt: state.lastViewedAt,
        };
        emitChange();
    },

    dismissToast: (id: string) => {
        // Closing a toast also drops it from the bell history so items don't stick forever.
        state = {
            notifications: state.notifications.filter((n) => n.id !== id),
            toastIds: state.toastIds.filter((toastId) => toastId !== id),
            lastViewedAt: state.lastViewedAt,
        };
        emitChange();
    },

    clearAll: () => {
        state = {
            notifications: [],
            toastIds: [],
            lastViewedAt: Date.now(),
        };
        emitChange();
    },

    markViewed: () => {
        state = {
            ...pruneExpired(),
            lastViewedAt: Date.now(),
        };
        emitChange();
    },

    getUnreadCount: () => {
        state = pruneExpired();
        return state.notifications.filter((n) => n.timestamp > state.lastViewedAt).length;
    },

    subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },

    getSnapshot: () => state,
};

export function useNotifications() {
    return useSyncExternalStore(
        notificationStore.subscribe,
        notificationStore.getSnapshot,
        notificationStore.getSnapshot
    );
}

export function useUnreadNotificationCount(): number {
    return useSyncExternalStore(
        notificationStore.subscribe,
        () => notificationStore.getUnreadCount(),
        () => 0
    );
}

export function notifyGitError(raw: unknown, fallbackTitle = "Git Error") {
    const { title, message, hint } = formatCommandError(raw, fallbackTitle);
    const description = hint ? `${message}\n${hint}` : message;
    notificationStore.add(title, "error", description, {
        code: 4100,
    });
}

export const notify = {
    info: (message: string, description?: string, options?: NotifyOptions) =>
        notificationStore.add(message, "info", description, options),
    warn: (message: string, description?: string, options?: NotifyOptions) =>
        notificationStore.add(message, "warning", description, options),
    /** Alias for warn — callers often use notify.warning. */
    warning: (message: string, description?: string, options?: NotifyOptions) =>
        notificationStore.add(message, "warning", description, options),
    error: (message: string, description?: string, options?: NotifyOptions) =>
        notificationStore.add(message, "error", description, options),
    success: (message: string, description?: string, options?: NotifyOptions) =>
        notificationStore.add(message, "success", description, options),
    gitError: notifyGitError,
};
