import { useEffect, useMemo, useRef, useState, memo, type MouseEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { commands, GitFileParams, useProjectState } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { useLoading } from "@/features/loading/context";
import { Tooltip } from "@/components/ui/tooltip";
import { FileIcon } from "@/components/ui/file-icon";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { useDiagnostics } from "@/features/diagnostics/store";

import { FileNode } from "../types";
import { useExplorerContext } from "../context";
import { startLiveServer } from "./live-server";
import { confirm } from "@tauri-apps/plugin-dialog";
import { HistoryPanel } from "@/features/history/ui/history-panel";

const BATCH_SIZE = 100;

export const FileEntry = memo(({
    node,
    depth,
    activeFile,
    dirtyPaths,
    gitStatuses,
    gitModifiedDirs,
    refreshToken
}: {
    node: FileNode;
    depth: number;
    activeFile: string | null;
    dirtyPaths: Set<string>;
    gitStatuses: Map<string, GitFileParams>;
    gitModifiedDirs: Map<string, string>;
    refreshToken: number;
}) => {
    const [open, setOpen] = useState(false);
    const [children, setChildren] = useState<FileNode[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
    const { startLoading, stopLoading } = useLoading();
    const diagnostics = useDiagnostics();
    const ctx = useExplorerContext();
    const { project_path } = useProjectState();
    const dropdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rowRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        return () => {
            if (dropdownTimerRef.current) clearTimeout(dropdownTimerRef.current);
        };
    }, []);

    useEffect(() => {
        ctx.registerVisiblePath(node.path);
        return () => ctx.unregisterVisiblePath(node.path);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- register/unregister are stable
    }, [node.path]);

    // Expand when reveal / force-expanded asks for this folder.
    useEffect(() => {
        if (!node.is_dir) return;
        if (ctx.forceExpandedPaths.has(node.path) && !open) {
            setOpen(true);
        }
    }, [ctx.forceExpandedPaths, node.is_dir, node.path, open]);

    // Scroll revealed path into view.
    useEffect(() => {
        if (ctx.revealPath !== node.path) return;
        const el = rowRef.current;
        if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, [ctx.revealPath, node.path]);

    const isGit = useMemo(() => node.name === ".git", [node.name]);
    const isMuted = useMemo(() => node.name === "node_modules" || node.name === "target" || node.name.startsWith("."), [node.name]);
    const isActive = activeFile === node.path;
    const isSelected = ctx.selectedPaths.has(node.path) || ctx.selectedPath === node.path;
    const isDirty = dirtyPaths.has(node.path);
    const [renameName, setRenameName] = useState(node.name);
    const [createName, setCreateName] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const fileSummary = useMemo(() => {
        const list = diagnostics.byFile[node.path] || [];
        let errors = 0, warnings = 0, infos = 0;
        for (const d of list) {
            if (d.severity === "error") errors++;
            else if (d.severity === "warning") warnings++;
            else infos++;
        }
        return { errors, warnings, infos };
    }, [diagnostics, node.path]);

    const visibleChildren = useMemo(
        () => children.slice(0, visibleCount),
        [children, visibleCount]
    );
    const hasMoreChildren = children.length > visibleCount;

    const normalizedPath = useMemo(() => node.path.replace(/\\/g, '/'), [node.path]);

    const fileGitStatus = useMemo(() => {
        if (node.is_dir) {
            const dirStatus = gitModifiedDirs?.get(normalizedPath);
            return dirStatus ? { status: dirStatus } : null;
        } else {
            return gitStatuses?.get(normalizedPath) || null;
        }
    }, [node.is_dir, gitStatuses, gitModifiedDirs, normalizedPath]);

    useEffect(() => {
        if (!node.is_dir || !open) return;
        let cancelled = false;
        const refreshChildren = async () => {
            try {
                const results = await commands.lsDir(node.path);
                if (cancelled) return;
                setChildren(results);
                setLoaded(true);
            } catch (err) {
                console.error("Failed to refresh directory:", err);
                notify.error("Explorer Error", `Failed to refresh directory "${node.name}": ${err instanceof Error ? err.message : String(err)}`, { code: 4000 });
            }
        };
        refreshChildren();
        return () => {
            cancelled = true;
        };
    }, [node.is_dir, node.path, node.name, open, refreshToken]);

    const handleToggle = async (e?: MouseEvent) => {
        if (isGit) return;

        const mods = e
            ? { ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey }
            : undefined;
        ctx.selectPath(node.path, mods);

        // Multi-select gestures should not open / toggle folders.
        if (mods?.ctrlKey || mods?.metaKey || mods?.shiftKey) {
            return;
        }

        if (!node.is_dir) {
            commands.openFile(node.path, node.name);
            return;
        }

        const nextOpen = !open;
        setOpen(nextOpen);

        if (nextOpen && !loaded) {
            startLoading();
            try {
                const results = await commands.lsDir(node.path);
                setChildren(results);
                setLoaded(true);
                setVisibleCount(BATCH_SIZE);
            } catch (err) {
                console.error("Failed to read directory:", err);
                notify.error("Explorer Error", `Failed to read directory "${node.name}": ${err instanceof Error ? err.message : String(err)}`, { code: 4000 });
            } finally {
                stopLoading();
            }
        }
    };

    return (
        <div className="relative">
            <div className="w-full">
            <ContextMenu>
                <ContextMenuTrigger>
                    <div
                        ref={rowRef}
                        draggable={!isGit}
                        onDragStart={(e) => {
                            setIsDragging(true);
                            e.dataTransfer.setData("text/plain", node.path);
                            e.dataTransfer.setData("application/x-shape-path", node.path);
                            e.dataTransfer.effectAllowed = "move";
                            e.stopPropagation();
                        }}
                        onDragEnd={(e) => {
                            setIsDragging(false);
                            ctx.setDragOverPath(null);
                            e.stopPropagation();
                        }}
                        onDragEnter={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = "move";
                        }}
                        onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = "move";

                            const targetPath = node.is_dir ? node.path : node.path.replace(/[\\/][^\\/]+$/, "");
                            if (ctx.dragOverPath !== targetPath) {
                                ctx.setDragOverPath(targetPath);
                            }

                            if (node.is_dir && !open && !dropdownTimerRef.current) {
                                dropdownTimerRef.current = setTimeout(() => {
                                    setOpen(true);
                                    dropdownTimerRef.current = null;
                                }, 700);
                            }
                        }}
                        onDragLeave={(e) => {
                            e.stopPropagation();
                            if (dropdownTimerRef.current) {
                                clearTimeout(dropdownTimerRef.current);
                                dropdownTimerRef.current = null;
                            }
                        }}
                        onDrop={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            ctx.setDragOverPath(null);
                            if (dropdownTimerRef.current) {
                                clearTimeout(dropdownTimerRef.current);
                                dropdownTimerRef.current = null;
                            }

                            const sourcePath = e.dataTransfer.getData("application/x-shape-path") || e.dataTransfer.getData("text/plain");
                            if (!sourcePath || sourcePath === node.path) return;

                            const basename = sourcePath.replace(/.*[\\/]/, "");
                            if (!basename) return;

                            const targetDir = node.is_dir ? node.path : node.path.replace(/[\\/][^\\/]+$/, "");

                            if (targetDir === sourcePath || targetDir.startsWith(sourcePath + (sourcePath.includes("\\") ? "\\" : "/"))) {
                                return;
                            }

                            const newPath = ctx.joinPath(targetDir, basename);

                            if (sourcePath === newPath) return;

                            try {
                                await commands.renamePath(sourcePath, newPath);
                                ctx.handleRefresh();
                            } catch { }
                        }}
                        className={cn(
                            "h-[20px] flex items-center px-2 rounded-md hover:bg-panel-hover cursor-pointer text-text-primary group text-[14px] font-medium whitespace-nowrap w-full outline-none transition-colors tracking-tight duration-75 select-none",
                            isGit && "opacity-40 grayscale cursor-not-allowed pointer-events-none",
                            isDragging && "opacity-50",
                            isSelected && (isActive ? "bg-panel-active text-white" : "bg-panel-hover"),
                            !isSelected && isActive && "bg-panel-active text-white",
                            ctx.dragOverPath && (node.path === ctx.dragOverPath || node.path.startsWith(ctx.dragOverPath + "/") || node.path.startsWith(ctx.dragOverPath + "\\")) && "bg-panel-hover/50"
                        )}
                        style={{ paddingLeft: `${depth * 12 + 8}px` }}
                        onClick={(e) => {
                            e.stopPropagation();
                            void handleToggle(e);
                        }}
                        tabIndex={0}
                        onKeyDown={async (e) => {
                            if (e.key === "Delete" || (e.metaKey && e.key === "Backspace")) {
                                e.preventDefault();
                                e.stopPropagation();
                                const targets = ctx.selectedPaths.has(node.path) && ctx.selectedPaths.size > 1
                                    ? Array.from(ctx.selectedPaths)
                                    : [node.path];
                                const label = targets.length === 1
                                    ? node.name
                                    : `${targets.length} items`;
                                if (await confirm(`Move ${label} to the Recycle Bin?`, { title: 'Move to Trash', kind: 'warning' })) {
                                    try {
                                        e.currentTarget.blur();
                                        for (const p of targets) {
                                            await commands.trashPath(p);
                                        }
                                        ctx.handleRefresh();
                                        window.dispatchEvent(new CustomEvent("shape-file-edited"));
                                    } catch (err) {
                                        notify.error("Delete Error", String(err), { code: 4000 });
                                    }
                                }
                            } else if (e.key === "F2") {
                                e.preventDefault();
                                e.stopPropagation();
                                ctx.setPendingRename(node.path);
                                setRenameName(node.name);
                            } else if (e.ctrlKey || e.metaKey) {
                                if (e.key === "c") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const paths = ctx.selectedPaths.has(node.path) && ctx.selectedPaths.size > 0
                                        ? Array.from(ctx.selectedPaths)
                                        : [node.path];
                                    ctx.setClipboard({ type: "copy", paths });
                                    navigator.clipboard.writeText(paths.join("\n"));
                                } else if (e.key === "x") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const paths = ctx.selectedPaths.has(node.path) && ctx.selectedPaths.size > 0
                                        ? Array.from(ctx.selectedPaths)
                                        : [node.path];
                                    ctx.setClipboard({ type: "cut", paths });
                                } else if (e.key === "v" && ctx.clipboard && node.is_dir) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    try {
                                        for (const src of ctx.clipboard.paths) {
                                            const basename = src.split(/[\\/]/).pop() || "";
                                            if (!basename) continue;
                                            const newPath = ctx.joinPath(node.path, basename);
                                            if (ctx.clipboard.type === "copy") {
                                                await commands.copyPath(src, newPath);
                                            } else {
                                                await commands.renamePath(src, newPath);
                                            }
                                        }
                                        if (ctx.clipboard.type === "cut") ctx.setClipboard(null);
                                        ctx.handleRefresh();
                                    } catch (err) {
                                        notify.error("Paste Error", String(err), { code: 4000 });
                                    }
                                }
                            }
                        }}
                    >
                        <div className="w-4 flex items-center justify-center shrink-0">
                            {node.is_dir ? (
                                <Icon
                                    name="chevron_right"
                                    size={15}
                                    className={cn("transition-transform duration-150 text-text-muted", open && "rotate-90")}
                                />
                            ) : (
                                <span className="w-3" />
                            )}
                        </div>
                        {node.is_dir ? (
                            <FileIcon name={node.name} isDir isOpen={open} className="mr-1" />
                        ) : (
                            <FileIcon name={node.name} className="mr-1" />
                        )}
                        {ctx.pendingRename === node.path ? (
                            <input
                                autoFocus
                                value={renameName}
                                onChange={(e) => setRenameName(e.target.value)}
                                onBlur={() => ctx.submitRename(renameName, node.path)}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        ctx.submitRename(renameName, node.path);
                                    } else if (e.key === "Escape") {
                                        ctx.setPendingRename(null);
                                    }
                                }}
                                className="h-[18px] flex-1 bg-panel border border-border-subtle rounded px-1 text-sm outline-none focus:border-accent w-full min-w-0"
                            />
                        ) : (
                            <span
                                className={cn(
                                    "truncate transition-colors flex-1",
                                    isMuted && "text-text-muted",
                                    !fileGitStatus && !isMuted && (node.is_dir ? "font-medium text-text-primary" : "text-text-secondary group-hover:text-text-primary"),
                                    fileGitStatus && node.is_dir && "font-medium"
                                )}
                                style={fileGitStatus ? {
                                    color: fileGitStatus.status === "M" ? "var(--git-modified)" :
                                        fileGitStatus.status === "A" || fileGitStatus.status === "U" ? "var(--git-added)" :
                                            fileGitStatus.status === "D" ? "var(--git-deleted)" : undefined
                                } : undefined}
                            >
                                {node.name}
                            </span>
                        )}
                        {isDirty && (
                            <div className="w-1.5 h-1.5 rounded-full bg-accent mr-1 shrink-0" />
                        )}
                        {!node.is_dir && (fileSummary.errors > 0 || fileSummary.warnings > 0) && (
                            <Tooltip
                                content={
                                    fileSummary.errors > 0
                                        ? `${fileSummary.errors} error${fileSummary.errors > 1 ? 's' : ''}`
                                        : `${fileSummary.warnings} warning${fileSummary.warnings > 1 ? 's' : ''}`
                                }
                            >
                                <span
                                    className={cn(
                                        "text-sm font-bold ml-1 shrink-0 leading-none",
                                        fileSummary.errors > 0 ? "text-error" : "text-warning"
                                    )}
                                >
                                    {fileSummary.errors > 0 ? fileSummary.errors : fileSummary.warnings}
                                </span>
                            </Tooltip>
                        )}
                        {fileGitStatus && (
                            node.is_dir ? (
                                <div
                                    className="w-1.5 h-1.5 rounded-full shrink-0 ml-1"
                                    style={{
                                        backgroundColor: fileGitStatus.status === "M" ? "var(--git-modified)" :
                                            fileGitStatus.status === "A" || fileGitStatus.status === "U" ? "var(--git-added)" :
                                                fileGitStatus.status === "D" ? "var(--git-deleted)" : "var(--git-added)"
                                    }}
                                />
                            ) : (
                                <span
                                    className="text-2xs font-bold w-4 text-center shrink-0 ml-1 leading-none self-center pt-0.5"
                                    style={{
                                        color: fileGitStatus.status === "M" ? "var(--git-modified)" :
                                            fileGitStatus.status === "A" || fileGitStatus.status === "U" ? "var(--git-added)" :
                                                fileGitStatus.status === "D" ? "var(--git-deleted)" : "var(--git-added)"
                                    }}
                                >
                                    {fileGitStatus.status}
                                </span>
                            )
                        )}
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem onClick={() => {
                        if (!node.is_dir) commands.openFile(node.path, node.name);
                        else setOpen(!open);
                    }}>
                        {node.is_dir ? (open ? "Collapse" : "Expand") : "Open"}
                    </ContextMenuItem>
                    {!node.is_dir && (
                        <ContextMenuItem onClick={() => setShowHistory(true)}>
                            Local History
                        </ContextMenuItem>
                    )}
                    {!node.is_dir && node.name.toLowerCase().endsWith(".html") && (
                        <ContextMenuItem onClick={() => {
                            const parentDir = node.path.substring(0, node.path.lastIndexOf(/[\\/]/.exec(node.path)?.[0] || "/"));
                            startLiveServer(parentDir, node.name);
                        }}>
                            Open with Live Server
                        </ContextMenuItem>
                    )}
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => ctx.setPendingCreate({ type: "file", parentPath: node.is_dir ? node.path : node.path.replace(/[\\/][^\\/]+$/, "") })}>
                        New File
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => ctx.setPendingCreate({ type: "folder", parentPath: node.is_dir ? node.path : node.path.replace(/[\\/][^\\/]+$/, "") })}>
                        New Folder
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => {
                        const targetPath = node.is_dir ? node.path : node.path.replace(/[\\/][^\\/]+$/, "");
                        window.dispatchEvent(new CustomEvent("shape-terminal-run", {
                            detail: { command: `cd "${targetPath}"` }
                        }));
                        window.dispatchEvent(new CustomEvent("shape-layout-toggle", {
                            detail: { id: "panel", value: true }
                        }));
                    }}>
                        Open in Terminal
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => commands.revealPath(node.path)}>
                        Reveal in File Explorer
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => {
                        const paths = ctx.selectedPaths.has(node.path) && ctx.selectedPaths.size > 0
                            ? Array.from(ctx.selectedPaths)
                            : [node.path];
                        ctx.setClipboard({ type: "cut", paths });
                    }}>
                        Cut <span className="ml-auto text-xs opacity-50">Ctrl+X</span>
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => {
                        const paths = ctx.selectedPaths.has(node.path) && ctx.selectedPaths.size > 0
                            ? Array.from(ctx.selectedPaths)
                            : [node.path];
                        ctx.setClipboard({ type: "copy", paths });
                        navigator.clipboard.writeText(paths.join("\n"));
                    }}>
                        Copy <span className="ml-auto text-xs opacity-50">Ctrl+C</span>
                    </ContextMenuItem>
                    <ContextMenuItem disabled={!ctx.clipboard} onClick={async () => {
                        if (!ctx.clipboard) return;
                        const targetDir = node.is_dir ? node.path : node.path.replace(/[\\/][^\\/]+$/, "");
                        try {
                            for (const src of ctx.clipboard.paths) {
                                const basename = src.split(/[\\/]/).pop() || "";
                                if (!basename) continue;
                                const newPath = ctx.joinPath(targetDir, basename);
                                if (ctx.clipboard.type === "copy") {
                                    await commands.copyPath(src, newPath);
                                } else {
                                    await commands.renamePath(src, newPath);
                                }
                            }
                            if (ctx.clipboard.type === "cut") ctx.setClipboard(null);
                            ctx.handleRefresh();
                        } catch (err) { notify.error("Paste Error", String(err), { code: 4000 }); }
                    }}>
                        Paste <span className="ml-auto text-xs opacity-50">Ctrl+V</span>
                    </ContextMenuItem>
                    <ContextMenuItem onClick={async () => {
                        let base = node.name;
                        let ext = "";
                        const dot = base.lastIndexOf(".");
                        if (dot > 0 && !node.is_dir) {
                            ext = base.substring(dot);
                            base = base.substring(0, dot);
                        }
                        const targetDir = node.is_dir ? node.path.replace(/[\\/][^\\/]+$/, "") : node.path.replace(/[\\/][^\\/]+$/, "");
                        const newPath = ctx.joinPath(targetDir, `${base} copy${ext}`);
                        try {
                            await commands.copyPath(node.path, newPath);
                            ctx.handleRefresh();
                        } catch (err) {
                            notify.error("Duplicate Error", String(err), { code: 4000 });
                        }
                    }}>
                        Duplicate
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => {
                        const rel = project_path ? node.path.replace(project_path + (project_path.includes("\\") ? "\\" : "/"), "") : node.path;
                        navigator.clipboard.writeText(rel);
                    }}>
                        Copy Relative Path
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => {
                        navigator.clipboard.writeText(node.path);
                    }}>
                        Copy Path
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => {
                        ctx.setPendingRename(node.path);
                        setRenameName(node.name);
                    }}>
                        Rename <span className="ml-auto text-xs opacity-50">F2</span>
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => ctx.handleCollapseAll()}>
                        Collapse All Folders
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        onClick={async () => {
                            if (await confirm(`Are you sure you want to move ${node.name} to Trash?`, { title: 'Trash File', kind: 'warning' })) {
                                try {
                                    await commands.trashPath(node.path);
                                    ctx.handleRefresh();
                                    window.dispatchEvent(new CustomEvent("shape-file-edited"));
                                } catch (e) {
                                    notify.error("Trash Error", String(e), { code: 4000 });
                                }
                            }
                        }}
                    >
                        Move to Trash <span className="ml-auto text-xs opacity-50">Del</span>
                    </ContextMenuItem>
                    <ContextMenuItem
                        className="text-foreground"
                        onClick={async () => {
                            if (await confirm(`Are you sure you want to permanently delete ${node.name}?`, { title: 'Delete File', kind: 'warning' })) {
                                try {
                                    await commands.deletePath(node.path);
                                    ctx.handleRefresh();
                                    window.dispatchEvent(new CustomEvent("shape-file-edited"));
                                } catch (e) {
                                    notify.error("Delete Error", String(e), { code: 4000 });
                                }
                            }
                        }}
                    >
                        Delete Permanently
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            <div
                className={cn(
                    "grid",
                    open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
            >
                <div className="overflow-hidden flex flex-col gap-0.5">
                    {ctx.pendingCreate?.parentPath === node.path && node.is_dir && open ? (
                        <div
                            className="h-[22px] flex items-center px-2 text-text-primary text-xs whitespace-nowrap w-full"
                            style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
                        >
                            <div className="w-4 flex items-center justify-center shrink-0">
                                <span className="w-3" />
                            </div>
                            <FileIcon
                                name={ctx.pendingCreate.type === "folder" ? "folder" : createName || "untitled.txt"}
                                isDir={ctx.pendingCreate.type === "folder"}
                                className="mr-1.5"
                            />
                            <input
                                autoFocus
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value)}
                                onBlur={() => ctx.submitCreate(createName, node.path)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        ctx.submitCreate(createName, node.path);
                                        setCreateName("");
                                    } else if (e.key === "Escape") {
                                        ctx.setPendingCreate(null);
                                    }
                                }}
                                className="h-[18px] flex-1 bg-panel border border-border-subtle rounded px-1 text-sm outline-none focus:border-accent w-full min-w-0"
                            />
                        </div>
                    ) : null}
                    {visibleChildren.map((child) => (
                        <FileEntry
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            activeFile={activeFile}
                            dirtyPaths={dirtyPaths}
                            gitStatuses={gitStatuses}
                            gitModifiedDirs={gitModifiedDirs}
                            refreshToken={refreshToken}
                        />
                    ))}
                    {hasMoreChildren && (
                        <button
                            type="button"
                            className="h-[22px] w-full text-left px-2 text-text-muted hover:text-text-primary hover:bg-panel-hover transition-colors text-xs"
                            style={{ paddingLeft: `${(depth + 1) * 12 + 32}px` }}
                            onClick={() => setVisibleCount((v) => v + BATCH_SIZE)}
                        >
                            Load more...
                        </button>
                    )}
                </div>
            </div>
            </div>
            {!node.is_dir && showHistory && (
                <HistoryPanel filePath={node.path} onClose={() => setShowHistory(false)} />
            )}
        </div>
    );
}, (prevProps, nextProps) => {
    if (prevProps.node.path !== nextProps.node.path) return false;
    if (prevProps.node.name !== nextProps.node.name) return false;
    if (prevProps.node.is_dir !== nextProps.node.is_dir) return false;
    if (prevProps.depth !== nextProps.depth) return false;
    if (prevProps.refreshToken !== nextProps.refreshToken) return false;
    if (prevProps.gitStatuses !== nextProps.gitStatuses) return false;
    if (prevProps.gitModifiedDirs !== nextProps.gitModifiedDirs) return false;
    if (prevProps.dirtyPaths !== nextProps.dirtyPaths) return false;

    const wasActive = prevProps.activeFile === prevProps.node.path;
    const isActive = nextProps.activeFile === nextProps.node.path;
    if (wasActive !== isActive) return false;

    return true;
});

FileEntry.displayName = "FileEntry";
