"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { openSettingsWindow } from "@/lib/open-settings";
import { useShapeAuth } from "@/lib/shape-auth/store";
import { useGitHubAuth } from "@/lib/github-auth/store";
import { SHAPE_API_BASE } from "@/lib/shape-auth/api";
import { AccountMenu } from "./menu";
import {
    useNotifications,
    notificationStore,
    useUnreadNotificationCount,
} from "@/features/notifications";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";

function AccountAvatar({
    gitAvatarUrl,
    shapeUserId,
    offline,
    name,
}: {
    gitAvatarUrl: string | null;
    shapeUserId: string | null;
    offline: boolean;
    name: string;
}) {
    const [failed, setFailed] = useState(false);
    const imageSrc =
        gitAvatarUrl
        ?? (shapeUserId && !offline ? `${SHAPE_API_BASE}/api/avatar/${shapeUserId}` : null);

    if (!imageSrc || failed) return null;

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={imageSrc}
            alt={name}
            width={28}
            height={28}
            className="size-7 shrink-0 rounded-full object-cover"
            onError={() => setFailed(true)}
        />
    );
}

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
                    <Icon name="notifications" size={16} />
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
        (github.loggedIn && github.username ? github.username : null)
        ?? (auth.name && !/^n\/?a$/i.test(auth.name.trim()) ? auth.name.trim() : null)
        ?? "Sign in";

    return (
        <div className="flex h-10 items-center gap-1.5 px-2">
            <AccountAvatar
                gitAvatarUrl={github.loggedIn ? github.avatarUrl : null}
                shapeUserId={auth.userId}
                offline={Boolean(auth.offline)}
                name={displayName}
            />
            <AccountMenu>
                <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-sm text-text-primary"
                >
                    {displayName}
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
                <Icon name="settings" size={16} />
            </Button>
        </div>
    );
}
