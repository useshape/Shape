"use client";

import { useEffect, useState } from "react";
import {
    AnimatedSecondarySidebarIcon,
    AnimatedSidebarIcon,
} from "@/features/activity-bar";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { useProjectState } from "@/lib/backend";
import {
    detectDevCommand,
    isWebProject,
    type DevCommandInfo,
} from "@/features/detection/lib/lib";
import { useDevRunStatus } from "@/features/preview/run-status";

export const AGENT_TABS_SLOT = "shape-agent-tabs";
export const AGENT_SIDEBAR_BACK_SLOT = "shape-agent-sidebar-back";

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

function RunStatusDot({
    status,
}: {
    status: "idle" | "starting" | "running" | "error";
}) {
    if (status === "idle") return null;
    if (status === "running") {
        return (
            <span
                className="pointer-events-none absolute -bottom-px -right-px size-1.5 rounded-full bg-success"
                aria-hidden
            />
        );
    }
    return (
        <span
            className={cn(
                "pointer-events-none absolute -bottom-0.5 -right-0.5 size-2 rounded-full border-[1.5px] border-t-transparent animate-spin",
                status === "starting" ? "border-accent" : "border-error",
            )}
            aria-hidden
        />
    );
}

function RunControl({
    command,
}: {
    command: string;
}) {
    const run = useDevRunStatus();
    const busy = run.status === "starting" || run.status === "running";

    const start = () => {
        window.dispatchEvent(
            new CustomEvent("shape-terminal-run", { detail: { command } }),
        );
    };
    const stop = () => {
        window.dispatchEvent(new CustomEvent("shape-terminal-run-stop"));
    };
    const restart = () => {
        window.dispatchEvent(
            new CustomEvent("shape-terminal-run-restart", { detail: { command } }),
        );
    };

    if (!busy) {
        return (
            <Btn label={`Run ${command}`} onClick={start}>
                <span className="relative inline-flex">
                    <Icon name="play_arrow" size={15} filled />
                    <RunStatusDot status={run.status} />
                </span>
            </Btn>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={run.status === "starting" ? "Starting…" : "Running"}
                    className={cn(
                        "flex size-7 items-center justify-center rounded-md text-text-muted transition-colors",
                        "hover:bg-panel-hover hover:text-text-primary",
                    )}
                >
                    <span className="relative inline-flex">
                        <Icon name={run.status === "starting" ? "play_arrow" : "stop"} size={15} filled />
                        <RunStatusDot status={run.status} />
                    </span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-36">
                <DropdownMenuItem onClick={restart}>Restart</DropdownMenuItem>
                <DropdownMenuItem onClick={stop}>Stop</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function AgentChrome({
    rightOpen,
    filesOpen,
    onToggleRight,
    onToggleFiles,
    canToggleRight = true,
    canToggleFiles = true,
    designOpen = false,
    onToggleDesign,
}: {
    leftOpen?: boolean;
    rightOpen: boolean;
    filesOpen: boolean;
    onToggleLeft?: () => void;
    onToggleRight: () => void;
    onToggleFiles: () => void;
    canToggleRight?: boolean;
    canToggleFiles?: boolean;
    designOpen?: boolean;
    onToggleDesign?: () => void;
}) {
    const { project_path } = useProjectState();
    const [web, setWeb] = useState(false);
    const [dev, setDev] = useState<DevCommandInfo | null>(null);

    useEffect(() => {
        if (!project_path) {
            setWeb(false);
            setDev(null);
            return;
        }
        let cancelled = false;
        void (async () => {
            const isWeb = await isWebProject(project_path);
            if (cancelled) return;
            setWeb(isWeb);
            if (!isWeb) {
                setDev(null);
                return;
            }
            const cmd = await detectDevCommand(project_path);
            if (!cancelled) setDev(cmd);
        })();
        return () => {
            cancelled = true;
        };
    }, [project_path]);

    return (
        <div className="flex h-titlebar shrink-0 items-stretch bg-titlebar">
            <div
                id={AGENT_TABS_SLOT}
                className="flex h-full min-w-0 flex-1 items-center overflow-hidden pl-2"
                data-tauri-drag-region
            />

            <div className="flex items-center gap-0.5 px-2">
                {web && dev ? <RunControl command={dev.command} /> : null}
                {web ? (
                    <Btn
                        label={designOpen ? "Exit Design Mode" : "Design Mode"}
                        active={designOpen}
                        onClick={() => onToggleDesign?.()}
                    >
                        <Icon name="palette" size={15} />
                    </Btn>
                ) : null}
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
                    <AnimatedSidebarIcon active={open} size={16} />
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
            <AnimatedSidebarIcon active={open} size={16} />
        </button>
    );
}
