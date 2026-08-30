"use client";

import {
    AnimatedSecondarySidebarIcon,
    AnimatedSidebarIcon,
} from "@/features/activity-bar";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

export const AGENT_TABS_SLOT = "shape-agent-tabs";

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
    children: React.ReactNode;
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
                    "disabled:pointer-events-none disabled:opacity-30",
                )}
            >
                {children}
            </button>
        </Tooltip>
    );
}

/** Center chrome: panel toggles · conversation tabs · history / files. */
export function AgentChrome({
    leftOpen,
    rightOpen,
    filesOpen,
    onToggleLeft,
    onToggleRight,
    onToggleFiles,
    canToggleRight = true,
    canToggleFiles = true,
}: {
    leftOpen: boolean;
    rightOpen: boolean;
    filesOpen: boolean;
    onToggleLeft: () => void;
    onToggleRight: () => void;
    onToggleFiles: () => void;
    canToggleRight?: boolean;
    canToggleFiles?: boolean;
}) {
    return (
        <div className="flex h-titlebar shrink-0 items-stretch border-b border-border-subtle bg-panel">
            <div className="flex items-center gap-0.5 px-2">
                <Btn
                    label={leftOpen ? "Hide sidebar" : "Show sidebar"}
                    active={leftOpen}
                    onClick={onToggleLeft}
                >
                    <AnimatedSidebarIcon active={leftOpen} size={16} />
                </Btn>
            </div>

            <div
                id={AGENT_TABS_SLOT}
                className="flex h-full min-w-0 flex-1 items-center overflow-hidden"
                data-tauri-drag-region
            />

            <div className="flex items-center gap-0.5 px-2">
                <Btn
                    label="History"
                    onClick={() => {
                        void import("@/features/chat/ui/shell/history").then(({ openChatHistoryMenu }) => {
                            openChatHistoryMenu();
                        });
                    }}
                >
                    <Icon name="history" size={15} />
                </Btn>
                <Btn
                    label={filesOpen ? "Close files" : "Open files"}
                    active={filesOpen}
                    disabled={!canToggleFiles}
                    onClick={onToggleFiles}
                >
                    <Icon name="folder" size={15} />
                </Btn>
                <Btn
                    label={rightOpen ? "Hide panel" : "Show panel"}
                    active={rightOpen && !filesOpen}
                    disabled={!canToggleRight || filesOpen}
                    onClick={onToggleRight}
                >
                    <AnimatedSecondarySidebarIcon active={rightOpen && !filesOpen} size={16} />
                </Btn>
            </div>
        </div>
    );
}
