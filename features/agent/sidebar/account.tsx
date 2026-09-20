"use client";

import { RiGitPullRequestLine, RiLoginBoxLine, RiSettings3Line } from "@remixicon/react";
import { Icon } from "@/components/ui/icon";
import { openSettingsWindow } from "@/lib/window/open-settings";
import { useShapeAuth } from "@/lib/cloud/store";
import { useGitHubAuth } from "@/lib/github/store";
import { requestShapeLogin } from "@/features/agent/workbench/ui/login-prompt-dialog";
import { AccountMenu, ProfileAvatar } from "./menu";
import { Button } from "@/components/ui/button";

export function AccountRow() {
    const auth = useShapeAuth();
    const github = useGitHubAuth();
    const signedIn =
        auth.loggedIn || github.loggedIn || Boolean(auth.accessToken);
    const resolving = auth.isLoading || Boolean(auth.revalidating);

    const displayName =
        (auth.name && !/^n\/?a$/i.test(auth.name.trim()) ? auth.name.trim() : null)
        ?? (github.loggedIn && github.username ? github.username : null)
        ?? "Account";

    return (
        <div className="flex h-10 items-center gap-1.5 px-2">
            {signedIn ? (
                <AccountMenu>
                    <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left hover:bg-panel-hover"
                    >
                        <ProfileAvatar
                            gitAvatarUrl={github.loggedIn ? github.avatarUrl : null}
                            shapeUserId={auth.userId}
                            offline={false}
                            name={displayName}
                            size={28}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                            {displayName}
                        </span>
                    </button>
                </AccountMenu>
            ) : resolving ? (
                <span className="min-w-0 flex-1 truncate px-1 text-sm text-text-muted">
                    Account
                </span>
            ) : (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => requestShapeLogin()}
                    className="size-7 shrink-0 text-text-muted hover:text-text-primary"
                    aria-label="Sign in"
                >
                    <Icon icon={RiLoginBoxLine} />
                </Button>
            )}
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => window.dispatchEvent(new Event("shape-open-pull-requests"))}
                className="size-7 shrink-0 text-text-muted hover:text-text-primary"
                aria-label="Pull requests"
            >
                <Icon icon={RiGitPullRequestLine} />
            </Button>
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
