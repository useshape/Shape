"use client";

import {
    RiArrowGoBackLine,
    RiArrowGoForwardLine,
    RiCameraLine,
    RiCodeLine,
    RiComputerLine,
    RiCursorLine,
    RiSmartphoneLine,
    RiTabletLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type DesignViewport = "desktop" | "tablet" | "mobile";

function Tool({
    label,
    icon,
    active,
    disabled,
    onClick,
}: {
    label: string;
    icon: typeof RiCursorLine;
    active?: boolean;
    disabled?: boolean;
    onClick?: () => void;
}) {
    return (
        <Tooltip content={label}>
            <Button
                variant="ghost"
                size="icon"
                selected={active}
                disabled={disabled}
                accessibleDisabled={false}
                onClick={onClick}
                aria-label={label}
                className={cn("size-8 rounded-lg", active && "bg-accent text-accent-fg hover:bg-accent-hover hover:text-accent-fg")}
            >
                <Icon icon={icon} size={ICON_SIZE_SM} />
            </Button>
        </Tooltip>
    );
}

export function DesignBottomToolbar({
    viewport,
    onViewportChange,
    zoom,
    onZoomChange,
    onUndo,
    onRedo,
    onCapture,
    onOpenCode,
    canCapture,
    canOpenCode,
}: {
    viewport: DesignViewport;
    onViewportChange: (viewport: DesignViewport) => void;
    zoom: number;
    onZoomChange: (zoom: number) => void;
    onUndo: () => void;
    onRedo: () => void;
    onCapture: () => void;
    onOpenCode: () => void;
    canCapture: boolean;
    canOpenCode: boolean;
}) {
    return (
        <div className="z-30 flex items-center gap-0.5 rounded-xl border border-border-secondary bg-surface-4/92 p-1 shadow-xl backdrop-blur-xl">
            <Tool label="Select and move" icon={RiCursorLine} active />
            <span className="mx-0.5 h-5 w-px bg-border" />
            <Tool label="Undo visual edit" icon={RiArrowGoBackLine} onClick={onUndo} />
            <Tool label="Redo visual edit" icon={RiArrowGoForwardLine} onClick={onRedo} />
            <span className="mx-0.5 h-5 w-px bg-border" />
            <Tool label="Capture canvas" icon={RiCameraLine} disabled={!canCapture} onClick={onCapture} />
            <Tool label="Open selected source" icon={RiCodeLine} disabled={!canOpenCode} onClick={onOpenCode} />
            <span className="mx-0.5 h-5 w-px bg-border" />
            <div className="flex rounded-lg bg-input-bg p-0.5">
                <Tool label="Desktop" icon={RiComputerLine} active={viewport === "desktop"} onClick={() => onViewportChange("desktop")} />
                <Tool label="Tablet" icon={RiTabletLine} active={viewport === "tablet"} onClick={() => onViewportChange("tablet")} />
                <Tool label="Mobile" icon={RiSmartphoneLine} active={viewport === "mobile"} onClick={() => onViewportChange("mobile")} />
            </div>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 min-w-14 px-2 text-xs tabular-nums">
                        {zoom}%
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-28">
                    {[50, 67, 75, 80, 90, 100, 125, 150].map((value) => (
                        <DropdownMenuItem key={value} onClick={() => onZoomChange(value)}>
                            {value}%
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
