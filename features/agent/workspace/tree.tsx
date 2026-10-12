"use client";

import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";
import { ChevronRight20Regular } from "@fluentui/react-icons/headless/svg/chevron-right";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";


import { useCallback, useEffect, useMemo, useState } from "react";
import { commands, type FileEntry } from "@/lib/backend";
import { Icon } from "@/components/ui/icon";
import { FileIcon } from "@/components/ui/file-icon";

import { cn } from "@/lib/utils";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context";

function gitMark(status: string | undefined): { letter: string; className: string } | null {
    const raw = (status ?? "").trim().toUpperCase();
    if (!raw) return null;
    if (raw.includes("?")) return { letter: "U", className: "text-warning" };
    if (raw.includes("A")) return { letter: "A", className: "text-success" };
    if (raw.includes("D")) return { letter: "D", className: "text-error" };
    if (raw.includes("M") || raw.includes("R")) return { letter: "M", className: "text-success" };
    return { letter: raw[0] ?? "", className: "text-text-muted" };
}

function sortEntries(list: FileEntry[]) {
    return [...list].sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}

function TreeNode({
    entry,
    depth,
    activePath,
    query,
    onOpenFile,
    statusFor,
}: {
    entry: FileEntry;
    depth: number;
    activePath: string | null;
    query: string;
    onOpenFile: (path: string) => void;
    statusFor: (path: string) => string | undefined;
}) {
    const [open, setOpen] = useState(false);
    const [children, setChildren] = useState<FileEntry[] | null>(null);

    const load = useCallback(async () => {
        if (!entry.is_dir) return;
        try {
            setChildren(sortEntries(await commands.lsDir(entry.path)));
        } catch {
            setChildren([]);
        }
    }, [entry.is_dir, entry.path]);

    useEffect(() => {
        if (open && children === null) void load();
    }, [open, children, load]);

    useEffect(() => {
        if (query.trim() && entry.is_dir) setOpen(true);
    }, [query, entry.is_dir]);

    const pad = 8 + depth * 12;
    const mark = gitMark(statusFor(entry.path));
    const needle = query.trim().toLowerCase();

    const reveal = () => {
        void commands.revealPath(entry.path).catch(() => {});
    };
    const copyPath = () => {
        void navigator.clipboard.writeText(entry.path);
    };

    if (entry.is_dir) {
        const visibleChildren = children?.filter((child) => {
            if (!needle || child.is_dir) return true;
            return child.name.toLowerCase().includes(needle);
        });
        if (needle && !entry.name.toLowerCase().includes(needle) && visibleChildren && visibleChildren.length === 0 && children) {
            return null;
        }
        return (
            <div>
                <ContextMenu>
                    <ContextMenuTrigger asChild>
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="flex h-6 w-full items-center gap-1 rounded-md pr-2 text-left text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                    style={{ paddingLeft: pad }}
                >
                    <Icon
                        icon={open ? ChevronDown20Regular : ChevronRight20Regular}
                        className="icon-sm shrink-0 text-text-muted"
                    />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="min-w-40">
                        <ContextMenuItem onClick={() => setOpen(true)}>Open</ContextMenuItem>
                        <ContextMenuItem onClick={reveal}>Reveal in Explorer</ContextMenuItem>
                        <ContextMenuItem onClick={copyPath}>Copy Path</ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>
                {open ? (
                    <div>
                        {visibleChildren?.map((child) => (
                        <TreeNode
                            key={child.path}
                            entry={child}
                            depth={depth + 1}
                            activePath={activePath}
                            query={query}
                            onOpenFile={onOpenFile}
                            statusFor={statusFor}
                        />
                        ))}
                    </div>
                ) : null}
            </div>
        );
    }

    if (needle && !entry.name.toLowerCase().includes(needle)) return null;

    const active =
        activePath != null
        && activePath.replace(/\\/g, "/").toLowerCase() === entry.path.replace(/\\/g, "/").toLowerCase();

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
        <button
            type="button"
            onClick={() => onOpenFile(entry.path)}
            className={cn(
                "flex h-6 w-full items-center gap-1.5 rounded-md pr-2 text-left text-sm",
                active
                    ? "bg-panel-active text-text-primary"
                    : "text-text-secondary hover:bg-panel-hover hover:text-text-primary",
            )}
            style={{ paddingLeft: pad }}
        >
            <FileIcon name={entry.name} className="size-4 shrink-0" />
            <span className={cn("min-w-0 flex-1 truncate", mark?.className)}>{entry.name}</span>
            {mark ? (
                <span className={cn("shrink-0 text-xs font-medium", mark.className)}>{mark.letter}</span>
            ) : null}
        </button>
            </ContextMenuTrigger>
            <ContextMenuContent className="min-w-40">
                <ContextMenuItem onClick={() => onOpenFile(entry.path)}>Open</ContextMenuItem>
                <ContextMenuItem onClick={reveal}>Reveal in Explorer</ContextMenuItem>
                <ContextMenuItem onClick={copyPath}>Copy Path</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    onClick={() => {
                        window.dispatchEvent(
                            new CustomEvent("shape-open-workspace-terminal", { detail: { path: entry.path } }),
                        );
                    }}
                >
                    Open Terminal
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

export function FileTree({
    projectPath,
    activePath,
    onOpenFile,
}: {
    projectPath: string;
    activePath: string | null;
    onOpenFile: (path: string) => void;
}) {
    const [roots, setRoots] = useState<FileEntry[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [statusByPath, setStatusByPath] = useState<Map<string, string>>(() => new Map());
    const title = projectPath.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || projectPath;
    const shown = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return roots;
        return roots.filter((entry) => entry.is_dir || entry.name.toLowerCase().includes(needle));
    }, [query, roots]);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const list = sortEntries(await commands.lsDir(projectPath));
                if (!cancelled) {
                    setRoots(list);
                    setError(null);
                }
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : String(e));
                    setRoots([]);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [projectPath]);

    useEffect(() => {
        let cancelled = false;
        void commands.gitStatus(projectPath).then((files) => {
            if (cancelled) return;
            const next = new Map<string, string>();
            const root = projectPath.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
            for (const file of files) {
                const rel = file.path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
                next.set(rel, file.status);
                next.set(`${root}/${rel}`, file.status);
            }
            setStatusByPath(next);
        }).catch(() => {
            if (!cancelled) setStatusByPath(new Map());
        });
        return () => {
            cancelled = true;
        };
    }, [projectPath]);

    const statusFor = useCallback((path: string) => {
        const key = path.replace(/\\/g, "/").toLowerCase();
        return statusByPath.get(key);
    }, [statusByPath]);

    // Padding on the wrapper (not margin on the island) keeps the flex parent
    // from shifting — the island sits inset without pushing layout sideways.
    return (
        <div className="box-border flex h-full min-h-0 w-full flex-col bg-transparent">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="px-2 pb-1 pt-2">
                    <div className="flex h-8 items-center gap-2 rounded-lg bg-panel-hover px-2">
                        <Icon icon={Search20Regular} className="icon-sm shrink-0 text-text-muted" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Filter files..."
                            aria-label="Filter files"
                            className="h-7 min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                        />
                    </div>
                    <span className="sr-only">{title}</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2 custom-scrollbar">
                    {error ? <div className="p-2 text-sm text-error">{error}</div> : null}
                    {shown.map((entry) => (
                        <TreeNode
                            key={entry.path}
                            entry={entry}
                            depth={0}
                            activePath={activePath}
                            query={query}
                            onOpenFile={onOpenFile}
                            statusFor={statusFor}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
