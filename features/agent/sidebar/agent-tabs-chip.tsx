"use client";

import { Bot20Regular } from "@fluentui/react-icons/headless/svg/bot";
import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
    getSubagents,
    openSubagent,
    subscribeSubagents,
} from "@/features/agent/subagents/store";
import { NEW_CHAT_TAB_ID } from "@/features/chat/ui/shell/tabs";

export function AgentTabsChip() {
    const [parentId, setParentId] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const all = useSyncExternalStore(subscribeSubagents, getSubagents, getSubagents);

    useEffect(() => {
        const onActive = (e: Event) => {
            const id = (e as CustomEvent<{ id?: string }>).detail?.id;
            setParentId(id && id !== NEW_CHAT_TAB_ID ? id : null);
        };
        window.addEventListener("shape-chat-active", onActive as EventListener);
        return () => window.removeEventListener("shape-chat-active", onActive as EventListener);
    }, []);

    const cards = useMemo(() => {
        if (!parentId) return all;
        return all.filter((c) => c.parentId === parentId);
    }, [all, parentId]);

    const count = cards.length;
    if (count === 0) return null;

    return (
        <div className="relative px-2 pb-1">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={cn(
                    "inline-flex w-fit max-w-full items-center gap-1.5 rounded-lg px-2 py-1",
                    "text-sm font-normal text-text-secondary",
                    "hover:bg-panel-hover hover:text-text-primary",
                    "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                )}
            >
                <Icon icon={Bot20Regular} className="text-text-muted" />
                <span>Agent tabs</span>
                <span className="tabular-nums text-text-muted">{count}</span>
                <Icon
                    icon={ChevronDown20Regular}
                    className={cn(
                        "text-text-muted transition-transform duration-200",
                        open && "rotate-180",
                    )}
                    style={{ ["--icon-size" as string]: "14px" }}
                />
            </button>
            {open ? (
                <div className="mt-1 flex flex-col gap-0.5 px-0.5">
                    {cards.map((card) => (
                        <button
                            key={card.id}
                            type="button"
                            onClick={() => {
                                openSubagent(card.id);
                                setOpen(false);
                            }}
                            className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-sm font-normal text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                        >
                            <span className="min-w-0 flex-1 truncate">{card.title}</span>
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
