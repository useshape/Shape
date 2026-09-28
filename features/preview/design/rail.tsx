"use client";

import { Camera20Filled } from "@fluentui/react-icons/headless/svg/camera";
import { Cursor20Filled } from "@fluentui/react-icons/headless/svg/cursor";
import { DataPie20Filled } from "@fluentui/react-icons/headless/svg/data-pie";
import { Edit20Regular } from "@fluentui/react-icons/headless/svg/edit";
import { Grid20Regular } from "@fluentui/react-icons/headless/svg/grid";
import { Rhombus20Filled } from "@fluentui/react-icons/headless/svg/rhombus";
import { Window20Filled } from "@fluentui/react-icons/headless/svg/window";


import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { type IconGlyph, Icon } from "@/components/ui/icon";

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
    icon: IconGlyph;
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
                <Icon icon={icon} />
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
                    icon={Edit20Regular}
                    active={mode === "select"}
                    onClick={() => onModeChange("select")}
                />
                <RailBtn
                    label="Normal"
                    icon={Cursor20Filled}
                    active={mode === "normal"}
                    onClick={() => onModeChange("normal")}
                />
                <RailBtn
                    label="Auto layout"
                    icon={Grid20Regular}
                    active={mode === "autolayout"}
                    onClick={() => onModeChange("autolayout")}
                />
                <RailBtn
                    label="Rotate"
                    icon={DataPie20Filled}
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
                                <Icon icon={Camera20Filled} />
                            </Button>
                        </DropdownMenuTrigger>
                    </Tooltip>
                    <DropdownMenuContent side="right" align="start" className="min-w-36">
                        <DropdownMenuItem disabled={!canCaptureElement} onClick={onCaptureElement}>
                            <Icon icon={Rhombus20Filled} />
                            Element
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={!canCapture} onClick={onCaptureScreen}>
                            <Icon icon={Window20Filled} />
                            Screen
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}
