"use client";

import { Add20Regular } from "@fluentui/react-icons/headless/svg/add";
import { Dismiss20Regular } from "@fluentui/react-icons/headless/svg/dismiss";
import { Document20Regular } from "@fluentui/react-icons/headless/svg/document";


import { useCallback, useMemo } from "react";
import { arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DragEndEvent } from "@dnd-kit/core";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Icon } from "@/components/ui/icon";
import { Favicon } from "@/components/ui/favicon";

import { FileIcon } from "@/components/ui/file-icon";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { TabBarShell } from "@/features/editor/ui/tabs/tab-bar-shell";
import {
    WORKBENCH_TAB_ACTION_BUTTON_CLASS,
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
    onCloseOthers,
    onCloseToRight,
}: {
    tab: WorkspaceTab;
    isActive: boolean;
    canClose: boolean;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
    onCloseOthers: (id: string) => void;
    onCloseToRight: (id: string) => void;
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
                    className={cn(workbenchTabItemClass(isActive, isDragging), "max-w-44")}
                >
                    <div className={cn(WORKBENCH_TAB_CONTENT_CLASS, isActive && WORKBENCH_TAB_CONTENT_ACTIVE_CLASS)}>
                    <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                        <span className={cn("flex items-center justify-center", canClose && "group-hover:opacity-0")}>
                            {tab.kind === "browser" && tab.url ? (
                                <Favicon url={tab.url} src={tab.favicon} size={16} />
                            ) : tab.kind === "file" || tab.kind === "diff" ? (
                                <FileIcon name={tab.title} className="size-4" />
                            ) : (
                                <Icon icon={iconFor(tab.kind)} className="text-text-muted" />
                            )}
                        </span>
                        {canClose ? (
                            <button
                                type="button"
                                aria-label={`Close ${tab.title}`}
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onClose(tab.id);
                                }}
                                className="absolute inset-0 flex items-center justify-center text-text-muted opacity-0 hover:text-text-primary group-hover:opacity-100"
                            >
                                <Icon icon={Dismiss20Regular} className="icon-sm" />
                            </button>
                        ) : null}
                    </div>
                        <span className="min-w-0 truncate text-sm">{tab.title}</span>
                    </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="min-w-44">
                <ContextMenuItem onClick={() => onSelect(tab.id)}>Open</ContextMenuItem>
                {tab.path ? (
                    <>
                        <ContextMenuItem
                            onClick={() => {
                                void navigator.clipboard.writeText(tab.path!);
                            }}
                        >
                            Copy Path
                        </ContextMenuItem>
                        <ContextMenuItem
                            onClick={() => {
                                void import("@/lib/backend").then(({ commands }) =>
                                    commands.revealPath(tab.path!).catch(() => {}),
                                );
                            }}
                        >
                            Reveal in Explorer
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                    </>
                ) : null}
                {canClose ? (
                    <ContextMenuItem onClick={() => onClose(tab.id)}>Close</ContextMenuItem>
                ) : null}
                <ContextMenuItem
                    onClick={() => onCloseOthers(tab.id)}
                >
                    Close Others
                </ContextMenuItem>
                <ContextMenuItem
                    onClick={() => onCloseToRight(tab.id)}
                >
                    Close to the Right
                </ContextMenuItem>
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
    className,
    fade,
}: {
    tabs: WorkspaceTab[];
    activeId: string;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
    onNew: (kind: TabKind) => void;
    onReorder: (next: WorkspaceTab[]) => void;
    className?: string;
    fade?: boolean;
}) {
    const uniqueTabs = useMemo(() => {
        const seen = new Set<string>();
        return tabs.filter((tab) => {
            if (seen.has(tab.id)) return false;
            seen.add(tab.id);
            return true;
        });
    }, [tabs]);

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            const oldIndex = uniqueTabs.findIndex((t) => t.id === active.id);
            const newIndex = uniqueTabs.findIndex((t) => t.id === over.id);
            if (oldIndex < 0 || newIndex < 0) return;
            onReorder(arrayMove(uniqueTabs, oldIndex, newIndex));
        },
        [onReorder, uniqueTabs],
    );

    const newMenu = (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className={WORKBENCH_TAB_ACTION_BUTTON_CLASS}
                    aria-label="New tab"
                    data-no-drag
                >
                    <Icon icon={Add20Regular} />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {(
                    [
                        ["files", "Files"],
                        ["graph", "Graph"],
                        ["prs", "Pull requests"],
                    ] as const
                ).map(([kind, label]) => (
                    <DropdownMenuItem key={kind} onSelect={() => onNew(kind)}>
                        <Icon icon={iconFor(kind)} className="size-4" />
                        {label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <TabBarShell
            dndId="agent-workspace-tabs"
            itemIds={uniqueTabs.map((t) => t.id)}
            onDragEnd={handleDragEnd}
            actions={newMenu}
            fade={fade}
            className={cn("h-titlebar bg-panel px-1", className)}
        >
            {uniqueTabs.map((tab) => (
                <SortableWorkspaceTab
                    key={tab.id}
                    tab={tab}
                    isActive={tab.id === activeId}
                    canClose={uniqueTabs.length > 1}
                    onSelect={onSelect}
                    onClose={onClose}
                    onCloseOthers={(id) => {
                        uniqueTabs.filter((t) => t.id !== id).forEach((t) => onClose(t.id));
                    }}
                    onCloseToRight={(id) => {
                        const idx = uniqueTabs.findIndex((t) => t.id === id);
                        uniqueTabs.slice(idx + 1).forEach((t) => onClose(t.id));
                    }}
                />
            ))}
        </TabBarShell>
    );
}
