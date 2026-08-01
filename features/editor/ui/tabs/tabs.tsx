"use client";

import { useProjectState, commands, FileInfo, GitFileParams } from "@/lib/backend";
import { Icon } from "@/components/ui/icon";
import { cn, getGitStatusColor } from "@/lib/utils";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToHorizontalAxis, restrictToFirstScrollableAncestor } from '@dnd-kit/modifiers';
import { getIconPath } from "@/lib/ui/icons/files";
import { isSettingsTab } from "@/lib/settings-tab";
import { isDesignPreviewTab, parseDesignPreviewTabPath } from "@/lib/design-preview-tab";
import React, { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useEditorView, ViewMode } from "@/core/providers/editor";
import { Tooltip } from "@/components/ui/tooltip";
import { getFileExtension, isImageExtension, isFontExtension } from "@/features/editor/lsp/image-types";

const AnimatedPanelIcon = ({ mode, size = 16 }: { mode: ViewMode; size?: number }) => {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width={size}
            height={size}
            className={cn("bottom-toggle", mode === "split" && "is-active", mode === "preview" && "is-full")}
        >
            <defs>
                <style>{`
        .bottom-toggle {
          cursor: pointer;
        }

        /* Base frame and line styles */
        .outer-frame, .divider-line {
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        /* The solid animated area */
        .solid-panel {
          fill: currentColor;
          y: 21px;
          height: 0px; 
          transition: y 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        /* Fills upward to y=15, landing dead-center under the divider line */
        .bottom-toggle.is-active .solid-panel {
          y: 14px;
          height: 7px; 
        }
        
        .bottom-toggle.is-full .solid-panel {
          y: 3px;
          height: 18px;
        }
      `}</style>
                <clipPath id="panel-clip">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                </clipPath>
            </defs>

            <rect className="solid-panel" x="3" width="18" clipPath="url(#panel-clip)" />
            <rect className="outer-frame" x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line className="divider-line" x1="4" y1="14" x2="20" y2="14" />
        </svg>
    )
};


import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { useEditorSplit } from "@/core/providers/editor";
import type { EditorGroupId } from "@/core/providers/editor";
import { isVirtualEditorTab } from "@/lib/settings-tab";
import { rememberClosedTab } from "@/lib/closed-tabs";
import { useSettings } from "@/lib/settings";
import { openEditorPopout } from "@/lib/open-editor-popout";
import { TabBarActions } from "./tab-bar-actions";
import {
    WORKBENCH_TAB_ACTIONS_CLASS,
    WORKBENCH_TAB_BAR_CLASS,
    WORKBENCH_TAB_CLOSE_BUTTON_CLASS,
    WORKBENCH_TAB_CONTENT_ACTIVE_CLASS,
    WORKBENCH_TAB_CONTENT_CLASS,
    WORKBENCH_TAB_LIST_CLASS,
    WORKBENCH_TAB_ROW_CLASS,
    WORKBENCH_TAB_SCROLL_CLASS,
    WORKBENCH_TAB_TRAIL_CLASS,
    workbenchTabItemClass,
} from "./workbench-tab-styles";

interface SortableTabProps {
    file: { path: string; name: string; is_dirty?: boolean; is_pinned?: boolean };
    gitStatus?: GitFileParams;
    isActive: boolean;
    onSelect: (path: string) => void;
    onClose: (path: string) => void;
    project_path: string | null;
}


