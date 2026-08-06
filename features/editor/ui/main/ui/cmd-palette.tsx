"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@/components/ui/icon";
import { FileIcon } from "@/components/ui/file-icon";

import { getShortcutForLabel } from "@/lib/ui/shortcuts";
import { SHAPE_MODAL_PANEL_CLASS, SHAPE_OVERLAY_CLASS, SHAPE_OVERLAY_CONTENT_CLASS } from "@/lib/ui/modal-overlay";
import { cn } from "@/lib/utils";
import { isPopoutPath } from "@/lib/tauri-window";
import { SETTINGS_CATEGORIES } from "@/features/settings/ui/settings-nav";
import { openSettingsWindow } from "@/lib/open-settings";

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
}

type PaletteFilter = "all" | "agents" | "files" | "actions" | "settings";

const PALETTE_FILTERS: { id: PaletteFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "agents", label: "Agents" },
    { id: "files", label: "Files" },
    { id: "actions", label: "Actions" },
    { id: "settings", label: "Settings" },
];

interface CommandPaletteOpenDetail {
    mode?: string;
    filter?: string;
    placeholder?: string;
    recent?: boolean;
    actions?: EditorAction[];
}

function isBrowseMode(mode: string): boolean {
    return !mode || mode === "files";
}

function formatRelativeAgo(timestamp: number): string {
    const now = Date.now() / 1000;
    const diff = Math.max(0, now - timestamp);
    const minutes = Math.floor(diff / 60);
    const hours = Math.floor(diff / 3600);
    const days = Math.floor(diff / 86400);
    if (days >= 1) return `${days}d`;
    if (hours >= 1) return `${hours}h`;
    return `${Math.max(1, minutes)}m`;
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

/** Monaco actions that open built-in widgets/overlays — handled by Shape UI instead. */
const MONACO_UI_ACTION_IDS = new Set([
    "editor.action.quickCommand",
    "editor.action.gotoLine",
    "editor.action.quickOutline",
    "editor.action.startFindAction",
    "editor.action.startFindReplaceAction",
    "actions.find",
    "actions.findWithSelection",
    "editor.action.referenceSearch.trigger",
    "editor.action.showReferences",
    "editor.action.peekLocations",
    "editor.action.rename",
    "editor.action.quickFix",
    "editor.action.peekDefinition",
    "editor.action.peekDeclaration",
    "editor.action.peekTypeDefinition",
    "editor.action.peekImplementation",
    "editor.action.revealDefinitionAside",
    "editor.action.showAccessibilityHelp",
    "editor.action.focusFindWidget",
    "editor.action.focusFindReplaceWidget",
    "editor.action.closeFindWidget",
    "editor.action.triggerSuggest",
    "editor.action.triggerParameterHints",
    "editor.action.showHover",
    "editor.action.showContextMenu",
    "editor.action.inlayHints.toggle",
    "editor.action.formatDocument",
    "editor.action.formatSelection",
    "editor.action.organizeImports",
    "editor.action.revealDefinition",
    "editor.action.marker.next",
    "editor.action.marker.prev",
    "editor.foldAll",
    "editor.unfoldAll",
    "editor.action.commentLine",
    "editor.action.blockComment",
    "editor.action.trimTrailingWhitespace",
    "editor.action.indentLines",
    "editor.action.outdentLines",
    "editor.action.copyLinesDownAction",
    "editor.action.moveLinesUpAction",
    "editor.action.moveLinesDownAction",
    "editor.action.selectAll",
    "editor.action.selectHighlights",
    "editor.action.sortLinesAscending",
    "editor.action.sortLinesDescending",
    "editor.action.transformToUppercase",
    "editor.action.transformToLowercase",
    "editor.action.transformToTitlecase",
    "editor.action.joinLines",
    "editor.action.insertCursorAbove",
    "editor.action.insertCursorBelow",
]);

function isMonacoUiAction(actionId: string, label: string): boolean {
    if (MONACO_UI_ACTION_IDS.has(actionId)) return true;
    const lower = label.toLowerCase();
    if (lower.includes("peek ") || lower.startsWith("peek ")) return true;
    if (lower.includes("widget") || lower.includes("accessibility help")) return true;
    return false;
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
                    className="rounded-lg bg-white/5 px-2 py-0.5 text-xs font-sans text-text-muted"
                >
                    {part}
                </kbd>
            ))}
        </span>
    );
}

