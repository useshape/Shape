"use client";

import { useState } from "react";
import { ShapeLogo } from "@/components/ui/shape-logo";
import { useSettings } from "@/lib/settings";
import { isShapePluginMeta, pluginLetter, pluginLogoCandidates } from "@/lib/plugin-logos";
import { cn } from "@/lib/utils";

export function PluginLogo({
    toolkit,
    name,
    logo,
    size = 32,
    className,
    slug,
}: {
    toolkit: string;
    name: string;
    logo?: string | null;
    size?: number;
    className?: string;
    slug?: string;
}) {
    const dark = useSettings().appearance.colorTheme !== "light";
    const [failedAt, setFailedAt] = useState(0);
    if (isShapePluginMeta(toolkit, slug)) {
        return <ShapeLogo size={size} className={className} />;
    }
    const candidates = pluginLogoCandidates(toolkit, dark, logo);
    const src = candidates[failedAt] ?? null;
    if (!src) {
        return (
            <div
                className={cn(
                    "flex shrink-0 items-center justify-center rounded-lg bg-accent/15 text-sm font-medium text-text-primary",
                    className,
                )}
                style={{ width: size, height: size }}
            >
                {pluginLetter(name)}
            </div>
        );
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt=""
            width={size}
            height={size}
            className={cn("shrink-0 rounded-lg object-contain", className)}
            style={{ width: size, height: size }}
            onError={() => setFailedAt((n) => n + 1)}
        />
    );
}
