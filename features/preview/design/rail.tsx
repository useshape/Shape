"use client";

import {
    RiDonutChartFill,
    RiLayoutGridLine,
    RiEditBoxLine,
    RiMouseLine,
    RiScreenshotFill,
    RiShapeFill,
    RiWindow2Fill,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DesignToolMode } from "./bottom-toolbar";

function RailBtn({
    label,
    icon,
    active,
    disabled,
    onClick,
}: {
    label: string;
    icon: typeof RiEditBoxLine;
    active?: boolean;
    disabled?: boolean;
    onClick?: () => void;
}) {
    return (
        <Tooltip content={label} side="right">
            <Button
                variant="ghost"
                size="icon"
                selected={active}
                disabled={disabled}
                accessibleDisabled={false}
                onClick={onClick}
                aria-label={label}
                className={cn("size-9 rounded-md", active && "bg-panel-hover text-text-primary")}
            >
                <Icon icon={icon} size={18} />
            </Button>
        </Tooltip>
    );
}

export function DesignRail({
    mode,
    onModeChange,
    onCaptureElement,
    onCaptureScreen,
    canCapture,
    canCaptureElement,
}: {
    mode: DesignToolMode;
    onModeChange: (mode: DesignToolMode) => void;
    onCaptureElement: () => void;
    onCaptureScreen: () => void;
    canCapture: boolean;
    canCaptureElement: boolean;
}) {
    return (
        <div className="flex h-full w-11 shrink-0 flex-col items-center border-r border-border bg-surface-3 py-2">
            <div className="flex flex-col items-center gap-0.5">
                <RailBtn
                    label="Inspect"
                    icon={RiEditBoxLine}
                    active={mode === "select"}
                    onClick={() => onModeChange("select")}
                />
                <RailBtn
                    label="Normal"
                    icon={RiMouseLine}
                    active={mode === "normal"}
                    onClick={() => onModeChange("normal")}
                />
                <RailBtn
                    label="Auto layout"
                    icon={RiLayoutGridLine}
                    active={mode === "autolayout"}
                    onClick={() => onModeChange("autolayout")}
                />
                <RailBtn
                    label="Rotate"
                    icon={RiDonutChartFill}
                    active={mode === "rotate"}
                    onClick={() => onModeChange("rotate")}
                />
                <DropdownMenu>
                    <Tooltip content="Capture" side="right">
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                disabled={!canCapture && !canCaptureElement}
                                accessibleDisabled={false}
                                aria-label="Capture"
                                className="size-9 rounded-md"
                            >
                                <Icon icon={RiScreenshotFill} size={18} />
                            </Button>
                        </DropdownMenuTrigger>
                    </Tooltip>
                    <DropdownMenuContent side="right" align="start" className="min-w-36">
                        <DropdownMenuItem disabled={!canCaptureElement} onClick={onCaptureElement}>
                            <Icon icon={RiShapeFill} size={16} />
                            Element
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={!canCapture} onClick={onCaptureScreen}>
                            <Icon icon={RiWindow2Fill} size={16} />
                            Screen
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}
