"use client";

import { RiArrowDownSLine, RiArrowRightSLine, RiFileTextLine, RiFolderLine, RiFolderOpenLine } from "@remixicon/react";
import { useCallback, useEffect, useState } from "react";
import { commands, type FileEntry } from "@/lib/backend";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

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
    onOpenFile,
}: {
    entry: FileEntry;
    depth: number;
    activePath: string | null;
    onOpenFile: (path: string) => void;
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

    const pad = 8 + depth * 12;

    if (entry.is_dir) {
        return (
            <div>
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="flex w-full items-center gap-1 rounded-md py-0.5 pr-1 text-left text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                    style={{ paddingLeft: pad }}
                >
                    <Icon
                        icon={open ? RiArrowDownSLine : RiArrowRightSLine}
                        className="shrink-0 text-text-muted"
                    />
                    <Icon
                        icon={open ? RiFolderOpenLine : RiFolderLine}
                        className="shrink-0 text-text-muted"
                    />
                    <span className="min-w-0 truncate">{entry.name}</span>
                </button>
                {open
                    ? children?.map((child) => (
                        <TreeNode
                            key={child.path}
                            entry={child}
                            depth={depth + 1}
                            activePath={activePath}
                            onOpenFile={onOpenFile}
                        />
                    ))
                    : null}
            </div>
        );
    }

    const active =
        activePath != null
        && activePath.replace(/\\/g, "/").toLowerCase() === entry.path.replace(/\\/g, "/").toLowerCase();

    return (
        <button
            type="button"
            onClick={() => onOpenFile(entry.path)}
            className={cn(
                "flex w-full items-center gap-1.5 rounded-md py-0.5 pr-1 text-left text-sm",
                active
                    ? "bg-panel-active text-text-primary"
                    : "text-text-secondary hover:bg-panel-hover hover:text-text-primary",
            )}
            style={{ paddingLeft: pad + 14 }}
        >
            <Icon icon={RiFileTextLine} className="shrink-0 text-text-muted" />
            <span className="min-w-0 truncate">{entry.name}</span>
        </button>
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
    const title = projectPath.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || projectPath;

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

    // Padding on the wrapper (not margin on the island) keeps the flex parent
    // from shifting — the island sits inset without pushing layout sideways.
    return (
        <div className="box-border flex h-full min-h-0 w-full flex-col p-2">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-2">
                <div className="flex h-9 shrink-0 items-center px-3 text-sm font-medium text-text-muted">
                    <span className="truncate capitalize">{title}</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2 custom-scrollbar">
                    {error ? <div className="p-2 text-sm text-error">{error}</div> : null}
                    {roots.map((entry) => (
                        <TreeNode
                            key={entry.path}
                            entry={entry}
                            depth={0}
                            activePath={activePath}
                            onOpenFile={onOpenFile}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
