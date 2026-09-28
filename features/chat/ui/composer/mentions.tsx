"use client";

import { ArrowLeft20Regular } from "@fluentui/react-icons/headless/svg/arrow-left";
import { Branch20Regular } from "@fluentui/react-icons/headless/svg/branch";
import { Chat20Filled } from "@fluentui/react-icons/headless/svg/chat";
import { ChevronRight20Regular } from "@fluentui/react-icons/headless/svg/chevron-right";
import { Code20Regular } from "@fluentui/react-icons/headless/svg/code";
import { Color20Regular } from "@fluentui/react-icons/headless/svg/color";
import { Document20Regular } from "@fluentui/react-icons/headless/svg/document";
import { DocumentText20Regular } from "@fluentui/react-icons/headless/svg/document-text";
import { Folder20Filled } from "@fluentui/react-icons/headless/svg/folder";
import { Globe20Regular } from "@fluentui/react-icons/headless/svg/globe";
import { Grid20Regular } from "@fluentui/react-icons/headless/svg/grid";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";
import { Target20Regular } from "@fluentui/react-icons/headless/svg/target";
import { WindowConsole20Regular } from "@fluentui/react-icons/headless/svg/window-console";



import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { type IconGlyph, Icon } from "@/components/ui/icon";


import { FileIcon } from "@/components/ui/file-icon";
import { Favicon } from "@/components/ui/favicon";
import { SearchInput } from "@/components/ui/search";
import { cn } from "@/lib/utils";
import { commands, useProjectState } from "@/lib/backend";
import { formatMentionToken, type ChatMention } from "@/lib/chat/mentions";
import { DESIGN_TOKEN_MENTIONS, designTokenById } from "@/lib/chat/design-mentions";
import { workflowSlashToken, type AgentWorkflow } from "@/lib/chat/workflows";
import { listDesignPreviewSessions, trySelectPendingDesignConcept } from "@/lib/agent-preview/store";
import { hostnameOf } from "@/lib/ui/favicon";
import { getPreviewCurrentUrl } from "@/features/preview/store";
import { fetchPlugins, peekPluginsCache, type PluginRow } from "@/lib/plugins/api";
import { listSkills, subscribeSkills, type Skill } from "@/lib/chat/skills";
import { PluginLogo } from "@/components/ui/plugin-logo";

type CategoryId = "files" | "code" | "docs" | "terminals" | "chats" | "branch" | "browser" | "mcp" | "plugins" | "skills" | "design" | null;

