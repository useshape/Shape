"use client";

import { RiLayoutRight2Line, RiLayoutLeft2Line, RiSparkling2Fill } from "@remixicon/react";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { useWindowControls } from "@/features/workbench/titlebar/hooks/use-window-controls";
import { WindowControls } from "@/features/workbench/titlebar/ui/window-controls";
import { useShapeAuth } from "@/lib/cloud/store";
import { dashboardUrl } from "@/lib/cloud/api";
import { commands } from "@/lib/backend/commands";

export const AGENT_TABS_SLOT = "shape-agent-tabs";
export const AGENT_CHROME_ACTIONS_SLOT = "shape-agent-chrome-actions";
export const AGENT_SIDEBAR_BACK_SLOT = "shape-agent-sidebar-back";
export const AGENT_SIDEBAR_HISTORY_SLOT = "shape-agent-sidebar-history";

function GetPlusButton() {
    const auth = useShapeAuth();
    if (!auth.loggedIn || auth.offline || auth.tier !== "free") return null;
    return (
        <button
            type="button"
            className="mr-1 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-[#3a3148] px-2.5 text-sm font-medium text-[#c084fc] transition-colors hover:bg-[#463a58] hover:text-[#d8b4fe]"
            onClick={() =>
                void commands.openUrlExternal(`${dashboardUrl()}/settings/billing`)
            }
        >
            <Icon icon={RiSparkling2Fill} />
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
                    "flex size-7 items-center justify-center rounded-md text-text-muted transition-colors",
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
}: {
    rightOpen: boolean;
    onToggleRight: () => void;
    canToggleRight?: boolean;
}) {
    const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();

    return (
        <div className="relative flex h-titlebar shrink-0 items-stretch overflow-hidden bg-panel" data-tauri-drag-region>
            {/* Title/tabs content — no data-no-drag so empty chrome stays draggable.
                Interactive children opt out via data-no-drag / button CSS rules. */}
            <div
                id={AGENT_TABS_SLOT}
                className="relative z-10 flex h-full min-w-0 flex-1 items-center overflow-hidden pl-2"
            />

            <div className="relative z-10 flex shrink-0 items-center gap-0.5 px-1" data-no-drag>
                <div id={AGENT_CHROME_ACTIONS_SLOT} className="flex items-center gap-0.5" />
                <GetPlusButton />
                <Btn
                    label={rightOpen ? "Hide panel" : "Show panel"}
                    disabled={!canToggleRight}
                    active={rightOpen}
                    onClick={onToggleRight}
                >
                    <Icon icon={RiLayoutRight2Line} />
                </Btn>
            </div>
            <div className="relative z-10 flex h-full shrink-0 items-center" data-no-drag>
                <WindowControls
                    isMaximized={isMaximized}
                    onMinimize={minimize}
                    onToggleMaximize={() => void toggleMaximize()}
                    onClose={close}
                    surface="panel"
                    spacer={!rightOpen}
                    floating
                />
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
    if (collapsed) {
        return (
            <Tooltip content={open ? "Hide sidebar" : "Show sidebar"} side="right" delayDuration={80}>
                <button
                    type="button"
                    aria-label={open ? "Hide sidebar" : "Show sidebar"}
                    onClick={onToggle}
                    className="flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
                >
                    <Icon icon={RiLayoutLeft2Line} />
                </button>
            </Tooltip>
        );
    }
    return (
        <button
            type="button"
            aria-label={open ? "Hide sidebar" : "Show sidebar"}
            onClick={onToggle}
            className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
        >
            <Icon icon={RiLayoutLeft2Line} />
        </button>
    );
}
