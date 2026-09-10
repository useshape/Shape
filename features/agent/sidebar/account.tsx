"use client";

import { RiNotification3Line, RiSettings3Line } from "@remixicon/react";
import { Icon } from "@/components/ui/icon";
import { openSettingsWindow } from "@/lib/window/open-settings";
import { useShapeAuth } from "@/lib/cloud/store";
import { useGitHubAuth } from "@/lib/github/store";
import { AccountMenu, ProfileAvatar } from "./menu";
import { Button } from "@/components/ui/button";
import {
    useNotifications,
    notificationStore,
    useUnreadNotificationCount,
} from "@/features/notifications";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";

function SidebarNotifications() {
    const { notifications } = useNotifications();
    const unreadCount = useUnreadNotificationCount();

    return (
        <DropdownMenu
            onOpenChange={(open) => {
                if (open) notificationStore.markViewed();
            }}
        >
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label="Notifications"
                    className="relative flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
                >
                    <Icon icon={RiNotification3Line} />
                    {unreadCount > 0 ? (
                        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 text-2xs font-medium text-accent-fg">
                            {Math.min(unreadCount, 99)}
                        </span>
                    ) : null}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
                <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-sm font-medium text-text-primary">Notifications</span>
                    {notifications.length > 0 ? (
                        <button
                            type="button"
                            className="text-xs text-text-muted hover:text-text-primary"
                            onClick={() => notificationStore.clearAll()}
                        >
                            Clear
                        </button>
                    ) : null}
                </div>
                {notifications.length === 0 ? (
                    <DropdownMenuItem disabled>No notifications</DropdownMenuItem>
                ) : (
                    [...notifications]
                        .reverse()
                        .slice(0, 20)
                        .map((n) => (
                            <DropdownMenuItem
                                key={n.id}
                                className="flex flex-col items-start gap-0.5 whitespace-normal py-2"
                                onSelect={(e) => e.preventDefault()}
                            >
                                <span className="text-sm text-text-primary">{n.message}</span>
                                {n.description ? (
                                    <span className="line-clamp-2 text-xs text-text-muted">
                                        {n.description}
                                    </span>
                                ) : null}
                            </DropdownMenuItem>
                        ))
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function AccountRow() {
    const auth = useShapeAuth();
    const github = useGitHubAuth();

    const displayName =
        (auth.name && !/^n\/?a$/i.test(auth.name.trim()) ? auth.name.trim() : null)
        ?? (github.loggedIn && github.username ? github.username : null)
        ?? "Sign in";

    return (
        <div className="flex h-10 items-center gap-1.5 px-2">
            <AccountMenu>
                <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left hover:bg-panel-hover"
                >
                    <ProfileAvatar
                        gitAvatarUrl={github.loggedIn ? github.avatarUrl : null}
                        shapeUserId={auth.userId}
                        offline={Boolean(auth.offline)}
                        name={displayName}
                        size={28}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                        {displayName}
                    </span>
                </button>
            </AccountMenu>
            <SidebarNotifications />
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void openSettingsWindow()}
                className="size-7 shrink-0 text-text-muted hover:text-text-primary"
                aria-label="Settings"
            >
                <Icon icon={RiSettings3Line} />
            </Button>
        </div>
    );
}
