"use client";

import { cn } from "@/lib/utils";
import { providerIcon } from "@/lib/ui/provider-icon";
import { formatMessageModelLabel } from "@/lib/usage-display";

/** Apple Messages–style bubble with optional curved tail. */
export function MsgBubble({
    side,
    hasTail = true,
    className,
    children,
}: {
    side: "sent" | "recv";
    hasTail?: boolean;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                "imsg-bubble",
                side === "sent" ? "imsg-bubble-sent" : "imsg-bubble-recv",
                hasTail && "has-tail",
                className,
            )}
        >
            {children}
        </div>
    );
}

/** Three-dot typing indicator for the AI bubble. */
export function TypingDots({ className }: { className?: string }) {
    return (
        <span className={cn("imsg-typing", className)} aria-label="Typing">
            <span />
            <span />
            <span />
        </span>
    );
}

/** Stack of provider icons (1 = single, 2+ = overlapping grid). */
export function ModelAvatarStack({
    models,
    size = 16,
    className,
}: {
    models: string[];
    size?: number;
    className?: string;
}) {
    const unique = [...new Set(models.filter(Boolean))];
    if (unique.length === 0) return null;

    if (unique.length === 1) {
        return (
            <span className={cn("inline-flex shrink-0 items-center justify-center", className)}>
                {providerIcon(unique[0]!, size)}
            </span>
        );
    }

    const shown = unique.slice(0, 4);
    const cell = Math.max(10, Math.round(size * 0.72));
    return (
        <span
            className={cn(
                "relative inline-grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-md bg-panel-hover p-px",
                className,
            )}
            style={{ width: size + 2, height: size + 2 }}
            title={unique.map((m) => formatMessageModelLabel(m)).join(", ")}
        >
            {shown.map((m) => (
                <span
                    key={m}
                    className="flex items-center justify-center overflow-hidden rounded-[3px] bg-surface-3"
                    style={{ width: cell, height: cell }}
                >
                    {providerIcon(m, Math.max(8, cell - 2))}
                </span>
            ))}
        </span>
    );
}

/** Compact mention / tool pill (Corpo-style). */
export function EntityPill({
    icon,
    label,
    className,
}: {
    icon?: React.ReactNode;
    label: string;
    className?: string;
}) {
    return (
        <span className={cn("wf-pill", className)}>
            {icon ? <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span> : null}
            <span className="truncate">{label}</span>
        </span>
    );
}
