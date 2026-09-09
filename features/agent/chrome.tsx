"use client";

import { RiLayoutRight2Line, RiLayoutLeft2Line, RiPlayFill, RiSparkling2Fill, RiStopFill } from "@remixicon/react";
import { useEffect, useState } from "react";
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
import { useWindowControls } from "@/features/workbench/titlebar/hooks/use-window-controls";
import { WindowControls } from "@/features/workbench/titlebar/ui/window-controls";
import { useShapeAuth } from "@/lib/shape-auth/store";
import { dashboardUrl } from "@/lib/shape-auth/api";
import { commands } from "@/lib/backend/commands";

export const AGENT_TABS_SLOT = "shape-agent-tabs";
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
                    "disabled:pointer-events-none disabled:text-text-disabled",
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
                    <Icon icon={RiPlayFill} />
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
                        <Icon icon={run.status === "starting" ? RiPlayFill : RiStopFill} />
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
    onToggleRight,
    canToggleRight = true,
}: {
    leftOpen?: boolean;
    rightOpen: boolean;
    onToggleLeft?: () => void;
    onToggleRight: () => void;
    canToggleRight?: boolean;
}) {
    const { project_path } = useProjectState();
    const [web, setWeb] = useState(false);
    const [dev, setDev] = useState<DevCommandInfo | null>(null);
    const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();
    const [sidebarOpen, setSidebarOpen] = useState(true);

    useEffect(() => {
        try {
            setSidebarOpen(localStorage.getItem("shape-agent-sidebar") !== "false");
        } catch {
            /* ignore */
        }
        const onToggle = (e: Event) => {
            const detail = (e as CustomEvent<{ id?: string; value?: boolean }>).detail;
            if (detail?.id !== "primary-sidebar" && detail?.id !== "agent-sidebar") return;
            if (detail.value === true) setSidebarOpen(true);
            else if (detail.value === false) setSidebarOpen(false);
            else setSidebarOpen((v) => !v);
        };
        window.addEventListener("shape-layout-toggle", onToggle as EventListener);
        return () => window.removeEventListener("shape-layout-toggle", onToggle as EventListener);
    }, []);

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
        <div className="relative flex h-titlebar shrink-0 items-stretch bg-panel">
            <div
                className="absolute inset-0 z-0"
                data-tauri-drag-region
                aria-hidden
            />
            <div className="relative z-10 flex h-full shrink-0 items-center pl-1">
                <SidebarToggleBtn
                    open={sidebarOpen}
                    onToggle={() => {
                        window.dispatchEvent(
                            new CustomEvent("shape-layout-toggle", {
                                detail: { id: "primary-sidebar" },
                            }),
                        );
                    }}
                />
            </div>
            <div
                id={AGENT_TABS_SLOT}
                className="relative z-10 flex h-full min-w-0 flex-1 items-center overflow-hidden pl-1"
            />

            <div className="relative z-10 flex shrink-0 items-center gap-0.5 px-1">
                <GetPlusButton />
                {web && dev ? <RunControl command={dev.command} /> : null}
                <Btn
                    label={rightOpen ? "Hide panel" : "Show panel"}
                    active={rightOpen}
                    disabled={!canToggleRight}
                    onClick={onToggleRight}
                >
                    <Icon icon={RiLayoutRight2Line} />
                </Btn>
            </div>
            <div className="relative z-10 h-full shrink-0">
                <WindowControls
                    isMaximized={isMaximized}
                    onMinimize={minimize}
                    onToggleMaximize={() => void toggleMaximize()}
                    onClose={close}
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
