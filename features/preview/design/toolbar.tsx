"use client";

import {
    RiComputerLine,
    RiHomeLine,
    RiLogoutBoxLine,
    RiMoreLine,
    RiSmartphoneLine,
    RiTabletLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Combobox } from "@/components/ui/combobox";
import { DisclosureDropdown } from "@/components/ui/disclosure";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { useWindowControls } from "@/features/workbench/titlebar/hooks/use-window-controls";
import { WindowControls } from "@/features/workbench/titlebar/ui/window-controls";

export function DesignToolbar({ onClose }: { onClose: () => void }) {
    const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();

    return (
        <div
            className="relative flex h-12 shrink-0 items-stretch border-b border-border"
            data-tauri-drag-region
        >
            <div className="relative z-10 flex h-full min-w-0 items-center gap-1.5 pl-2" data-no-drag>
                <Button variant="ghost" size="icon" aria-label="Back to chat" onClick={onClose}>
                    <Icon icon={RiLogoutBoxLine} size={ICON_SIZE_SM} />
                </Button>
                <span className="text-md pl-1 text-text-primary">Dawn</span>
                <span className="text-sm text-text-secondary">Draft</span>
                <DisclosureDropdown
                    variant="ghost"
                    icon={RiMoreLine}
                    toggleText="More"
                    textSrOnly
                    items={[
                        { text: "Rename" },
                        { text: "Duplicate" },
                    ]}
                />
            </div>

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="pointer-events-auto flex items-center gap-1.5" data-no-drag>
                    <Combobox
                        variant="ghost"
                        size="xs"
                        toggleText="Default"
                        items={[{ value: "default", text: "Default" }]}
                        value="default"
                    />
                    <Combobox
                        variant="ghost"
                        size="xs"
                        icon={RiHomeLine}
                        toggleText="Home page"
                        items={[{ value: "home", text: "Home page" }]}
                        value="home"
                    />
                </div>
            </div>

            <div className="relative z-10 ml-auto flex h-full items-center gap-1 pr-0" data-no-drag>
                <Button variant="secondary" size="sm">
                    Publish
                </Button>
                <Button variant="confirm" size="sm">
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