function SortableTab({ file, gitStatus, isActive, onSelect, onClose, project_path }: SortableTabProps) {
    const { toggleViewMode, getViewMode } = useEditorView();
    const isSettingsVirtual = isSettingsTab(file.path);
    const isDesignPreviewVirtual = isDesignPreviewTab(file.path);
    // Use path for ext derivation — it handles diff: prefixes and display-name suffixes
    const ext = getFileExtension(file.path || file.name);
    const isFont = isFontExtension(ext);
    const isImage = isImageExtension(ext);
    const isMarkdown =
        !isSettingsVirtual &&
        !isDesignPreviewVirtual &&
        file.name.toLowerCase().endsWith(".md");
    const hasViewToggle = isMarkdown || isFont;
    const defaultMode = isImage || isFont ? "preview" : "raw";
    const currentMode = getViewMode(file.path, defaultMode);

    const isDiff = file.path.startsWith('diff:');
    const isStaged = file.path.startsWith('diff:staged:');
    // Strip diff prefixes and any legacy arrow prefix (⟷ ) from the name
    const rawFileName = isDiff ? file.name.replace(/^(⟷\s*)?/, '').replace(/^diff:(staged|unstaged):/, '') : file.name;

    // Build display name: "filename (Working Tree)" or "filename (Index)" for diffs
    const diffLabel = isDiff ? (isStaged ? 'Index' : 'Working Tree') : '';
    const displayName = isDiff ? `${rawFileName} (${diffLabel})` : file.name;

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: file.path, disabled: !!file.is_pinned });

    const tabRef = useRef<HTMLDivElement>(null);

    // Smoothly scroll the tab into a better viewing position when active without shifting the main window
    useEffect(() => {
        if (isActive && tabRef.current) {
            const container = tabRef.current.closest('.no-scrollbar') as HTMLElement;
            if (container) {
                const scrollLeft = tabRef.current.offsetLeft - container.offsetWidth / 2 + tabRef.current.offsetWidth / 2;
                container.scrollTo({
                    left: scrollLeft,
                    behavior: 'smooth'
                });
            }
        }
    }, [isActive]);

    const style = {
        transform: transform ? CSS.Translate.toString({
            x: transform.x,
            y: 0,
            scaleX: 1,
            scaleY: 1
        }) : undefined,
        transition,
        zIndex: isDragging ? 20 : 1,
    };

    const combinedRef = (node: HTMLDivElement | null) => {
        setNodeRef(node);
        tabRef.current = node;
    };

    const getToggleIcon = (mode: ViewMode) => {
        return <AnimatedPanelIcon mode={mode} size={14} />;
    };

    const getToggleLabel = () => {
        if (isMarkdown) {
            return currentMode === "raw" ? "Split View" : currentMode === "split" ? "Preview" : "Source";
        }
        return currentMode === "preview" || currentMode === "split" ? "View Source" : "View Preview";
    };

    const getStatusStyle = (): React.CSSProperties | undefined => {
        if (!gitStatus) return undefined;
        return { color: getGitStatusColor(gitStatus.status) };
    };

    const tabContent = (
        <div
            ref={combinedRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={() => onSelect(file.path)}
            className={workbenchTabItemClass(isActive, isDragging)}
        >
            <div className={cn(WORKBENCH_TAB_CONTENT_CLASS, isActive && WORKBENCH_TAB_CONTENT_ACTIVE_CLASS)}>
            <div className="relative w-4 h-4 shrink-0 flex items-center justify-center">
                {isDesignPreviewVirtual ? (
                    <Icon name="auto_awesome" size={14} className="text-text-muted" />
                ) : isSettingsVirtual ? (
                    <Icon name="settings" size={14} className="text-accent" />
                ) : (
                    <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={getIconPath(rawFileName)}
                            alt=""
                            className={cn(
                                "w-4 h-4 transition-opacity duration-200",
                                hasViewToggle ? "group-hover:opacity-0" : "opacity-100"
                            )}
                        />
                        {hasViewToggle && (
                            <Tooltip content={`Switch to ${getToggleLabel()}`}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleViewMode(file.path);
                                    }}
                                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-accent hover:text-accent-hover"
                                >
                                    {getToggleIcon(currentMode)}
                                </button>
                            </Tooltip>
                        )}
                    </>
                )}
            </div>

            <div className="flex h-full min-w-0 flex-1 items-center gap-1.5">
                <span
                    className="truncate whitespace-nowrap text-sm"
                    style={getStatusStyle()}
                >
                    {displayName}
                </span>
                {gitStatus?.status && (
                    <span
                        className="text-xs font-medium pt-0.5 shrink-0"
                        style={{
                            color: getGitStatusColor(gitStatus.status)
                        }}
                    >
                        {gitStatus.status}
                    </span>
                )}
                {gitStatus?.staged && (
                    <div className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-success" title="Staged" />
                )}
            </div>

            <div className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center">
                {file.is_pinned ? (
                    <>
                        <Icon name="push_pin" size={12} className="text-accent group-hover:hidden" />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose(file.path);
                            }}
                            className={WORKBENCH_TAB_CLOSE_BUTTON_CLASS}
                        >
                            <Icon name="close" size={12} />
                        </button>
                    </>
                ) : (
                    <>
                        {file.is_dirty && (
                            <div className="w-2 h-2 rounded-full bg-accent group-hover:hidden" />
                        )}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose(file.path);
                            }}
                            className={WORKBENCH_TAB_CLOSE_BUTTON_CLASS}
                        >
                            <Icon name="close" size={12} />
                        </button>
                    </>
                )}
            </div>
            </div>
        </div>
    );

    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <Tooltip content={file.path}>
                    {tabContent}
                </Tooltip>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
                <ContextMenuItem onClick={() => onClose(file.path)} className="flex items-center gap-2">
                    Close <span className="ml-auto text-xs opacity-50">Ctrl+W</span>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => commands.closeOtherFiles(file.path)}>
                    Close Others
                </ContextMenuItem>
                <ContextMenuItem onClick={() => commands.closeToRight(file.path)}>
                    Close to Right
                </ContextMenuItem>
                <ContextMenuItem onClick={() => commands.closeSaved()}>
                    Close Saved
                </ContextMenuItem>
                <ContextMenuItem onClick={() => commands.closeAllFiles()} className="flex items-center gap-2">
                    Close All
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => commands.pinFile(file.path, !file.is_pinned)} className="flex items-center gap-2">
                    {file.is_pinned ? <Icon name="keep_off" size={14} /> : <Icon name="push_pin" size={14} />}
                    {file.is_pinned ? "Unpin" : "Pin"} <span className="ml-auto text-xs opacity-50">Ctrl+K Enter</span>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => navigator.clipboard.writeText(file.path)}>
                    Copy Path
                </ContextMenuItem>
                <ContextMenuItem onClick={() => {
                    const parts = file.path.split(/[\\/]/);
                    const rootIdx = parts.findIndex(p => p === project_path?.split(/[\\/]/).pop());
                    const rel = rootIdx !== -1 ? parts.slice(rootIdx + 1).join("/") : file.name;
                    navigator.clipboard.writeText(rel);
                }}>
                    Copy Relative Path
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => void openEditorPopout(file.path)}>
                    Move to New Window
                </ContextMenuItem>
                <ContextMenuItem onClick={() => {
                    window.dispatchEvent(new CustomEvent("shape-reveal-in-explorer", {
                        detail: { path: file.path },
                    }));
                }}>
                    Reveal in Explorer
                </ContextMenuItem>
                <ContextMenuItem onClick={() => {
                    commands.revealPath(file.path).catch(() => { });
                }}>
                    Reveal in File Explorer
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

