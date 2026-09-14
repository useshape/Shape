"use client";

import type { RemixiconComponentType } from "@remixicon/react";
import {
    RiArrowDownSLine,
    RiArrowGoBackLine,
    RiArrowGoForwardLine,
    RiComputerLine,
    RiFileTextLine,
    RiHomeLine,
    RiLayoutGridLine,
    RiMoreLine,
    RiLogoutBoxLine,
    RiSmartphoneLine,
    RiStackLine,
    RiTabletLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { useWindowControls } from "@/features/workbench/titlebar/hooks/use-window-controls";
import { WindowControls } from "@/features/workbench/titlebar/ui/window-controls";
import { cn } from "@/lib/utils";

function IconBtn({
    label,
    active,
    children,
}: {
    label: string;
    active?: boolean;
    children: React.ReactNode;
}) {
    return (
        <Tooltip content={label} side="bottom">
            <Button
                variant="ghost"
                size="icon"
                aria-label={label}
                aria-pressed={active}

            >
                {children}
            </Button>
        </Tooltip>
    );
}

function PillSelect({
    icon,
    label,
}: {
    icon?: RemixiconComponentType;
    label: string;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="xs"
                    className="h-8 text-sm"
                >
                    {icon ? <Icon icon={icon} size={ICON_SIZE_SM} /> : null}
                    <span className="truncate">{label}</span>
                    <Icon icon={RiArrowDownSLine} size={ICON_SIZE_SM} className="opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="min-w-40">
                <DropdownMenuItem>{label}</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function DesignToolbar({ onClose }: { onClose: () => void }) {
    const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();

    return (
        <div
            className="relative flex h-12 shrink-0 items-stretch border-b border-border"
            data-tauri-drag-region
        >
            <div className="relative z-10 flex h-full min-w-0 items-center gap-1.5 pl-2" data-no-drag>
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <Icon icon={RiLogoutBoxLine} size={ICON_SIZE_SM} />
                </Button>
                <span className="text-md pl-1 text-text-primary">Dawn</span>
                <span className="text-sm text-text-secondary">
                    Draft
                </span>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="More"
                        >
                            <Icon icon={RiMoreLine} size={ICON_SIZE_SM} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-36">
                        <DropdownMenuItem>Rename</DropdownMenuItem>
                        <DropdownMenuItem>Duplicate</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="pointer-events-auto flex items-center gap-1.5" data-no-drag>
                    <PillSelect label="Default" />
                    <PillSelect icon={RiHomeLine} label="Home page" />
                </div>
            </div>

            <div className="relative z-10 ml-auto flex h-full items-center gap-0.5 pr-0" data-no-drag>
                <div className="mr-1 flex items-center rounded-lg border border-border">
                    <Button variant="ghost" size="icon" aria-pressed={true}>
                        <Icon icon={RiComputerLine} size={ICON_SIZE_SM} />
                    </Button>
                    <Button variant="ghost" size="icon" aria-pressed={false}>
                        <Icon icon={RiTabletLine} size={ICON_SIZE_SM} />
                    </Button>
                    <Button variant="ghost" size="icon" aria-pressed={false}>
                        <Icon icon={RiSmartphoneLine} size={ICON_SIZE_SM} />
                    </Button>
                </div>
                <Button variant="outline" size="sm">
                    Publish
                </Button>
                <Button variant="default" size="sm">
                    Save
                </Button>
                <WindowControls
                    isMaximized={isMaximized}
                    onMinimize={minimize}
                    onToggleMaximize={toggleMaximize}
                    onClose={close}
                />
            </div>
        </div>
    );
}
