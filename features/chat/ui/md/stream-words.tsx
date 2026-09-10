"use client";

/**
 * Legacy word-stream helpers — chat prose typing now lives in `view.tsx`
 * (`useRevealText`) so markdown re-parses don't reset the animation.
 * Kept as a no-op wrapper for any stray imports.
 */
export function StreamInline({
    children,
}: {
    children?: React.ReactNode;
    streaming?: boolean;
}) {
    return <>{children}</>;
}
