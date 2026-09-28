"use client";

import { GithubMark } from "@/components/ui/github-mark";
import { Camera20Filled } from "@fluentui/react-icons/headless/svg/camera";
import { Cursor20Filled } from "@fluentui/react-icons/headless/svg/cursor";
import { DataPie20Filled } from "@fluentui/react-icons/headless/svg/data-pie";
import { Edit20Regular } from "@fluentui/react-icons/headless/svg/edit";
import { Grid20Regular } from "@fluentui/react-icons/headless/svg/grid";
import { Phone20Regular } from "@fluentui/react-icons/headless/svg/phone";
import { Rhombus20Filled } from "@fluentui/react-icons/headless/svg/rhombus";
import { Tablet20Regular } from "@fluentui/react-icons/headless/svg/tablet";
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

export type DesignViewport = "desktop" | "tablet" | "mobile";
export type DesignToolMode = "select" | "normal" | "rotate" | "autolayout";

function Tool({
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
                <Icon icon={icon} />
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
                    label="Inspect"
                    icon={Edit20Regular}
                    active={mode === "select"}
                    onClick={() => onModeChange("select")}
                />
                <Tool
                    label="Normal"
                    icon={Cursor20Filled}
                    active={mode === "normal"}
                    onClick={() => onModeChange("normal")}
                />
                <Tool
                    label="Auto layout"
                    icon={Grid20Regular}
                    active={mode === "autolayout"}
                    onClick={() => onModeChange("autolayout")}
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
                            <Icon icon={Camera20Filled} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="min-w-36">
                        <DropdownMenuItem
                            disabled={!canCaptureElement}
                            onClick={onCaptureElement}
                        >
                            <Icon icon={Rhombus20Filled} />
                            Element
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={!canCapture} onClick={onCaptureScreen}>
                            <Icon icon={Window20Filled} />
                            Screen
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <Tool
                    label="Open source"
                    icon={GithubMark}
                    disabled={!canOpenCode}
                    onClick={onOpenCode}
                />
                <Tool
                    label="Rotate"
                    icon={DataPie20Filled}
                    active={mode === "rotate"}
                    onClick={() => onModeChange("rotate")}
                />
            </div>
            <span className="mx-0.5 h-5 w-px bg-border-secondary" />
            <div className="flex rounded-lg bg-panel-hover p-0.5">
                <Tool
                    label="Desktop"
                    icon={Window20Filled}
                    active={viewport === "desktop"}
                    onClick={() => onViewportChange("desktop")}
                />
                <Tool
                    label="Tablet"
                    icon={Tablet20Regular}
                    active={viewport === "tablet"}
                    onClick={() => onViewportChange("tablet")}
                />
                <Tool
                    label="Mobile"
                    icon={Phone20Regular}
                    active={viewport === "mobile"}
                    onClick={() => onViewportChange("mobile")}
                />
            </div>
        </div>
    );
}