const CATEGORIES: {
    id: Exclude<CategoryId, null>;
    label: string;
    icon: IconGlyph;
}[] = [
    { id: "files", label: "Files & Folders", icon: Folder20Filled },
    { id: "code", label: "Code", icon: Code20Regular },
    { id: "docs", label: "Docs", icon: Document20Regular },
    { id: "branch", label: "Git", icon: Branch20Regular },
    { id: "chats", label: "Past Chats", icon: Chat20Filled },
    { id: "plugins", label: "Plugins", icon: Grid20Regular },
    { id: "skills", label: "Skills", icon: DocumentText20Regular },
    { id: "mcp", label: "MCP Servers", icon: Grid20Regular },
    { id: "terminals", label: "Terminals", icon: WindowConsole20Regular },
    { id: "browser", label: "Browser", icon: Globe20Regular },
    { id: "design", label: "Design", icon: Color20Regular },
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
    boxRef,
    caretIndex,
    mode = "mention",
    workflows = [],
}: {
    open: boolean;
    query: string;
    onPick: (token: string) => void;
    onClose: () => void;
    anchorRef?: RefObject<HTMLTextAreaElement | null>;
    boxRef?: RefObject<HTMLDivElement | null>;
    /** Index of the `@` that opened the menu (not the caret end of the query). */
    caretIndex?: number;
    mode?: "mention" | "slash";
    workflows?: AgentWorkflow[];
}) {
    const { project_path } = useProjectState();
    const [files, setFiles] = useState<string[]>([]);
    const [chats, setChats] = useState<{ id: string; title: string }[]>([]);
    const [mcpServers, setMcpServers] = useState<{ id: string; name: string }[]>([]);
    const [plugins, setPlugins] = useState<PluginRow[]>(() => peekPluginsCache()?.plugins ?? []);
    const [skills, setSkills] = useState<Skill[]>(() => listSkills());
    const [activeCategory, setActiveCategory] = useState<CategoryId>(null);
    const [highlight, setHighlight] = useState(0);
    const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
    const [menuEl, setMenuEl] = useState<HTMLDivElement | null>(null);
    const [filter, setFilter] = useState("");

    useEffect(() => {
        if (open) setFilter(query);
    }, [open, query]);

    const q = filter.trim().toLowerCase();

    useLayoutEffect(() => {
        if (!open) {
            setPos(null);
            return;
        }
        const box = boxRef?.current ?? anchorRef?.current;
        const update = () => {
            if (!box) return;
            const rect = box.getBoundingClientRect();
            const measured = menuEl?.offsetHeight;
            const menuHeight = measured && measured > 0 ? measured : 280;
            const width = rect.width;
            let top = rect.top - menuHeight - 6;
            if (top < 8) top = 8;
            setPos({ left: rect.left, top, width });
        };
        update();
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
        };
    }, [open, anchorRef, boxRef, filter, activeCategory, menuEl, files.length, chats.length, mode, workflows.length]);

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
                const results = await commands.searchProjectFiles(filter || "", 40);
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
    }, [open, project_path, filter]);

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

    useEffect(() => subscribeSkills(() => setSkills(listSkills())), []);

    const designItems: ChatMention[] = useMemo(() => {
        const tokens: ChatMention[] = DESIGN_TOKEN_MENTIONS.map((t) => ({
            kind: "design",
            id: t.id,
            path: t.id,
            label: t.label,
        }));
        const sessions = listDesignPreviewSessions();
        const seen = new Set<string>(tokens.map((t) => t.id || ""));
        for (const s of sessions) {
            for (const item of s.items) {
                const id = item.id || item.path;
                if (!id || seen.has(id)) continue;
                seen.add(id);
                tokens.push({
                    kind: "design",
                    id: item.id,
                    path: item.path,
                    label: item.name,
                });
            }
        }
        return tokens;
    }, [open]);

    const fileMentions: ChatMention[] = useMemo(() => {
        return files
            .filter((path) => !q || path.toLowerCase().includes(q))
            .slice(0, 10)
            .map((path) => ({
                kind: path.endsWith("/") ? ("folder" as const) : ("file" as const),
                path,
                label: path.split("/").pop() || path,
            }));
    }, [files, q]);

    const pluginMentions: ChatMention[] = useMemo(() => {
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
    }, [plugins, q]);

    const categoryItems: ChatMention[] = useMemo(() => {
        if (activeCategory === "files") return fileMentions;
        if (activeCategory === "docs") {
            return files
                .filter((path) => /\.(md|mdx|txt|rst)$/i.test(path) || /(^|\/)docs\//i.test(path))
                .filter((path) => !q || path.toLowerCase().includes(q))
                .slice(0, 20)
                .map((path) => ({
                    kind: "docs" as const,
                    path,
                    label: path.split("/").pop() || path,
                }));
        }
        if (activeCategory === "code") {
            return [
                { kind: "codebase" as const, label: "Codebase" },
                { kind: "selection" as const, label: "Selection" },
            ].filter((m) => !q || m.label.toLowerCase().includes(q));
        }
        if (activeCategory === "plugins") return pluginMentions;
        if (activeCategory === "skills") {
            return skills
                .filter((skill) => !q || skill.name.toLowerCase().includes(q) || skill.id.includes(q))
                .map((skill) => ({
                    kind: "skill" as const,
                    id: skill.id,
                    path: skill.id,
                    label: skill.name,
                }));
        }
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
            const raw = filter.trim();
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
    }, [activeCategory, fileMentions, files, chats, designItems, mcpServers, pluginMentions, skills, q, filter]);

    const rootItems = useMemo(() => {
        if (activeCategory) return categoryItems;
        return fileMentions.slice(0, 8);
    }, [activeCategory, categoryItems, fileMentions]);

    const slashItems = useMemo(() => {
        const needle = q.replace(/^\//, "").toLowerCase();
        return workflows
            .map((w) => {
                const trigger = w.trigger.trim();
                const triggerKey = trigger.replace(/^\/+/, "").toLowerCase();
                const name = w.name.toLowerCase();
                let score = 0;
                if (!needle) score = 1;
                else if (triggerKey === needle || trigger.toLowerCase() === `/${needle}`) score = 3;
                else if (triggerKey.startsWith(needle) || name.startsWith(needle)) score = 2;
                else if (triggerKey.includes(needle) || name.includes(needle)) score = 1;
                return { w, score };
            })
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((x) => x.w)
            .slice(0, 20);
    }, [workflows, q]);

    const visibleCategories = useMemo(() => {
        if (activeCategory) return [];
        if (!q) return CATEGORIES;
        return CATEGORIES.filter((c) => c.label.toLowerCase().includes(q));
    }, [activeCategory, q]);

    const showCategories = mode === "mention" && !activeCategory;
    const listLen = mode === "slash" ? slashItems.length : rootItems.length;

    useEffect(() => {
        setHighlight(0);
    }, [activeCategory, filter, rootItems.length, slashItems.length, mode]);

    const pickItem = (item: ChatMention) => {
        if (item.kind === "design" && item.id) {
            void trySelectPendingDesignConcept(item.id);
        }
        onPick(`${formatMentionToken(item)} `);
        onClose();
    };

    const pickSlash = (w: AgentWorkflow) => {
        onPick(`${workflowSlashToken(w)} `);
        onClose();
    };

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                if (mode === "mention" && activeCategory) setActiveCategory(null);
                else onClose();
                return;
            }
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, Math.max(listLen - 1, 0)));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (mode === "slash") {
                    if (slashItems[highlight]) pickSlash(slashItems[highlight]);
                } else if (rootItems[highlight]) {
                    pickItem(rootItems[highlight]);
                }
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open, activeCategory, rootItems, slashItems, highlight, onClose, mode, listLen]);

    if (!open || !pos) return null;

    return createPortal(
        <div
            ref={setMenuEl}
            className="shape-popover-content fixed z-dropdown overflow-hidden squircle-2xl border border-border-secondary bg-surface-4/80 backdrop-blur-sm shadow-md"
            style={{ left: pos.left, top: pos.top, width: pos.width }}
        >
            <SearchInput
                borderless
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={mode === "slash" ? "Search workflows…" : "Add files, folders, docs..."}
                aria-label={mode === "slash" ? "Search workflows" : "Search mentions"}
            />

            {mode === "mention" && activeCategory ? (
                <button
                    type="button"
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setActiveCategory(null)}
                >
                    <Icon icon={ArrowLeft20Regular} />
                    {CATEGORIES.find((c) => c.id === activeCategory)?.label ?? "Back"}
                </button>
            ) : null}

            <div className="max-h-72 overflow-y-auto no-scrollbar px-1 pb-1">
                {mode === "slash" ? (
                    slashItems.length === 0 ? (
                        <div className="px-2.5 py-2 text-sm text-text-muted">
                            No matching commands. Add workflows in Settings.
                        </div>
                    ) : (
                        slashItems.map((w, idx) => (
                            <button
                                key={w.id}
                                type="button"
                                className={cn(
                                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                                    idx === highlight
                                        ? "bg-panel-hover text-text-primary"
                                        : "text-text-primary hover:bg-panel-hover",
                                )}
                                onMouseDown={(e) => e.preventDefault()}
                                onMouseEnter={() => setHighlight(idx)}
                                onClick={() => pickSlash(w)}
                            >
                                {w.pluginToolkit ? (
                                    <PluginLogo
                                        toolkit={w.pluginToolkit}
                                        name={w.name}
                                        size={14}
                                        className="rounded-sm"
                                    />
                                ) : (
                                    <Icon icon={Code20Regular} className="shrink-0 text-text-muted" />
                                )}
                                <span className="min-w-0 flex-1 truncate font-medium">{workflowSlashToken(w)}</span>
                                <span className="ml-auto max-w-[50%] truncate text-sm text-text-muted">{w.name}</span>
                            </button>
                        ))
                    )
                ) : (
                    <>
                {rootItems.length === 0 && (activeCategory || !showCategories) ? (
                    <div className="px-2.5 py-2 text-sm text-text-muted">No matches</div>
                ) : null}

                {rootItems.map((item, idx) => (
                    <button
                        key={`${item.kind}-${item.id ?? item.path ?? item.label}-${idx}`}
                        type="button"
                        className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                            idx === highlight
                                ? "bg-panel-hover text-text-primary"
                                : "text-text-primary hover:bg-panel-hover",
                        )}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setHighlight(idx)}
                        onClick={() => pickItem(item)}
                    >
                        {item.kind === "file" || item.kind === "folder" || item.kind === "docs" ? (
                            <FileIcon
                                name={item.label}
                                isDir={item.kind === "folder"}
                                className="h-4 w-4 shrink-0"
                            />
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
                                        ? Search20Regular
                                        : item.kind === "selection"
                                          ? Code20Regular
                                          : item.kind === "design"
                                            ? (designTokenById(item.id || item.path)?.icon ?? Color20Regular)
                                            : item.kind === "chat"
                                              ? Chat20Filled
                                              : item.kind === "terminal"
                                                ? WindowConsole20Regular
                                                : item.kind === "branch"
                                                  ? Branch20Regular
                                                  : item.kind === "browser"
                                                    ? Globe20Regular
                                                    : item.kind === "mcp"
                                                      ? Grid20Regular
                                                      : item.kind === "element"
                                                        ? Target20Regular
                                                        : item.kind === "skill"
                                                          ? DocumentText20Regular
                                                          : Document20Regular
                                }
                                className="shrink-0 text-text-muted"
                            />
                        )}
                        <span className="min-w-0 flex-1 truncate font-medium">
                            {item.kind === "browser" && item.path && item.path !== "current"
                                ? `Visit ${item.label}`
                                : item.label}
                        </span>
                        {item.path && item.kind !== "design" && item.kind !== "browser" && item.kind !== "chat" ? (
                            <span className="ml-auto max-w-[48%] truncate text-sm text-text-muted">
                                {pathDir(item.path) || item.path}
                            </span>
                        ) : null}
                    </button>
                ))}

                {showCategories && visibleCategories.length > 0 ? (
                    <>
                        {rootItems.length > 0 ? <div className="my-1 h-px bg-border-subtle" /> : null}
                        {visibleCategories.map((cat) => (
                            <button
                                key={cat.id}
                                type="button"
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-primary hover:bg-panel-hover"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setActiveCategory(cat.id)}
                            >
                                <Icon icon={cat.icon} className="shrink-0 text-text-muted" />
                                <span className="flex-1 font-medium">{cat.label}</span>
                                <Icon icon={ChevronRight20Regular} className="text-text-muted" />
                            </button>
                        ))}
                    </>
                ) : null}
                    </>
                )}
            </div>
        </div>,
        document.body,
    );
}
