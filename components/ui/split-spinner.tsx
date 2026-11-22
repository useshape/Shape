"use client";

import { cn } from "@/lib/utils";

/**
 * Split spinner from loading.dev, inlined. A dot splits in two and merges back.
 * Source: loading-dev Split (MIT), https://loading.dev/spinners/split
 */

const SPLIT_CSS = `
.ld-split-dot {
  transform-box: fill-box;
  transform-origin: center;
  animation: ld-split-part var(--ld-duration, 1400ms) cubic-bezier(0.65, 0, 0.35, 1) infinite;
  animation-play-state: var(--ld-play-state, running);
}
@keyframes ld-split-part {
  0%, 100% { translate: 0 0; scale: 1; }
  40%, 60% { translate: calc((var(--ld-step) * 2 - 1) * 5px) 0; scale: 0.65; }
}
@media (prefers-reduced-motion: reduce) {
  .ld-split-dot {
    animation: none;
    translate: calc((var(--ld-step) * 2 - 1) * 5px) 0;
    scale: 0.65;
  }
}
`;

export function SplitSpinner({
    size = 16,
    className,
}: {
    size?: number;
    className?: string;
}) {
    return (
        <>
            <style>{SPLIT_CSS}</style>
            <svg
                className={cn("ld-split", className)}
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
                role="presentation"
            >
                <circle className="ld-split-dot" cx="12" cy="12" r="4" style={{ ["--ld-step" as string]: 0 }} />
                <circle className="ld-split-dot" cx="12" cy="12" r="4" style={{ ["--ld-step" as string]: 1 }} />
            </svg>
        </>
    );
}
