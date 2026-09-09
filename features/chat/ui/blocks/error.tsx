"use client";

import { RiCloseCircleLine, RiCloseLine, RiErrorWarningLine } from "@remixicon/react";
import React from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { classifyAiError, errorDocsUrl } from "@/lib/errors/catalog";
import { commands } from "@/lib/backend";

export function ChatErrorCard({
  message,
  onDismiss,
  onRetry,
  className,
}: {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
}) {
  const entry = classifyAiError(message);
  const docsUrl = errorDocsUrl(entry.code);
  const isModelBusy = /model_busy|model is busy|high\s*(load|demand)/i.test(message);
  const isTransient =
    entry.code === 2100
    || /rate\s*limit/i.test(message)
    || isModelBusy
    || /too many requests/i.test(message);

  const retryAfterSec = (() => {
    const m =
      message.match(/retry(?:\s*after)?[:\s]+(\d+)\s*s/i)
      || message.match(/"retryAfterMs"\s*:\s*(\d+)/i);
    if (!m) return null;
    const raw = Number(m[1]);
    if (!Number.isFinite(raw)) return null;
    // retryAfterMs values are large; seconds are small.
    return raw > 120 ? Math.ceil(raw / 1000) : raw;
  })();

  const title = isTransient
    ? isModelBusy
      ? "Model busy"
      : "Rate limited"
    : entry.title;

  const hint = isTransient
    ? retryAfterSec
      ? `Try again in about ${retryAfterSec}s, or switch models.`
      : isModelBusy
        ? "This model is under heavy load. Wait a moment or switch models."
        : "Try again or switch models."
    : entry.description;

  return (
    <div
      className={cn(
        "rounded-xl border border-border-subtle bg-surface-3 px-3 py-2.5 text-sm shadow-sm",
        "animate-in fade-in slide-in-from-bottom-1 duration-200",
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <Icon
          icon={isTransient ? RiErrorWarningLine : RiCloseCircleLine}
          className={cn("mt-0.5 shrink-0", isTransient ? "text-warn" : "text-error")}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-text-primary">{title}</p>
          {hint ? (
            <p className="text-text-muted leading-snug">{hint}</p>
          ) : null}
          {!isTransient ? (
            <button
              type="button"
              className="text-xs text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
              onClick={() => void commands.openUrlExternal(docsUrl)}
            >
              Learn more
            </button>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md bg-panel-hover px-2 py-1 text-xs font-medium text-text-primary hover:bg-surface-2"
            >
              Try again
            </button>
          ) : null}
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded p-1 text-text-muted hover:bg-panel-hover hover:text-text-primary"
              aria-label="Dismiss"
            >
              <Icon icon={RiCloseLine} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
