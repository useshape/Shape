"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getFolderIconPath, getIconPath, isDocumentLightTheme } from "@/lib/ui/icons/files";

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
    const [light, setLight] = useState(false);

    useEffect(() => {
        const sync = () => setLight(isDocumentLightTheme());
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "data-theme", "style"],
        });
        return () => observer.disconnect();
    }, []);

    if (isDir) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={getFolderIconPath(name, isOpen, light)}
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
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={getIconPath(name, light)}
            alt=""
            width={16}
            height={16}
            loading="eager"
            decoding="async"
            className={cn("h-4 w-4 shrink-0", className)}
        />
    );
}
