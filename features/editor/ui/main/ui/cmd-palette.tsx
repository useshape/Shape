"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@/components/ui/icon";
import { FileIcon } from "@/components/ui/file-icon";

import { getShortcutForLabel } from "@/lib/ui/shortcuts";
import { SHAPE_MODAL_PANEL_CLASS, SHAPE_OVERLAY_CLASS, SHAPE_OVERLAY_CONTENT_CLASS } from "@/lib/ui/modal-overlay";
import { cn } from "@/lib/utils";
import { isPopoutPath } from "@/lib/tauri-window";

interface EditorAction {
    id: string;
    label: string;
    shortcut: string;
    /** Optional file name used with FileIcon (e.g. `python.py`). */
    icon?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    run: () => any;
    delete?: (e: React.MouseEvent) => void;
}

interface CommandPaletteOpenDetail {
    mode?: string;
    filter?: string;
    placeholder?: string;
    recent?: boolean;
    actions?: EditorAction[];
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
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [mode, setMode] = useState<string>("");
    const [recentFiles, setRecentFiles] = useState(false);
    const [placeholder, setPlaceholder] = useState("Type a command...");
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Listen for open event
    useEffect(() => {
        const handleOpen = (e?: Event) => {
            const customEvent = e as CustomEvent<CommandPaletteOpenDetail>;
            const detail = customEvent?.detail;
            const openMode = detail?.mode || "";
            setMode(openMode);
            setRecentFiles(Boolean(detail?.recent));
            setPlaceholder(detail?.placeholder || (
                openMode === "files" ? "Search files by name..."
                    : openMode === "goto_line" ? "Line : Column"
                        : openMode === "editor_symbols" ? "Search symbols in file…"
                        : "Type a command..."
            ));
            if (openMode === "workspace_symbols") {
                import("@/features/editor/lsp/workspace-symbols").then(({ buildWorkspaceSymbolActions }) => {
                    buildWorkspaceSymbolActions().then((symbolActions) => {
                        setActions(symbolActions);
                        setQuery(detail?.filter || "");
                        setOpen(true);
                    });
                });
            } else if (openMode === "files") {
                setActions([]);
                setQuery(detail?.filter || "");
                setOpen(true);
            } else if (openMode === "goto_line") {
                setActions([]);
                setQuery(detail?.filter || "");
                setOpen(true);
            } else if (openMode === "editor_symbols") {
                import("@/features/editor/lsp/document-symbols").then(({ buildDocumentSymbolActions }) => {
                    buildDocumentSymbolActions(detail?.filter || "").then((symbolActions) => {
                        setActions(symbolActions);
                        setQuery(detail?.filter || "");
                        setOpen(true);
                    });
                });
            } else if (openMode === "language_mode" && detail?.actions?.length) {
                setActions(detail.actions);
                setQuery(detail.filter || "");
                setOpen(true);
            } else if (detail?.actions?.length) {
                setActions(detail.actions);
                setQuery(detail.filter || "");
                setOpen(true);
            } else {
                // Get actions from the current Monaco editor
                const editorActions = getMonacoActions();
                setActions(editorActions);
                setQuery(detail?.filter || "");
                setOpen(true);
            }
        };
        window.addEventListener("shape-command-palette", handleOpen);

        // Ctrl+Shift+P / F1 — Shape palette (also stolen from Monaco via suppress-monaco-native-ui)
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

    // Handler for open/close changes
    const handleOpenChange = useCallback((value: boolean) => {
        setOpen(value);
        if (!value) {
            setQuery("");
            setSelectedIndex(0);
            setMode("");
            setRecentFiles(false);
            setActions([]);
            setPlaceholder("Type a command...");
        }
    }, []);

    // Filter actions based on query
    const filtered = useMemo(() => {
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
    }, [actions, query]);

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

    useEffect(() => {
        if (mode !== "files" || !open) return;
        const handle = window.setTimeout(() => {
            if (query.length > 0 && query.length < 2) {
                setActions([]);
                return;
            }
            if (recentFiles && !query.trim()) {
                import("@/lib/backend").then(({ commands }) => {
                    commands.getProjectState().then((state) => {
                        const active = state.active_file;
                        const ordered = [...state.open_files];
                        if (active) {
                            const idx = ordered.findIndex((f) => f.path === active);
                            if (idx > 0) {
                                const [item] = ordered.splice(idx, 1);
                                ordered.unshift(item);
                            }
                        }
                        ordered.reverse();
                        setActions(ordered.map((file) => ({
                            id: `file:${file.path}`,
                            label: file.name,
                            shortcut: file.path,
                            run: () => commands.setActiveFile(file.path),
                        })));
                    }).catch(() => setActions([]));
                });
                return;
            }
            import("@/lib/backend").then(({ commands }) => {
                commands.searchProjectFiles(query, 80)
                    .then((results) => {
                        setActions(results.map((result) => ({
                            id: `file:${result.path}`,
                            label: result.name,
                            shortcut: result.relative_path,
                            run: () => commands.openFile(result.path, result.name),
                        })));
                    })
                    .catch(() => setActions([]));
            });
        }, query.trim() ? 140 : 0);
        return () => window.clearTimeout(handle);
    }, [mode, open, query, recentFiles]);

    // Scroll selected item into view
    useEffect(() => {
        if (!listRef.current) return;
        const item = listRef.current.children[selectedIndex] as HTMLElement;
        if (item) {
            item.scrollIntoView({ block: "nearest" });
        }
    }, [selectedIndex]);

    const runAction = useCallback((action: EditorAction) => {
        setOpen(false);
        // Defer so the dialog fully closes and editor regains focus
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
            setSelectedIndex((idx) => Math.min(idx + 1, filtered.length - 1));
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

    return (
        <Dialog.Root open={open} onOpenChange={handleOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className={SHAPE_OVERLAY_CLASS} />
                <Dialog.Content className={cn(
                    SHAPE_OVERLAY_CONTENT_CLASS,
                    SHAPE_MODAL_PANEL_CLASS,
                    "fixed top-[12%] left-1/2 -translate-x-1/2 w-full max-w-[640px] overflow-hidden focus:outline-none",
                )}>
                    <Dialog.Title className="sr-only">Command Palette</Dialog.Title>
                    <Dialog.Description className="sr-only">Search commands</Dialog.Description>
                    <div className="flex items-center gap-2 px-3 h-10 border-b border-border-subtle">
                        {!mode && <span className="text-text-muted text-lg shrink-0">&gt;</span>}
                        {mode === "files" && <Icon name="insert_drive_file" size={14} className="text-text-muted shrink-0" />}
                        <input
                            ref={inputRef}
                            className="h-9 border-none bg-transparent px-0 text-sm outline-none flex-1 text-text-primary placeholder:text-text-muted font-sans"
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

                    <div
                        ref={listRef}
                        className="py-1 max-h-[420px] overflow-y-auto overflow-x-hidden custom-scrollbar"
                    >
                        {filtered.length === 0 && (
                            <div className="px-4 py-6 text-sm text-text-muted text-center">
                                {mode === "goto_line"
                                    ? "Line number, optional column (e.g. 42:10)"
                                    : mode === "editor_symbols"
                                      ? "No symbols in the current file"
                                      : "No matching commands"}
                            </div>
                        )}
                        {filtered.map((action, idx) => (
                            <div
                                key={action.id}
                                role="button"
                                tabIndex={0}
                                className={`mx-1 min-w-0 text-left px-3 py-1.5 group flex items-center justify-between cursor-pointer rounded-lg ${idx === selectedIndex ? "bg-panel-hover text-text-primary" : "hover:bg-panel-hover text-text-secondary"
                                    }`}
                                onMouseEnter={() => setSelectedIndex(idx)}
                                onClick={() => runAction(action)}
                            >
                                <div className="flex items-center overflow-hidden min-w-0 flex-1 gap-2">
                                    {mode === "files" && <FileIcon name={action.label} className="w-4 h-4 shrink-0 opacity-70" />}
                                    {!mode && action.icon && (
                                        <FileIcon name={action.icon} className="w-4 h-4 shrink-0 opacity-70" />
                                    )}
                                    <span className="text-xs truncate min-w-0">
                                        {action.label}
                                    </span>
                                </div>
                                <div className="flex items-center min-w-0">
                                    <ShortcutBadge shortcut={action.shortcut} />
                                    {action.delete && (
                                        <button
                                            onClick={action.delete}
                                            className="ml-2 p-1 rounded text-text-muted hover:text-error hover:bg-error/10 transition-colors shrink-0"
                                            title="Delete chat"
                                        >
                                            <Icon name="delete" size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
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
                import("@/features/chat/ui/shell/history").then(({ openChatHistoryMenu }) => {
                    window.requestAnimationFrame(() => openChatHistoryMenu());
                });
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
