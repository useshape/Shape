"use client";

import { cn } from "@/lib/utils";
import { providerIcon } from "@/lib/ui/provider-icon";
import { formatMessageModelLabel, isAutoModelId } from "@/lib/chat/usage-display";

/** Model id used for Auto UI mark (backend still routes via MODEL_FAST). */
export const AUTO_DISPLAY_MODEL = "deepseek/deepseek-v4-flash";

/** Grey rounded card for user messages (no blue, no iMessage tail). */
export function UserMessageCard({
    className,
    children,
}: {
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                "relative max-w-[min(100%,36rem)] squircle-2xl bg-surface-3 p-3 chat-text text-text-primary",
                className,
            )}
        >
            {children}
        </div>
    );
}

/** Three-dot typing indicator (iMessage style). */
export function TypingDots({ className }: { className?: string }) {
    return (
        <span className={cn("imsg-typing", className)} aria-label="Typing">
            <span />
            <span />
            <span />
        </span>
    );
}

/** Compact working dots for sidebar / chat tabs. */
export function WorkingDots({ className }: { className?: string }) {
    return (
        <span className={cn("imsg-typing imsg-typing-sm", className)} aria-hidden>
            <span />
            <span />
            <span />
        </span>
    );
}

/** Stack of provider icons — Auto shows DeepSeek only (not a multi-grid). */
export function ModelAvatarStack({
    models,
    size = 16,
    className,
}: {
    models: string[];
    size?: number;
    className?: string;
}) {
    const raw = models.filter(Boolean);
    const isAuto = raw.length === 0 || raw.every((m) => isAutoModelId(m));
    const id = isAuto ? AUTO_DISPLAY_MODEL : raw[0]!;

    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center justify-center overflow-visible",
                className,
            )}
            title={isAuto ? "Auto" : formatMessageModelLabel(id)}
        >
            {providerIcon(id, size)}
        </span>
    );
}

/** Compact mention / tool pill. */
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
            {icon ? <span className="flex size-5 shrink-0 items-center justify-center">{icon}</span> : null}
            <span className="truncate">{label}</span>
        </span>
    );
}

/** @deprecated Use UserMessageCard */
export function MsgBubble({
    side,
    className,
    children,
}: {
    side: "sent" | "recv";
    hasTail?: boolean;
    className?: string;
    children: React.ReactNode;
}) {
    if (side === "sent") {
        return <UserMessageCard className={className}>{children}</UserMessageCard>;
    }
    return <div className={cn("chat-text! text-text-primary", className)}>{children}</div>;
}
