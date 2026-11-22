"use client";

import { PanelLeft20Filled } from "@fluentui/react-icons/headless/svg/panel-left";
import { PanelRight20Filled } from "@fluentui/react-icons/headless/svg/panel-right";
import { Sparkle20Filled } from "@fluentui/react-icons/headless/svg/sparkle";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";

import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { useShapeAuth } from "@/lib/cloud/store";
import { dashboardUrl } from "@/lib/cloud/api";
import { commands } from "@/lib/backend/commands";
import { WindowControlsSpacer } from "@/features/agent/workbench/titlebar/ui/window-controls";
import { useChromeKind } from "@/lib/ui/chrome-platform";
import { AccountMenuButton } from "@/features/agent/sidebar/menu";

export const AGENT_TABS_SLOT = "shape-agent-tabs";
export const AGENT_CHROME_ACTIONS_SLOT = "shape-agent-chrome-actions";
export const AGENT_SIDEBAR_BACK_SLOT = "shape-agent-sidebar-back";
export const AGENT_SIDEBAR_HISTORY_SLOT = "shape-agent-sidebar-history";

export function GetPlusButton({ className }: { className?: string }) {
    const auth = useShapeAuth();
    if (!auth.loggedIn || auth.offline || auth.tier !== "free") return null;
    return (
        <button
            type="button"
            className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-[#3a3148] px-2.5 text-sm font-medium text-[#c084fc] transition-colors hover:bg-[#463a58] hover:text-[#d8b4fe]",
                className,
            )}
            onClick={() =>
                void commands.openUrlExternal(`${dashboardUrl()}/settings/billing`)
            }
        >
            <Icon icon={Sparkle20Filled} />
            Get Plus
        </button>
    );
}

function Btn({
    label,
    onClick,
    disabled,
    active,
    children,
}: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    active?: boolean;
    children: ReactNode;
}) {
    return (
        <Tooltip content={label}>
            <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                disabled={disabled}
                onClick={onClick}
                className={cn(
                    "flex size-7 items-center justify-center rounded-md text-text-muted press-spring",
                    "hover:bg-panel-hover hover:text-text-primary",
                    active && "text-text-primary",
                    "disabled:pointer-events-none disabled:text-text-disabled",
                )}
            >
                {children}
            </button>
        </Tooltip>
    );
}

export function AgentChrome({
    rightOpen,
    onToggleRight,
    canToggleRight = true,
    showRightToggle = true,
    padWindowControls = false,
    sidebarOpen = true,
    onToggleSidebar,
    onSidebarHoverStart,
    onSidebarHoverEnd,
}: {
    rightOpen: boolean;
    onToggleRight: () => void;
    canToggleRight?: boolean;
    showRightToggle?: boolean;
    padWindowControls?: boolean;
    sidebarOpen?: boolean;
    onToggleSidebar?: () => void;
    onSidebarHoverStart?: () => void;
    onSidebarHoverEnd?: () => void;
}) {
    const macos = useChromeKind() === "macos";
    return (
        <div
            className="relative z-30 flex h-titlebar shrink-0 items-stretch overflow-hidden bg-transparent transition-[padding] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
            data-tauri-drag-region
            data-chrome-leading="false"
            style={macos ? { paddingLeft: sidebarOpen ? 0 : "var(--traffic-lights-inset)" } : undefined}
        >
            {onToggleSidebar ? (
                <div
                    data-sidebar-peek-toggle=""
                    className={cn(
                        "relative z-10 flex h-full shrink-0 items-center overflow-hidden transition-[width,opacity,padding] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
                        sidebarOpen ? "w-0 p-0 opacity-0" : "w-9 pl-2 opacity-100",
                    )}
                    data-no-drag
                    onMouseEnter={onSidebarHoverStart}
                    onMouseLeave={onSidebarHoverEnd}
                >
                    <SidebarToggleBtn open={false} onToggle={onToggleSidebar} />
                </div>
            ) : null}
            <div
                id={AGENT_TABS_SLOT}
                className="relative z-10 flex h-full min-w-0 flex-1 items-center overflow-hidden pl-3"
            />

            <div className="relative z-10 ml-auto flex shrink-0 items-center gap-0.5 px-1" data-no-drag>
                <div id={AGENT_CHROME_ACTIONS_SLOT} className="flex items-center gap-0.5" />
                {showRightToggle ? (
                    <Btn
                        label={rightOpen ? "Hide panel" : "Show panel"}
                        disabled={!canToggleRight}
                        active={rightOpen}
                        onClick={onToggleRight}
                    >
                        <Icon icon={PanelRight20Filled} />
                    </Btn>
                ) : null}
                {padWindowControls && !macos ? <WindowControlsSpacer /> : null}
                {macos ? <AccountMenuButton align="end" chevron={false} avatarSize={16} /> : null}
            </div>
        </div>
    );
}

export function SidebarToggleBtn({
    open,
    onToggle,
    collapsed,
}: {
    open: boolean;
    onToggle: () => void;
    collapsed?: boolean;
}) {
    return (
        <Tooltip content={open ? "Hide sidebar" : "Show sidebar"} side={collapsed ? "right" : "bottom"} delayDuration={80}>
            <button
                type="button"
                aria-label={open ? "Hide sidebar" : "Show sidebar"}
                onClick={onToggle}
                className={cn(
                    "flex items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary",
                    collapsed ? "size-9" : "size-7",
                )}
            >
                <Icon icon={PanelLeft20Filled} />
            </button>
        </Tooltip>
    );
}
