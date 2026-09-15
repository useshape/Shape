"use client";

import { RiCheckLine } from "@remixicon/react";
import React from "react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";

export type ComposerTaskItem = {
    id: string;
    label: string;
    status: "running" | "pending" | "done";
};

export type ComposerActivityItem = { kind: "task" } & ComposerTaskItem;

export function ComposerTasksStrip({ items }: { items: ComposerTaskItem[] }) {
    if (items.length === 0) return null;

    const active = items.find((i) => i.status === "running") ?? items[0];
    const done = items.filter((i) => i.status === "done").length;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="flex h-6 max-w-[200px] items-center gap-1.5 rounded-md px-1.5 text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                    aria-label="Tasks"
                >
                    {active.status === "running" ? (
                        <span className="t-spin-check shrink-0" data-state="spin">
                            <span className="t-spin-check__ring" />
                        </span>
                    ) : (
                        <Icon icon={RiCheckLine} size={ICON_SIZE_SM} className="text-success" />
                    )}
                    <span className="truncate">{active.label}</span>
                    <span className="tabular-nums text-xs text-text-muted">
                        {done}/{items.length}
                    </span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 p-1">
                {items.map((item) => (
                    <div key={item.id} className="flex min-h-8 items-center gap-2 rounded-md px-2 py-1 text-sm">
                        {item.status === "running" ? (
                            <span className="t-spin-check shrink-0" data-state="spin">
                                <span className="t-spin-check__ring" />
                            </span>
                        ) : item.status === "done" ? (
                            <Icon icon={RiCheckLine} size={ICON_SIZE_SM} className="text-success" />
                        ) : (
                            <span className="size-3.5 shrink-0 rounded-full border-2 border-text-muted/45" />
                        )}
                        <span
                            className={cn(
                                "min-w-0 flex-1 truncate",
                                item.status === "running" ? "text-text-primary" : "text-text-muted",
                            )}
                        >
                            {item.label}
                        </span>
                    </div>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
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
