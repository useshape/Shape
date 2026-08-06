"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SHAPE_API_BASE } from "@/lib/shape-auth/api";

/** Initials fallback when the avatar image is unavailable. */
export function accountInitials(name: string | null, email: string | null): string {
    const trimmedName = name?.trim();
    if (trimmedName && !/^n\/?a$/i.test(trimmedName)) {
        const words = trimmedName.split(/\s+/).filter(Boolean);
        if (words.length >= 2) {
            const first = words[0]![0] ?? "";
            const last = words[words.length - 1]![0] ?? "";
            return `${first}${last}`.toUpperCase();
        }
        const word = words[0] ?? "";
        if (word.length >= 2) return word.slice(0, 2).toUpperCase();
        if (word.length === 1) return word.toUpperCase();
    }

    const local = email?.trim().split("@")[0]?.replace(/[^a-zA-Z0-9]/g, "") ?? "";
    if (local.length >= 2) return local.slice(0, 2).toUpperCase();
    if (local.length === 1) return local.toUpperCase();
    return "?";
}

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
    const initials = accountInitials(name, email);

    if (showImage && userId) {
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

    return (
        <div
            className={cn(
                "flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-medium text-text-primary",
                className,
            )}
            style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
            aria-hidden
        >
            {initials}
        </div>
    );
}
