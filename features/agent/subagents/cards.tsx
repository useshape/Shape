"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { RiArrowRightSLine, RiCheckboxCircleLine, RiCloseCircleLine, RiSparkling2Fill } from "@remixicon/react";
import { listen } from "@tauri-apps/api/event";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { providerIcon } from "@/lib/ui/provider-icon";
import { GeneratingIndicator } from "@/features/chat/ui/blocks/generating";
import { ReadGroup } from "@/features/chat/ui/blocks/workflow";
import {
    applySubagentEvent,
    getSubagents,
    subscribeSubagents,
    type SubagentCard,
    type SubagentStatus,
} from "./store";

function statusTone(status: SubagentStatus) {
    if (status === "done") return "text-success";
    if (status === "error") return "text-error";
    return "text-text-muted";
}

function clockLabel(card: SubagentCard): string {
    const at = new Date(card.startedAt ?? card.updatedAt);
    return at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function Card({ card }: { card: SubagentCard }) {
    const live = card.status === "running" || card.status === "pending";
    const reviewing = live && card.phase === "reviewing" && (card.reads?.length ?? 0) > 0;
    const editing = live && card.phase === "editing";
    const [open, setOpen] = useState(true);

    return (
        <div className="flex flex-col gap-1 rounded-xl border border-border-subtle bg-surface-3 px-3 py-2.5">
            <div className="flex items-center gap-2">
                <span className="flex size-4 shrink-0 items-center justify-center">
                    {providerIcon(card.model || "auto", 14)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                    {card.title}
                </span>
                {card.status === "done" ? (
                    <Icon icon={RiCheckboxCircleLine} className={cn("shrink-0", statusTone(card.status))} />
                ) : card.status === "error" ? (
                    <Icon icon={RiCloseCircleLine} className={cn("shrink-0", statusTone(card.status))} />
                ) : null}
            </div>

            {editing ? (
                <GeneratingIndicator label={card.activity || "Editing file"} />
            ) : reviewing ? (
                <div className="flex flex-col gap-0.5">
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        className="flex w-full items-center gap-2 py-0.5 text-left chat-text font-medium text-text-secondary hover:text-text-primary transition-colors"
                    >
                        <Icon icon={RiSparkling2Fill} className="shrink-0 text-text-secondary" />
                        <span className="min-w-0 flex-1 truncate">Reviewing changes...</span>
                        <span className="shrink-0 tabular-nums text-text-muted">{clockLabel(card)}</span>
                        <Icon
                            icon={RiArrowRightSLine}
                            className={cn("shrink-0 opacity-50 transition-transform duration-200", open && "rotate-90")}
                        />
                    </button>
                    {open ? (
                        <div className="flex flex-col gap-0.5 pl-0.5">
                            <ReadGroup files={card.reads ?? []} tokens={card.tokens} />
                            {card.truncated ? (
                                <p className="py-0.5 text-xs text-text-muted">
                                    This diff was truncated because it exceeded the preview limit. The changes shown are incomplete.
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : live ? (
                <GeneratingIndicator label={card.activity || "Working"} showTimer={false} />
            ) : (
                <p className="truncate text-sm text-text-muted">{card.activity}</p>
            )}
        </div>
    );
}

export function SubagentCards({ className }: { className?: string }) {
    const cards = useSyncExternalStore(subscribeSubagents, getSubagents, getSubagents);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        void listen<{
            id?: string;
            title?: string;
            activity?: string;
            status?: string;
        }>("agent-subagent", (event) => {
            applySubagentEvent(event.payload);
            window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "agents" }));
        }).then((fn) => {
            unlisten = fn;
        });
        return () => unlisten?.();
    }, []);

    if (cards.length === 0) {
        return (
            <div className={cn("flex flex-col items-start gap-1 px-4 py-6", className)}>
                <p className="text-sm text-text-muted">No agents running</p>
                <p className="text-xs text-text-disabled">
                    The AI can spawn subagents for parallel research. Each card shows the current step until it finishes.
                </p>
            </div>
        );
    }

    return (
        <div className={cn("flex flex-col gap-2 overflow-y-auto p-2", className)}>
            <span className="px-1 text-xs font-medium text-text-muted">Agents</span>
            {cards.map((card) => (
                <Card key={card.id} card={card} />
            ))}
        </div>
    );
}
