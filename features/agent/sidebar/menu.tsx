"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { logoutShape, useShapeAuth } from "@/lib/cloud/store";
import { requestShapeLogin } from "@/features/agent/workbench/ui/login-prompt-dialog";
import { logoutGitHub, loginGitHub, useGitHubAuth } from "@/lib/github/store";
import { openSettingsWindow } from "@/lib/window/open-settings";
import { SHAPE_API_BASE, dashboardUrl } from "@/lib/cloud/api";
import { commands } from "@/lib/backend/commands";
import { notify } from "@/features/notifications";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
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
        return null;
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

                {shapeAuth.loggedIn && !shapeAuth.offline && shapeAuth.tier === "free" ? (
                    <button
                        type="button"
                        className="mx-1 mt-1 flex w-[calc(100%-0.5rem)] flex-col gap-0.5 rounded-lg bg-surface-2 px-2.5 py-2 text-left hover:bg-panel-hover"
                        onClick={() => void commands.openUrlExternal(`${dashboardUrl()}/settings/billing`)}
                    >
                        <span className="text-sm font-medium text-text-primary">Get Plus</span>
                        <span className="text-xs text-text-muted">Higher limits for this account</span>
                    </button>
                ) : null}

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
                    <Icon icon={"cloud-upload"} size={ICON_SIZE_SM} />
                    Check for updates
                </DropdownMenuItem>

                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer">
                        <Icon icon={"code-square"} size={ICON_SIZE_SM} />
                        GitHub
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                        {githubAuth.loggedIn ? (
                            <>
                                <div className="flex items-center gap-2 px-2 py-1.5">
                                    {githubAuth.avatarUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={githubAuth.avatarUrl}
                                            alt=""
                                            className="size-6 shrink-0 rounded-full object-cover"
                                        />
                                    ) : null}
                                    <span className="min-w-0 truncate text-sm font-medium text-text-primary">
                                        {githubAuth.username || "GitHub"}
                                    </span>
                                </div>
                                <DropdownMenuItem
                                    className="cursor-pointer"
                                    onClick={() => void handleGitHubLogout()}
                                >
                                    <Icon icon={"logout"} size={ICON_SIZE_SM} />
                                    Log out
                                </DropdownMenuItem>
                            </>
                        ) : (
                            <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => void loginGitHub()}
                            >
                                <Icon icon={"login"} size={ICON_SIZE_SM} />
                                Log in
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
                {shapeAuth.loggedIn ? (
                    <DropdownMenuItem
                        className="cursor-pointer text-danger hover:text-danger hover:bg-danger/10"
                        onClick={() => void logoutShape()}
                    >
                        <Icon icon={"logout"} size={ICON_SIZE_SM} />
                        Sign out
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuItem onClick={() => requestShapeLogin()}>
                        <Icon icon={"login"} size={ICON_SIZE_SM} />
                        Sign in
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
