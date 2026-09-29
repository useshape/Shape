"use client";

import { useState, useSyncExternalStore } from "react";
import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { providerIcon } from "@/lib/ui/provider-icon";
import {
    getActiveWorkerId,
    getWorkers,
    openWorker,
    subscribeMultiwork,
    type MultiworkWorker,
} from "./session-store";

function statusTone(worker: MultiworkWorker): "live" | "review" | "done" | "error" {
    if (worker.status === "error") return "error";
    if (worker.column === "done") return "done";
    if (worker.column === "review") return "review";
    return "live";
}

function WorkerRow({ worker }: { worker: MultiworkWorker }) {
    const tone = statusTone(worker);
    return (
        <button
            type="button"
            onClick={() => openWorker(worker.id)}
            className={cn(
                "flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left",
                "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                "hover:bg-panel-hover",
            )}
        >
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-text-primary">{worker.title}</div>
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
                    {worker.model ? (
                        <span className="inline-flex shrink-0 items-center gap-1">
                            {providerIcon(worker.model, 12)}
                        </span>
                    ) : null}
                    <span className="min-w-0 truncate">{worker.activity || "Working…"}</span>
                </div>
            </div>
            <span
                className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    tone === "live" && "bg-accent",
                    tone === "review" && "bg-warning",
                    tone === "done" && "bg-success",
                    tone === "error" && "bg-error",
                )}
                aria-hidden
            />
        </button>
    );
}

/** Inline office panel for Multiwork — lives in the chat stream, not a separate board tab. */
export function MultiworkBoard({ className }: { className?: string }) {
    const workers = useSyncExternalStore(subscribeMultiwork, getWorkers, getWorkers);
    useSyncExternalStore(subscribeMultiwork, getActiveWorkerId, getActiveWorkerId);
    const [open, setOpen] = useState(true);

    if (workers.length === 0) return null;

    const live = workers.filter((w) => w.status === "running" || w.status === "pending").length;
    const title =
        workers.length === 1
            ? workers[0]!.title
            : `${workers.length} agents${live ? ` · ${live} running` : ""}`;

    return (
        <div
            className={cn(
                "my-2 w-full overflow-hidden rounded-xl border border-border-subtle bg-surface-3",
                className,
            )}
        >
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex h-chrome w-full items-center gap-2 px-3 text-left hover:bg-panel-hover"
            >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-secondary">
                    {title}
                </span>
                <Icon
                    icon={ChevronDown20Regular}
                    className={cn(
                        "size-icon-sm shrink-0 text-text-muted transition-transform duration-[var(--transition-fast)]",
                        !open && "-rotate-90",
                    )}
                />
            </button>
            {open ? (
                <div className="flex flex-col gap-0.5 border-t border-border-subtle px-1 py-1">
                    {workers.map((w) => (
                        <WorkerRow key={w.id} worker={w} />
                    ))}
                </div>
            ) : null}
        </div>
    );
}
