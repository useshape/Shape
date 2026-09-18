"use client";

import { cn } from "@/lib/utils";
import { projectGlyph } from "../lib/project-kind";

export function ProjectKindGlyph({
    path,
    className,
}: {
    path: string | null | undefined;
    className?: string;
}) {
    const glyph = projectGlyph(path);
    const Glyph = glyph.icon;
    return <Glyph className={cn("shrink-0", className)} style={{ color: glyph.color }} aria-hidden />;
}