export default function Tabs({
    group = "left",
    showActions = true,
}: {
    group?: EditorGroupId;
    showActions?: boolean;
}) {
    const { open_files, active_file, project_path } = useProjectState();
    const { getGroupActiveFile, setGroupActiveFile, getGroupTabs, splitEnabled } = useEditorSplit();
    const groupActiveFile = getGroupActiveFile(group);
    const groupTabPaths = getGroupTabs(group);
    const sortedFiles = useMemo(() => {
        const pathSet = new Set(groupTabPaths);
        const inGroup = open_files.filter((f: FileInfo) => pathSet.has(f.path));
        const pinned = inGroup.filter((f: FileInfo) => f.is_pinned);
        const unpinned = inGroup.filter((f: FileInfo) => !f.is_pinned);
        return [...pinned, ...unpinned];
    }, [open_files, groupTabPaths]);
    const [gitFiles, setGitFiles] = useState<Map<string, GitFileParams>>(new Map());
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const getRelPath = useCallback((path: string) => {
        if (!project_path) return "";
        const projSafe = project_path.replace(/\\/g, '/').replace(/\/$/, '');
        let filePath = path.replace(/\\/g, '/');
        if (filePath.startsWith('diff:')) {
            filePath = filePath.replace(/^diff:(staged|unstaged):/, '');
        }
        let relPath = filePath;
        if (relPath.startsWith(projSafe)) {
            relPath = relPath.substring(projSafe.length);
        }
        if (relPath.startsWith('/')) {
            relPath = relPath.substring(1);
        }
        return relPath;
    }, [project_path]);

    const handleCloseFile = useCallback((path: string) => {
        const file = open_files.find((f) => f.path === path);
        if (file?.is_dirty) {
            const name = file.name || path.split(/[\\/]/).pop() || "this file";
            if (!window.confirm(`"${name}" has unsaved changes. Close without saving?`)) {
                return;
            }
        }
        if (file) rememberClosedTab(file.path, file.name);
        const previewSessionId = parseDesignPreviewTabPath(path);
        if (previewSessionId) {
            void import("@/lib/design-preview-store").then(({ removeDesignPreviewSession }) => {
                removeDesignPreviewSession(previewSessionId);
            });
        }
        void commands.closeFile(path);
    }, [open_files]);

    const refreshGit = useCallback(async () => {
        if (!project_path) return;
        try {
            const status = await commands.gitStatus(project_path);
            const statusMap = new Map<string, GitFileParams>();
            status.forEach(gf => {
                statusMap.set(gf.path.replace(/\\/g, '/'), gf);
            });
            setGitFiles(statusMap);
        } catch {
            setGitFiles(new Map());
        }
    }, [project_path]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'w') {
                    e.preventDefault();
                    if (active_file) handleCloseFile(active_file);
                } else if (e.key === 'k') {
                    const nextKeyHandler = (nextE: KeyboardEvent) => {
                        if (nextE.key === 'w') {
                            nextE.preventDefault();
                            const dirty = open_files.filter((f) => f.is_dirty);
                            if (dirty.length > 0) {
                                if (!window.confirm(`${dirty.length} file(s) have unsaved changes. Close all without saving?`)) {
                                    return;
                                }
                            }
                            commands.closeAllFiles();
                        } else if (nextE.key === 'Enter') {
                            nextE.preventDefault();
                            if (active_file) {
                                const file = open_files.find(f => f.path === active_file);
                                if (file) commands.pinFile(active_file, !file.is_pinned);
                            }
                        }
                        window.removeEventListener('keydown', nextKeyHandler, true);
                    };
                    window.addEventListener('keydown', nextKeyHandler, true);
                    // timeout to clear the listener if no second key is pressed
                    setTimeout(() => window.removeEventListener('keydown', nextKeyHandler, true), 1000);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [active_file, open_files, handleCloseFile]);

    useEffect(() => {
        void refreshGit();
        const onGitRefresh = () => { void refreshGit(); };
        window.addEventListener("shape-git-refresh", onGitRefresh);
        const interval = setInterval(() => {
            void refreshGit();
        }, 60000);
        return () => {
            window.removeEventListener("shape-git-refresh", onGitRefresh);
            clearInterval(interval);
        };
    }, [refreshGit]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Convert vertical scroll to horizontal scroll for the tab bar
    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft += e.deltaY;
        }
    }, []);

    const settings = useSettings();
    const compactTabs = settings.editor.compactTabs;

    function handleDragEnd(event: DragEndEvent) {
        const { active, over, delta } = event;

        if (!over && Math.hypot(delta.x, delta.y) > 72) {
            const file = sortedFiles.find((f) => f.path === active.id);
            if (file && !isVirtualEditorTab(file.path)) {
                void openEditorPopout(file.path);
                return;
            }
        }

        if (over && active.id !== over.id) {
            const oldIndex = sortedFiles.findIndex((f) => f.path === active.id);
            const newIndex = sortedFiles.findIndex((f) => f.path === over.id);

            // Only allow reordering if both items are unpinned
            const activeFile = sortedFiles[oldIndex];
            const overFile = sortedFiles[newIndex];

            if (activeFile && !activeFile.is_pinned && overFile && !overFile.is_pinned) {
                commands.reorderFiles(arrayMove(sortedFiles, oldIndex, newIndex));
            }
        }
    }

    const handleSelect = useCallback((path: string) => {
        setGroupActiveFile(group, path);
    }, [group, setGroupActiveFile]);

    if (sortedFiles.length === 0 && !splitEnabled) return null;
    if (compactTabs) return null;

    return (
        <div className={WORKBENCH_TAB_BAR_CLASS}>
            <div
                ref={scrollContainerRef}
                onWheel={handleWheel}
                className={WORKBENCH_TAB_SCROLL_CLASS}
            >
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    modifiers={[restrictToHorizontalAxis, restrictToFirstScrollableAncestor]}
                >
                    <div className={WORKBENCH_TAB_ROW_CLASS}>
                        <div className={WORKBENCH_TAB_LIST_CLASS}>
                        {sortedFiles.filter((f: FileInfo) => f.is_pinned).map((file: FileInfo) => (
                            <SortableTab
                                key={file.path}
                                file={file}
                                gitStatus={gitFiles.get(getRelPath(file.path))}
                                isActive={groupActiveFile === file.path}
                                onSelect={handleSelect}
                                onClose={handleCloseFile}
                                project_path={project_path}
                            />
                        ))}
                        <SortableContext
                            items={sortedFiles.filter((f: FileInfo) => !f.is_pinned).map((f: FileInfo) => f.path)}
                            strategy={horizontalListSortingStrategy}
                        >
                            {sortedFiles.filter((f: FileInfo) => !f.is_pinned).map((file: FileInfo) => (
                                <SortableTab
                                    key={file.path}
                                    file={file}
                                    gitStatus={gitFiles.get(getRelPath(file.path))}
                                    isActive={groupActiveFile === file.path}
                                    onSelect={handleSelect}
                                    onClose={handleCloseFile}
                                    project_path={project_path}
                                />
                            ))}
                        </SortableContext>
                        </div>
                        <div className={WORKBENCH_TAB_TRAIL_CLASS} aria-hidden />
                    </div>
                </DndContext>
            </div>
            {showActions && !isVirtualEditorTab(groupActiveFile) ? (
                <div className={WORKBENCH_TAB_ACTIONS_CLASS}>
                    <TabBarActions />
                </div>
            ) : null}
        </div>
    );
}