export function CommandPalette() {
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
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const browse = isBrowseMode(mode);

    useEffect(() => {
        const handleOpen = (e?: Event) => {
            const customEvent = e as CustomEvent<CommandPaletteOpenDetail>;
            const detail = customEvent?.detail;
            const openMode = detail?.mode || "";
            const requestedFilter = (detail?.filter || "") as PaletteFilter | "";
            setMode(openMode);
            setRecentFiles(Boolean(detail?.recent));

            if (requestedFilter && PALETTE_FILTERS.some((f) => f.id === requestedFilter)) {
                setFilterTab(requestedFilter);
            } else if (openMode === "files") {
                setFilterTab("files");
            } else if (!openMode) {
                setFilterTab("all");
            }

            const defaultPlaceholder = browsePlaceholder(openMode, requestedFilter || (openMode === "files" ? "files" : "all"));
            setPlaceholder(detail?.placeholder || defaultPlaceholder);

            if (openMode === "workspace_symbols") {
                import("@/features/editor/lsp/workspace-symbols").then(({ buildWorkspaceSymbolActions }) => {
                    buildWorkspaceSymbolActions().then((symbolActions) => {
                        setActions(symbolActions);
                        setQuery(detail?.filter && !PALETTE_FILTERS.some((f) => f.id === detail.filter) ? detail.filter : "");
                        setOpen(true);
                    });
                });
            } else if (openMode === "goto_line") {
                setActions([]);
                setQuery(detail?.filter || "");
                setOpen(true);
            } else if (openMode === "editor_symbols") {
                import("@/features/editor/lsp/document-symbols").then(({ buildDocumentSymbolActions }) => {
                    buildDocumentSymbolActions("").then((symbolActions) => {
                        setActions(symbolActions);
                        setQuery("");
                        setOpen(true);
                    });
                });
            } else if (openMode === "language_mode" && detail?.actions?.length) {
                setActions(detail.actions);
                setQuery(detail.filter || "");
                setOpen(true);
            } else if (detail?.actions?.length && openMode && openMode !== "files") {
                setActions(detail.actions);
                setQuery(detail.filter || "");
                setOpen(true);
            } else {
                // Browse mode: All / Agents / Files / Actions / Settings
                setActions(getMonacoActions());
                setQuery(
                    detail?.filter && !PALETTE_FILTERS.some((f) => f.id === detail.filter)
                        ? detail.filter
                        : "",
                );
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
            setActions([]);
            setAgentActions([]);
            setFileActions([]);
            setPlaceholder("Search agents, files, actions...");
        }
    }, []);

    // Load agents when browsing
    useEffect(() => {
        if (!open || !browse) return;
        if (filterTab !== "all" && filterTab !== "agents") {
            setAgentActions([]);
            return;
        }
        void import("@/lib/backend").then(({ commands }) => {
            void commands.getConversations().then((convs) => {
                setAgentActions(
                    convs.slice(0, 40).map((conv) => {
                        const project = projectNameFromPath(conv.project_path);
                        const rel = formatRelativeAgo(conv.timestamp);
                        return {
                            id: `agent:${conv.id}`,
                            label: conv.title || "Untitled",
                            shortcut: "",
                            meta: [project, rel].filter(Boolean).join(" "),
                            section: "Recent Agents",
                            run: () => openAgentConversation(conv.id, conv.project_path),
                            delete: (e: React.MouseEvent) => {
                                e.stopPropagation();
                                e.preventDefault();
                                void commands.deleteConversation(conv.id).then(() => {
                                    setAgentActions((prev) => prev.filter((a) => a.id !== `agent:${conv.id}`));
                                    window.dispatchEvent(new CustomEvent("shape-chat-refresh"));
                                });
                            },
                        } satisfies EditorAction;
                    }),
                );
            }).catch(() => setAgentActions([]));
        });
    }, [open, browse, filterTab]);

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
    useEffect(() => {
        if (mode !== "editor_symbols" || !open) return;
        const handle = window.setTimeout(() => {
            import("@/features/editor/lsp/document-symbols").then(({ buildDocumentSymbolActions }) => {
                buildDocumentSymbolActions(query.trim()).then(setActions);
            });
        }, query.trim() ? 200 : 0);
        return () => window.clearTimeout(handle);
    }, [mode, open, query]);

    useEffect(() => {
        if (mode !== "workspace_symbols" || !open) return;
        const handle = window.setTimeout(() => {
            import("@/features/editor/lsp/workspace-symbols").then(({ buildWorkspaceSymbolActions }) => {
                buildWorkspaceSymbolActions(query.trim()).then(setActions);
            });
        }, query.trim() ? 200 : 0);
        return () => window.clearTimeout(handle);
    }, [mode, open, query]);

    const actionCommands = useMemo(() => {
        if (!browse) return actions;
        // getMonacoActions() already merges app + editor commands
        return actions.map((a) => ({ ...a, section: a.section || "Skills & Commands" }));
    }, [browse, actions]);

    const settingsCommands = useMemo(() => getSettingsPaletteActions(), []);

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
            pool = [...agentActions.slice(0, 8), ...fileActions.slice(0, 8), ...actionCommands.slice(0, 24), ...settingsCommands.slice(0, 8)];
        } else if (filterTab === "agents") {
            pool = agentActions;
        } else if (filterTab === "files") {
            pool = fileActions;
        } else if (filterTab === "actions") {
            pool = actionCommands;
        } else if (filterTab === "settings") {
            pool = settingsCommands;
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
                ),
            }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((entry) => entry.action);
    }, [browse, actions, filterTab, agentActions, fileActions, actionCommands, settingsCommands, query]);

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

    const cycleFilter = useCallback((dir: 1 | -1) => {
        if (!browse) return;
        const idx = PALETTE_FILTERS.findIndex((f) => f.id === filterTab);
        const next = (idx + dir + PALETTE_FILTERS.length) % PALETTE_FILTERS.length;
        setFilterTab(PALETTE_FILTERS[next].id);
        setSelectedIndex(0);
    }, [browse, filterTab]);

    const onInputKeyDown = (e: React.KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === "[" || e.key === "]")) {
            e.preventDefault();
            cycleFilter(e.key === "]" ? 1 : -1);
            return;
        }
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
            <Dialog.Portal>
                <Dialog.Overlay className={SHAPE_OVERLAY_CLASS} />
                <Dialog.Content className={cn(
                    SHAPE_OVERLAY_CONTENT_CLASS,
                    SHAPE_MODAL_PANEL_CLASS,
                    "fixed top-[12%] left-1/2 -translate-x-1/2 flex w-full max-w-[640px] flex-col overflow-hidden focus:outline-none",
                )}>
                    <Dialog.Title className="sr-only">Command Palette</Dialog.Title>
                    <Dialog.Description className="sr-only">Search agents, files, and actions</Dialog.Description>
                    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
                        <Icon name="search" size={15} className="shrink-0 text-text-muted" />
                        <input
                            ref={inputRef}
                            className="h-10 flex-1 border-none bg-transparent px-0 font-sans text-sm text-text-primary outline-none placeholder:text-text-muted"
                            placeholder={placeholder}
                            autoFocus
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setSelectedIndex(0);
                            }}
                            onKeyDown={onInputKeyDown}
                        />
                    </div>

                    {browse ? (
                        <div className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-3 py-2">
                            {PALETTE_FILTERS.map((f) => (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => {
                                        setFilterTab(f.id);
                                        setSelectedIndex(0);
                                    }}
                                    className={cn(
                                        "rounded-md px-2.5 py-1 text-xs transition-colors",
                                        filterTab === f.id
                                            ? "bg-surface-3 text-text-primary"
                                            : "text-text-muted hover:bg-panel-hover hover:text-text-secondary",
                                    )}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    ) : null}

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
                                      : filterTab === "agents"
                                        ? "No agents yet"
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
                                        <div className="px-3 pb-1 pt-2 text-2xs font-medium uppercase tracking-wide text-text-muted">
                                            {section}
                                        </div>
                                    ) : null}
                                    <div
                                        data-palette-index={idx}
                                        role="button"
                                        tabIndex={0}
                                        className={cn(
                                            "mx-1 flex min-w-0 cursor-pointer items-center justify-between rounded-lg px-3 py-1.5 text-left",
                                            idx === selectedIndex
                                                ? "bg-panel-hover text-text-primary"
                                                : "text-text-secondary hover:bg-panel-hover",
                                        )}
                                        onMouseEnter={() => setSelectedIndex(idx)}
                                        onClick={() => runAction(action)}
                                    >
                                        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                                            {(browse && (filterTab === "files" || action.id.startsWith("file:"))) || mode === "files" ? (
                                                <FileIcon name={action.icon || action.label} className="h-4 w-4 shrink-0 opacity-70" />
                                            ) : null}
                                            {browse && action.id.startsWith("agent:") ? (
                                                <Icon name="agents" size={14} className="shrink-0 text-text-muted" />
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
                                                    <Icon name="delete" size={14} />
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {browse ? (
                        <div className="flex shrink-0 items-center gap-4 border-t border-border-subtle px-3 py-2 text-2xs text-text-muted">
                            <span>
                                <kbd className="text-text-secondary">↑↓</kbd> Select
                            </span>
                            <span>
                                <kbd className="text-text-secondary">⏎</kbd> Open
                            </span>
                            <span>
                                <kbd className="text-text-secondary">Ctrl+[</kbd>
                                {" or "}
                                <kbd className="text-text-secondary">Ctrl+]</kbd>
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

/**
 * Decode a Monaco numeric keybinding into a human-readable shortcut string.
 * Monaco encodes keybindings as bitfields combining KeyMod and KeyCode values.
 */
function decodeKeybinding(keybinding: number): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monaco = (window as any).monaco;
    if (!monaco) return "";

    try {
        // Use Monaco's internal keybinding service to resolve to a label
        const editors = monaco.editor?.getEditors?.() ?? [];
        if (editors.length > 0) {
            const editor = editors[0];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const kbService = (editor as any)._standaloneKeybindingService;
            if (kbService?.resolveKeybinding) {
                const createKeybinding = kbService.resolveKeybinding(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    new (monaco as any).Keybinding(keybinding)
                );
                if (createKeybinding?.[0]) {
                    const label = createKeybinding[0].getLabel?.();
                    if (label) return label;
                }
            }
        }
    } catch {
        // Fall through to manual decode
    }

    // Manual bitfield decode fallback
    const parts: string[] = [];

    // Monaco KeyMod values
    const CtrlCmd = 2048;
    const Shift = 1024;
    const Alt = 512;
    const WinCtrl = 256;

    if (keybinding & CtrlCmd) parts.push("Ctrl");
    if (keybinding & Shift) parts.push("Shift");
    if (keybinding & Alt) parts.push("Alt");
    if (keybinding & WinCtrl) parts.push("Win");

    // Strip modifier bits to get the raw KeyCode
    const keyCode = keybinding & 0xFF;
    const keyName = getKeyName(keyCode);
    if (keyName) parts.push(keyName);

    return parts.join("+");
}

/**
 * Map a Monaco KeyCode value to a human-readable key name
 */
function getKeyName(keyCode: number): string {
    const keyCodeMap: Record<number, string> = {
        0: "", 1: "", // Unknown / Backspace internal
        3: "Enter", 4: "Tab", 5: "Space",
        6: "Backspace", 7: "Escape",
        // arrows
        15: "↑", 16: "↓", 17: "←", 18: "→",
        // Page navigation
        11: "Home", 12: "End",
        13: "PageUp", 14: "PageDown",
        19: "Insert", 20: "Delete",
        // F-keys
        59: "F1", 60: "F2", 61: "F3", 62: "F4",
        63: "F5", 64: "F6", 65: "F7", 66: "F8",
        67: "F9", 68: "F10", 69: "F11", 70: "F12",
        // Digits 0-9
        21: "0", 22: "1", 23: "2", 24: "3", 25: "4",
        26: "5", 27: "6", 28: "7", 29: "8", 30: "9",
        // Letters A-Z
        31: "A", 32: "B", 33: "C", 34: "D", 35: "E",
        36: "F", 37: "G", 38: "H", 39: "I", 40: "J",
        41: "K", 42: "L", 43: "M", 44: "N", 45: "O",
        46: "P", 47: "Q", 48: "R", 49: "S", 50: "T",
        51: "U", 52: "V", 53: "W", 54: "X", 55: "Y",
        56: "Z",
        // Punctuation & symbols
        80: ";", 81: "=", 82: ",", 83: "-",
        84: ".", 85: "/", 86: "`",
        87: "[", 88: "\\", 89: "]", 90: "'",
    };

    return keyCodeMap[keyCode] ?? "";
}

/**
 * Look up the keybinding label string for an action using Monaco's keybinding service
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getActionKeybindingLabel(editor: any, actionId: string): string {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const kbService = (editor as any)._standaloneKeybindingService;
        if (kbService?.lookupKeybinding) {
            const kb = kbService.lookupKeybinding(actionId);
            if (kb) {
                const label = kb.getLabel?.();
                if (label) return label;
            }
        }
    } catch {
        // ignore
    }
    return "";
}

/** App-level commands that go beyond Monaco editor actions (like VS Code's workbench commands). */
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
            id: "app.nav.editorSymbols",
            label: "Go to Symbol in Editor...",
            shortcut: shortcut("Go to Symbol in Editor..."),
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-command-palette", { detail: { mode: "editor_symbols" } }),
                ),
        },
        {
            id: "app.view.workspaceSymbols",
            label: "Go to Symbol in Workspace...",
            shortcut: shortcut("Go to Symbol in Workspace..."),
            run: () =>
                window.dispatchEvent(
                    new CustomEvent("shape-command-palette", { detail: { mode: "workspace_symbols" } }),
                ),
        },
        {
            id: "app.nav.findInFile",
            label: "Find in Current File",
            shortcut: shortcut("Find"),
            run: () => window.dispatchEvent(new Event("open-in-file-search")),
        },
        {
            id: "app.nav.findInFiles",
            label: "Find in Files",
            shortcut: shortcut("Find in Files"),
            run: () => openSearchSidebar("search"),
        },
        {
            id: "app.nav.replaceInFiles",
            label: "Replace in Files",
            shortcut: shortcut("Replace in Files"),
            run: () => openSearchSidebar("replace"),
        },
        // ── View / Panels ──────────────────────────────────────────────────────
        {
            id: "app.view.explorer",
            label: "View: Show Explorer",
            shortcut: shortcut("Explorer"),
            run: () => showSidebarTab("explorer"),
        },
        {
            id: "app.view.revealInExplorer",
            label: "Reveal Active File in Explorer",
            shortcut: "",
            run: () => {
                void import("@/lib/backend").then(({ commands }) =>
                    commands.getProjectState().then((state) => {
                        if (!state.active_file) return;
                        window.dispatchEvent(
                            new CustomEvent("shape-reveal-in-explorer", {
                                detail: { path: state.active_file },
                            }),
                        );
                    }),
                );
            },
        },
        {
            id: "app.view.search",
            label: "View: Show Search",
            shortcut: shortcut("Search"),
            run: () => showSidebarTab("search"),
        },
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
            id: "app.view.outline",
            label: "View: Show Outline",
            shortcut: shortcut("Outline"),
            run: () => showSidebarTab("outline"),
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
            id: "app.view.problems",
            label: "View: Show Problems",
            shortcut: shortcut("Problems"),
            run: () => {
                window.dispatchEvent(new Event("shape-open-problems"));
                window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }));
            },
        },
        {
            id: "app.view.output",
            label: "View: Show Output",
            shortcut: shortcut("Output"),
            run: () => {
                window.dispatchEvent(new Event("shape-open-output"));
                window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }));
            },
        },
        {
            id: "app.view.preview",
            label: "View: Show Preview",
            shortcut: "",
            run: () => {
                window.dispatchEvent(new Event("shape-open-preview"));
                window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }));
            },
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
                    void import("@/lib/tauri-window").then(({ toggleDevTools }) => {
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
                            filter: "agents",
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
            id: "app.stats.open",
            label: "View: Open Project Statistics",
            shortcut: "",
            run: () => {
                void import("@/lib/open-stats-window").then(({ openStatsWindow }) => openStatsWindow());
            },
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
            run: async () => {
                const { open } = await import("@tauri-apps/plugin-dialog");
                const selected = await open({ directory: true, multiple: false });
                if (selected) {
                    window.dispatchEvent(
                        new CustomEvent("shape-open-project", { detail: { path: selected as string } }),
                    );
                }
            },
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
                void import("@/lib/last-project").then(({ saveLastProject }) => saveLastProject(null));
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

/**
 * Extract all actions from the currently active Monaco editor instance
 */
function getMonacoActions(): EditorAction[] {
    const appCommands = getAppCommands();

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const monacoEditors = (window as any).monaco?.editor?.getEditors?.() ?? [];

        if (monacoEditors.length > 0) {
            const monacoActions: EditorAction[] = [];
            const seenIds = new Set<string>(appCommands.map((a) => a.id));
            const seenLabels = new Set(appCommands.map((a) => a.label.toLowerCase()));

            const editor = monacoEditors[monacoEditors.length - 1];
            const supported = editor.getSupportedActions?.() ?? [];

            for (const action of supported) {
                const actionId = action.id;
                const label = action.label || actionId;
                if (seenIds.has(actionId)) continue;
                if (isMonacoUiAction(actionId, label)) continue;
                if (seenLabels.has(label.toLowerCase())) continue;
                seenIds.add(actionId);
                seenLabels.add(label.toLowerCase());

                let kb = getActionKeybindingLabel(editor, actionId);
                if (!kb && action.keybindings?.length > 0) {
                    kb = decodeKeybinding(action.keybindings[0]);
                }

                const capturedEditor = editor;
                monacoActions.push({
                    id: actionId,
                    label,
                    shortcut: kb,
                    run: () => {
                        capturedEditor.focus();
                        capturedEditor.trigger("command-palette", actionId, null);
                    },
                });
            }

            return [...appCommands, ...monacoActions].sort((a, b) => a.label.localeCompare(b.label));
        }
    } catch {
        // Fall through
    }

    return appCommands.sort((a, b) => a.label.localeCompare(b.label));
}
