"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SHAPE_API_BASE } from "@/lib/cloud/api";

export function ShapeAccountAvatar({
    userId,
    name,
    email = null,
    offline = false,
    size = 20,
    className,
}: {
    userId: string | null;
    name: string | null;
    email?: string | null;
    offline?: boolean;
    size?: number;
    className?: string;
}) {
    const [failed, setFailed] = useState(false);
    const showImage = Boolean(userId) && !offline && !failed;

    if (!showImage || !userId) return null;

    return (
        <img
            src={`${SHAPE_API_BASE}/api/avatar/${userId}`}
            alt={name ?? email ?? "Account"}
            width={size}
            height={size}
            className={cn("rounded-full object-cover", className)}
            style={{ width: size, height: size }}
            onError={() => setFailed(true)}
        />
    );
}
