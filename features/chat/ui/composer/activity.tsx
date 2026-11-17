"use client";

import { Checkmark20Regular } from "@fluentui/react-icons/headless/svg/checkmark";
import React from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type ComposerTaskItem = {
    id: string;
    label: string;
    status: "running" | "pending" | "done";
};

export type ComposerActivityItem = { kind: "task" } & ComposerTaskItem;

export function ComposerTasksStrip({ items }: { items: ComposerTaskItem[] }) {
    const [open, setOpen] = React.useState(false);
    const rootRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!open) return;
        const close = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [open]);

    if (items.length === 0) return null;

    const done = items.filter((item) => item.status === "done").length;
    const active = items.find((item) => item.status === "running")
        ?? items.find((item) => item.status === "pending")
        ?? items[items.length - 1];

    return (
        <div ref={rootRef} className="relative min-w-0">
            <button
                type="button"
                className="flex h-6 max-w-[220px] items-center gap-1.5 rounded-md px-1.5 text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                aria-expanded={open}
                aria-label="Tasks"
                onClick={() => setOpen((value) => !value)}
            >
                <TaskMark status={active.status} />
                <span className="truncate">{active.label}</span>
                <span className="tabular-nums text-xs text-text-muted">
                    {done}/{items.length}
                </span>
            </button>
            {open ? (
                <div className="absolute bottom-full left-0 z-50 mb-1.5 w-72 squircle-2xl border border-border-secondary bg-sidebar p-1.5 shadow-md">
                    {items.map((item) => (
                        <div key={item.id} className="flex min-h-8 items-center gap-2 squircle-xl px-2 py-1 text-sm">
                            <TaskMark status={item.status} />
                            <span
                                className={cn(
                                    "min-w-0 flex-1 truncate",
                                    item.status === "done" ? "text-text-muted line-through" : "text-text-primary",
                                )}
                            >
                                {item.label}
                            </span>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function TaskMark({ status }: { status: ComposerTaskItem["status"] }) {
    if (status === "running") {
        return (
            <span className="flex size-4 shrink-0 items-center justify-center">
                <span className="t-spin-check" data-state="spin">
                    <span className="t-spin-check__ring" />
                </span>
            </span>
        );
    }
    if (status === "done") {
        return (
            <span className="flex size-4 shrink-0 items-center justify-center">
                <Icon icon={Checkmark20Regular} className="icon-sm text-success" />
            </span>
        );
    }
    return (
        <span className="flex size-4 shrink-0 items-center justify-center">
            <span className="size-3.5 rounded-full border border-text-muted/55" />
        </span>
    );
}

export function ComposerActivityStrip({
    items,
}: {
    items: ComposerActivityItem[];
    onAnswerQuestion?: (answer: string) => void;
}) {
    const tasks = items
        .filter((i): i is Extract<ComposerActivityItem, { kind: "task" }> => i.kind === "task")
        .map(({ id, label, status }) => ({ id, label, status }));

    if (tasks.length === 0) return null;

    return <ComposerTasksStrip items={tasks} />;
}
