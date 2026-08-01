"use client";

import React, { memo } from "react";
import { cn } from "@/lib/utils";
import {
    ContextMenu,
    ContextMenuTrigger,
} from "@/components/ui/context";
import type { GitBranchGraphNode } from "@/lib/backend/types";
import {
    DOT,
    NODE_H,
    NODE_W,
    PILL_H,
    PILL_W,
    shortLabel,
    type Lod,
    type Pos,
} from "./layout";
import { NodeMenu } from "./node-menu";

export type BranchNodeProps = {
    node: GitBranchGraphNode;
    pos: Pos;
    lod: Lod;
    color: string;
    selected: boolean;
    dimmed: boolean;
    highlighted: boolean;
    onSelect: (name: string) => void;
    onCheckout: (name: string) => void;
    onCopy: (text: string, label: string) => void;
    onFocus: (name: string) => void;
    onNodeDragStart: (name: string, e: React.PointerEvent) => void;
    onDropMerge: (from: string, onto: string) => void;
};

export const BranchNode = memo(function BranchNode({
    node,
    pos,
    lod,
    color,
    selected,
    dimmed,
    highlighted,
    onSelect,
    onCheckout,
    onCopy,
    onFocus,
    onNodeDragStart,
    onDropMerge,
}: BranchNodeProps) {
    const label = shortLabel(node.name);
    const ring = selected || highlighted;

    if (lod === "dot") {
        return (
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <button
                        type="button"
                        data-branch-node
                        title={node.name}
                        className={cn(
                            "absolute rounded-full border transition-opacity",
                            ring ? "border-accent ring-2 ring-accent/50" : "border-transparent",
                            dimmed && "opacity-25",
                        )}
                        style={{
                            left: pos.x,
                            top: pos.y,
                            width: DOT,
                            height: DOT,
                            background: color,
                            contain: "layout style paint",
                        }}
                        onClick={() => onSelect(node.name)}
                        onDoubleClick={() => onFocus(node.name)}
                        onPointerDown={(e) => onNodeDragStart(node.name, e)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault();
                            const from = e.dataTransfer.getData("text/branch");
                            if (from && from !== node.name) onDropMerge(from, node.name);
                        }}
                    />
                </ContextMenuTrigger>
                <NodeMenu
                    node={node}
                    onCheckout={onCheckout}
                    onCopy={onCopy}
                    onFocus={onFocus}
                />
            </ContextMenu>
        );
    }

    if (lod === "pill") {
        return (
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <button
                        type="button"
                        data-branch-node
                        title={node.name}
                        className={cn(
                            "absolute truncate rounded-full border px-2 text-left text-[10px] font-medium text-text-primary transition-opacity",
                            ring ? "border-accent bg-panel ring-1 ring-accent/40" : "border-border bg-panel",
                            dimmed && "opacity-25",
                        )}
                        style={{
                            left: pos.x,
                            top: pos.y,
                            width: PILL_W,
                            height: PILL_H,
                            borderLeftWidth: 3,
                            borderLeftColor: color,
                            contain: "layout style paint",
                        }}
                        onClick={() => onSelect(node.name)}
                        onDoubleClick={() => onFocus(node.name)}
                        onPointerDown={(e) => onNodeDragStart(node.name, e)}
                    >
                        {label}
                    </button>
                </ContextMenuTrigger>
                <NodeMenu
                    node={node}
                    onCheckout={onCheckout}
                    onCopy={onCopy}
                    onFocus={onFocus}
                />
            </ContextMenu>
        );
    }

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <button
                    type="button"
                    data-branch-node
                    draggable
                    title={node.name}
                    className={cn(
                        "absolute flex cursor-grab items-center gap-2 rounded-xl border bg-panel px-3 text-left shadow-sm active:cursor-grabbing",
                        ring ? "border-accent ring-1 ring-accent/40" : "border-border hover:border-text-muted",
                        node.isCurrent && "border-accent/80",
                        node.isDetached && "border-dashed",
                        dimmed && "opacity-25",
                    )}
                    style={{
                        left: pos.x,
                        top: pos.y,
                        width: NODE_W,
                        height: NODE_H,
                        borderLeftWidth: 3,
                        borderLeftColor: color,
                        contain: "layout style paint",
                    }}
                    onClick={() => onSelect(node.name)}
                    onDoubleClick={() => onFocus(node.name)}
                    onPointerDown={(e) => onNodeDragStart(node.name, e)}
                    onDragStart={(e) => {
                        e.dataTransfer.setData("text/branch", node.name);
                        e.dataTransfer.effectAllowed = "linkMove";
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        e.preventDefault();
                        const from = e.dataTransfer.getData("text/branch");
                        if (from && from !== node.name) onDropMerge(from, node.name);
                    }}
                >
                    <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium"
                        style={{ background: `${color}33` }}
                    >
                        {node.isDetached ? "H" : label.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-text-primary">
                            {label}
                            {node.isCurrent ? (
                                <span className="ml-1 text-[10px] font-normal text-accent">
                                    {node.isDetached ? "detached" : "current"}
                                </span>
                            ) : node.isRemote ? (
                                <span className="ml-1 text-[10px] font-normal text-text-muted">remote</span>
                            ) : node.isOrphanRoot ? (
                                <span className="ml-1 text-[10px] font-normal text-text-muted">root</span>
                            ) : null}
                        </span>
                        <span className="block truncate text-[11px] text-text-muted">
                            {node.author}
                            {node.date ? ` · ${node.date}` : ""}
                        </span>
                    </span>
                </button>
            </ContextMenuTrigger>
            <NodeMenu node={node} onCheckout={onCheckout} onCopy={onCopy} onFocus={onFocus} />
        </ContextMenu>
    );
});
