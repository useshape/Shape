"use client";

import { RiAddLine, RiCloseLine } from "@remixicon/react";
import { Slide } from "loading-dev";
import { FileIcon } from "@/components/ui/file-icon";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { cn } from "@/lib/utils";
import { TabTitleFade } from "./tab-title";

export type SidebarTab = {
    id: string;
    title: string;
    active: boolean;
    parentId?: string;
    working?: boolean;
    tool?: boolean;
    file?: boolean;
    threadStatus?: "running" | "done" | "error";
};

type Node = SidebarTab & { children: Node[] };

function forest(tabs: SidebarTab[]): Node[] {
    const byId = new Map(tabs.map((tab) => [tab.id, { ...tab, children: [] as Node[] }]));
    const roots: Node[] = [];
    for (const tab of tabs) {
        const node = byId.get(tab.id);
        if (!node) continue;
        const parent = tab.parentId ? byId.get(tab.parentId) : undefined;
        if (parent) parent.children.push(node);
        else roots.push(node);
    }
    return roots;
}

function Row({
    node,
    depth,
    grouped,
    last,
    onActivate,
    onClose,
    onNew,
    onCloseOthers,
}: {
    node: Node;
    depth: number;
    grouped: boolean;
    last: boolean;
    onActivate: (id: string) => void;
    onClose: (id: string) => void;
    onNew: () => void;
    onCloseOthers: (id: string) => void;
}) {
    const nested = node.children.length > 0;
    const radius = grouped
        ? nested && depth === 0
            ? "rounded-t-[18px] rounded-b-none"
            : last
              ? "rounded-b-[18px] rounded-t-none"
              : "rounded-none"
        : "rounded-full";

    return (
        <div className="relative">
            {depth > 0 ? (
                <span
                    aria-hidden
                    className="pointer-events-none absolute start-[13px] top-0 h-full w-px bg-border-subtle"
                />
            ) : null}
            {depth > 0 ? (
                <span
                    aria-hidden
                    className="pointer-events-none absolute start-[13px] top-[14px] h-px w-2.5 bg-border-subtle"
                />
            ) : null}
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <div
                        data-chat-tab={node.id}
                        data-active={node.active ? "true" : "false"}
                        onClick={() => onActivate(node.id)}
                        onAuxClick={(event) => {
                            if (event.button !== 1) return;
                            event.preventDefault();
                            onClose(node.id);
                        }}
                        className={cn(
                            "group flex h-8 min-w-0 cursor-pointer items-center gap-1.5 px-2 text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                            radius,
                            node.active && "bg-surface-4 text-text-primary",
                            depth > 0 && "ms-4",
                        )}
                    >
                        {node.working ? (
                            <Slide size={10} className="shrink-0 text-text-muted" />
                        ) : node.file ? (
                            <FileIcon name={node.title} className="size-3.5 shrink-0" />
                        ) : (
                            <span
                                className={cn(
                                    "size-1.5 shrink-0 rounded-full",
                                    node.threadStatus === "error"
                                        ? "bg-error"
                                        : node.threadStatus === "done"
                                          ? "bg-success"
                                          : node.threadStatus === "running"
                                            ? "bg-accent"
                                            : "bg-text-muted/40",
                                )}
                            />
                        )}
                        <TabTitleFade title={node.title || "New chat"} working={node.working} />
                        <button
                            type="button"
                            data-close
                            aria-label={`Close ${node.title}`}
                            className="ms-auto hidden size-5 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-panel-active hover:text-text-primary group-hover:flex"
                            onClick={(event) => {
                                event.stopPropagation();
                                onClose(node.id);
                            }}
                        >
                            <RiCloseLine size={12} />
                        </button>
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem onClick={() => onActivate(node.id)}>Open</ContextMenuItem>
                    <ContextMenuItem onClick={() => onClose(node.id)}>Close</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => onCloseOthers(node.id)}>Close others</ContextMenuItem>
                    <ContextMenuItem onClick={onNew}>New chat</ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
            {node.children.map((child, index) => (
                <Row
                    key={child.id}
                    node={child}
                    depth={Math.min(depth + 1, 2)}
                    grouped
                    last={index === node.children.length - 1}
                    onActivate={onActivate}
                    onClose={onClose}
                    onNew={onNew}
                    onCloseOthers={onCloseOthers}
                />
            ))}
        </div>
    );
}

export function ChatTabTree({
    tabs,
    onActivate,
    onClose,
    onNew,
    onCloseOthers,
}: {
    tabs: SidebarTab[];
    onActivate: (id: string) => void;
    onClose: (id: string) => void;
    onNew: () => void;
    onCloseOthers: (id: string) => void;
}) {
    const roots = forest(tabs);
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center justify-between px-1 pb-1 pt-0.5">
                <span className="px-1 text-xs text-text-muted">Chats</span>
                <button
                    type="button"
                    aria-label="New chat"
                    onClick={onNew}
                    className="flex size-7 items-center justify-center rounded-full text-text-muted hover:bg-panel-hover hover:text-text-primary"
                >
                    <RiAddLine size={16} />
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
                {roots.map((node) => (
                    <div
                        key={node.id}
                        className={cn(node.children.length > 0 && "mb-0.5 bg-surface-3/40 rounded-[18px]")}
                    >
                        <Row
                            node={node}
                            depth={0}
                            grouped={node.children.length > 0}
                            last={node.children.length === 0}
                            onActivate={onActivate}
                            onClose={onClose}
                            onNew={onNew}
                            onCloseOthers={onCloseOthers}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
