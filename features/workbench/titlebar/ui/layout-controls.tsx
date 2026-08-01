"use client";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
    AnimatedPanelIcon,
    AnimatedSecondarySidebarIcon,
    AnimatedSidebarIcon,
} from "@/features/activity-bar";
import { useLayoutState } from "../hooks/use-layout-state";

const ICON_SIZE = 16;

const titlebarIconButtonClass =
    "flex items-center justify-center w-7 h-7 shrink-0 rounded cursor-pointer transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] text-text-muted hover:bg-panel-hover hover:text-text-primary";

function TitlebarLayoutButton({
    label,
    active,
    onClick,
    children,
}: {
    label: string;
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <Tooltip content={label} side="bottom">
            <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                onClick={onClick}
                className={cn(titlebarIconButtonClass, active && "text-text-primary")}
            >
                {children}
            </button>
        </Tooltip>
    );
}

/** Terminal and chat panel toggles for the titlebar right side. */
export function TitlebarLayoutControls() {
    const { layoutState, toggleLayout } = useLayoutState();

    return (
        <div className="flex items-center gap-0.5 px-1">
            <TitlebarLayoutButton
                label="Toggle Terminal"
                active={layoutState.panelOpen}
                onClick={() => toggleLayout("panel")}
            >
                <AnimatedPanelIcon active={layoutState.panelOpen} size={ICON_SIZE} />
            </TitlebarLayoutButton>
            <TitlebarLayoutButton
                label="Toggle AI Chat"
                active={layoutState.secondarySidebarOpen}
                onClick={() => toggleLayout("secondary-sidebar")}
            >
                <AnimatedSecondarySidebarIcon active={layoutState.secondarySidebarOpen} size={ICON_SIZE} />
            </TitlebarLayoutButton>
        </div>
    );
}

/** Primary sidebar toggle — sits next to the app logo. */
export function TitlebarSidebarToggle() {
    const { layoutState, toggleLayout } = useLayoutState();

    return (
        <Tooltip content="Toggle Sidebar" side="bottom">
            <button
                type="button"
                aria-label="Toggle Sidebar"
                aria-pressed={layoutState.primarySidebarOpen}
                onClick={() => toggleLayout("primary-sidebar")}
                className={cn(
                    titlebarIconButtonClass,
                    layoutState.primarySidebarOpen && "text-text-primary",
                )}
            >
                <AnimatedSidebarIcon active={layoutState.primarySidebarOpen} size={ICON_SIZE} />
            </button>
        </Tooltip>
    );
}

export { titlebarIconButtonClass, TitlebarLayoutButton };
