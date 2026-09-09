"use client";

import { RiCloseLine, RiPencilLine } from "@remixicon/react";
import React from "react";
import { Icon } from "@/components/ui/icon";
import { MorphMenu } from "@/components/ui/morph-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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

    const openH = Math.min(200, 52 + items.length * 44);

    return (
        <MorphMenu
            variant="morph"
            aria-label="Queued messages"
            align="end"
            openWidth={300}
            openHeight={openH}
            closedHeight={32}
            trigger={
                <>
                    <span>Queued</span>
                    <span className="tabular-nums text-text-muted">{items.length}</span>
                </>
            }
        >
            <div className="flex h-full flex-col py-1">
                {items.map((item) => (
                    <div
                        key={item.id}
                        className="group mx-1 flex items-start gap-2 rounded-lg px-2 py-1.5"
                    >
                        <div className="relative min-h-[2.5rem] min-w-0 flex-1">
                            <p className="line-clamp-3 text-sm leading-snug text-text-primary">
                                {previewText(item.content, 160)}
                            </p>
                            <div
                                className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-surface-3 to-transparent"
                                aria-hidden
                            />
                            <div
                                className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-surface-3 to-transparent"
                                aria-hidden
                            />
                        </div>
                        <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <Tooltip content="Edit" side="left">
                                <button
                                    type="button"
                                    className="rounded p-0.5 text-text-muted hover:bg-panel-hover hover:text-text-primary"
                                    onClick={() => onEdit(item.id)}
                                >
                                    <Icon icon={RiPencilLine} />
                                </button>
                            </Tooltip>
                            <Tooltip content="Remove" side="left">
                                <button
                                    type="button"
                                    className="rounded p-0.5 text-text-muted hover:bg-panel-hover hover:text-error"
                                    onClick={() => onRemove(item.id)}
                                >
                                    <Icon icon={RiCloseLine} />
                                </button>
                            </Tooltip>
                        </div>
                    </div>
                ))}
            </div>
        </MorphMenu>
    );
}
