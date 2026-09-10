"use client";

import type { RemixiconComponentType } from "@remixicon/react";
import { RiArrowLeftLine, RiArrowRightSLine, RiChat3Line, RiCodeLine, RiFileLine, RiFolderLine, RiGitBranchLine, RiGlobalLine, RiPaletteLine, RiPuzzle2Line, RiSearchLine, RiTerminalBoxLine, RiApps2Line } from "@remixicon/react";
import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { FileIcon } from "@/components/ui/file-icon";
import { Favicon } from "@/components/ui/favicon";
import { cn } from "@/lib/utils";
import { commands, useProjectState } from "@/lib/backend";
import { formatMentionToken, type ChatMention } from "@/lib/chat-mentions";
import { listDesignPreviewSessions } from "@/lib/design-preview-store";
import { getTextareaCaretViewportRect } from "@/lib/textarea-caret";
import { hostnameOf } from "@/lib/favicon";
import { getPreviewCurrentUrl } from "@/features/preview/store";
import { fetchPlugins, peekPluginsCache, type PluginRow } from "@/lib/plugins-api";
import { PluginLogo } from "@/components/ui/plugin-logo";

type CategoryId = "files" | "terminals" | "chats" | "branch" | "browser" | "mcp" | "plugins" | "design" | null;

const CATEGORIES: {
    id: Exclude<CategoryId, null>;
    label: string;
    icon: RemixiconComponentType;
}[] = [
    { id: "files", label: "Files & Folders", icon: RiFolderLine },
    { id: "plugins", label: "Plugins", icon: RiApps2Line },
    { id: "mcp", label: "MCP Servers", icon: RiPuzzle2Line },
    { id: "terminals", label: "Terminals", icon: RiTerminalBoxLine },
    { id: "chats", label: "Past Chats", icon: RiChat3Line },
    { id: "branch", label: "Branch (Diff with Main)", icon: RiGitBranchLine },
    { id: "browser", label: "Browser", icon: RiGlobalLine },
    { id: "design", label: "Design concepts", icon: RiPaletteLine },
];

function pathDir(path: string): string {
    const parts = path.replace(/\\/g, "/").split("/");
    if (parts.length <= 1) return "";
    const dir = parts.slice(0, -1).join("/");
    if (dir.length <= 28) return dir;
    return `…${dir.slice(-26)}`;
}

