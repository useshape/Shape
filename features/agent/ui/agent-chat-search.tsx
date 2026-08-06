"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useChatStream } from "@/features/chat/lib/chat-stream-store";
import type { ChatMessage } from "@/lib/backend/types";

function stripChatContent(content: string): string {
    return content
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function highlightMatch(text: string, query: string) {
    if (!query) return text;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const idx = lowerText.indexOf(lowerQuery);
    if (idx === -1) return text;
    return (
        <>
            {text.slice(0, idx)}
            <mark className="rounded-none bg-accent/25 px-0 text-text-primary">
                {text.slice(idx, idx + query.length)}
            </mark>
            {text.slice(idx + query.length)}
        </>
    );
}

type ChatSearchHit = {
    messageIndex: number;
    role: ChatMessage["role"];
    preview: string;
};

export function AgentChatSearch() {
    const { messages } = useChatStream();
    const [focused, setFocused] = useState(false);
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const results = useMemo<ChatSearchHit[]>(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return messages
            .map((msg, messageIndex) => {
                const plain = stripChatContent(msg.content);
                if (!plain.toLowerCase().includes(q)) return null;
                const matchIdx = plain.toLowerCase().indexOf(q);
                const start = Math.max(0, matchIdx - 40);
                const end = Math.min(plain.length, matchIdx + q.length + 60);
                const preview =
                    (start > 0 ? "…" : "")
                    + plain.slice(start, end)
                    + (end < plain.length ? "…" : "");
                return { messageIndex, role: msg.role, preview };
            })
            .filter((hit): hit is ChatSearchHit => hit !== null)
            .slice(0, 24);
    }, [messages, query]);

    const showDropdown = focused && Boolean(query.trim());

    useEffect(() => {
        if (!showDropdown) {
            setSelectedIndex(0);
        }
    }, [showDropdown, query]);

    useEffect(() => {
        if (!focused) return;
        const onPointerDown = (e: MouseEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) {
                setFocused(false);
            }
        };
        window.addEventListener("mousedown", onPointerDown);
        return () => window.removeEventListener("mousedown", onPointerDown);
    }, [focused]);

    const jumpToMessage = useCallback((messageIndex: number | null) => {
        if (messageIndex == null) return;
        window.dispatchEvent(
            new CustomEvent("shape-agent-chat-jump", { detail: { messageIndex } }),
        );
        setFocused(false);
        inputRef.current?.blur();
    }, []);

    const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            setQuery("");
            setFocused(false);
            inputRef.current?.blur();
            return;
        }
        if (!results.length) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((idx) => Math.min(idx + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((idx) => Math.max(idx - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            jumpToMessage(results[selectedIndex]?.messageIndex ?? null);
        }
    };

    return (
        <div ref={containerRef} className="relative w-[min(220px,28vw)] max-w-full">
            <div
                className={cn(
                    "command-center flex h-[26px] w-full items-center gap-2 rounded-lg border px-2 transition-colors",
                    focused ? "border-border bg-panel" : "border-border bg-transparent hover:bg-panel-hover",
                    showDropdown && "rounded-b-none border-b-0 bg-surface-3",
                )}
            >
                <Icon name="search" size={14} className="shrink-0 text-text-muted" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onKeyDown={onInputKeyDown}
                    placeholder="Search in chat…"
                    className="h-full min-w-0 flex-1 border-none bg-transparent text-xs text-text-primary outline-none placeholder:text-text-secondary"
                />
            </div>

            {showDropdown ? (
                <div className="absolute left-0 right-0 top-full z-50 overflow-hidden rounded-b-2xl border border-t-0 border-border bg-surface-3 shadow-md">
                    <div className="max-h-[320px] overflow-auto custom-scrollbar py-1">
                        {results.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-text-muted">No matches in this chat.</div>
                        ) : (
                            results.map((hit, idx) => (
                                <button
                                    key={`${hit.messageIndex}-${idx}`}
                                    type="button"
                                    className={cn(
                                        "flex w-full cursor-pointer items-start gap-2 px-2 py-1.5 text-left transition-colors",
                                        idx === selectedIndex ? "bg-panel-hover" : "hover:bg-panel-hover",
                                    )}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onMouseEnter={() => setSelectedIndex(idx)}
                                    onClick={() => jumpToMessage(hit.messageIndex)}
                                >
                                    <span className="w-14 shrink-0 pt-px text-xs capitalize text-text-muted">
                                        {hit.role}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                                        {highlightMatch(hit.preview, query.trim())}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
