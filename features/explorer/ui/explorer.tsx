"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { cn } from "@/lib/utils";
import {
    commands,
    useProjectState,
    GitFileParams,
} from "@/lib/backend";
import { notify } from "@/features/notifications";
import { discoverGitRepos, loadAllRepoGitStatuses, buildGitDirMap } from "@/lib/git/repos";
import { useLoading } from "@/features/loading/context";
import { LoadingBar } from "@/components/ui/loading";
import { FileIcon } from "@/components/ui/file-icon";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { SidebarPanelHeader, SidebarPanelActionButton, SidebarSwitchPanelMenuItems } from "@/features/panels";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";

import { ExplorerContext } from "../context";
import { FileNode } from "../types";
import { FileEntry } from "./file-entry";
import { getWorkspaceRoots, workspaceFolderLabel } from "@/lib/workspace-folders";

export default function Explorer({ className }: { className?: string }) {
    const { project_path, active_file, open_files } = useProjectState();
    const { startLoading, stopLoading } = useLoading();
    const [rootFiles, setRootFiles] = useState<FileNode[]>([]);
    const [treeResetKey, setTreeResetKey] = useState(0);
    const [refreshToken, setRefreshToken] = useState(0);

    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
    const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
    const [clipboard, setClipboard] = useState<{ type: "copy" | "cut"; paths: string[] } | null>(null);
    const [pendingCreate, setPendingCreate] = useState<{ type: "file" | "folder", parentPath: string } | null>(null);
    const [pendingRename, setPendingRename] = useState<string | null>(null);
    const [dragOverPath, setDragOverPath] = useState<string | null>(null);
    const [forceExpandedPaths, setForceExpandedPaths] = useState<Set<string>>(() => new Set());
    const [revealPath, setRevealPath] = useState<string | null>(null);
    const visiblePathsRef = useRef<string[]>([]);

    const registerVisiblePath = useCallback((path: string) => {
        if (!visiblePathsRef.current.includes(path)) {
            visiblePathsRef.current.push(path);
        }
    }, []);

    const unregisterVisiblePath = useCallback((path: string) => {
        visiblePathsRef.current = visiblePathsRef.current.filter((p) => p !== path);
    }, []);

    const selectPath = useCallback((path: string, mods?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => {
        const toggle = !!(mods?.ctrlKey || mods?.metaKey);
        const range = !!mods?.shiftKey;

        if (range && selectionAnchor) {
            const visible = visiblePathsRef.current;
            const a = visible.indexOf(selectionAnchor);
            const b = visible.indexOf(path);
            if (a !== -1 && b !== -1) {
                const [lo, hi] = a < b ? [a, b] : [b, a];
                const next = new Set(visible.slice(lo, hi + 1));
                setSelectedPaths(next);
                setSelectedPath(path);
                return;
            }
        }

        if (toggle) {
            setSelectedPaths((prev) => {
                const next = new Set(prev);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return next;
            });
            setSelectedPath(path);
            setSelectionAnchor(path);
            return;
        }

        setSelectedPaths(new Set([path]));
        setSelectedPath(path);
        setSelectionAnchor(path);
    }, [selectionAnchor]);

    const [gitStatuses, setGitStatuses] = useState<Map<string, GitFileParams>>(new Map());
    const [gitModifiedDirs, setGitModifiedDirs] = useState<Map<string, string>>(new Map());
    const [scrolledFromTop, setScrolledFromTop] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);


    const dirtyPaths = useMemo(
        () => new Set(open_files.filter((f) => f.is_dirty).map((f) => f.path)),
        [open_files]
    );

    const activeFileRef = useRef<string | null>(active_file);

    const joinPath = useCallback((base: string, child: string) => {
        const separator = base.includes("\\") ? "\\" : "/";
        return `${base.replace(/[\\/]+$/, "")}${separator}${child}`;
    }, []);

    const loadRootFiles = useCallback(async (silent = false) => {
        if (!project_path) return;
        if (!silent) startLoading();
        try {
            const roots = getWorkspaceRoots(project_path);
            if (roots.length <= 1) {
                const entries = await commands.lsDir(project_path);
                setRootFiles(entries);
            } else {
                setRootFiles(
                    roots.map((root) => ({
                        name: workspaceFolderLabel(root),
                        path: root,
                        is_dir: true,
                    })),
                );
            }
        } catch (err) {
            console.error(err);
            notify.error("Explorer Error", `Failed to load workspace files: ${err instanceof Error ? err.message : String(err)}`, { code: 4000 });
        } finally {
            if (!silent) stopLoading();
        }
    }, [project_path, startLoading, stopLoading]);

    useEffect(() => {
        const onFoldersChanged = () => void loadRootFiles(true);
        window.addEventListener("shape-workspace-folders-changed", onFoldersChanged);
        return () => window.removeEventListener("shape-workspace-folders-changed", onFoldersChanged);
    }, [loadRootFiles]);

    const loadGitStatus = useCallback(async () => {
        if (!project_path) return;
        try {
            const repos = await discoverGitRepos(project_path);
            const map = await loadAllRepoGitStatuses(project_path, repos);
            setGitStatuses(map);
            setGitModifiedDirs(buildGitDirMap(map));
        } catch {
            setGitStatuses(new Map());
            setGitModifiedDirs(new Map());
        }
    }, [project_path]);

    useEffect(() => {
        activeFileRef.current = active_file;
    }, [active_file]);

    useEffect(() => {
        loadRootFiles();
        loadGitStatus();
    }, [loadRootFiles, loadGitStatus]);

    const beginCreate = useCallback((type: "file" | "folder") => {
        let targetPath = selectedPath || project_path || "";

        const lastSegment = targetPath.split(/[\\/]/).pop() || "";
        if (lastSegment.includes(".") && targetPath !== project_path) {
            targetPath = targetPath.replace(/[\\/][^\\/]+$/, "");
        }

        setPendingCreate({ type, parentPath: targetPath });
    }, [project_path, selectedPath]);

    const handleNewFile = useCallback(() => beginCreate("file"), [beginCreate]);
    const handleNewFolder = useCallback(() => beginCreate("folder"), [beginCreate]);

    const submitCreate = useCallback(async (name: string, parentPath: string) => {
        if (!project_path) return;
        const trimmed = name.trim();
        if (!trimmed) {
            setPendingCreate(null);
            return;
        }
        const fullPath = joinPath(parentPath, trimmed);
        try {
            if (pendingCreate?.type === "file") {
                await commands.createFile(fullPath);
                await commands.openFile(fullPath, trimmed.split(/[\\/]/).pop() || trimmed);
            } else {
                await commands.createDir(fullPath);
            }
            await loadRootFiles();
        } catch (err) {
            console.error(`Failed to create:`, err);
            notify.error("Explorer Error", `Failed to create: ${err instanceof Error ? err.message : String(err)}`, { code: 4000 });
        } finally {
            setPendingCreate(null);
        }
    }, [joinPath, loadRootFiles, pendingCreate, project_path]);

    const submitRename = useCallback(async (newName: string, oldPath: string) => {
        const trimmed = newName.trim();
        if (!trimmed) {
            setPendingRename(null);
            return;
        }
        const parentPath = oldPath.replace(/[\\/][^\\/]+$/, "");
        const newPath = joinPath(parentPath, trimmed);
        if (newPath === oldPath) {
            setPendingRename(null);
            return;
        }
        try {
            await commands.renamePath(oldPath, newPath);
            await loadRootFiles();
        } catch (err) {
            notify.error("Rename Error", String(err), { code: 4000 });
        } finally {
            setPendingRename(null);
        }
    }, [joinPath, loadRootFiles]);

    const handleRefresh = useCallback(async (silent = true) => {
        await loadRootFiles(silent);
        await loadGitStatus();
        setRefreshToken((value) => value + 1);
    }, [loadRootFiles, loadGitStatus]);

    const scheduleRefresh = useCallback(() => {
        const w = window as Window & { __shapeExplorerRefreshTimer?: ReturnType<typeof setTimeout> };
        if (w.__shapeExplorerRefreshTimer) clearTimeout(w.__shapeExplorerRefreshTimer);
        w.__shapeExplorerRefreshTimer = setTimeout(() => {
            w.__shapeExplorerRefreshTimer = undefined;
            void handleRefresh();
        }, 400);
    }, [handleRefresh]);

    const handleCollapseAll = useCallback(() => {
        setTreeResetKey((value) => value + 1);
        setForceExpandedPaths(new Set());
    }, []);

    // Reveal active file in the sidebar tree (expand ancestors + scroll).
    useEffect(() => {
        const handleReveal = (event: Event) => {
            const path = (event as CustomEvent<{ path?: string }>).detail?.path;
            if (!path || !project_path) return;
            window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "explorer" }));
            window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "primary-sidebar", value: true } }));

            const sep = path.includes("\\") ? "\\" : "/";
            const root = project_path.replace(/[\\/]+$/, "");
            const relative = path.startsWith(root) ? path.slice(root.length).replace(/^[\\/]/, "") : "";
            const parts = relative ? relative.split(/[\\/]/) : [];
            const ancestors: string[] = [];
            let cur = root;
            for (let i = 0; i < parts.length - 1; i++) {
                cur = `${cur}${sep}${parts[i]}`;
                ancestors.push(cur);
            }
            setForceExpandedPaths((prev) => {
                const next = new Set(prev);
                for (const a of ancestors) next.add(a);
                return next;
            });
            setSelectedPaths(new Set([path]));
            setSelectedPath(path);
            setSelectionAnchor(path);
            setRevealPath(path);
            // Clear scroll target after FileEntry has a chance to scroll
            window.setTimeout(() => setRevealPath(null), 800);
        };
        window.addEventListener("shape-reveal-in-explorer", handleReveal as EventListener);
        return () => window.removeEventListener("shape-reveal-in-explorer", handleReveal as EventListener);
    }, [project_path]);

    // Global Cut/Copy/Paste when explorer is focused (routed from shortcut-actions).
    useEffect(() => {
        const handleAction = (event: Event) => {
            const action = (event as CustomEvent<{ action?: string }>).detail?.action;
            if (!action) return;
            const paths = selectedPaths.size > 0
                ? Array.from(selectedPaths)
                : selectedPath
                    ? [selectedPath]
                    : [];
            if (action === "copy" || action === "cut") {
                if (paths.length === 0) return;
                setClipboard({ type: action, paths });
                if (action === "copy") {
                    void navigator.clipboard.writeText(paths.join("\n"));
                }
                return;
            }
            if (action === "paste" && clipboard) {
                const targetDir = (() => {
                    const focus = selectedPath || project_path || "";
                    if (!focus) return "";
                    // If focus is a file, paste into its parent
                    const last = focus.split(/[\\/]/).pop() || "";
                    if (last.includes(".") && focus !== project_path) {
                        return focus.replace(/[\\/][^\\/]+$/, "");
                    }
                    return focus;
                })();
                if (!targetDir) return;
                void (async () => {
                    try {
                        for (const src of clipboard.paths) {
                            const basename = src.split(/[\\/]/).pop() || "";
                            if (!basename) continue;
                            const newPath = joinPath(targetDir, basename);
                            if (clipboard.type === "copy") {
                                await commands.copyPath(src, newPath);
                            } else {
                                await commands.renamePath(src, newPath);
                            }
                        }
                        if (clipboard.type === "cut") setClipboard(null);
                        handleRefresh();
                    } catch (err) {
                        notify.error("Paste Error", String(err), { code: 4000 });
                    }
                })();
            }
        };
        window.addEventListener("shape-explorer-action", handleAction as EventListener);
        return () => window.removeEventListener("shape-explorer-action", handleAction as EventListener);
    }, [clipboard, selectedPath, selectedPaths, project_path, joinPath, handleRefresh]);

    const trashSelection = useCallback(async () => {
        const paths = selectedPaths.size > 0
            ? Array.from(selectedPaths)
            : selectedPath
                ? [selectedPath]
                : [];
        if (paths.length === 0) return;
        const label = paths.length === 1
            ? paths[0]!.split(/[\\/]/).pop()
            : `${paths.length} items`;
        const { confirm } = await import("@tauri-apps/plugin-dialog");
        if (!(await confirm(`Move ${label} to the Recycle Bin?`, { title: "Move to Trash", kind: "warning" }))) {
            return;
        }
        try {
            for (const p of paths) {
                await commands.trashPath(p);
            }
            setSelectedPaths(new Set());
            setSelectedPath(null);
            handleRefresh();
            window.dispatchEvent(new CustomEvent("shape-file-edited"));
        } catch (err) {
            notify.error("Delete Error", String(err), { code: 4000 });
        }
    }, [selectedPaths, selectedPath, handleRefresh]);

    useEffect(() => {
        const handleCreateRequest = (event: Event) => {
            const custom = event as CustomEvent<{ type?: "file" | "folder" }>;
            if (custom.detail?.type === "folder") {
                beginCreate("folder");
            } else {
                beginCreate("file");
            }
        };

        window.addEventListener("shape-explorer-create", handleCreateRequest as EventListener);
        const unlistenPromise = listen("new-file", () => beginCreate("file"));
        const unlistenBulk = listen<number>("shape-files-changed", () => scheduleRefresh());
        const onLocalEdit = () => scheduleRefresh();
        window.addEventListener("shape-file-edited", onLocalEdit);

        return () => {
            window.removeEventListener("shape-explorer-create", handleCreateRequest as EventListener);
            unlistenPromise.then((unlisten) => unlisten()).catch(() => { });
            unlistenBulk.then((unlisten) => unlisten()).catch(() => { });
            window.removeEventListener("shape-file-edited", onLocalEdit);
        };
    }, [beginCreate, scheduleRefresh]);



    const [rootCreateName, setRootCreateName] = useState("");

    const explorerContextValue = useMemo(
        () => ({
            selectedPath,
            selectedPaths,
            setSelectedPath,
            selectPath,
            clipboard,
            setClipboard,
            pendingCreate,
            setPendingCreate,
            pendingRename,
            setPendingRename,
            submitCreate,
            submitRename,
            dragOverPath,
            setDragOverPath,
            joinPath,
            handleRefresh,
            handleCollapseAll,
            forceExpandedPaths,
            revealPath,
            registerVisiblePath,
            unregisterVisiblePath,
        }),
        [
            selectedPath,
            selectedPaths,
            selectPath,
            clipboard,
            pendingCreate,
            pendingRename,
            dragOverPath,
            submitCreate,
            submitRename,
            joinPath,
            handleRefresh,
            handleCollapseAll,
            forceExpandedPaths,
            revealPath,
            registerVisiblePath,
            unregisterVisiblePath,
        ],
    );

    return (
        <ExplorerContext.Provider value={explorerContextValue}>
            <div
                data-explorer-root="true"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === "Delete" || (e.metaKey && e.key === "Backspace")) {
                        const t = e.target as HTMLElement;
                        if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
                        e.preventDefault();
                        void trashSelection();
                    } else if (e.key === "F2" && selectedPath) {
                        e.preventDefault();
                        setPendingRename(selectedPath);
                    }
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverPath !== (project_path || "")) {
                        setDragOverPath(project_path || "");
                    }
                }}
                onDragLeave={() => {
                }}
                onDrop={async (e) => {
                    e.preventDefault();
                    setDragOverPath(null);
                    const sourcePath = e.dataTransfer.getData("text/plain");
                    if (!sourcePath || !project_path) return;
                    const basename = sourcePath.replace(/.*[\\/]/, "");
                    if (!basename) return;
                    const newPath = project_path + (project_path.includes("\\") ? "\\" : "/") + basename;
                    if (sourcePath === newPath) return;
                    try {
                        await commands.renamePath(sourcePath, newPath);
                        handleRefresh();
                    } catch { }
                }}
                className={cn("w-full h-full flex flex-col overflow-hidden font-sans", className)}
            >
                <SidebarPanelHeader
                    title="Explorer"
                    side="left"
                    panelId="explorer"
                    actions={
                        <div className="flex items-center gap-0.5">
                            <Tooltip content="New File">
                                <SidebarPanelActionButton onClick={handleNewFile}>
                                    <Icon name="note_add" size={16} />
                                </SidebarPanelActionButton>
                            </Tooltip>
                            <Tooltip content="New Folder">
                                <SidebarPanelActionButton onClick={handleNewFolder}>
                                    <Icon name="create_new_folder" size={16} />
                                </SidebarPanelActionButton>
                            </Tooltip>
                            <Tooltip content="Refresh">
                                <SidebarPanelActionButton onClick={() => void handleRefresh(false)}>
                                    <Icon name="refresh" size={16} />
                                </SidebarPanelActionButton>
                            </Tooltip>
                            <Tooltip content="Collapse All">
                                <SidebarPanelActionButton onClick={handleCollapseAll}>
                                    <Icon name="unfold_less" size={16} />
                                </SidebarPanelActionButton>
                            </Tooltip>
                        </div>
                    }
                />
                <LoadingBar />

                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                    {/* Same technique as Graph: overlap scroller, only when scrolled */}
                    <div
                        className="pointer-events-none relative z-10 shrink-0 transition-opacity duration-200"
                        style={{
                            height: 30,
                            marginBottom: -30,
                            opacity: scrolledFromTop ? 1 : 0,
                            background:
                                "linear-gradient(to bottom, var(--color-panel) 0%, transparent 100%)",
                        }}
                        aria-hidden
                    />
                    <div
                        ref={scrollRef}
                        onScroll={(e) => {
                            setScrolledFromTop(e.currentTarget.scrollTop > 0);
                        }}
                        className="flex min-h-0 flex-1 flex-col overflow-y-auto custom-scrollbar px-1"
                    >
                    <ContextMenu>
                        <ContextMenuTrigger asChild>
                            <div className="flex min-h-full flex-col">
                        <div key={treeResetKey} className="flex flex-col gap-0.5">
                                {pendingCreate?.parentPath === project_path ? (
                                    <div
                                        className="h-[20px] flex items-center pr-2 text-text-primary text-sm whitespace-nowrap w-full"
                                        style={{ paddingLeft: `8px` }}
                                    >
                                        <div className="w-4 flex items-center justify-center shrink-0">
                                            <span className="w-3" />
                                        </div>
                                        <FileIcon
                                            name={pendingCreate.type === "folder" ? "folder" : rootCreateName || "untitled.txt"}
                                            isDir={pendingCreate.type === "folder"}
                                            className="mr-1.5"
                                        />
                                        <input
                                            autoFocus
                                            value={rootCreateName}
                                            onChange={(event) => setRootCreateName(event.target.value)}
                                            onBlur={() => submitCreate(rootCreateName, project_path || "")}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                    event.preventDefault();
                                                    submitCreate(rootCreateName, project_path || "");
                                                    setRootCreateName("");
                                                } else if (event.key === "Escape") {
                                                    setPendingCreate(null);
                                                }
                                            }}
                                            className="h-[18px] flex-1 bg-panel border border-border-subtle rounded px-1.5 text-sm outline-none focus:border-accent min-w-0"
                                        />
                                    </div>
                                ) : null}
                                {rootFiles.map((node) => (
                                    <FileEntry
                                        key={node.path}
                                        node={node}
                                        depth={0}
                                        activeFile={active_file}
                                        dirtyPaths={dirtyPaths}
                                        gitStatuses={gitStatuses}
                                        gitModifiedDirs={gitModifiedDirs}
                                        refreshToken={refreshToken}
                                    />
                                ))}
                            </div>
                            </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                            <ContextMenuItem onClick={handleNewFile}>
                                New File
                            </ContextMenuItem>
                            <ContextMenuItem onClick={handleNewFolder}>
                                New Folder
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={() => handleRefresh(false)}>
                                Refresh Explorer
                            </ContextMenuItem>
                            <ContextMenuItem onClick={handleCollapseAll}>
                                Collapse All Folders
                            </ContextMenuItem>
                            <SidebarSwitchPanelMenuItems currentSide="left" currentPanelId="explorer" />
                        </ContextMenuContent>
                    </ContextMenu>
                    </div>
                </div>

            </div>
        </ExplorerContext.Provider>
    );
}
