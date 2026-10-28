"use client";

import { PanelBottom20Filled } from "@fluentui/react-icons/headless/svg/panel-bottom";
import { PanelLeft20Filled } from "@fluentui/react-icons/headless/svg/panel-left";
import { PanelRight20Filled } from "@fluentui/react-icons/headless/svg/panel-right";
import { Sparkle20Filled } from "@fluentui/react-icons/headless/svg/sparkle";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";

import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { useShapeAuth } from "@/lib/cloud/store";
import { dashboardUrl } from "@/lib/cloud/api";
import { commands } from "@/lib/backend/commands";
import { WindowControlsSpacer } from "@/features/agent/workbench/titlebar/ui/window-controls";
import { Button } from "@/components/ui/button";
import { useWorkspaceMode } from "@/lib/ui/workspace-mode";

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
    shortcut,
    light,
    children,
}: {
    label: string;
    shortcut?: string;
    onClick: () => void;
    disabled?: boolean;
    active?: boolean;
    light?: boolean;
    children: ReactNode;
}) {
    return (
        <Tooltip content={label} shortcut={shortcut}>
            <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                disabled={disabled}
                onClick={onClick}
                className={cn(
                    "flex size-7 items-center justify-center rounded-md press-spring",
                    "disabled:pointer-events-none disabled:text-text-disabled",
                    light
                        ? "text-white/80 hover:bg-black/25 hover:text-white"
                        : "text-text-muted hover:bg-panel-hover hover:text-text-primary",
                    active && (light ? "text-white" : "text-text-primary"),
                )}
            >
                {children}
            </button>
        </Tooltip>
    );
}

export function TerminalToggle({ light }: { light?: boolean }) {
    const mode = useWorkspaceMode();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        try {
            setOpen(localStorage.getItem("shape-agent-terminal-open") === "true");
        } catch {
            /* ignore */
        }
        const onOpen = (e: Event) => {
            const next = (e as CustomEvent<{ open?: boolean }>).detail?.open;
            if (typeof next === "boolean") setOpen(next);
        };
        window.addEventListener("shape-terminal-open", onOpen as EventListener);
        return () => window.removeEventListener("shape-terminal-open", onOpen as EventListener);
    }, []);

    if (mode !== "Code") return null;

    const toggle = () => {
        window.dispatchEvent(
            new CustomEvent("shape-layout-toggle", {
                detail: { id: "terminal", value: !open },
            }),
        );
    };

    return (
        <Btn label={open ? "Hide terminal" : "Show terminal"} shortcut="Ctrl+`" active={open} light={light} onClick={toggle}>
            <Icon icon={PanelBottom20Filled} />
        </Btn>
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
    onOpenSearch,
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
    onOpenSearch?: () => void;
}) {
    const mode = useWorkspaceMode();
    const press = useRef<{ x: number; y: number } | null>(null);
    const searchEnabled = mode === "Code" && Boolean(onOpenSearch);

    return (
        <div className="relative z-30 flex h-full min-w-0 flex-1 items-stretch bg-panel" data-tauri-drag-region>
            {!sidebarOpen && onToggleSidebar ? (
                <div
                    data-sidebar-peek-toggle=""
                    className="relative z-20 flex shrink-0 items-center pl-1"
                    data-no-drag
                    onMouseEnter={onSidebarHoverStart}
                    onMouseLeave={onSidebarHoverEnd}
                >
                    <SidebarToggleBtn open={false} onToggle={onToggleSidebar} />
                </div>
            ) : null}
            <div
                className="relative z-20 flex h-full min-w-0 flex-1 items-center"
                data-tauri-drag-region
                onPointerDown={(event) => {
                    if (!searchEnabled || event.target !== event.currentTarget) return;
                    press.current = { x: event.clientX, y: event.clientY };
                }}
                onClick={(event) => {
                    if (!searchEnabled || event.target !== event.currentTarget || !press.current) return;
                    const moved =
                        Math.abs(event.clientX - press.current.x) > 4
                        || Math.abs(event.clientY - press.current.y) > 4;
                    press.current = null;
                    if (moved) return;
                    onOpenSearch?.();
                }}
            >
                <div
                    id={AGENT_TABS_SLOT}
                    data-no-drag
                    className="pointer-events-auto flex h-full min-w-0 items-center"
                />
            </div>
            <AgentChromeTools
                rightOpen={rightOpen}
                onToggleRight={onToggleRight}
                canToggleRight={canToggleRight}
                showRightToggle={showRightToggle}
            />
            {padWindowControls ? <WindowControlsSpacer /> : null}
        </div>
    );
}

export function AgentChromeTools({
    rightOpen,
    onToggleRight,
    canToggleRight = true,
    showRightToggle = true,
    light = false,
}: {
    rightOpen: boolean;
    onToggleRight: () => void;
    canToggleRight?: boolean;
    showRightToggle?: boolean;
    light?: boolean;
}) {
    return (
        <div className="relative z-20 flex h-full shrink-0 items-center gap-0.5 pr-1" data-no-drag>
            <TerminalToggle light={light} />
            {showRightToggle ? (
                <Btn
                    label={rightOpen ? "Hide panel" : "Show panel"}
                    shortcut="Ctrl+Alt+B"
                    disabled={!canToggleRight}
                    active={rightOpen}
                    light={light}
                    onClick={onToggleRight}
                >
                    <Icon icon={PanelRight20Filled} />
                </Btn>
            ) : null}
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
        <Tooltip content={open ? "Hide sidebar" : "Show sidebar"} shortcut="Ctrl+B" side={collapsed ? "right" : "bottom"} delayDuration={80}>
            <Button
                variant="ghost"
                size="icon"
                aria-label={open ? "Hide sidebar" : "Show sidebar"}
                onClick={onToggle}
                className="size-8 min-h-8 min-w-8 bg-panel-hover rounded-full"
            >
                <Icon icon={PanelLeft20Filled} style={{ ["--icon-size" as string]: "20px" }} />
            </Button>
        </Tooltip>
    );
}
