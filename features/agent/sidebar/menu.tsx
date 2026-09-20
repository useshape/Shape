"use client";

import { RiLoginBoxLine, RiLogoutBoxLine, RiUploadCloud2Fill, RiUserLine } from "@remixicon/react";
import { useCallback, useState, type ReactNode } from "react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { logoutShape, useShapeAuth } from "@/lib/cloud/store";
import { requestShapeLogin } from "@/features/agent/workbench/ui/login-prompt-dialog";
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
        const { checkForAppUpdates } = await import("@/lib/window/updater");
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

    const displayName =
        (shapeAuth.name && !/^n\/?a$/i.test(shapeAuth.name.trim()) ? shapeAuth.name.trim() : null)
        ?? (githubAuth.loggedIn && githubAuth.username ? githubAuth.username : null)
        ?? "Sign in";
    const email =
        shapeAuth.email?.trim()
        || (githubAuth.loggedIn && githubAuth.username ? `@${githubAuth.username}` : null)
        || "Not signed in";

    const handleGitHubLogout = useCallback(async () => {
        try {
            await logoutGitHub(githubAuth.username ?? undefined);
        } catch (error) {
            notify.error(
                "GitHub logout failed",
                error instanceof Error ? error.message : String(error),
            );
        }
    }, [githubAuth.username]);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-64">
                <div className="flex items-center gap-2.5 px-2 py-0.5">
                    <ProfileAvatar
                        size={18}
                        gitAvatarUrl={githubAuth.loggedIn ? githubAuth.avatarUrl : null}
                        shapeUserId={shapeAuth.userId}
                        offline={Boolean(shapeAuth.offline)}
                        name={displayName}
                    />
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-text-primary">
                            {displayName}
                        </div>
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
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer" onClick={() => void checkForUpdates()}>
                    <Icon icon={RiUploadCloud2Fill} size={ICON_SIZE_SM} />
                    Check for updates
                </DropdownMenuItem>

                {githubAuth.loggedIn ? (
                    <DropdownMenuItem
                        className="cursor-pointer"
                        onClick={() => void handleGitHubLogout()}
                    >
                        <Icon icon={RiLogoutBoxLine} size={ICON_SIZE_SM} />
                        Log out of GitHub
                    </DropdownMenuItem>
                ) : null}
                {shapeAuth.loggedIn ? (
                    <DropdownMenuItem
                        className="cursor-pointer text-danger hover:text-danger hover:bg-danger/10"
                        onClick={() => void logoutShape()}
                    >
                        <Icon icon={RiLogoutBoxLine} size={ICON_SIZE_SM} />
                        Sign out
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuItem onClick={() => requestShapeLogin()}>
                        <Icon icon={RiLoginBoxLine} size={ICON_SIZE_SM} />
                        Sign in
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
