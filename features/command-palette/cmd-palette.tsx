"use client";

import { RiDeleteBinLine } from "@remixicon/react";
import { providerIcon } from "@/lib/ui/provider-icon";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@/components/ui/icon";
import { FileIcon } from "@/components/ui/file-icon";
import { SearchInput } from "@/components/ui/search";

import { getShortcutForLabel } from "@/lib/ui/shortcuts";
import { SHAPE_MODAL_PANEL_CLASS, SHAPE_OVERLAY_CLASS, SHAPE_OVERLAY_CONTENT_CLASS } from "@/lib/ui/modal-overlay";
import { useOverlayRoot } from "@/lib/ui/overlay-root";
import { cn } from "@/lib/utils";
import { isPopoutPath } from "@/lib/window/tauri-window";
import { SETTINGS_CATEGORIES } from "@/features/settings/ui/shared/nav";
import { openSettingsWindow } from "@/lib/window/open-settings";
import { toTimestampMs } from "@/lib/ui/timestamp";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context";

interface EditorAction {
    id: string;
    label: string;
    shortcut: string;
    /** Optional file name used with FileIcon (e.g. `python.py`). */
    icon?: string;
    /** Optional section header when browsing (Recent Agents, etc.). */
    section?: string;
    /** Right-side muted meta (path, relative time) — preferred over shortcut badges for browse rows. */
    meta?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    run: () => any;
    delete?: (e: React.MouseEvent) => void;
    /** Reddit-style nested subagent under a parent agent row. */
    reply?: boolean;
    model?: string;
}

type PaletteFilter = "all" | "files";

const PALETTE_TAB_QUERIES = new Set(["all", "agents", "files", "actions", "settings"]);

function paletteSearchQuery(filter?: string, mode?: string): string {
    const value = (filter || "").trim();
    if (!value) return "";
    if (PALETTE_TAB_QUERIES.has(value.toLowerCase())) return "";
    if (mode === "files" && value.toLowerCase() === "files") return "";
    return value;
}

interface CommandPaletteOpenDetail {
    mode?: string;
    filter?: string;
    placeholder?: string;
    recent?: boolean;
    /** Bias results toward this file when opened from the titlebar omnibar. */
    activeFile?: string;
    actions?: EditorAction[];
}

function isBrowseMode(mode: string): boolean {
    return !mode || mode === "files";
}

function formatRelativeAgo(timestamp: number): string {
    const diffMs = Date.now() - toTimestampMs(timestamp);
    if (!Number.isFinite(diffMs) || diffMs < 0) return "—";
    const minutes = Math.floor(diffMs / 60_000);
    const hours = Math.floor(diffMs / 3_600_000);
    const days = Math.floor(diffMs / 86_400_000);
    if (days >= 1) return `${days}d`;
    if (hours >= 1) return `${hours}h`;
    if (minutes < 1) return "now";
    return `${minutes}m`;
}

function projectNameFromPath(path?: string | null): string {
    if (!path) return "";
    return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
}

function openAgentConversation(id: string, projectPath?: string | null) {
    window.dispatchEvent(
        new CustomEvent("shape-layout-toggle", {
            detail: { id: "secondary-sidebar", value: true },
        }),
    );
    void import("@/lib/backend").then(({ commands }) => {
        void commands.loadConversation(id, projectPath ?? undefined).then(() => {
            window.dispatchEvent(new CustomEvent("shape-chat-refresh"));
        });
    });
}

function getSettingsPaletteActions(): EditorAction[] {
    return [
        {
            id: "settings:open",
            label: "Open Settings",
            shortcut: "",
            meta: "Settings",
            section: "Settings",
            run: () => window.dispatchEvent(new Event("shape-open-settings")),
        },
        ...SETTINGS_CATEGORIES.map((cat) => ({
            id: `settings:${cat.id}`,
            label: cat.label,
            shortcut: "",
            meta: "Settings",
            section: "Settings",
            run: () => {
                void openSettingsWindow({ category: cat.id });
            },
        })),
    ];
}

function shortcut(label: string) {
    return getShortcutForLabel(label) ?? "";
}

function toggleLayout(id: "primary-sidebar" | "secondary-sidebar" | "panel") {
    window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id } }));
}

function openSearchSidebar(mode: "search" | "replace") {
    window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "search" }));
    window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "primary-sidebar", value: true } }));
    window.dispatchEvent(new CustomEvent("shape-search-mode", { detail: { mode } }));
}

function showSidebarTab(tab: string) {
    window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: tab }));
    window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "primary-sidebar", value: true } }));
}

function fuzzyScore(query: string, text: string): number {
    if (!query.trim()) return 1;
    const q = query.toLowerCase().trim();
    const t = text.toLowerCase();
    if (t === q) return 200;
    if (t.startsWith(q)) return 150;
    if (t.split(/\s+/).some((w) => w.startsWith(q))) return 120;
    if (t.includes(q)) return 80;
    let qi = 0;
    for (let i = 0; i < t.length && qi < q.length; i++) {
        if (t[i] === q[qi]) qi++;
    }
    return qi === q.length ? 40 : 0;
}

