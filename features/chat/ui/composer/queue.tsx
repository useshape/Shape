"use client";

import { RiCloseLine, RiPencilLine } from "@remixicon/react";
import React from "react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";

export type QueuedMessage = {
    id: string;
    content: string;
};

function previewText(text: string, max = 120) {
    const one = text.replace(/\s+/g, " ").trim();
    if (one.length <= max) return one;
    return `${one.slice(0, max - 1)}…`;
}

export function QueuedMessagesPanel({
    items,
    onEdit,
    onRemove,
}: {
    items: QueuedMessage[];
    onEdit: (id: string) => void;
    onRemove: (id: string) => void;
}) {
    if (items.length === 0) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="flex h-6 items-center gap-1.5 rounded-md px-1.5 text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                    aria-label="Queued messages"
                >
                    Queued
                    <span className="tabular-nums text-xs text-text-muted">{items.length}</span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 p-1">
                {items.map((item) => (
                    <div key={item.id} className="flex items-start gap-2 rounded-md px-2 py-1.5">
                        <p className="min-w-0 flex-1 line-clamp-3 text-sm leading-snug text-text-primary">
                            {previewText(item.content, 160)}
                        </p>
                        <div className="flex shrink-0 gap-0.5">
                            <Tooltip content="Edit">
                                <button
                                    type="button"
                                    className="rounded p-0.5 text-text-muted hover:text-text-primary"
                                    onClick={() => onEdit(item.id)}
                                >
                                    <Icon icon={RiPencilLine} size={ICON_SIZE_SM} />
                                </button>
                            </Tooltip>
                            <Tooltip content="Remove">
                                <button
                                    type="button"
                                    className="rounded p-0.5 text-text-muted hover:text-error"
                                    onClick={() => onRemove(item.id)}
                                >
                                    <Icon icon={RiCloseLine} size={ICON_SIZE_SM} />
                                </button>
                            </Tooltip>
                        </div>
                    </div>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
