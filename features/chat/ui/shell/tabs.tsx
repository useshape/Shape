"use client";

import { useCallback } from "react";
import { arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DragEndEvent } from "@dnd-kit/core";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { FadeTruncate } from "@/components/ui/fade-truncate";
import { TabBarShell } from "@/features/editor/ui/tabs/tab-bar-shell";
import {
    WORKBENCH_TAB_ACTION_BUTTON_CLASS,
    WORKBENCH_TAB_CLOSE_BUTTON_CLASS,
    WORKBENCH_TAB_CONTENT_ACTIVE_CLASS,
    WORKBENCH_TAB_CONTENT_CLASS,
    workbenchTabItemClass,
} from "@/features/editor/ui/tabs/workbench-tab-styles";
import { cn } from "@/lib/utils";
import { ModelAvatarStack, WorkingDots } from "../message/bubble";
import { useIsChatGenerating } from "../../lib/generating-chats";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context";

export type ChatTab = {
    id: string;
    title: string;
    /** Models used in this chat — for tab avatar stack. */
    models?: string[];
};

/** Draft / unsaved conversation sentinel — still used by the chat session store. */
export const NEW_CHAT_TAB_ID = "__new_chat__";

/** In-memory demo conversation (not persisted to disk). */
export const DEMO_CHAT_TAB_ID = "__demo_chat__";

export function isEphemeralChatTabId(id: string): boolean {
    return id === NEW_CHAT_TAB_ID || id === DEMO_CHAT_TAB_ID;
}

function SortableChatTab({
    tab,
    isActive,
    canClose,
    onSelect,
    onClose,
    onCloseOthers,
    onCloseAll,
}: {
    tab: ChatTab;
    isActive: boolean;
    canClose: boolean;
    onSelect: (id: string) => void;
    onClose?: (id: string) => void;
    onCloseOthers?: (id: string) => void;
    onCloseAll?: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: tab.id });
    const generating = useIsChatGenerating(tab.id);

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
                    <div
                        className={cn(
                            WORKBENCH_TAB_CONTENT_CLASS,
                            isActive && WORKBENCH_TAB_CONTENT_ACTIVE_CLASS,
                        )}
                    >
                        {generating ? (
                            <WorkingDots className="imsg-typing imsg-typing-sm shrink-0" />
                        ) : tab.models && tab.models.length > 0 ? (
                            <ModelAvatarStack models={tab.models} size={14} />
                        ) : null}
                        <div className="flex h-full min-w-0 flex-1 items-center gap-1.5">
                            <FadeTruncate
                                title={tab.title}
                                className="min-w-0 max-w-[140px] truncate text-sm"
                            >
                                {tab.title || "New Chat"}
                            </FadeTruncate>
                        </div>
                        {canClose && onClose ? (
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
                                    <Icon name="close" size={12} />
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="min-w-44">
                <ContextMenuItem onClick={() => onSelect(tab.id)}>Open</ContextMenuItem>
                {canClose && onClose ? (
                    <ContextMenuItem onClick={() => onClose(tab.id)}>Close</ContextMenuItem>
                ) : null}
                {onCloseOthers ? (
                    <ContextMenuItem onClick={() => onCloseOthers(tab.id)}>
                        Close Others
                    </ContextMenuItem>
                ) : null}
                {onCloseAll ? (
                    <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={onCloseAll}>Close All</ContextMenuItem>
                    </>
                ) : null}
            </ContextMenuContent>
        </ContextMenu>
    );
}

/** Chat conversation tabs — same TabBarShell as workspace / editor tabs. */
export function ChatTabBar({
    title,
    onNewChat,
    tabs,
    activeTabId,
    onSelectTab,
    onCloseTab,
    onReorderTabs,
}: {
    title: string;
    onNewChat: () => void;
    tabs?: ChatTab[];
    activeTabId?: string;
    onSelectTab?: (tabId: string) => void;
    onCloseTab?: (tabId: string) => void;
    onReorderTabs?: (next: ChatTab[]) => void;
    /** @deprecated unused */
    onSelectConversation?: (id: string) => void;
    activeConversationId?: string | null;
    projectPath?: string | null;
    onClosePanel?: () => void;
    sidebarSide?: "left" | "right";
    embedWindowControls?: React.ReactNode;
}) {
    const list =
        tabs && tabs.length > 0
            ? tabs
            : [{ id: NEW_CHAT_TAB_ID, title: title.trim() || "New Chat" }];
    const active = activeTabId ?? list[0]?.id;

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active: a, over } = event;
            if (!over || a.id === over.id || !onReorderTabs || !tabs) return;
            const oldIndex = tabs.findIndex((t) => t.id === a.id);
            const newIndex = tabs.findIndex((t) => t.id === over.id);
            if (oldIndex < 0 || newIndex < 0) return;
            onReorderTabs(arrayMove(tabs, oldIndex, newIndex));
        },
        [onReorderTabs, tabs],
    );

    const closeOthers = useCallback(
        (keepId: string) => {
            if (!onCloseTab || !tabs) return;
            for (const t of tabs) {
                if (t.id !== keepId) onCloseTab(t.id);
            }
        },
        [onCloseTab, tabs],
    );

    const closeAll = useCallback(() => {
        if (!onCloseTab || !tabs) return;
        for (const t of tabs) onCloseTab(t.id);
    }, [onCloseTab, tabs]);

    return (
        <TabBarShell
            dndId="agent-chat-tabs"
            itemIds={list.map((t) => t.id)}
            onDragEnd={handleDragEnd}
            className="h-full min-w-0 flex-1 bg-transparent px-1"
            listEnd={
                <button
                    type="button"
                    onClick={onNewChat}
                    className={cn(WORKBENCH_TAB_ACTION_BUTTON_CLASS, "ml-0.5 shrink-0 self-center")}
                    aria-label="New chat"
                >
                    <Icon name="add" size={ICON_SIZE_SM} />
                </button>
            }
        >
            {list.map((tab) => (
                <SortableChatTab
                    key={tab.id}
                    tab={tab}
                    isActive={tab.id === active}
                    canClose={Boolean(onCloseTab) && list.length > 1}
                    onSelect={(id) => onSelectTab?.(id)}
                    onClose={onCloseTab}
                    onCloseOthers={onCloseTab ? closeOthers : undefined}
                    onCloseAll={onCloseTab ? closeAll : undefined}
                />
            ))}
        </TabBarShell>
    );
}