function ShortcutBadge({ shortcut }: { shortcut: string }) {
    if (!shortcut) return null;
    const parts = shortcut.split(/\s*\+\s*/);
    return (
        <span className="ml-2 flex shrink-0 items-center gap-0.5">
            {parts.map((part) => (
                <kbd
                    key={part}
                    className="rounded-sm bg-panel-hover text-text-secondary px-1.5 py-0.5 text-xs font-sans"
                >
                    {part}
                </kbd>
            ))}
        </span>
    );
}

export function CommandPalette() {
    const overlayRoot = useOverlayRoot();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [actions, setActions] = useState<EditorAction[]>([]);
    const [agentActions, setAgentActions] = useState<EditorAction[]>([]);
    const [fileActions, setFileActions] = useState<EditorAction[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [mode, setMode] = useState<string>("");
    const [filterTab, setFilterTab] = useState<PaletteFilter>("all");
    const [recentFiles, setRecentFiles] = useState(false);
    const [placeholder, setPlaceholder] = useState("Search agents, files, actions...");
    const [activeFileBias, setActiveFileBias] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const browse = isBrowseMode(mode);

    useEffect(() => {
        const handleOpen = (e?: Event) => {
            const customEvent = e as CustomEvent<CommandPaletteOpenDetail>;
            const detail = customEvent?.detail;
            const openMode = detail?.mode || "";
            setMode(openMode);
            setRecentFiles(Boolean(detail?.recent));
            setActiveFileBias(detail?.activeFile || null);
            setFilterTab(openMode === "files" ? "files" : "all");
            setPlaceholder(detail?.placeholder || browsePlaceholder(openMode, openMode === "files" ? "files" : "all"));

            if (openMode === "goto_line") {
                setActions([]);
                setQuery(paletteSearchQuery(detail?.filter, openMode));
                setOpen(true);
            } else if (openMode === "language_mode" && detail?.actions?.length) {
                setActions(detail.actions);
                setQuery(paletteSearchQuery(detail.filter, openMode));
                setOpen(true);
            } else if (detail?.actions?.length && openMode && openMode !== "files") {
                setActions(detail.actions);
                setQuery(paletteSearchQuery(detail.filter, openMode));
                setOpen(true);
            } else {
                setActions(getAppCommands());
                setQuery(paletteSearchQuery(detail?.filter, openMode));
                setOpen(true);
            }
        };
        window.addEventListener("shape-command-palette", handleOpen);

        const handleKeyDown = (e: KeyboardEvent) => {
            const isPaletteChord =
                ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p") ||
                e.key === "F1";
            if (isPaletteChord) {
                e.preventDefault();
                handleOpen();
            }
        };
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("shape-command-palette", handleOpen);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    const handleOpenChange = useCallback((value: boolean) => {
        setOpen(value);
        if (!value) {
            setQuery("");
            setSelectedIndex(0);
            setMode("");
            setFilterTab("all");
            setRecentFiles(false);
            setActiveFileBias(null);
            setActions([]);
            setAgentActions([]);
            setFileActions([]);
            setPlaceholder("Search agents, files, actions...");
        }
    }, []);

    // Load agents when browsing
    useEffect(() => {
        if (!open || !browse) return;
        void import("@/lib/backend").then(({ commands }) => {
            void Promise.all([
                commands.getConversations(),
                import("@/features/agent/subagents/store"),
            ]).then(([convs, sub]) => {
                const live = sub.getSubagents();
                const actions: EditorAction[] = [];
                for (const conv of convs.slice(0, 12)) {
                    const project = projectNameFromPath(conv.project_path);
                    const rel = formatRelativeAgo(conv.timestamp);
                    const lastModel = [...(conv.history || [])]
                        .reverse()
                        .find((m) => m.model)?.model;
                    actions.push({
                        id: `agent:${conv.id}`,
                        label: conv.title || "Untitled",
                        shortcut: "",
                        meta: [project, rel].filter(Boolean).join(" "),
                        section: "Recent Agents",
                        model: lastModel || "auto",
                        run: () => openAgentConversation(conv.id, conv.project_path),
                        delete: (e: React.MouseEvent) => {
                            e.stopPropagation();
                            e.preventDefault();
                            void commands.deleteConversation(conv.id).then(() => {
                                setAgentActions((prev) => prev.filter((a) => !a.id.startsWith(`agent:${conv.id}`)));
                                window.dispatchEvent(new CustomEvent("shape-chat-refresh"));
                            });
                        },
                    });
                    const fromHistory = (conv.history || [])
                        .flatMap((m) => sub.extractSubagentsFromText(typeof m.content === "string" ? m.content : "", conv.id));
                    const fromLive = live.filter((c) => c.parentId === conv.id);
                    const nested = new Map<string, { id: string; title: string; model?: string }>();
                    for (const item of fromHistory) nested.set(item.id, { id: item.id, title: item.title, model: item.model });
                    for (const item of fromLive) nested.set(item.id, { id: item.id, title: item.title, model: item.model });
                    for (const child of nested.values()) {
                        actions.push({
                            id: `agent:${conv.id}:sub:${child.id}`,
                            label: child.title,
                            shortcut: "",
                            section: "Recent Agents",
                            model: child.model || "auto",
                            reply: true,
                            run: () => {
                                openAgentConversation(conv.id, conv.project_path);
                                window.setTimeout(() => {
                                    window.dispatchEvent(
                                        new CustomEvent("shape-open-subagent", {
                                            detail: { id: child.id, parentId: conv.id },
                                        }),
                                    );
                                }, 80);
                            },
                        });
                    }
                }
                const leftover = live.filter(
                    (c) => !actions.some((a) => a.id.endsWith(`:sub:${c.id}`)),
                );
                if (leftover.length > 0) {
                    const parentLabel =
                        leftover[0]?.parentId === "__demo_chat__" ? "Demo" : "Current chat";
                    actions.unshift(
                        {
                            id: "agent:live-parent",
                            label: parentLabel,
                            shortcut: "",
                            section: "Recent Agents",
                            model: "auto",
                            run: () => {
                                if (leftover[0]?.parentId === "__demo_chat__") {
                                    window.dispatchEvent(new CustomEvent("shape-demo-chat"));
                                }
                            },
                        },
                        ...leftover.map((child) => ({
                            id: `agent:live-parent:sub:${child.id}`,
                            label: child.title,
                            shortcut: "",
                            section: "Recent Agents",
                            model: child.model || "auto",
                            reply: true,
                            run: () => {
                                if (child.parentId === "__demo_chat__") {
                                    window.dispatchEvent(new CustomEvent("shape-demo-chat"));
                                }
                                window.setTimeout(() => {
                                    window.dispatchEvent(
                                        new CustomEvent("shape-open-subagent", {
                                            detail: { id: child.id, parentId: child.parentId },
                                        }),
                                    );
                                }, 80);
                            },
                        })),
                    );
                }
                setAgentActions(actions);
            }).catch(() => setAgentActions([]));
        });
    }, [open, browse]);

    // Load files when browsing files / all
    useEffect(() => {
        if (!open || !browse) return;
        if (filterTab !== "all" && filterTab !== "files") {
            setFileActions([]);
            return;
        }
        const handle = window.setTimeout(() => {
            if (query.length > 0 && query.length < 2 && filterTab === "files") {
                setFileActions([]);
                return;
            }
            void import("@/lib/backend").then(({ commands }) => {
                if ((recentFiles || filterTab === "all") && !query.trim()) {
                    void commands.getProjectState().then((state) => {
                        const ordered = [...state.open_files].reverse().slice(0, 12);
                        setFileActions(
                            ordered.map((file) => ({
                                id: `file:${file.path}`,
                                label: file.name,
                                shortcut: "",
                                meta: file.path.replace(/\\/g, "/"),
                                section: "Recent Files",
                                icon: file.name,
                                run: () => commands.setActiveFile(file.path),
                            })),
                        );
                    }).catch(() => setFileActions([]));
                    return;
                }
                void commands.searchProjectFiles(query, 80)
                    .then((results) => {
                        setFileActions(
                            results.map((result) => ({
                                id: `file:${result.path}`,
                                label: result.name,
                                shortcut: "",
                                meta: result.relative_path,
                                section: "Files",
                                icon: result.name,
                                run: () => commands.openFile(result.path, result.name),
                            })),
                        );
                    })
                    .catch(() => setFileActions([]));
            });
        }, query.trim() ? 140 : 0);
        return () => window.clearTimeout(handle);
    }, [open, browse, filterTab, query, recentFiles]);

    // Legacy mode: files-only when mode===files still uses fileActions via browse

    const actionCommands = useMemo(() => {
        if (!browse) return actions;
        return actions.map((a) => ({ ...a, section: a.section || "Commands" }));
    }, [browse, actions]);

    const settingsCommands = useMemo(() => getSettingsPaletteActions(), []);

    const currentFileActions = useMemo((): EditorAction[] => {
        if (!browse || !activeFileBias) return [];
        const name = activeFileBias.split(/[\\/]/).pop() || activeFileBias;
        const path = activeFileBias;
        return [
            {
                id: `current-file:open:${path}`,
                label: name,
                shortcut: "",
                meta: path.replace(/\\/g, "/"),
                section: "Current File",
                icon: name,
                run: () => {
                    void import("@/lib/backend").then(({ commands }) => commands.setActiveFile(path));
                },
            },
            {
                id: "current-file:find",
                label: "Find in Current File",
                shortcut: shortcut("Find"),
                meta: name,
                section: "Current File",
                run: () => window.dispatchEvent(new Event("open-in-file-search")),
            },
            {
                id: "current-file:goto-symbol",
                label: "Go to Symbol in Editor…",
                shortcut: shortcut("Go to Symbol in Editor..."),
                meta: name,
                section: "Current File",
                run: () =>
                    window.dispatchEvent(
                        new CustomEvent("shape-command-palette", { detail: { mode: "editor_symbols" } }),
                    ),
            },
            {
                id: "current-file:goto-line",
                label: "Go to Line/Column…",
                shortcut: shortcut("Go to Line/Column..."),
                meta: name,
                section: "Current File",
                run: () =>
                    window.dispatchEvent(
                        new CustomEvent("shape-command-palette", {
                            detail: { mode: "goto_line", placeholder: "Line : Column" },
                        }),
                    ),
            },
            {
                id: "current-file:reveal",
                label: "Reveal in Explorer",
                shortcut: "",
                meta: name,
                section: "Current File",
                run: () => {
                    window.dispatchEvent(
                        new CustomEvent("shape-reveal-in-explorer", { detail: { path } }),
                    );
                },
            },
        ];
    }, [browse, activeFileBias]);

    const filtered = useMemo(() => {
        if (!browse) {
            if (!query.trim()) return actions;
            const q = query.toLowerCase();
            return actions
                .map((action) => ({
                    action,
                    score: Math.max(fuzzyScore(q, action.label), fuzzyScore(q, action.id) * 0.8),
                }))
                .filter((entry) => entry.score > 0)
                .sort((a, b) => b.score - a.score)
                .map((entry) => entry.action);
        }

        let pool: EditorAction[] = [];
        if (filterTab === "all") {
            const fileSlice = fileActions.slice(0, activeFileBias ? 6 : 8);
            const actionSlice = query.trim()
                ? actionCommands
                : actionCommands.slice(0, 48);
            pool = [
                ...currentFileActions,
                ...agentActions,
                ...fileSlice,
                ...actionSlice,
                ...settingsCommands.slice(0, 8),
            ];
        } else if (filterTab === "files") {
            pool = activeFileBias ? [...currentFileActions, ...fileActions] : fileActions;
        }

        if (!query.trim()) return pool;
        const q = query.toLowerCase();
        return pool
            .map((action) => ({
                action,
                score: Math.max(
                    fuzzyScore(q, action.label),
                    fuzzyScore(q, action.meta || "") * 0.7,
                    fuzzyScore(q, action.id) * 0.5,
                    // Boost current-file section when searching from omnibar
                    action.section === "Current File" ? 30 : 0,
                ),
            }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((entry) => entry.action);
    }, [
        browse,
        actions,
        filterTab,
        agentActions,
        fileActions,
        actionCommands,
        settingsCommands,
        currentFileActions,
        activeFileBias,
        query,
    ]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [filterTab, query, open]);

    useEffect(() => {
        if (!listRef.current) return;
        const item = listRef.current.querySelector(`[data-palette-index="${selectedIndex}"]`) as HTMLElement | null;
        item?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    const runAction = useCallback((action: EditorAction) => {
        setOpen(false);
        setTimeout(() => {
            try {
                action.run();
            } catch (e) {
                console.error("Command palette action failed:", e);
            }
        }, 50);
    }, []);

    const onInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((idx) => Math.min(idx + 1, Math.max(filtered.length - 1, 0)));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((idx) => Math.max(idx - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (mode === "goto_line") {
                const trimmed = query.trim();
                if (!trimmed) return;
                const parts = trimmed.split(/[:\s,]+/).map((p) => parseInt(p, 10)).filter((n) => !Number.isNaN(n));
                const line = parts[0] ?? 1;
                const column = parts[1] ?? 1;
                setOpen(false);
                window.dispatchEvent(new CustomEvent("shape-editor-action", {
                    detail: { action: "jumpToPosition", line, column },
                }));
                return;
            }
            if (filtered.length > 0 && selectedIndex < filtered.length) {
                runAction(filtered[selectedIndex]);
            }
        }
    };

    // Group for section headers when query empty in browse
    const showSections = browse && !query.trim();
    let lastSection = "";

    return (
        <Dialog.Root open={open} onOpenChange={handleOpenChange}>
            <Dialog.Portal container={overlayRoot}>
                <Dialog.Overlay className={SHAPE_OVERLAY_CLASS} />
                <Dialog.Content className={cn(
                    SHAPE_OVERLAY_CONTENT_CLASS,
                    SHAPE_MODAL_PANEL_CLASS,
                    "absolute top-[12%] left-1/2 z-50 -translate-x-1/2 flex squircle-2xl! w-[min(600px,calc(100%-2rem))] flex-col overflow-hidden focus:outline-none",
                )}>
                    <Dialog.Title className="sr-only">Command Palette</Dialog.Title>
                    <Dialog.Description className="sr-only">Search agents, files, and actions</Dialog.Description>
                    <div className="px-1">
                        <SearchInput
                            borderless
                            stickyFade={false}
                            ref={inputRef}
                            placeholder={placeholder}
                            autoFocus
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setSelectedIndex(0);
                            }}
                            onKeyDown={onInputKeyDown}
                            className="h-11"
                        />
                    </div>

                    <div
                        ref={listRef}
                        className="max-h-[420px] min-h-0 flex-1 overflow-x-hidden overflow-y-auto custom-scrollbar py-1"
                    >
                        {filtered.length === 0 && (
                            <div className="px-4 py-6 text-center text-sm text-text-muted">
                                {mode === "goto_line"
                                    ? "Line number, optional column (e.g. 42:10)"
                                    : mode === "editor_symbols"
                                      ? "No symbols in the current file"
                                      : "No matching results"}
                            </div>
                        )}
                        {filtered.map((action, idx) => {
                            const section = showSections ? action.section : undefined;
                            const showHeader = Boolean(section && section !== lastSection);
                            if (section) lastSection = section;
                            return (
                                <React.Fragment key={action.id}>
                                    {showHeader ? (
                                        <div className="px-3 pb-1 pt-2 text-sm font-medium text-text-muted">
                                            {section}
                                        </div>
                                    ) : null}
                                    <ContextMenu>
                                    <ContextMenuTrigger asChild>
                                    <div
                                        data-palette-index={idx}
                                        role="button"
                                        tabIndex={0}
                                        className={cn(
                                            "mx-1 flex min-w-0 cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-left",
                                            action.reply && "ml-6",
                                            idx === selectedIndex
                                                ? "bg-panel-hover text-text-primary"
                                                : "text-text-secondary hover:bg-panel-hover",
                                        )}
                                        onMouseEnter={() => setSelectedIndex(idx)}
                                        onClick={() => runAction(action)}
                                    >
                                        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                                            {action.reply ? (
                                                <span
                                                    className="h-5 w-px shrink-0 bg-border-subtle"
                                                    aria-hidden
                                                />
                                            ) : null}
                                            {(browse && (filterTab === "files" || action.id.startsWith("file:"))) || mode === "files" ? (
                                                <FileIcon name={action.icon || action.label} className="h-4 w-4 shrink-0 opacity-70" />
                                            ) : null}
                                            {browse && action.id.startsWith("agent:") ? (
                                                <span className="flex size-4 shrink-0 items-center justify-center">
                                                    {providerIcon(action.model || "auto", 14)}
                                                </span>
                                            ) : null}
                                            {!browse && action.icon ? (
                                                <FileIcon name={action.icon} className="h-4 w-4 shrink-0 opacity-70" />
                                            ) : null}
                                            <span className="min-w-0 truncate text-sm">{action.label}</span>
                                        </div>
                                        <div className="flex min-w-0 items-center">
                                            {action.meta ? (
                                                <span className="ml-2 max-w-[220px] truncate text-xs text-text-muted">
                                                    {action.meta}
                                                </span>
                                            ) : (
                                                <ShortcutBadge shortcut={action.shortcut} />
                                            )}
                                            {action.delete ? (
                                                <button
                                                    type="button"
                                                    onClick={action.delete}
                                                    className="ml-2 shrink-0 rounded p-1 text-text-muted transition-colors hover:bg-error/10 hover:text-error"
                                                    title="Delete"
                                                >
                                                    <Icon icon={RiDeleteBinLine} />
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                    </ContextMenuTrigger>
                                    <ContextMenuContent className="min-w-40">
                                        <ContextMenuItem onClick={() => runAction(action)}>Open</ContextMenuItem>
                                        {action.id.startsWith("file:") ? (
                                            <ContextMenuItem
                                                onClick={() => {
                                                    const p = action.meta;
                                                    if (p) void navigator.clipboard.writeText(p);
                                                }}
                                            >
                                                Copy Path
                                            </ContextMenuItem>
                                        ) : null}
                                        {action.delete ? (
                                            <>
                                                <ContextMenuSeparator />
                                                <ContextMenuItem
                                                    onClick={(e) => action.delete?.(e as unknown as React.MouseEvent)}
                                                >
                                                    Delete
                                                </ContextMenuItem>
                                            </>
                                        ) : null}
                                    </ContextMenuContent>
                                    </ContextMenu>
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {browse ? (
                        <div className="flex shrink-0 items-center gap-4 border-t border-border px-2 py-1.5 text-sm text-text-muted">
                            <span className="flex items-center gap-1">
                                <kbd className="text-xs bg-panel-hover text-text-secondary rounded-sm px-1.5 py-0.5">↑↓</kbd> <span>Select</span>
                            </span>
                            <span>
                                <kbd className="text-xs bg-panel-hover text-text-secondary rounded-sm px-1.5 py-0.5">⏎</kbd> <span>Open</span>
                            </span>
                            <span>
                                <kbd className="text-xs bg-panel-hover text-text-secondary rounded-sm px-1.5 py-0.5">Ctrl+[</kbd>
                                {" or "}
                                <kbd className="text-xs bg-panel-hover text-text-secondary rounded-sm px-1.5 py-0.5">Ctrl+]</kbd>
                                {" Change Filter"}
                            </span>
                        </div>
                    ) : null}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

function browsePlaceholder(mode: string, filter: string): string {
    if (mode === "goto_line") return "Line : Column";
    if (mode === "editor_symbols") return "Search symbols in file…";
    if (mode === "workspace_symbols") return "Search symbols in workspace…";
    if (filter === "files" || mode === "files") return "Search files by name...";
    if (filter === "agents") return "Search agents…";
    return "Search agents, files, actions...";
}

/** App-level workbench commands for the command palette. */
function getAppCommands(): EditorAction[] {
    const commands: EditorAction[] = [
        // ── Navigation ───────────────────────────────────────────────────────
        {
            id: "app.file.goToFile",
            label: "Go to File...",
            shortcut: shortcut("Go to File"),
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-command-palette", { detail: { mode: "files" } }),
                ),
        },
        {
            id: "app.chat.openDemo",
            label: "Chat: Open Demo",
            shortcut: "",
            run: () => {
                window.dispatchEvent(
                    new CustomEvent("shape-layout-toggle", {
                        detail: { id: "secondary-sidebar", value: true },
                    }),
                );
                window.dispatchEvent(new CustomEvent("shape-demo-chat"));
            },
        },
        {
            id: "app.file.recentFiles",
            label: "Recent Files",
            shortcut: shortcut("Recent Files"),
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-command-palette", {
                        detail: { mode: "files", recent: true, placeholder: "Recent files..." },
                    }),
                ),
        },
        {
            id: "app.nav.goToLine",
            label: "Go to Line/Column...",
            shortcut: shortcut("Go to Line/Column..."),
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-command-palette", {
                        detail: { mode: "goto_line", placeholder: "Line : Column" },
                    }),
                ),
        },
        {
            id: "app.nav.findInFile",
            label: "Find in Current File",
            shortcut: shortcut("Find"),
            run: () => window.dispatchEvent(new Event("open-in-file-search")),
        },
        // ── View / Panels ──────────────────────────────────────────────────────
        {
            id: "app.view.sourceControl",
            label: "View: Show Source Control",
            shortcut: shortcut("Source Control"),
            run: () => showSidebarTab("source"),
        },
        {
            id: "app.view.gitGraph",
            label: "View: Show Git Graph",
            shortcut: shortcut("Git Graph"),
            run: () => showSidebarTab("graph"),
        },
        {
            id: "app.view.togglePrimarySidebar",
            label: "View: Toggle Primary Sidebar",
            shortcut: "",
            run: () => toggleLayout("primary-sidebar"),
        },
        {
            id: "app.view.toggleChat",
            label: "View: Toggle AI Chat",
            shortcut: shortcut("AI Chat"),
            run: () => toggleLayout("secondary-sidebar"),
        },
        {
            id: "app.view.terminal",
            label: "View: Toggle Terminal Panel",
            shortcut: shortcut("Terminal"),
            run: () => {
                toggleLayout("panel");
                window.dispatchEvent(new CustomEvent("shape-terminal-shortcut", { detail: { action: "open" } }));
            },
        },
        {
            id: "app.view.newTerminal",
            label: "Terminal: New Terminal",
            shortcut: shortcut("New Terminal"),
            run: () => {
                window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }));
                window.dispatchEvent(new CustomEvent("shape-terminal-shortcut", { detail: { action: "new" } }));
            },
        },
        {
            id: "app.view.splitTerminal",
            label: "Terminal: Split Terminal",
            shortcut: "",
            run: () => {
                window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }));
                window.dispatchEvent(new CustomEvent("shape-terminal-shortcut", { detail: { action: "split" } }));
            },
        },
        {
            id: "app.view.zenMode",
            label: "View: Toggle Zen Mode",
            shortcut: shortcut("Zen Mode"),
            run: () => window.dispatchEvent(new Event("shape-toggle-zen-mode")),
        },
        {
            id: "app.view.resetLayout",
            label: "View: Reset Layout",
            shortcut: shortcut("Reset Layout"),
            run: () => {
                window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "primary-sidebar", value: true } }));
                window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }));
                window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "secondary-sidebar", value: false } }));
                window.dispatchEvent(new Event("shape-layout-reset"));
            },
        },
        {
            id: "app.developer.toggleDevTools",
            label: "Developer: Toggle Developer Tools",
            shortcut: "",
            run: () => {
                void import("@/lib/settings").then(({ getSettings, updateSettingSection }) => {
                    const enabled = getSettings().developer?.enableDevTools === true;
                    if (!enabled) {
                        updateSettingSection("developer", { enableDevTools: true });
                    }
                    void import("@/lib/window/tauri-window").then(({ toggleDevTools }) => {
                        void toggleDevTools();
                    });
                });
            },
        },
        {
            id: "app.view.chatHistory",
            label: "Chat: Show History",
            shortcut: "",
            run: () => {
                window.dispatchEvent(
                    new CustomEvent("shape-layout-toggle", {
                        detail: { id: "secondary-sidebar", value: true },
                    }),
                );
                window.dispatchEvent(
                    new CustomEvent("shape-command-palette", {
                        detail: {
                            placeholder: "Search agents…",
                        },
                    }),
                );
            },
        },
        // ── Editor settings ────────────────────────────────────────────────────
        {
            id: "app.settings.open",
            label: "Preferences: Open Settings",
            shortcut: shortcut("Settings"),
            run: () => window.dispatchEvent(new Event("shape-open-settings")),
        },
        {
            id: "app.editor.wordWrap",
            label: "Editor: Toggle Word Wrap",
            shortcut: "Alt+Z",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", { detail: { action: "toggleWordWrap" } })
                ),
        },
        {
            id: "app.editor.minimap",
            label: "Editor: Toggle Minimap",
            shortcut: "",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", { detail: { action: "toggleMinimap" } })
                ),
        },
        {
            id: "app.editor.languageMode",
            label: "Change Language Mode…",
            shortcut: "",
            run: () => {
                import("@/features/editor/ui/main/ui/language-picker").then(({ openLanguageModePicker }) => {
                    // Get active file from editor status
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const path = (window as any).__shapeActivePath || "";
                    openLanguageModePicker(path);
                });
            },
        },
        {
            id: "app.editor.formatDoc",
            label: "Format Document",
            shortcut: "Shift+Alt+F",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", { detail: { action: "editor.action.formatDocument" } })
                ),
        },
        {
            id: "app.editor.formatSel",
            label: "Format Selection",
            shortcut: "Ctrl+K Ctrl+F",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", { detail: { action: "editor.action.formatSelection" } })
                ),
        },
        {
            id: "app.editor.rename",
            label: "Rename Symbol",
            shortcut: "F2",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", { detail: { action: "editor.action.rename" } })
                ),
        },
        {
            id: "app.editor.quickFix",
            label: "Quick Fix…",
            shortcut: "Ctrl+.",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", { detail: { action: "editor.action.quickFix" } })
                ),
        },
        {
            id: "app.editor.organizeImports",
            label: "Organize Imports",
            shortcut: "Shift+Alt+O",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.organizeImports" },
                    })
                ),
        },
        {
            id: "app.editor.goToDefinition",
            label: "Go to Definition",
            shortcut: "F12",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", { detail: { action: "editor.action.revealDefinition" } })
                ),
        },
        {
            id: "app.editor.findRefs",
            label: "Find All References",
            shortcut: "Shift+F12",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.referenceSearch.trigger" },
                    })
                ),
        },
        {
            id: "app.editor.peekDef",
            label: "Peek Definition",
            shortcut: "Alt+F12",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.peekDefinition" },
                    })
                ),
        },
        {
            id: "app.editor.inlayHints",
            label: "Editor: Toggle Inlay Hints",
            shortcut: "",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", { detail: { action: "editor.action.inlayHints.toggle" } })
                ),
        },
        {
            id: "app.editor.foldAll",
            label: "Fold All Regions",
            shortcut: "Ctrl+K Ctrl+0",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", { detail: { action: "editor.foldAll" } })
                ),
        },
        {
            id: "app.editor.unfoldAll",
            label: "Unfold All Regions",
            shortcut: "Ctrl+K Ctrl+J",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", { detail: { action: "editor.unfoldAll" } })
                ),
        },
        {
            id: "app.editor.toggleComment",
            label: "Toggle Line Comment",
            shortcut: "Ctrl+/",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.commentLine" },
                    })
                ),
        },
        {
            id: "app.editor.blockComment",
            label: "Toggle Block Comment",
            shortcut: "Shift+Alt+A",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.blockComment" },
                    })
                ),
        },
        {
            id: "app.editor.trimTrailing",
            label: "Delete Trailing Whitespace",
            shortcut: "",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.trimTrailingWhitespace" },
                    })
                ),
        },
        {
            id: "app.editor.indentLines",
            label: "Indent Lines",
            shortcut: "Ctrl+]",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", { detail: { action: "editor.action.indentLines" } })
                ),
        },
        {
            id: "app.editor.outdentLines",
            label: "Outdent Lines",
            shortcut: "Ctrl+[",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", { detail: { action: "editor.action.outdentLines" } })
                ),
        },
        {
            id: "app.editor.duplicateLine",
            label: "Duplicate Line Down",
            shortcut: "Shift+Alt+↓",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.copyLinesDownAction" },
                    })
                ),
        },
        {
            id: "app.editor.moveLinesUp",
            label: "Move Line Up",
            shortcut: "Alt+↑",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.moveLinesUpAction" },
                    })
                ),
        },
        {
            id: "app.editor.moveLinesDown",
            label: "Move Line Down",
            shortcut: "Alt+↓",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.moveLinesDownAction" },
                    })
                ),
        },
        {
            id: "app.editor.selectAll",
            label: "Select All",
            shortcut: "Ctrl+A",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", { detail: { action: "editor.action.selectAll" } })
                ),
        },
        {
            id: "app.editor.selectHighlights",
            label: "Select All Occurrences",
            shortcut: "Ctrl+Shift+L",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.selectHighlights" },
                    })
                ),
        },
        {
            id: "app.editor.sortLinesAsc",
            label: "Sort Lines Ascending",
            shortcut: "",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.sortLinesAscending" },
                    })
                ),
        },
        {
            id: "app.editor.sortLinesDesc",
            label: "Sort Lines Descending",
            shortcut: "",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.sortLinesDescending" },
                    })
                ),
        },
        {
            id: "app.editor.transformUppercase",
            label: "Transform to Uppercase",
            shortcut: "",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.transformToUppercase" },
                    })
                ),
        },
        {
            id: "app.editor.transformLowercase",
            label: "Transform to Lowercase",
            shortcut: "",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.transformToLowercase" },
                    })
                ),
        },
        {
            id: "app.editor.transformTitlecase",
            label: "Transform to Title Case",
            shortcut: "",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.transformToTitlecase" },
                    })
                ),
        },
        {
            id: "app.editor.joinLines",
            label: "Join Lines",
            shortcut: "",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.joinLines" },
                    })
                ),
        },
        {
            id: "app.editor.addCursorAbove",
            label: "Add Cursor Above",
            shortcut: "Ctrl+Alt+↑",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.insertCursorAbove" },
                    })
                ),
        },
        {
            id: "app.editor.addCursorBelow",
            label: "Add Cursor Below",
            shortcut: "Ctrl+Alt+↓",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.insertCursorBelow" },
                    })
                ),
        },
        {
            id: "app.editor.nextDiagnostic",
            label: "Go to Next Problem",
            shortcut: "F8",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.marker.next" },
                    })
                ),
        },
        {
            id: "app.editor.prevDiagnostic",
            label: "Go to Previous Problem",
            shortcut: "Shift+F8",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", {
                        detail: { action: "editor.action.marker.prev" },
                    })
                ),
        },
        // ── File ───────────────────────────────────────────────────────────────
        {
            id: "app.file.new",
            label: "File: New Text File",
            shortcut: shortcut("New Text File"),
            run: () =>
                window.dispatchEvent(new CustomEvent("shape-explorer-create", { detail: { type: "file" } })),
        },
        {
            id: "app.file.open",
            label: "File: Open File",
            shortcut: shortcut("Open File"),
            run: () => window.dispatchEvent(new Event("open-file-request")),
        },
        {
            id: "app.file.openFolder",
            label: "File: Open Folder",
            shortcut: shortcut("Open Folder"),
            run: () => window.dispatchEvent(new Event("shape-open-project-pick")),
        },
        {
            id: "app.file.newNext",
            label: "File: Create Next.js Project",
            shortcut: "",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-scaffold-project", { detail: { kind: "next" } }),
                ),
        },
        {
            id: "app.file.newVite",
            label: "File: Create Vite Project",
            shortcut: "",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-scaffold-project", { detail: { kind: "vite" } }),
                ),
        },
        {
            id: "app.file.newAstro",
            label: "File: Create Astro Project",
            shortcut: "",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-scaffold-project", { detail: { kind: "astro" } }),
                ),
        },
        {
            id: "app.file.newRemix",
            label: "File: Create Remix Project",
            shortcut: "",
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-scaffold-project", { detail: { kind: "remix" } }),
                ),
        },
        {
            id: "app.file.save",
            label: "File: Save",
            shortcut: shortcut("Save"),
            run: () => window.dispatchEvent(new Event("save-request")),
        },
        {
            id: "app.file.saveAll",
            label: "File: Save All",
            shortcut: shortcut("Save All"),
            run: () => window.dispatchEvent(new Event("save-all-request")),
        },
        {
            id: "app.file.closeFolder",
            label: "File: Close Folder",
            shortcut: shortcut("Close Folder"),
            run: () => {
                void import("@/lib/workspace/last-project").then(({ saveLastProject }) => saveLastProject(null));
                void import("@/lib/backend").then(({ commands }) => commands.setProjectPath(null));
            },
        },
    ];

    // Focused popout has no sidebars/status — zen mode is not applicable.
    if (isPopoutPath()) {
        return commands.filter((c) => c.id !== "app.view.zenMode");
    }
    return commands;
}

