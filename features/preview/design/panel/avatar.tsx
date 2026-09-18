"use client";

import { useState } from "react";
import { SHAPE_API_BASE } from "@/lib/cloud/api";
import { useShapeAuth } from "@/lib/cloud/store";
import { useGitHubAuth } from "@/lib/github/store";

export function UserAvatar() {
    const auth = useShapeAuth();
    const github = useGitHubAuth();
    const [failed, setFailed] = useState(false);
    if (!auth.loggedIn || auth.offline || failed) return null;
    const src =
        (github.loggedIn && github.avatarUrl ? github.avatarUrl : null)
        ?? (auth.userId ? `${SHAPE_API_BASE}/api/avatar/${auth.userId}` : null);
    if (!src) return null;
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt=""
            className="size-5.5 rounded-full object-cover"
            onError={() => setFailed(true)}
        />
    );
}
