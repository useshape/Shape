"use client";

import { useWindowControls } from "@/features/agent/workbench/titlebar/hooks/use-window-controls";
import { WindowControls } from "@/features/agent/workbench/titlebar/ui/window-controls";

/** Drag region + min / max / close only — no menu or logo. */
export function OnboardingWindowChrome() {
    const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();

    return (
        <div className="relative z-30 flex h-titlebar w-full shrink-0 select-none" data-tauri-drag-region>
            <div className="min-w-0 flex-1" aria-hidden />
            <div className="relative z-10 ml-auto flex h-full items-stretch px-1" data-no-drag>
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
