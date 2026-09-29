"use client";

import { ArrowEnter20Regular } from "@fluentui/react-icons/headless/svg/arrow-enter";
import { ArrowExit20Regular } from "@fluentui/react-icons/headless/svg/arrow-exit";
import { Compose20Regular } from "@fluentui/react-icons/headless/svg/compose";
import { FolderOpen20Regular } from "@fluentui/react-icons/headless/svg/folder-open";
import { Open20Regular } from "@fluentui/react-icons/headless/svg/open";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";
import { Settings20Regular } from "@fluentui/react-icons/headless/svg/settings";

import { useCallback, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { logoutShape, useShapeAuth } from "@/lib/cloud/store";
import { requestShapeLogin } from "@/features/agent/workbench/ui/login-prompt-dialog";
import { useGitHubAuth } from "@/lib/github/store";
import { openSettingsWindow } from "@/lib/window/open-settings";
import { SHAPE_API_BASE, dashboardUrl } from "@/lib/cloud/api";
import { commands, useProjectState } from "@/lib/backend";
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

    if (!imageSrc || failed) return null;

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

export function AccountMenu({ children }: { children: ReactNode }) {
    const shapeAuth = useShapeAuth();
    const githubAuth = useGitHubAuth();
    const { project_path } = useProjectState();

    const displayName =
        (shapeAuth.name && !/^n\/?a$/i.test(shapeAuth.name.trim()) ? shapeAuth.name.trim() : null)
        ?? (githubAuth.loggedIn && githubAuth.username ? githubAuth.username : null)
        ?? "Sign in";

    const newChat = useCallback(() => {
        window.dispatchEvent(new Event("shape-chat-new"));
        window.dispatchEvent(new Event("shape-chat-focus-input"));
    }, []);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom" className="w-56">
                <div className="flex items-center gap-2.5 px-2 py-1.5">
                    <ProfileAvatar
                        size={22}
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
                        className="mx-1 mt-0.5 flex w-[calc(100%-0.5rem)] flex-col gap-0.5 rounded-lg bg-surface-2 px-2.5 py-2 text-left hover:bg-panel-hover"
                        onClick={() => void commands.openUrlExternal(`${dashboardUrl()}/settings/billing`)}
                    >
                        <span className="text-sm font-medium text-text-primary">Get Plus</span>
                        <span className="text-xs text-text-muted">Higher limits for this account</span>
                    </button>
                ) : null}

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void openSettingsWindow()}>
                    <Icon icon={Settings20Regular} />
                    Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => window.dispatchEvent(new Event("shape-open-project-pick"))}
                >
                    <Icon icon={FolderOpen20Regular} />
                    Open folder
                </DropdownMenuItem>
                {project_path ? (
                    <DropdownMenuItem onClick={() => void commands.revealPath(project_path)}>
                        <Icon icon={Open20Regular} />
                        Reveal in Explorer
                    </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                    onClick={() =>
                        window.dispatchEvent(
                            new CustomEvent("shape-command-palette", {
                                detail: { placeholder: "Search…" },
                            }),
                        )
                    }
                >
                    <Icon icon={Search20Regular} />
                    Search
                </DropdownMenuItem>
                <DropdownMenuItem onClick={newChat}>
                    <Icon icon={Compose20Regular} />
                    New chat
                </DropdownMenuItem>

                {shapeAuth.loggedIn ? (
                    <DropdownMenuItem
                        className="cursor-pointer text-danger hover:text-danger hover:bg-danger/10"
                        onClick={() => void logoutShape()}
                    >
                        <Icon icon={ArrowExit20Regular} />
                        Sign out
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuItem onClick={() => requestShapeLogin()}>
                        <Icon icon={ArrowEnter20Regular} />
                        Sign in
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
