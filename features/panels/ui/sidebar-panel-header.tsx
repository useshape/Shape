"use client";

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { Button, type ButtonProps } from "@/components/ui/button";
import { FadeTruncate } from "@/components/ui/fade-truncate";
import { cn } from "@/lib/utils";
import { SidebarSwitchPanelMenuItems } from "./sidebar-panel-menu";

export function SidebarPanelActionButton({
    className,
    children,
    ...props
}: ButtonProps) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
                "h-5 w-5 shrink-0 text-text-muted hover:bg-panel-hover hover:text-text-primary",
                className,
            )}
            {...props}
        >
            {children}
        </Button>
    );
}

export function SidebarPanelHeader({
    title,
    side,
    panelId,
    actions,
    children,
}: {
    title: string;
    side: "left" | "right";
    panelId: string;
    actions?: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div className="flex h-8 shrink-0 cursor-default items-center justify-between gap-2 px-3 group">
                    <FadeTruncate
                        title={title}
                        className="min-w-0 flex-1 text-sm font-normal text-text-primary"
                    >
                        {title}
                    </FadeTruncate>
                    {actions ? (
                        <div className="flex shrink-0 items-center gap-0.5">
                            {actions}
                        </div>
                    ) : null}
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">
                {children}
                <SidebarSwitchPanelMenuItems currentSide={side} currentPanelId={panelId} />
            </ContextMenuContent>
        </ContextMenu>
    );
}
