"use client";

import {
    RiAddLine,
    RiCloseLine,
    RiFolderLine,
    RiGitCommitLine,
    RiGitPullRequestLine,
    RiTerminalBoxLine,
} from "@remixicon/react";
import { useCallback } from "react";
import { arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DragEndEvent } from "@dnd-kit/core";
import { Icon } from "@/components/ui/icon";
import { FileIcon } from "@/components/ui/file-icon";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { TabBarShell } from "@/features/editor/ui/tabs/tab-bar-shell";
import {
    WORKBENCH_TAB_ACTION_BUTTON_CLASS,
    WORKBENCH_TAB_CLOSE_BUTTON_CLASS,
    WORKBENCH_TAB_CONTENT_ACTIVE_CLASS,
    WORKBENCH_TAB_CONTENT_CLASS,
    workbenchTabItemClass,
} from "@/features/editor/ui/tabs/workbench-tab-styles";
import { cn } from "@/lib/utils";
import type { TabKind, WorkspaceTab } from "./model";
import { iconFor } from "./model";

function SortableWorkspaceTab({
    tab,
    isActive,
    canClose,
    onSelect,
    onClose,
}: {
    tab: WorkspaceTab;
    isActive: boolean;
    canClose: boolean;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: tab.id });

    const style = {
        transform: transform
            ? CSS.Translate.toString({
                  x: transform.x,
                  y: 0,
                  scaleX: 1,
                  scaleY: 1,
              })
            : undefined,
        transition,
        zIndex: isDragging ? 20 : 1,
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    ref={setNodeRef}
                    style={style}
                    {...attributes}
                    {...listeners}
                    onClick={() => onSelect(tab.id)}
                    className={workbenchTabItemClass(isActive, isDragging)}
                >
                    <div className={cn(WORKBENCH_TAB_CONTENT_CLASS, isActive && WORKBENCH_TAB_CONTENT_ACTIVE_CLASS)}>
                        <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                            {tab.kind === "file" || tab.kind === "diff" ? (
                                <FileIcon name={tab.title} className="size-3.5" />
                            ) : (
                                <Icon icon={iconFor(tab.kind)} className="text-text-muted" />
                            )}
                        </div>
                        <div className="flex h-full min-w-0 flex-1 items-center gap-1.5">
                            <span className="truncate whitespace-nowrap text-sm">{tab.title}</span>
                        </div>
                        {canClose ? (
                            <div className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center">
                                <button
                                    type="button"
                                    aria-label={`Close ${tab.title}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onClose(tab.id);
                                    }}
                                    className={WORKBENCH_TAB_CLOSE_BUTTON_CLASS}
                                >
                                    <Icon icon={RiCloseLine} />
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="min-w-40">
                <ContextMenuItem onClick={() => onSelect(tab.id)}>Open</ContextMenuItem>
                {canClose ? (
                    <ContextMenuItem onClick={() => onClose(tab.id)}>Close</ContextMenuItem>
                ) : null}
            </ContextMenuContent>
        </ContextMenu>
    );
}

export function WorkspaceTabs({
    tabs,
    activeId,
    onSelect,
    onClose,
    onNew,
    onReorder,
}: {
    tabs: WorkspaceTab[];
    activeId: string;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
    onNew: (kind: TabKind) => void;
    onReorder: (next: WorkspaceTab[]) => void;
}) {
    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            const oldIndex = tabs.findIndex((t) => t.id === active.id);
            const newIndex = tabs.findIndex((t) => t.id === over.id);
            if (oldIndex < 0 || newIndex < 0) return;
            onReorder(arrayMove(tabs, oldIndex, newIndex));
        },
        [onReorder, tabs],
    );

    const newMenu = (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className={WORKBENCH_TAB_ACTION_BUTTON_CLASS}
                    aria-label="New tab"
                >
                    <Icon icon={RiAddLine} />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => onNew("terminal")}>
                    <Icon icon={RiTerminalBoxLine} />
                    <span className="flex-1">Terminal</span>
                    <span className="text-2xs text-text-muted">Ctrl+J</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNew("files")}>
                    <Icon icon={RiFolderLine} />
                    <span className="flex-1">Files</span>
                    <span className="text-2xs text-text-muted">Ctrl+G</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNew("changes")}>
                    <Icon icon={RiGitPullRequestLine} />
                    <span className="flex-1">Changes</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNew("graph")}>
                    <Icon icon={RiGitCommitLine} />
                    <span className="flex-1">Graph</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <TabBarShell
            dndId="agent-workspace-tabs"
            itemIds={tabs.map((t) => t.id)}
            onDragEnd={handleDragEnd}
            actions={newMenu}
        >
            {tabs.map((tab) => (
                <SortableWorkspaceTab
                    key={tab.id}
                    tab={tab}
                    isActive={tab.id === activeId}
                    canClose={tabs.length > 1}
                    onSelect={onSelect}
                    onClose={onClose}
                />
            ))}
        </TabBarShell>
    );
}
