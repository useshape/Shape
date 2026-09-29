"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { providerIcon } from "@/lib/ui/provider-icon";
import { ScrollArea } from "@/components/ui/scroll";
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

function WorkerCard({ worker, active }: { worker: MultiworkWorker; active: boolean }) {
    const tone = statusTone(worker);
    return (
        <button
            type="button"
            onClick={() => openWorker(worker.id)}
            className={cn(
                "flex w-full flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left",
                "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                active
                    ? "border-border-subtle bg-panel-active"
                    : "border-border-subtle bg-surface-1 hover:bg-panel-hover",
            )}
        >
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text-primary">
                        {worker.title}
                    </div>
                    {worker.task ? (
                        <div className="mt-0.5 line-clamp-2 text-xs text-text-muted">
                            {worker.task}
                        </div>
                    ) : null}
                </div>
                <span
                    className={cn(
                        "mt-1 size-2 shrink-0 rounded-full",
                        tone === "live" && "bg-accent",
                        tone === "review" && "bg-warning",
                        tone === "done" && "bg-success",
                        tone === "error" && "bg-error",
                    )}
                    aria-hidden
                />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
                <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-text-secondary">
                    Code
                </span>
                {worker.model ? (
                    <span className="inline-flex min-w-0 items-center gap-1 truncate">
                        {providerIcon(worker.model, 12)}
                        <span className="truncate">{worker.model}</span>
                    </span>
                ) : null}
            </div>
            <div className="truncate text-xs text-text-muted">
                {worker.activity || "Working…"}
            </div>
        </button>
    );
}

/** Right-side agents panel for Multiwork — organised by task, shows mode + model. */
export function MultiworkBoard({ className }: { className?: string }) {
    const workers = useSyncExternalStore(subscribeMultiwork, getWorkers, getWorkers);
    const activeId = useSyncExternalStore(subscribeMultiwork, getActiveWorkerId, getActiveWorkerId);

    if (workers.length === 0) {
        return (
            <aside
                className={cn(
                    "flex h-full w-[280px] shrink-0 flex-col border-l border-border-subtle bg-panel",
                    className,
                )}
            >
                <div className="flex h-[32px] shrink-0 items-center px-3">
                    <span className="text-sm font-medium text-text-muted">Agents</span>
                </div>
                <p className="px-3 text-sm text-text-muted">Workers appear here when spawned.</p>
            </aside>
        );
    }

    const live = workers.filter((w) => w.status === "running" || w.status === "pending").length;

    return (
        <aside
            className={cn(
                "flex h-full w-[280px] shrink-0 flex-col border-l border-border-subtle bg-panel",
                className,
            )}
        >
            <div className="flex h-[32px] shrink-0 items-center justify-between gap-2 px-3">
                <span className="text-sm font-medium text-text-muted">Agents</span>
                <span className="text-xs text-text-muted">
                    {workers.length}
                    {live ? ` · ${live} live` : ""}
                </span>
            </div>
            <ScrollArea fadeFrom="from-panel" className="min-h-0 flex-1 px-2 pb-3">
                <div className="flex flex-col gap-2">
                    {workers.map((w) => (
                        <WorkerCard key={w.id} worker={w} active={activeId === w.id} />
                    ))}
                </div>
            </ScrollArea>
        </aside>
    );
}
