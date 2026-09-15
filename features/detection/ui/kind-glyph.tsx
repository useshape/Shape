"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
    detectProjectKind,
    fallbackProjectKind,
    type ProjectKind,
} from "../lib/project-kind";

export function useProjectKind(path: string | null | undefined): ProjectKind {
    const [kind, setKind] = useState<ProjectKind>(fallbackProjectKind());
    useEffect(() => {
        let cancelled = false;
        void detectProjectKind(path).then((next) => {
            if (!cancelled) setKind(next);
        });
        return () => {
            cancelled = true;
        };
    }, [path]);
    return kind;
}

export function ProjectKindGlyph({
    path,
    className,
}: {
    path: string | null | undefined;
    className?: string;
}) {
    const kind = useProjectKind(path);
    if (kind.mark) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={`https://cdn.simpleicons.org/${kind.mark.slug}/${kind.mark.color}`}
                alt=""
                className={cn("shrink-0 object-contain", className)}
                draggable={false}
            />
        );
    }
    const Glyph = kind.icon;
    return <Glyph className={className} style={{ color: kind.color }} aria-hidden />;
}
