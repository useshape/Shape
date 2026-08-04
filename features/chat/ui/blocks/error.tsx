"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { classifyAiError, errorDocsUrl } from "@/lib/errors/catalog";
import { commands } from "@/lib/backend";

export function ChatErrorCard({
  message,
  onDismiss,
  className,
}: {
  message: string;
  onDismiss?: () => void;
  className?: string;
}) {
  const entry = classifyAiError(message);
  const docsUrl = errorDocsUrl(entry.code);

  return (
    <div
      className={cn(
        "rounded-2xl border border-border px-3 py-3 text-sm",
        "animate-in fade-in zoom-in-95 duration-200",
        className,
      )}
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-error">{entry.title}</p>
          {entry.description ? (
            <p className="text-text-muted leading-relaxed">{entry.description}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5 text-xs text-text-muted">
            <span className="font-mono">Error {entry.code}</span>
            <button
              type="button"
              className="text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
              onClick={() => void commands.openUrlExternal(docsUrl)}
            >
              Learn more
            </button>
          </div>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-xs text-text-muted hover:text-foreground transition-colors"
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}
