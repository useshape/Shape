"use client";

import {
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
} from "@/components/ui/context";
import type { GitBranchGraphNode } from "@/lib/backend/types";

export function NodeMenu({
    node,
    onCheckout,
    onCopy,
    onFocus,
}: {
    node: GitBranchGraphNode;
    onCheckout: (name: string) => void;
    onCopy: (text: string, label: string) => void;
    onFocus: (name: string) => void;
}) {
    return (
        <ContextMenuContent>
            <ContextMenuItem onClick={() => onFocus(node.name)}>Focus</ContextMenuItem>
            <ContextMenuItem disabled={node.isCurrent || node.isDetached} onClick={() => onCheckout(node.name)}>
                Checkout
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onCopy(node.name, "Branch name")}>Copy name</ContextMenuItem>
            <ContextMenuItem onClick={() => onCopy(node.commit, "Commit hash")}>Copy commit</ContextMenuItem>
            {node.author ? (
                <ContextMenuItem onClick={() => onCopy(node.author, "Author")}>Copy author</ContextMenuItem>
            ) : null}
        </ContextMenuContent>
    );
}
