"use client";

import {
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
} from "@/components/ui/context";

export function swapSidebars() {
    window.dispatchEvent(new Event("shape-swap-sidebars"));
}

/** Radix submenu items to swap left/right sidebar positions. */
export function SidebarSwitchPanelMenuItems({
    currentSide,
}: {
    currentSide: "left" | "right";
    currentPanelId?: string;
}) {
    const targetSide = currentSide === "left" ? "right" : "left";

    return (
        <>
            <ContextMenuSeparator />
            <ContextMenuSub>
                <ContextMenuSubTrigger>Switch Panel To</ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-52">
                    <ContextMenuItem onClick={swapSidebars}>
                        {targetSide === "right" ? "Right Side" : "Left Side"}
                    </ContextMenuItem>
                </ContextMenuSubContent>
            </ContextMenuSub>
        </>
    );
}
