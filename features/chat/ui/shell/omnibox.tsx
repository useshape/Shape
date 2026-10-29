"use client";

import { ArrowLeft20Filled } from "@fluentui/react-icons/headless/svg/arrow-left";
import { ArrowRight20Filled } from "@fluentui/react-icons/headless/svg/arrow-right";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";
import { Settings20Regular } from "@fluentui/react-icons/headless/svg/settings";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { FileTree } from "@/features/agent/workspace/tree";
import { TerminalToggle } from "@/features/agent/chrome";
import { chatNavBack, chatNavForward, ensureChatNav, getChatNav, subscribeChatNav } from "@/features/chat/lib/chat-nav";
import { localSearchQuery } from "@/features/agent/panes/strip-model";
import { commands, useProjectState, type CodebaseSearchHit, type Conversation } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { useSyncExternalStore } from "react";

function NavButton({
    label,
    disabled,
    onClick,
    children,
}: {
    label: string;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className="flex size-7 items-center justify-center rounded-full text-text-muted hover:bg-panel-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-40"
        >
            {children}
        </button>
    );
}

export function ChatOmnibox({
    title,
    projectPath,
    showActions = true,
    onBack,
    onForward,
    canBack,
    canForward,
    onOpenChat,
}: {
    title: string;
    projectPath: string | null;
    showActions?: boolean;
    onBack?: () => void;
    onForward?: () => void;
    canBack?: boolean;
    canForward?: boolean;
    onOpenChat?: (id: string) => void;
}) {
    const { project_path } = useProjectState();
    const path = projectPath || project_path;
    const project = path?.split(/[/\\]/).filter(Boolean).pop() || "shape";
    const nav = useSyncExternalStore(subscribeChatNav, getChatNav, getChatNav);
    const [open, setOpen] = useState<null | "tree" | "find">(null);
    const [query, setQuery] = useState("");
    const [chats, setChats] = useState<Conversation[]>([]);
    const [code, setCode] = useState<CodebaseSearchHit[]>([]);
    const [searching, setSearching] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        ensureChatNav();
    }, []);

    useEffect(() => {
        if (open !== "find") return;
        inputRef.current?.focus();
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onPointer = (event: PointerEvent) => {
            if (!boxRef.current?.contains(event.target as Node)) setOpen(null);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(null);
        };
        window.addEventListener("pointerdown", onPointer);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("pointerdown", onPointer);
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);

    useEffect(() => {
        if (open !== "find" || !path) return;
        let cancelled = false;
        void commands.getConversations(path).then((list) => {
            if (cancelled) return;
            setChats(list.filter((chat) => !chat.archived).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
        }).catch(() => {
            if (!cancelled) setChats([]);
        });
        return () => {
            cancelled = true;
        };
    }, [open, path]);

    useEffect(() => {
        if (open !== "find") return;
        const text = localSearchQuery(query);
        if (text.length < 2 || !path) {
            setCode([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        let cancelled = false;
        const timer = window.setTimeout(() => {
            void commands.searchCodebase(text, 8, path, true).then((hits) => {
                if (!cancelled) setCode(hits);
            }).catch(() => {
                if (!cancelled) setCode([]);
            }).finally(() => {
                if (!cancelled) setSearching(false);
            });
        }, 120);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [open, query, path]);

    const chatHits = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = q
            ? chats.filter((chat) => (chat.title || "New chat").toLowerCase().includes(q))
            : chats;
        return list.slice(0, 8);
    }, [chats, query]);

    const openChat = (id: string) => {
        if (onOpenChat) onOpenChat(id);
        else window.dispatchEvent(new CustomEvent("shape-chat-load", { detail: { id } }));
        setOpen(null);
        setQuery("");
    };

    const openFile = (file: string) => {
        window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "secondary-sidebar", value: true } }));
        window.dispatchEvent(new CustomEvent("shape-open-workspace-file", { detail: { path: file } }));
        setOpen(null);
        setQuery("");
    };

    const backDisabled = canBack != null ? !canBack : !nav.canBack;
    const forwardDisabled = canForward != null ? !canForward : !nav.canForward;

    return (
        <div className="flex h-11 shrink-0 items-center gap-2 bg-transparent px-2" data-tauri-drag-region>
            <div className="flex shrink-0 items-center" data-no-drag>
                <NavButton label="Back" disabled={backDisabled} onClick={onBack ?? chatNavBack}>
                    <Icon icon={ArrowLeft20Filled} className="icon-md" />
                </NavButton>
                <NavButton label="Forward" disabled={forwardDisabled} onClick={onForward ?? chatNavForward}>
                    <Icon icon={ArrowRight20Filled} className="icon-md" />
                </NavButton>
            </div>
            <div ref={boxRef} className="relative min-w-0 flex-1" data-no-drag>
                <div
                    className={cn(
                        "flex h-8 items-center gap-0.5 px-1",
                        open ? "squircle-t-2xl border-b-transparent bg-white/5" : "squircle-2xl ",
                    )}
                >
                    <button
                        type="button"
                        className="max-w-[34%] shrink-0 truncate rounded-full px-1.5 py-1 text-left text-sm text-text-muted hover:bg-panel-hover hover:text-text-primary"
                        onClick={() => setOpen((value) => (value === "tree" ? null : "tree"))}
                    >
                        {project}
                    </button>
                    <span className="shrink-0 text-text-muted">/</span>
                    {open === "find" ? (
                        <input
                            ref={inputRef}
                            value={query}
                            aria-label="Search chats and code"
                            placeholder="Search chats and code"
                            onChange={(event) => setQuery(event.target.value)}
                            className="h-7 min-w-0 flex-1 bg-transparent px-1 text-sm text-text-primary outline-none placeholder:text-text-muted"
                        />
                    ) : (
                        <button
                            type="button"
                            className="h-7 min-w-0 flex-1 truncate px-1 text-left text-sm text-text-primary"
                            onClick={() => setOpen("find")}
                        >
                            {title}
                        </button>
                    )}
                </div>
                {open ? (
                    <div className="absolute inset-x-0 top-full z-40 max-h-[min(500px,82vh)] overflow-hidden squircle-b-2xl bg-[#2C2B2C] backdrop-blur-md shadow-lg/10">
                        {open === "tree" && path ? (
                            <div className="h-150">
                                <FileTree
                                    projectPath={path}
                                    activePath={null}
                                    onOpenFile={openFile}
                                />
                            </div>
                        ) : null}
                        {open === "tree" && !path ? (
                            <p className="px-3 py-4 text-sm text-text-muted">Open a folder to browse files.</p>
                        ) : null}
                        {open === "find" ? (
                            <div className="max-h-[min(400px,56vh)] overflow-y-auto py-1">
                                <p className="px-3 py-1 text-xs text-text-muted">Chats</p>
                                {chatHits.length === 0 ? (
                                    <p className="px-3 py-1.5 text-sm text-text-muted">No matching chats</p>
                                ) : chatHits.map((chat) => (
                                    <button
                                        key={chat.id}
                                        type="button"
                                        className="flex w-full items-center px-3 py-1.5 text-left text-sm text-text-primary hover:bg-panel-hover"
                                        onClick={() => openChat(chat.id)}
                                    >
                                        <span className="truncate">{chat.title?.trim() || "New chat"}</span>
                                    </button>
                                ))}
                                <p className="px-3 pb-1 pt-2 text-xs text-text-muted">Code</p>
                                {searching ? <p className="px-3 py-1.5 text-sm text-text-muted">Searching…</p> : null}
                                {!searching && query.trim().length >= 2 && code.length === 0 ? (
                                    <p className="px-3 py-1.5 text-sm text-text-muted">No matching code</p>
                                ) : null}
                                {code.map((hit) => {
                                    const line = hit.startLine || (hit as { start_line?: number }).start_line || 0;
                                    const name = hit.file.split(/[/\\]/).pop() || hit.file;
                                    return (
                                        <button
                                            key={`${hit.file}:${line}:${hit.excerpt.slice(0, 24)}`}
                                            type="button"
                                            className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-panel-hover"
                                            onClick={() => openFile(hit.file)}
                                        >
                                            <span className="text-sm text-text-primary">
                                                {name}
                                                {line > 0 ? <span className="text-text-muted">:{line}</span> : null}
                                            </span>
                                            <span className="line-clamp-2 w-full text-xs text-text-muted">{hit.excerpt}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
            {showActions ? (
                <div className="ml-auto flex shrink-0 items-center gap-0.5" data-no-drag>
                    <TerminalToggle />
                    <NavButton label="Search" onClick={() => setOpen("find")}>
                        <Icon icon={Search20Regular} className="icon-md" />
                    </NavButton>
                    <NavButton
                        label="Settings"
                        onClick={() => window.dispatchEvent(new Event("shape-open-settings"))}
                    >
                        <Icon icon={Settings20Regular} className="icon-md" />
                    </NavButton>
                </div>
            ) : null}
        </div>
    );
}

export function ChatWindowActions() {
    return (
        <div className="flex shrink-0 items-center gap-0.5" data-no-drag>
            <TerminalToggle />
            <NavButton label="Search" onClick={() => window.dispatchEvent(new Event("shape-open-chat-search"))}>
                <Icon icon={Search20Regular} className="icon-md" />
            </NavButton>
            <NavButton
                label="Settings"
                onClick={() => window.dispatchEvent(new Event("shape-open-settings"))}
            >
                <Icon icon={Settings20Regular} className="icon-md" />
            </NavButton>
        </div>
    );
}