export function MentionPicker({
    open,
    query,
    onPick,
    onClose,
    anchorRef,
    caretIndex,
}: {
    open: boolean;
    query: string;
    onPick: (token: string) => void;
    onClose: () => void;
    anchorRef?: RefObject<HTMLTextAreaElement | null>;
    /** Index of the `@` that opened the menu (not the caret end of the query). */
    caretIndex?: number;
}) {
    const { project_path } = useProjectState();
    const [files, setFiles] = useState<string[]>([]);
    const [chats, setChats] = useState<{ id: string; title: string }[]>([]);
    const [mcpServers, setMcpServers] = useState<{ id: string; name: string }[]>([]);
    const [plugins, setPlugins] = useState<PluginRow[]>(() => peekPluginsCache()?.plugins ?? []);
    const [activeCategory, setActiveCategory] = useState<CategoryId>(null);
    const [highlight, setHighlight] = useState(0);
    const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
    const [menuEl, setMenuEl] = useState<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        if (!open) {
            setPos(null);
            return;
        }
        const el = anchorRef?.current;
        const update = () => {
            if (!el) return;
            // Anchor to the `@` character so the menu stays next to the mention, not the typing caret.
            const atIndex = typeof caretIndex === "number" ? caretIndex : el.selectionStart ?? 0;
            const caretRect = getTextareaCaretViewportRect(el, atIndex);
            const width = 280;
            const measured = menuEl?.offsetHeight;
            const menuHeight = measured && measured > 0 ? measured : 240;
            let left = caretRect.left;
            let top = caretRect.top - menuHeight - 6;
            if (top < 8) {
                top = caretRect.top + caretRect.height + 6;
            }
            left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
            setPos({ left, top, width });
        };
        update();
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        el?.addEventListener("scroll", update);
        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
            el?.removeEventListener("scroll", update);
        };
    }, [open, anchorRef, caretIndex, query, activeCategory, menuEl, files.length, chats.length]);

    useEffect(() => {
        if (!open) {
            setActiveCategory(null);
            setHighlight(0);
        }
    }, [open]);

    useEffect(() => {
        if (!open || !project_path) return;
        let cancelled = false;
        void (async () => {
            try {
                const results = await commands.searchProjectFiles(query || "", 40);
                if (!cancelled) {
                    setFiles(results.map((r) => (r.relative_path || r.path).replace(/\\/g, "/")));
                }
            } catch {
                if (!cancelled) setFiles([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, project_path, query]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        void (async () => {
            try {
                const list = await commands.getConversations(project_path ?? undefined);
                if (!cancelled) {
                    setChats(
                        list.slice(0, 20).map((c) => ({
                            id: c.id,
                            title: c.title || "Chat",
                        })),
                    );
                }
            } catch {
                if (!cancelled) setChats([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, project_path]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        void (async () => {
            try {
                const statuses = await commands.getMcpStatus();
                if (cancelled) return;
                setMcpServers(
                    statuses
                        .filter((s) => String(s.status || "").toLowerCase() === "connected")
                        .map((s) => ({
                            id: s.id,
                            name: s.name || s.id,
                        })),
                );
            } catch {
                if (!cancelled) setMcpServers([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const cached = peekPluginsCache()?.plugins;
        if (cached) setPlugins(cached);
        void fetchPlugins()
            .then((data) => {
                if (!cancelled) setPlugins(data.plugins);
            })
            .catch(() => {
                if (!cancelled && !cached) setPlugins([]);
            });
        return () => {
            cancelled = true;
        };
    }, [open]);

    const designItems: ChatMention[] = useMemo(() => {
        const sessions = listDesignPreviewSessions();
        const out: ChatMention[] = [];
        const seen = new Set<string>();
        for (const s of sessions) {
            for (const item of s.items) {
                const id = item.id || item.path;
                if (!id || seen.has(id)) continue;
                seen.add(id);
                out.push({
                    kind: "design",
                    id: item.id,
                    path: item.path,
                    label: item.name,
                });
            }
        }
        return out;
    }, [open, query]);

    const fileMentions: ChatMention[] = useMemo(() => {
        const q = query.trim().toLowerCase();
        return files
            .filter((path) => !q || path.toLowerCase().includes(q))
            .slice(0, 10)
            .map((path) => ({
                kind: path.endsWith("/") ? ("folder" as const) : ("file" as const),
                path,
                label: path.split("/").pop() || path,
            }));
    }, [files, query]);

    const staticTop: ChatMention[] = useMemo(() => {
        const q = query.trim().toLowerCase();
        return [
            { kind: "codebase" as const, label: "Codebase" },
            { kind: "selection" as const, label: "Selection" },
        ].filter((m) => !q || m.label.toLowerCase().includes(q));
    }, [query]);

    const pluginMentions: ChatMention[] = useMemo(() => {
        const q = query.trim().toLowerCase();
        return plugins
            .filter((p) =>
                !q
                || p.name.toLowerCase().includes(q)
                || p.toolkit.toLowerCase().includes(q)
                || p.description.toLowerCase().includes(q),
            )
            .sort((a, b) => Number(b.connected) - Number(a.connected))
            .slice(0, 20)
            .map((p) => ({
                kind: "plugin" as const,
                id: p.toolkit,
                path: p.toolkit,
                label: p.name,
            }));
    }, [plugins, query]);

    const categoryItems: ChatMention[] = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (activeCategory === "files") return fileMentions;
        if (activeCategory === "plugins") return pluginMentions;
        if (activeCategory === "chats") {
            return chats
                .filter((c) => !q || c.title.toLowerCase().includes(q))
                .map((c) => ({
                    kind: "chat" as const,
                    path: c.id,
                    id: c.id,
                    label: c.title || "Chat",
                }));
        }
        if (activeCategory === "mcp") {
            return mcpServers
                .filter((s) => !q || s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
                .map((s) => ({
                    kind: "mcp" as const,
                    id: s.id,
                    path: s.id,
                    label: s.name || s.id,
                }));
        }
        if (activeCategory === "design") {
            return designItems.filter(
                (d) => !q || d.label.toLowerCase().includes(q) || (d.id || "").includes(q),
            );
        }
        if (activeCategory === "terminals") {
            return [{ kind: "terminal" as const, path: "active", label: "Active terminal" }];
        }
        if (activeCategory === "branch") {
            return [{ kind: "branch" as const, path: "main", label: "Diff with main" }];
        }
        if (activeCategory === "browser") {
            const raw = query.trim();
            const host = hostnameOf(raw);
            const currentUrl = getPreviewCurrentUrl();
            const items: ChatMention[] = [
                {
                    kind: "browser" as const,
                    path: currentUrl || "current",
                    label: currentUrl
                        ? `Current page (${hostnameOf(currentUrl) || currentUrl})`
                        : "Current page",
                },
            ];
            if (host && /\./.test(host)) {
                items.unshift({
                    kind: "browser",
                    path: /^https?:\/\//i.test(raw) ? raw : `https://${host}`,
                    label: host,
                });
            }
            return items;
        }
        return [];
    }, [activeCategory, fileMentions, files, chats, designItems, mcpServers, pluginMentions, query]);

    const rootItems = useMemo(() => {
        if (activeCategory) return categoryItems;
        const q = query.trim().toLowerCase();
        const designs = designItems
            .filter((d) => !q || d.label.toLowerCase().includes(q))
            .slice(0, 3);
        const mcps = mcpServers
            .filter((s) => !q || s.id.toLowerCase().includes(q))
            .slice(0, 4)
            .map((s) => ({
                kind: "mcp" as const,
                id: s.id,
                path: s.id,
                label: s.name || s.id,
            }));
        const pluginHits = pluginMentions.slice(0, 4);
        return [...staticTop, ...pluginHits, ...mcps, ...fileMentions.slice(0, 8), ...designs];
    }, [activeCategory, categoryItems, staticTop, fileMentions, designItems, mcpServers, pluginMentions, query]);

    const showCategories = !activeCategory && !query.trim();

    useEffect(() => {
        setHighlight(0);
    }, [activeCategory, query, rootItems.length]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                if (activeCategory) setActiveCategory(null);
                else onClose();
                return;
            }
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, Math.max(rootItems.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && rootItems[highlight]) {
                e.preventDefault();
                onPick(`${formatMentionToken(rootItems[highlight])} `);
                onClose();
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open, activeCategory, rootItems, highlight, onPick, onClose]);

    if (!open || !pos) return null;

    return createPortal(
        <div
            ref={setMenuEl}
            className="fixed z-[200] max-h-72 max-w-70 overflow-hidden rounded-xl border border-border bg-surface-3 shadow-lg/30"
            style={{ left: pos.left, top: pos.top, width: pos.width }}
        >
            {activeCategory ? (
                <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-muted hover:text-text-primary"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setActiveCategory(null)}
                >
                    <Icon icon={RiArrowLeftLine} />
                    {CATEGORIES.find((c) => c.id === activeCategory)?.label ?? "Back"}
                </button>
            ) : null}

            <div className="max-h-64 overflow-y-auto py-1 px-1">
                {rootItems.length === 0 && !showCategories ? (
                    <div className="px-3 py-2 text-sm text-text-muted">No matches</div>
                ) : (
                    rootItems.map((item, idx) => (
                        <button
                            key={`${item.kind}-${item.id ?? item.path ?? item.label}-${idx}`}
                            type="button"
                            className={cn(
                                "flex w-full items-center gap-2 px-3 py-1.5 rounded-lg text-left text-xs",
                                idx === highlight
                                    ? "bg-panel-hover text-text-primary"
                                    : "text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                            )}
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setHighlight(idx)}
                            onClick={() => {
                                onPick(`${formatMentionToken(item)} `);
                                onClose();
                            }}
                        >
                            {item.kind === "file" || item.kind === "folder" || item.kind === "docs" ? (
                                <FileIcon name={item.label} className="h-3.5 w-3.5 shrink-0" />
                            ) : item.kind === "plugin" ? (
                                <PluginLogo
                                    toolkit={item.id || item.path || item.label}
                                    name={item.label}
                                    size={14}
                                    className="rounded-sm"
                                />
                            ) : item.kind === "browser" && item.path && item.path !== "current" ? (
                                <Favicon url={item.path} size={14} />
                            ) : (
                                <Icon
                                    icon={
                                        item.kind === "codebase"
                                            ? RiSearchLine
                                            : item.kind === "selection"
                                              ? RiCodeLine
                                              : item.kind === "design"
                                                ? RiPaletteLine
                                                : item.kind === "chat"
                                                  ? RiChat3Line
                                                  : item.kind === "terminal"
                                                    ? RiTerminalBoxLine
                                                    : item.kind === "branch"
                                                      ? RiGitBranchLine
                                                      : item.kind === "browser"
                                                        ? RiGlobalLine
                                                        : item.kind === "mcp"
                                                          ? RiPuzzle2Line
                                                          : item.kind === "plugin"
                                                            ? RiApps2Line
                                                          : RiFileLine
                                    }
                                    className="shrink-0 text-text-muted"
                                />
                            )}
                            <span className="min-w-0 truncate font-medium text-text-primary">
                                {item.kind === "browser" && item.path && item.path !== "current"
                                    ? `Visit ${item.label}`
                                    : item.label}
                            </span>
                            {item.path && item.kind !== "design" && item.kind !== "browser" && item.kind !== "chat" ? (
                                <span className="ml-auto max-w-[45%] truncate text-xs text-text-muted">
                                    {pathDir(item.path) || item.path}
                                </span>
                            ) : null}
                        </button>
                    ))
                )}

                {showCategories ? (
                    <>
                        <div className="my-1" />
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.id}
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-1.5 rounded-lg text-left text-xs text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setActiveCategory(cat.id)}
                            >
                                <Icon icon={cat.icon} className="shrink-0 text-text-muted" />
                                <span className="flex-1">{cat.label}</span>
                                <Icon icon={RiArrowRightSLine} className="text-text-muted" />
                            </button>
                        ))}
                    </>
                ) : null}
            </div>
        </div>,
        document.body,
    );
}
