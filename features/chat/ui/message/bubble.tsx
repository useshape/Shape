"use client";

import { cn } from "@/lib/utils";
import { FrostMark } from "@/components/ui/frost-mark";
import { providerIcon } from "@/lib/ui/provider-icon";
import { formatMessageModelLabel, isAutoModelId } from "@/lib/chat/usage-display";

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
                "relative w-fit max-w-[min(100%,32rem)] squircle-2xl border border-border-subtle bg-surface-3 p-3 chat-text text-text-primary",
                className,
            )}
        >
            {children}
        </div>
    );
}

/** Frost face while the assistant is typing, with the chosen model in the corner. */
export function AssistantMark({
    model,
    size = 35,
    className,
}: {
    model?: string;
    size?: number;
    className?: string;
}) {
    const showModel = !!model && !isAutoModelId(model);
    const badge = Math.max(10, Math.round(size * 0.42));
    return (
        <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }} role="status" aria-label="Typing">
            <FrostMark size={size} live />
            {showModel ? (
                <span className="absolute -right-1 -bottom-1" style={{ width: badge, height: badge }}>
                    <span
                        className="absolute -inset-[3px] animate-spin rounded-full border-[1.5px] border-transparent border-t-accent border-r-accent/40"
                        aria-hidden
                    />
                    <span className="relative flex size-full items-center justify-center rounded-full bg-panel">
                        {providerIcon(model, Math.max(8, badge - 4))}
                    </span>
                </span>
            ) : null}
        </span>
    );
}

/** Circular spinner while the assistant is typing. */
export function TypingDots({ className, model }: { className?: string; model?: string }) {
    return <AssistantMark model={model} size={56} className={className} />;
}

/** Compact spinner for sidebar / chat tabs. */
export function WorkingDots({ className }: { className?: string }) {
    return <FrostMark size={22} live className={className} label="" />;
}

/** Model mark. Auto uses the frost face. */
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
    const id = isAuto ? "auto" : raw[0]!;

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
        <span className={cn("inline-flex max-w-full items-center gap-1.5 chat-text text-text-muted", className)}>
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
