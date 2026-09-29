"use client";

import { Globe20Regular } from "@fluentui/react-icons/headless/svg/globe";


import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";

import { faviconUrl, hostnameOf } from "@/lib/ui/favicon";
import { cn } from "@/lib/utils";

export function Favicon({
    url,
    src,
    size = 14,
    className,
}: {
    url: string;
    /** Icon address from the page itself, when the site published one. */
    src?: string | null;
    size?: number;
    className?: string;
}) {
    const host = hostnameOf(url);
    const chain = useMemo(() => {
        const list: string[] = [];
        if (src && /^(https?:|data:)/i.test(src)) list.push(src);
        if (host) list.push(`https://icons.duckduckgo.com/ip3/${host}.ico`);
        const google = faviconUrl(url || host, Math.max(size * 2, 32));
        if (google) list.push(google);
        return list;
    }, [host, size, src, url]);
    const [index, setIndex] = useState(0);
    useEffect(() => {
        setIndex(0);
    }, [chain]);

    const current = chain[index];
    if (!current) {
        return <Icon icon={Globe20Regular} className={cn("shrink-0 text-text-muted", className)} />;
    }

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={current}
            alt=""
            width={size}
            height={size}
            className={cn("shrink-0 rounded-sm object-contain", className)}
            onError={() => setIndex((i) => i + 1)}
        />
    );
}
