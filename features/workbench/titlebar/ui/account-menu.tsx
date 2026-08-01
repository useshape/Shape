"use client";

import Image from "next/image";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { commands } from "@/lib/backend";
import { HELP_LINKS } from "@/lib/help-links";
import { getShortcutForLabel } from "@/lib/ui/shortcuts";
import { loginShape, logoutShape, openShapeBilling, useShapeAuth } from "@/lib/shape-auth/store";
import { loginGitHub, logoutGitHub, useGitHubAuth } from "@/lib/github-auth/store";
import { openSettingsWindow } from "@/lib/open-settings";
import { notify } from "@/features/notifications";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuPortal,
    DropdownMenuSubContent,
    DropdownMenuShortcut,
} from "@/components/ui/dropdown";
import { useCallback, useMemo } from "react";

function formatAccountLabel(
    name: string | null,
    email: string | null,
    tier: string | null,
): string {
    const displayName = name?.trim() || "Shape";
    const emailPart = email?.trim() || "Not signed in";
    const tierPart = tier?.trim();
    return tierPart ? `${displayName} Account (${emailPart} - ${tierPart})` : `${displayName} Account (${emailPart})`;
}

export function AccountMenu() {
    const shapeAuth = useShapeAuth();
    const githubAuth = useGitHubAuth();

    const handleGitHubLogin = useCallback(async () => {
        try {
            const result = await loginGitHub();
            if (!result.success && result.error) {
                notify.error("GitHub sign-in failed", result.error);
            }
        } catch (error) {
            notify.error(
                "GitHub sign-in failed",
                error instanceof Error ? error.message : String(error),
            );
        }
    }, []);

    const handleGitHubLogout = useCallback(async () => {
        try {
            await logoutGitHub(githubAuth.username ?? undefined);
        } catch (error) {
            notify.error(
                "GitHub sign-out failed",
                error instanceof Error ? error.message : String(error),
            );
        }
    }, [githubAuth.username]);

    const handleViewGitHubAccount = useCallback(() => {
        if (!githubAuth.username) return;
        void commands.openUrlExternal(`https://github.com/${githubAuth.username}`);
    }, [githubAuth.username]);

    const accountLabel = useMemo(
        () =>
            shapeAuth.loggedIn
                ? formatAccountLabel(shapeAuth.name, shapeAuth.email, shapeAuth.tier)
                : "Shape Account (Not signed in)",
        [shapeAuth.loggedIn, shapeAuth.name, shapeAuth.email, shapeAuth.tier],
    );

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-text-muted">
                    <Icon name="expand_more" size={16} />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="mt-2 w-72">
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="truncate">
                        {accountLabel}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                            {shapeAuth.isLoggingIn ? (
                                <DropdownMenuItem disabled className="flex items-center gap-2">
                                    <Icon name="sync" size={14} className="shrink-0 animate-spin" />
                                    <span>Waiting for browser…</span>
                                </DropdownMenuItem>
                            ) : shapeAuth.loggedIn ? (
                                <>
                                    <DropdownMenuItem onClick={() => openShapeBilling()}>
                                        View Billing
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => void logoutShape()}>
                                        Logout
                                    </DropdownMenuItem>
                                </>
                            ) : (
                                <DropdownMenuItem onClick={() => void loginShape()}>
                                    Sign in to Shape
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                </DropdownMenuSub>

                <DropdownMenuItem onClick={() => void openSettingsWindow({ category: "account" })}>
                    Shape Settings
                    <DropdownMenuShortcut>{getShortcutForLabel("Settings")}</DropdownMenuShortcut>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={() => void openSettingsWindow()}>
                    Editor Settings
                    <DropdownMenuShortcut>{getShortcutForLabel("Settings")}</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() =>
                        window.dispatchEvent(new CustomEvent("shape-command-palette"))
                    }
                >
                    Command Palette
                    <DropdownMenuShortcut>{getShortcutForLabel("Command Palette...")}</DropdownMenuShortcut>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex items-center justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                            {githubAuth.avatarUrl ? (
                                <Image
                                    src={githubAuth.avatarUrl}
                                    alt="GitHub"
                                    width={14}
                                    height={14}
                                    className="shrink-0 rounded-full object-cover"
                                    unoptimized
                                />
                            ) : (
                                <Icon name="dependabot" size={14} className="shrink-0 text-text-muted" />
                            )}
                            <span className="truncate">
                                {githubAuth.loggedIn && githubAuth.username
                                    ? `@${githubAuth.username}`
                                    : "GitHub"}
                            </span>
                        </div>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                            {githubAuth.isLoggingIn ? (
                                <DropdownMenuItem disabled className="flex items-center gap-2">
                                    <Icon name="sync" size={14} className="shrink-0 animate-spin" />
                                    <span>Waiting for browser…</span>
                                </DropdownMenuItem>
                            ) : githubAuth.loggedIn ? (
                                <>
                                    <DropdownMenuItem onClick={handleViewGitHubAccount}>
                                        View Account
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => void handleGitHubLogout()}>
                                        Sign out of GitHub
                                    </DropdownMenuItem>
                                </>
                            ) : (
                                <DropdownMenuItem
                                    onClick={() => void handleGitHubLogin()}
                                    disabled={githubAuth.provider === "none"}
                                >
                                    Sign in with GitHub
                                </DropdownMenuItem>
                            )}
                            {githubAuth.error ? (
                                <DropdownMenuItem disabled className="whitespace-normal text-xs text-error">
                                    {githubAuth.error}
                                </DropdownMenuItem>
                            ) : null}
                            {githubAuth.provider === "none" && !githubAuth.isLoading ? (
                                <DropdownMenuItem disabled className="whitespace-normal text-xs text-text-muted">
                                    Install Git for Windows or GitHub CLI to sign in.
                                </DropdownMenuItem>
                            ) : null}
                        </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                </DropdownMenuSub>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={() => commands.openUrlExternal(HELP_LINKS.documentation)}>
                    Docs
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => commands.openUrlExternal(HELP_LINKS.changelog)}>
                    Changelog
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => commands.openUrlExternal(HELP_LINKS.reportIssue)}>
                    Report Issue
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
