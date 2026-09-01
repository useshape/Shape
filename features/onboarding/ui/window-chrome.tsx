"use client";

import { useWindowControls } from "@/features/workbench/titlebar/hooks/use-window-controls";
import { WindowControls } from "@/features/workbench/titlebar/ui/window-controls";

/** Drag region + min / max / close only — no menu or logo. */
export function OnboardingWindowChrome() {
    const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();

    return (
        <div className="relative z-30 flex h-titlebar w-full shrink-0 select-none">
            <div
                className="absolute inset-0 z-0"
                data-tauri-drag-region
                aria-hidden
            />
            <div className="relative z-10 ml-auto flex h-full items-stretch px-1">
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
