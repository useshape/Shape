"use client";

import {
    RiArrowGoBackLine,
    RiArrowGoForwardLine,
    RiArrowLeftLine,
    RiCrosshair2Line,
    RiEyeLine,
    RiLayoutLeft2Line,
    RiLayoutRight2Line,
    RiRefreshLine,
} from "@remixicon/react";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useWindowControls } from "@/features/workbench/titlebar/hooks/use-window-controls";
import { WindowControls } from "@/features/workbench/titlebar/ui/window-controls";

function ChromeBtn({
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
                    "flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors",
                    "hover:bg-panel-hover hover:text-text-primary",
                    active && "bg-panel-active text-text-primary",
                    "disabled:pointer-events-none disabled:text-text-disabled",
                )}
            >
                {children}
            </button>
        </Tooltip>
    );
}

export function DesignChrome({
    pageLabel,
    inspect,
    toolsEnabled,
    leftOpen,
    rightOpen,
    onToggleLeft,
    onToggleRight,
    onBack,
    onSelect,
    onInteract,
    onReload,
    onUndo,
    onRedo,
}: {
    pageLabel?: string;
    inspect: boolean;
    toolsEnabled: boolean;
    leftOpen: boolean;
    rightOpen: boolean;
    onToggleLeft: () => void;
    onToggleRight: () => void;
    onBack: () => void;
    onSelect: () => void;
    onInteract: () => void;
    onReload: () => void;
    onUndo: () => void;
    onRedo: () => void;
}) {
    const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();

    return (
        <div className="flex shrink-0 flex-col border-b border-border-subtle bg-panel">
            <div className="relative flex h-titlebar shrink-0 items-stretch" data-tauri-drag-region>
                <div className="relative z-10 flex h-full min-w-0 shrink-0 items-center gap-1 pl-1" data-no-drag>
                    <button
                        type="button"
                        onClick={onBack}
                        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                    >
                        <Icon icon={RiArrowLeftLine} />
                        Back to Chat
                    </button>
                    <span className="mx-1 h-4 w-px shrink-0 bg-border-subtle" />
                    <span className="truncate text-sm text-text-muted">Design</span>
                </div>
                <div className="min-w-8 flex-1" aria-hidden />
                <div className="relative z-10 h-full shrink-0" data-no-drag>
                    <WindowControls
                        isMaximized={isMaximized}
                        onMinimize={minimize}
                        onToggleMaximize={() => void toggleMaximize()}
                        onClose={close}
                    />
                </div>
            </div>
            <div className="relative flex h-10 shrink-0 items-center gap-1 px-2" data-tauri-drag-region>
                <div className="relative z-10 flex min-w-0 shrink-0 items-center gap-0.5" data-no-drag>
                    <ChromeBtn
                        label={leftOpen ? "Hide left panel" : "Show left panel"}
                        active={leftOpen}
                        onClick={onToggleLeft}
                    >
                        <Icon icon={RiLayoutLeft2Line} />
                    </ChromeBtn>
                    <ChromeBtn
                        label="Select"
                        active={toolsEnabled && inspect}
                        disabled={!toolsEnabled}
                        onClick={onSelect}
                    >
                        <Icon icon={RiCrosshair2Line} />
                    </ChromeBtn>
                    <ChromeBtn
                        label="Interact"
                        active={toolsEnabled && !inspect}
                        disabled={!toolsEnabled}
                        onClick={onInteract}
                    >
                        <Icon icon={RiEyeLine} />
                    </ChromeBtn>
                    {pageLabel ? (
                        <span className="ml-2 truncate text-sm tabular-nums text-text-muted">
                            {pageLabel}
                        </span>
                    ) : null}
                </div>
                <div className="min-w-4 flex-1" aria-hidden />
                <div className="relative z-10 flex shrink-0 items-center gap-0.5" data-no-drag>
                    <ChromeBtn label="Undo" disabled={!toolsEnabled} onClick={onUndo}>
                        <Icon icon={RiArrowGoBackLine} />
                    </ChromeBtn>
                    <ChromeBtn label="Redo" disabled={!toolsEnabled} onClick={onRedo}>
                        <Icon icon={RiArrowGoForwardLine} />
                    </ChromeBtn>
                    <ChromeBtn label="Reload" disabled={!toolsEnabled} onClick={onReload}>
                        <Icon icon={RiRefreshLine} />
                    </ChromeBtn>
                    <ChromeBtn
                        label={rightOpen ? "Hide right panel" : "Show right panel"}
                        active={rightOpen}
                        onClick={onToggleRight}
                    >
                        <Icon icon={RiLayoutRight2Line} />
                    </ChromeBtn>
                </div>
            </div>
        </div>
    );
}
