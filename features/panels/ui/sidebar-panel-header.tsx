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

/** Same bar height as AI chat tabs (`h-[36px]`). */
export const SIDEBAR_PANEL_HEADER_HEIGHT_CLASS = "h-[36px]";

/** Title typography — same size/weight as chat tab labels. */
export const SIDEBAR_PANEL_TITLE_CLASS =
    "min-w-0 flex-1 truncate text-sm font-normal text-text-primary";

/**
 * Left panel chrome:
 * - Title sits at normal left padding (not inset like a chat tab chip)
 * - Action buttons use chat-style trailing padding (`px-1`)
 */
export function SidebarPanelHeaderFrame({
    title,
    titleExtra,
    actions,
    className,
}: {
    title: string;
    titleExtra?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
}) {
    return (
        <header
            className={cn(
                "relative flex shrink-0 items-center bg-panel",
                SIDEBAR_PANEL_HEADER_HEIGHT_CLASS,
                className,
            )}
        >
            <div className="relative z-10 flex min-w-0 flex-1 items-center gap-1.5 pl-3 pr-1">
                <FadeTruncate title={title} className={SIDEBAR_PANEL_TITLE_CLASS}>
                    {title}
                </FadeTruncate>
                {titleExtra}
            </div>
            {actions ? (
                <div className="relative z-10 flex shrink-0 items-center gap-0.5 px-1">
                    {actions}
                </div>
            ) : null}
        </header>
    );
}

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
                "h-6 w-6 shrink-0 text-text-muted hover:bg-panel-hover hover:text-text-primary",
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
                <div>
                    <SidebarPanelHeaderFrame title={title} actions={actions} />
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">
                {children}
                <SidebarSwitchPanelMenuItems currentSide={side} currentPanelId={panelId} />
            </ContextMenuContent>
        </ContextMenu>
    );
}
