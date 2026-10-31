"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Slide } from "loading-dev";
import { createPortal } from "react-dom";
import {
    RiArrowLeftSLine,
    RiArrowRightSLine,
    RiEqualizer2Line,
    RiRefreshLine,
    RiSearchLine,
    RiSettings3Line,
} from "@remixicon/react";
import { FileTree } from "@/features/agent/workspace/tree";
import { TerminalToggle } from "@/features/agent/chrome";
import { Tooltip } from "@/components/ui/tooltip";
import { chatNavBack, chatNavForward, ensureChatNav, getChatNav, subscribeChatNav } from "@/features/chat/lib/chat-nav";
import { openFileTab } from "@/features/agent/strip";
import { localSearchQuery } from "@/features/agent/panes/strip-model";
import { commands, useProjectState, type CodebaseSearchHit, type Conversation } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { useSyncExternalStore } from "react";

/** Wider with one tab, tighter as more tabs need the bar, full width when there are none. */
function omniboxMax(tabCount: number): string {
    if (tabCount <= 1) return "36rem";
    if (tabCount === 2) return "30rem";
    if (tabCount === 3) return "26rem";
    return "22rem";
}

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
            className="flex size-8 items-center justify-center squircle-xl text-text-secondary hover:bg-panel-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-40"
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
    reloadId,
    reloadPath,
    tabCount,
    titleWorking = false,
    fill = false,
    children,
}: {
    title: string;
    projectPath: string | null;
    showActions?: boolean;
    onBack?: () => void;
    onForward?: () => void;
    canBack?: boolean;
    canForward?: boolean;
    onOpenChat?: (id: string) => void;
    /** Conversation to reload. Omit to reload the open chat. */
    reloadId?: string | null;
    /** File tab to re-read. */
    reloadPath?: string | null;
    /** Real tabs beside the field. Zero fills the bar. Omit to keep the fixed width. */
    tabCount?: number;
    /** The open chat is generating, so the name shows the working treatment. */
    titleWorking?: boolean;
    /** Address field fills the row. Used when tabs live on their own row. */
    fill?: boolean;
    children?: ReactNode;
}) {
    const { project_path } = useProjectState();
    const path = projectPath || project_path;
    const project = path?.split(/[/\\]/).filter(Boolean).pop() || "shape";
    const nav = useSyncExternalStore(subscribeChatNav, getChatNav, getChatNav);
    const [open, setOpen] = useState<null | "tree" | "find">(null);
    const [panel, setPanel] = useState<null | "tree" | "find">(null);
    const [panelShown, setPanelShown] = useState(false);
    const [query, setQuery] = useState("");
    const [chats, setChats] = useState<Conversation[]>([]);
    const [code, setCode] = useState<CodebaseSearchHit[]>([]);
    const [searching, setSearching] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);

    useEffect(() => {
        ensureChatNav();
    }, []);

    useEffect(() => {
        if (open) {
            setPanel(open);
            const frame = requestAnimationFrame(() => setPanelShown(true));
            return () => cancelAnimationFrame(frame);
        }
        setPanelShown(false);
        const timer = window.setTimeout(() => setPanel(null), 200);
        return () => window.clearTimeout(timer);
    }, [open]);

    useEffect(() => {
        if (open !== "find") return;
        inputRef.current?.focus();
    }, [open]);

    useLayoutEffect(() => {
        if (!panel) {
            setAnchor(null);
            return;
        }
        const place = () => {
            const rect = boxRef.current?.getBoundingClientRect();
            if (!rect) return;
            setAnchor({ top: rect.bottom, left: rect.left, width: rect.width });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [panel]);

    useEffect(() => {
        if (!open) return;
        const onPointer = (event: PointerEvent) => {
            const target = event.target as Node;
            if (boxRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(null);
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
        openFileTab(file);
        setOpen(null);
        setQuery("");
    };

    const reload = () => {
        window.dispatchEvent(new CustomEvent("shape-reload-view", {
            detail: { id: reloadId ?? null, path: reloadPath ?? null },
        }));
    };

    const backDisabled = canBack != null ? !canBack : !nav.canBack;
    const forwardDisabled = canForward != null ? !canForward : !nav.canForward;

    return (
        <div className="flex h-full min-w-0 flex-1 items-center gap-1.5 pe-1" data-no-drag>
            <div className="flex shrink-0 items-center" data-no-drag>
                <NavButton label="Back" disabled={backDisabled} onClick={onBack ?? chatNavBack}>
                    <RiArrowLeftSLine size={21} />
                </NavButton>
                <NavButton label="Forward" disabled={forwardDisabled} onClick={onForward ?? chatNavForward}>
                    <RiArrowRightSLine size={21} />
                </NavButton>
                <NavButton label="Reload" onClick={reload}>
                    <RiRefreshLine size={19} />
                </NavButton>
            </div>
            <div
                ref={boxRef}
                data-no-drag
                className={cn(
                    "relative min-w-[7.5rem]",
                    fill || tabCount === 0
                        ? "min-w-0 flex-1"
                        : tabCount == null
                            ? "max-w-[22rem] flex-[0_1_22rem]"
                            : "transition-[max-width,flex-grow] duration-300 ease-[var(--ease-out)]",
                )}
                style={fill || tabCount == null || tabCount === 0 ? undefined : {
                    flexGrow: tabCount === 0 ? 1 : tabCount === 1 ? 1.6 : tabCount === 2 ? 1.25 : 1,
                    flexShrink: 1,
                    flexBasis: 0,
                    maxWidth: tabCount === 0 ? "120rem" : omniboxMax(tabCount),
                }}
            >
                <div
                    className={cn(
                        "relative flex h-8 items-center bg-surface-4",
                        panel ? "squircle-t-xl rounded-b-none" : "squircle-2xl",
                    )}
                >
                    <Tooltip content="Open Folder" side="bottom">
                        <button
                            type="button"
                            aria-label="Open Folder"
                            className="absolute inset-y-0 start-1 z-10 grid w-6 place-items-center rounded-md text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                            onClick={() => window.dispatchEvent(new Event("shape-open-project-pick"))}
                        >
                            <RiEqualizer2Line size={19} />
                        </button>
                    </Tooltip>
                    {open === "find" ? (
                        <input
                            ref={inputRef}
                            value={query}
                            aria-label="Search chats and code"
                            placeholder="Search chats and code"
                            onChange={(event) => setQuery(event.target.value)}
                            className="h-8 min-w-0 flex-1 bg-transparent ps-8 pe-2 text-[14px] font-normal leading-none text-text-primary outline-none placeholder:text-text-primary/50"
                        />
                    ) : (
                        <div className="flex h-full min-w-0 flex-1 items-center justify-center gap-2 px-8">
                            <button
                                type="button"
                                className="max-w-[45%] shrink truncate text-center text-[14px] font-normal capitalize leading-none text-text-primary"
                                onClick={() => setOpen((value) => (value === "tree" ? null : "tree"))}
                            >
                                {project}
                            </button>
                            <button
                                type="button"
                                className="flex min-w-0 shrink items-center justify-center gap-1.5 text-center text-[14px] font-normal leading-none text-text-primary/55"
                                onClick={() => setOpen("find")}
                            >
                                {titleWorking ? <Slide size={10} className="shrink-0 text-text-muted" /> : null}
                                <span className={cn("min-w-0 truncate", titleWorking && "agent-progress-loading-text")}>{title}</span>
                            </button>
                        </div>
                    )}
                </div>
                {panel && anchor && typeof document !== "undefined"
                    ? createPortal(
                    <div
                        ref={panelRef}
                        className={cn(
                            "fixed z-dropdown overflow-hidden bg-surface-4 shadow-md squircle-b-2xl transition-[max-height,opacity] duration-150 ease-[var(--ease-out)]",
                            panelShown ? "max-h-[640px] opacity-100" : "pointer-events-none max-h-0 border-transparent opacity-0",
                        )}
                        style={{ top: anchor.top, left: anchor.left, width: anchor.width }}
                    >
                        {panel === "tree" && path ? (
                            <div className="h-150">
                                <FileTree
                                    projectPath={path}
                                    activePath={null}
                                    onOpenFile={openFile}
                                />
                            </div>
                        ) : null}
                        {panel === "tree" && !path ? (
                            <p className="px-3 py-4 text-sm text-text-muted">Open a folder to browse files.</p>
                        ) : null}
                        {panel === "find" ? (
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
                    </div>,
                    document.body,
                ) : null}
            </div>
            {tabCount == null ? (
                children ? (
                    <div className="flex min-w-0 flex-1 items-center">{children}</div>
                ) : fill ? null : (
                    <div className="h-full min-w-4 flex-1" data-tauri-drag-region />
                )
            ) : (
                <div
                    className={cn(
                        "grid overflow-hidden transition-[grid-template-columns,flex-grow,opacity] duration-300 ease-[var(--ease-out)]",
                        tabCount === 0 ? "grow-0 opacity-0" : "min-w-0 flex-1 opacity-100",
                    )}
                    style={{ gridTemplateColumns: tabCount === 0 ? "minmax(0,0fr)" : "minmax(0,1fr)" }}
                    aria-hidden={tabCount === 0}
                >
                    <div className="flex min-w-0 overflow-hidden">{children}</div>
                </div>
            )}
            {showActions ? (
                <div className="flex shrink-0 gap-1 items-center" data-no-drag>
                    <TerminalToggle />
                    <NavButton label="Search" onClick={() => setOpen((value) => (value === "find" ? null : "find"))}>
                        <RiSearchLine size={19} />
                    </NavButton>
                    <NavButton
                        label="Settings"
                        onClick={() => window.dispatchEvent(new Event("shape-open-settings"))}
                    >
                        <RiSettings3Line size={19} />
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
                <RiSearchLine size={16} />
            </NavButton>
            <NavButton
                label="Settings"
                onClick={() => window.dispatchEvent(new Event("shape-open-settings"))}
            >
                <RiSettings3Line size={16} />
            </NavButton>
        </div>
    );
}
