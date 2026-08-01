"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { SHAPE_API_BASE } from "@/lib/shape-auth/api";

export function ShapeAccountAvatar({
    userId,
    name,
    offline,
}: {
    userId: string;
    name: string | null;
    offline: boolean;
}) {
    const [failed, setFailed] = useState(false);
    const showImage = !offline && !failed;

    if (!showImage) {
        return <Icon name="expand_more" size={16} />;
    }

    return (
        <img
            src={`${SHAPE_API_BASE}/api/avatar/${userId}`}
            alt={name ?? "Account"}
            width={20}
            height={20}
            className="size-5 rounded-full object-cover"
            onError={() => setFailed(true)}
        />
    );
}
