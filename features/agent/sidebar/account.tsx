"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { openSettingsWindow } from "@/lib/open-settings";
import { useShapeAuth } from "@/lib/shape-auth/store";
import { useGitHubAuth } from "@/lib/github-auth/store";
import { SHAPE_API_BASE } from "@/lib/shape-auth/api";
import { AccountMenu } from "./menu";

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

export function AccountRow() {
    const auth = useShapeAuth();
    const github = useGitHubAuth();

    const displayName =
        (github.loggedIn && github.username ? github.username : null)
        ?? (auth.name && !/^n\/?a$/i.test(auth.name.trim()) ? auth.name.trim() : null)
        ?? "Sign in";

    return (
        <div className="flex items-center gap-2 px-2 py-1.5">
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
            <button
                type="button"
                onClick={() => void openSettingsWindow()}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
                aria-label="Settings"
            >
                <Icon name="settings" size={16} />
            </button>
        </div>
    );
}
