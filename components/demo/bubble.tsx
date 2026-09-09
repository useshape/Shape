"use client";

import { cn } from "@/lib/utils";

/* Copied from shape/features/chat/ui/message/bubble.tsx */

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
        "relative max-w-[min(100%,36rem)] rounded-2xl bg-surface-3 px-3.5 py-2.5 chat-text text-text-primary",
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
