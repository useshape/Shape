"use client";

import {
    RiScreenshotFill,
    RiCodeBlock,
    RiComputerLine,
    RiCursorLine,
    RiEditBoxLine,
    RiMouseLine,
    RiDonutChartFill,
    RiSmartphoneLine,
    RiTabletLine,
    RiWindow2Fill,
    RiShapeFill,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Icon, ICON_SIZE_MD, ICON_SIZE_SM } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type DesignViewport = "desktop" | "tablet" | "mobile";
export type DesignToolMode = "select" | "normal" | "rotate";

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
                className={cn(
                    "size-10 rounded-lg",
                    active && "bg-panel-hover text-panel-fg hover:bg-panel-hover hover:text-panel-fg",
                )}
            >
                <Icon icon={icon} size={20} />
            </Button>
        </Tooltip>
    );
}

export function DesignBottomToolbar({
    mode,
    onModeChange,
    viewport,
    onViewportChange,
    onCaptureElement,
    onCaptureScreen,
    onOpenCode,
    canCapture,
    canOpenCode,
    canCaptureElement,
}: {
    mode: DesignToolMode;
    onModeChange: (mode: DesignToolMode) => void;
    viewport: DesignViewport;
    onViewportChange: (viewport: DesignViewport) => void;
    onCaptureElement: () => void;
    onCaptureScreen: () => void;
    onOpenCode: () => void;
    canCapture: boolean;
    canOpenCode: boolean;
    canCaptureElement: boolean;
}) {
    return (
        <div className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-surface-4 p-1 shadow-md/30">
            <div className="flex items-center gap-0.5">
                <Tool
                    label="Edit"
                    icon={RiEditBoxLine}
                    active={mode === "select"}
                    onClick={() => onModeChange("select")}
                />
                <Tool
                    label="Normal"
                    icon={RiMouseLine}
                    active={mode === "normal"}
                    onClick={() => onModeChange("normal")}
                />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            disabled={!canCapture && !canCaptureElement}
                            accessibleDisabled={false}
                            aria-label="Capture"
                            className="size-10 rounded-lg"
                        >
                            <Icon icon={RiScreenshotFill} size={20} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="min-w-36">
                        <DropdownMenuItem
                            disabled={!canCaptureElement}
                            onClick={onCaptureElement}
                        >
                            <Icon icon={RiShapeFill} size={ICON_SIZE_SM} />
                            Element
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={!canCapture} onClick={onCaptureScreen}>
                            <Icon icon={RiWindow2Fill} size={ICON_SIZE_SM} />
                            Screen
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <Tool
                    label="Open source"
                    icon={RiCodeBlock}
                    disabled={!canOpenCode}
                    onClick={onOpenCode}
                />
                <Tool
                    label="Radial"
                    icon={RiDonutChartFill}
                    active={mode === "rotate"}
                    onClick={() => onModeChange("rotate")}
                />
            </div>
            <span className="mx-0.5 h-5 w-px bg-border-secondary" />
            <div className="flex rounded-lg bg-panel-hover p-0.5">
                <Tool
                    label="Desktop"
                    icon={RiComputerLine}
                    active={viewport === "desktop"}
                    onClick={() => onViewportChange("desktop")}
                />
                <Tool
                    label="Tablet"
                    icon={RiTabletLine}
                    active={viewport === "tablet"}
                    onClick={() => onViewportChange("tablet")}
                />
                <Tool
                    label="Mobile"
                    icon={RiSmartphoneLine}
                    active={viewport === "mobile"}
                    onClick={() => onViewportChange("mobile")}
                />
            </div>
        </div>
    );
}
