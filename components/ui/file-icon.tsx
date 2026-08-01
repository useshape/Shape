"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getFolderIconPath, getIconPath } from "@/lib/ui/icons/files";

export function FileIcon({
    name,
    isDir = false,
    isOpen = false,
    className,
}: {
    name: string;
    isDir?: boolean;
    isOpen?: boolean;
    className?: string;
}) {
    const [, setTick] = useState(0);

    useEffect(() => {
        const observer = new MutationObserver(() => setTick(t => t + 1));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    if (isDir) {
        return (
            <img
                src={getFolderIconPath(name, isOpen)}
                alt=""
                width={16}
                height={16}
                loading="eager"
                decoding="async"
                className={cn("h-4 w-4 shrink-0", className)}
            />
        );
    }

    return (
        <img
            src={getIconPath(name)}
            alt=""
            width={16}
            height={16}
            loading="eager"
            decoding="async"
            className={cn("h-4 w-4 shrink-0", className)}
        />
    );
}
