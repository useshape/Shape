"use client";

import { RiUserLine } from "@remixicon/react";
import { useCallback, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { logoutShape, useShapeAuth } from "@/lib/cloud/store";
import { requestShapeLogin } from "@/features/workbench/ui/login-prompt-dialog";
import { logoutGitHub, useGitHubAuth } from "@/lib/github/store";
import { openSettingsWindow } from "@/lib/window/open-settings";
import { SHAPE_API_BASE } from "@/lib/cloud/api";
import { notify } from "@/features/notifications";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown";

export function ProfileAvatar({
    gitAvatarUrl,
    shapeUserId,
    offline,
    name,
    size = 28,
}: {
    gitAvatarUrl: string | null;
    shapeUserId: string | null;
    offline: boolean;
    name: string;
    size?: number;
}) {
    const [failed, setFailed] = useState(false);
    const imageSrc =
        gitAvatarUrl
        ?? (shapeUserId && !offline ? `${SHAPE_API_BASE}/api/avatar/${shapeUserId}` : null);

    if (!imageSrc || failed) {
        return (
            <span
                className="flex shrink-0 items-center justify-center rounded-full bg-panel-hover text-text-muted"
                style={{ width: size, height: size }}
            >
                <Icon icon={RiUserLine} size={Math.round(size * 0.55)} />
            </span>
        );
    }

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={imageSrc}
            alt={name}
            width={size}
            height={size}
            className="shrink-0 rounded-full object-cover"
            style={{ width: size, height: size }}
            onError={() => setFailed(true)}
        />
    );
}

async function checkForUpdates() {
    try {
        const { checkForAppUpdates } = await import("@/lib/updater");
        const status = await checkForAppUpdates({ force: true });
        if (status.kind === "available") {
            notify.info("Update available", `Shape ${status.version} is available.`);
        } else if (status.kind === "upToDate") {
            notify.success("You're on the latest version.");
        } else if (status.kind === "error") {
            notify.error("Check for updates", status.message);
        }
    } catch (error) {
        notify.error(
            "Check for updates",
            error instanceof Error ? error.message : String(error),
        );
    }
}

export function AccountMenu({ children }: { children: ReactNode }) {
    const shapeAuth = useShapeAuth();
    const githubAuth = useGitHubAuth();

    const signedIn = shapeAuth.loggedIn || githubAuth.loggedIn;
    const displayName =
        (shapeAuth.name && !/^n\/?a$/i.test(shapeAuth.name.trim()) ? shapeAuth.name.trim() : null)
        ?? (githubAuth.loggedIn && githubAuth.username ? githubAuth.username : null)
        ?? "Sign in";
    const email =
        shapeAuth.email?.trim()
        || (githubAuth.loggedIn && githubAuth.username ? `@${githubAuth.username}` : null)
        || "Not signed in";

    const handleSignOut = useCallback(async () => {
        if (shapeAuth.loggedIn) {
            await logoutShape();
            return;
        }
        if (githubAuth.loggedIn) {
            try {
                await logoutGitHub(githubAuth.username ?? undefined);
            } catch (error) {
                notify.error(
                    "Sign out failed",
                    error instanceof Error ? error.message : String(error),
                );
            }
        }
    }, [shapeAuth.loggedIn, githubAuth.loggedIn, githubAuth.username]);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-64">
                <div className="flex items-center gap-2.5 px-2 py-2">
                    <ProfileAvatar
                        gitAvatarUrl={githubAuth.loggedIn ? githubAuth.avatarUrl : null}
                        shapeUserId={shapeAuth.userId}
                        offline={Boolean(shapeAuth.offline)}
                        name={displayName}
                    />
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-text-primary">
                            {displayName}
                        </div>
                        <div className="truncate text-xs text-text-muted">{email}</div>
                    </div>
                </div>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={() => void openSettingsWindow()}>
                    Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => void openSettingsWindow({ category: "keyboard" })}
                >
                    Keyboard shortcuts
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void checkForUpdates()}>
                    Check for updates
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {signedIn ? (
                    <DropdownMenuItem onClick={() => void handleSignOut()}>
                        Sign out
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuItem onClick={() => requestShapeLogin()}>
                        Sign in
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
