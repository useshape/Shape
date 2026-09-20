"use client";

import { RiCheckboxCircleFill, RiCloseCircleFill, RiErrorWarningFill, RiInformationLine, RiNotification3Fill } from "@remixicon/react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import {
    useNotifications,
    notificationStore,
    useUnreadNotificationCount,
} from "@/features/notifications";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

export function NotificationsMenu() {
    const { notifications } = useNotifications();
    const unreadCount = useUnreadNotificationCount();

    // Drop expired entries when the menu opens so the list doesn't grow forever.
    const handleOpenChange = (open: boolean) => {
        if (open) notificationStore.markViewed();
    };

    return (
        <DropdownMenu onOpenChange={handleOpenChange}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="relative h-full px-2 shrink-0 text-text-muted hover:text-text-primary"
                >
                    <Icon icon={RiNotification3Fill} />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-accent px-1 text-2xs font-medium text-accent-fg">
                            {Math.min(unreadCount, 99)}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[360px]">
                <DropdownMenuItem disabled className="text-sm text-text-muted">
                    Notifications
                </DropdownMenuItem>
                {notifications.length === 0 ? (
                    <DropdownMenuItem disabled>No notifications</DropdownMenuItem>
                ) : (
                    [...notifications].reverse().slice(0, 20).map((notification) => (
                        <DropdownMenuItem
                            key={notification.id}
                            className="flex flex-col items-start gap-1 py-2 whitespace-normal"
                            onSelect={(e) => e.preventDefault()}
                        >
                            <div className="flex w-full items-start gap-2">
                                <Icon
                                    icon={
                                        notification.type === "error"
                                            ? RiCloseCircleFill
                                            : notification.type === "warning"
                                                ? RiErrorWarningFill
                                                : notification.type === "success"
                                                    ? RiCheckboxCircleFill
                                                    : RiInformationLine
                                    }
                                    className={cn(
                                        "mt-0.5 shrink-0",
                                        notification.type === "error" && "text-error",
                                        notification.type === "warning" && "text-warning",
                                        notification.type === "success" && "text-success",
                                        notification.type === "info" && "text-info",
                                    )}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm text-text-primary">{notification.message}</div>
                                    {notification.description && (
                                        <div className="mt-0.5 space-y-0.5">
                                            {notification.description.split(/\n/).map((line, i) => (
                                                <div
                                                    key={i}
                                                    className={cn(
                                                        "text-xs wrap-break-word",
                                                        i === 0
                                                            ? "text-text-secondary"
                                                            : "text-text-muted line-clamp-2",
                                                    )}
                                                >
                                                    {line}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <CopyButton
                                text={[notification.message, notification.description]
                                    .filter(Boolean)
                                    .join("\n")}
                            />
                        </DropdownMenuItem>
                    ))
                )}
                {notifications.length > 0 && (
                    <DropdownMenuItem onClick={() => notificationStore.clearAll()}>
                        Clear All
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
