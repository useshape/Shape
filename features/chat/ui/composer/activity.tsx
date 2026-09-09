"use client";

import { RiCheckLine } from "@remixicon/react";
import React from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { MorphMenu } from "@/components/ui/morph-menu";

export type ComposerTaskItem = {
    id: string;
    label: string;
    status: "running" | "pending" | "done";
};

export type ComposerActivityItem = { kind: "task" } & ComposerTaskItem;

/** Composer pill for live todos — shows the active step (with spinner), not "Continue Working". */
export function ComposerTasksStrip({ items }: { items: ComposerTaskItem[] }) {
    if (items.length === 0) return null;

    const active = items.find((i) => i.status === "running") ?? items[0];
    const openH = Math.min(220, 48 + items.length * 36);

    return (
        <MorphMenu
            variant="morph"
            aria-label="Tasks"
            align="end"
            openWidth={280}
            openHeight={openH}
            closedHeight={32}
            trigger={
                <>
                    {active.status === "running" ? (
                        <span className="t-spin-check shrink-0" data-state="spin">
                            <span className="t-spin-check__ring" />
                        </span>
                    ) : (
                        <span className="size-3.5 shrink-0 rounded-full border-2 border-text-muted/45" />
                    )}
                    <span className="max-w-[180px] truncate">{active.label}</span>
                </>
            }
        >
            <div className="flex flex-col py-1">
                {items.map((item) => (
                    <div
                        key={item.id}
                        className="flex min-h-8 items-center gap-2 px-3 py-1.5 text-sm"
                    >
                        {item.status === "running" ? (
                            <span className="t-spin-check shrink-0" data-state="spin">
                                <span className="t-spin-check__ring" />
                            </span>
                        ) : item.status === "done" ? (
                            <Icon icon={RiCheckLine} className="text-success" />
                        ) : (
                            <span className="size-3.5 shrink-0 rounded-full border-2 border-text-muted/45" />
                        )}
                        <span
                            className={cn(
                                "min-w-0 flex-1 truncate",
                                item.status === "running"
                                    ? "text-text-primary"
                                    : "text-text-muted",
                            )}
                        >
                            {item.label}
                        </span>
                    </div>
                ))}
            </div>
        </MorphMenu>
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
