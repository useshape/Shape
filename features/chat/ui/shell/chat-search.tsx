"use client";

import { Chat20Regular } from "@fluentui/react-icons/headless/svg/chat";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { commands, useProjectState } from "@/lib/backend";
import type { Conversation } from "@/lib/backend/types";
import { cn } from "@/lib/utils";

export function ChatSearch({ onClose }: { onClose: () => void }) {
    const { project_path } = useProjectState();
    const [query, setQuery] = useState("");
    const [chats, setChats] = useState<Conversation[]>([]);
    const [active, setActive] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        if (!project_path) {
            setChats([]);
            return;
        }
        let cancelled = false;
        void commands
            .getConversations(project_path)
            .then((list) => {
                if (cancelled) return;
                setChats(
                    list
                        .filter((chat) => !chat.archived)
                        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
                );
            })
            .catch(() => {
                if (!cancelled) setChats([]);
            });
        return () => {
            cancelled = true;
        };
    }, [project_path]);

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = q
            ? chats.filter((chat) => (chat.title || "New chat").toLowerCase().includes(q))
            : chats;
        return list.slice(0, 12);
    }, [chats, query]);

    useEffect(() => {
        setActive(0);
    }, [query]);

    const open = (id: string) => {
        window.dispatchEvent(new CustomEvent("shape-chat-load", { detail: { id } }));
        onClose();
    };

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, Math.max(0, matches.length - 1)));
            }
            if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, 0));
            }
            if (event.key === "Enter" && matches[active]) {
                event.preventDefault();
                open(matches[active].id);
            }
        };
        const onPointer = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) onClose();
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("mousedown", onPointer);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("mousedown", onPointer);
        };
    }, [active, matches, onClose]);

    return (
        <div
            ref={rootRef}
            className="overflow-hidden rounded-xl border border-border-subtle bg-panel shadow-lg"
            role="dialog"
            aria-label="Search chats"
        >
            <div className="p-2">
                <div className="relative flex h-9 items-center">
                    <Icon
                        icon={Search20Regular}
                        className="pointer-events-none absolute left-2.5 text-text-muted"
                    />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search chats"
                        aria-label="Search chats"
                        className="h-full w-full rounded-lg border border-border-subtle bg-surface-2 pl-9 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted"
                    />
                </div>
            </div>
            <div className="px-3 pb-1 text-xs text-text-muted">Chats</div>
            <div className="max-h-80 overflow-y-auto px-1.5 pb-1">
                {matches.length === 0 ? (
                    <div className="px-2 py-6 text-center text-sm text-text-muted">No chats</div>
                ) : (
                    matches.map((chat, index) => (
                        <button
                            key={chat.id}
                            type="button"
                            onMouseEnter={() => setActive(index)}
                            onClick={() => open(chat.id)}
                            className={cn(
                                "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-text-primary",
                                index === active && "bg-panel-hover",
                            )}
                        >
                            <Icon icon={Chat20Regular} className="shrink-0 text-text-muted" />
                            <span className="min-w-0 flex-1 truncate">{chat.title?.trim() || "New chat"}</span>
                        </button>
                    ))
                )}
            </div>
            <div className="border-t border-border-subtle px-3 py-2 text-xs text-text-muted">
                Search chats in this project
            </div>
        </div>
    );
}
