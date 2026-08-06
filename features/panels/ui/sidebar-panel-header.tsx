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
                <div className="group relative flex h-titlebar shrink-0 cursor-default items-stretch">
                    <div
                        className="titlebar-drag-region absolute inset-0 z-0"
                        data-tauri-drag-region
                    />
                    <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2 px-3 pointer-events-none">
                        <FadeTruncate
                            title={title}
                            className="min-w-0 flex-1 text-sm font-normal text-text-primary"
                        >
                            {title}
                        </FadeTruncate>
                    </div>
                    {actions ? (
                        <div className="relative z-10 flex shrink-0 items-center gap-0.5 pr-2 pointer-events-auto">
                            {actions}
                        </div>
                    ) : (
                        <div className="pointer-events-none relative z-0 min-w-0 flex-1" aria-hidden />
                    )}
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">
                {children}
                <SidebarSwitchPanelMenuItems currentSide={side} currentPanelId={panelId} />
            </ContextMenuContent>
        </ContextMenu>
    );
}
