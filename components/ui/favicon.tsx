"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { faviconUrl, hostnameOf } from "@/lib/favicon";
import { cn } from "@/lib/utils";

export function Favicon({
    url,
    size = 14,
    className,
}: {
    url: string;
    size?: number;
    className?: string;
}) {
    const [failed, setFailed] = useState(false);
    const src = faviconUrl(url, Math.max(size * 2, 32));
    const host = hostnameOf(url);

    if (!src || failed || !host) {
        return <Icon name="public" size={size} className={cn("shrink-0 text-text-muted", className)} />;
    }

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt=""
            width={size}
            height={size}
            className={cn("shrink-0 rounded-sm object-contain", className)}
            onError={() => setFailed(true)}
        />
    );
}
