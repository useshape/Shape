"use client";

import { useEffect, useMemo, useState } from "react";
import { useProjectState } from "@/lib/backend";
import { useKeyboardShortcuts } from "@/lib/ui/shortcuts";
import { createMenuActionHandler } from "@/features/workbench/titlebar/menu-actions";
import { useWindowControls } from "@/features/workbench/titlebar/hooks/use-window-controls";
import { useRepoHistory } from "@/features/workbench/titlebar/hooks/use-repo-history";
import { useEditorBuffer } from "@/features/workbench/titlebar/hooks/use-editor-buffer";
import { TitlebarMenubar } from "@/features/workbench/titlebar/ui/app-menu";
import { CommandOmnibar } from "@/features/workbench/titlebar/ui/command-center";
import { AccountMenu } from "@/features/workbench/titlebar/ui/account-menu";
import { WindowControls } from "@/features/workbench/titlebar/ui/window-controls";
import {
    TitlebarLayoutControls,
    TitlebarSidebarToggle,
} from "@/features/workbench/titlebar/ui/layout-controls";
import { TitlebarUpdateButton } from "@/features/workbench/titlebar/ui/update-button";

const LOGO_ASPECT_RATIO = 46 / 56;

export function WorkbenchActivityChrome() {
    return (
        <div className="relative z-20 flex h-titlebar w-full shrink-0 items-stretch">
            <div className="titlebar-drag-region absolute inset-0 z-0" data-tauri-drag-region />
            <div className="relative z-10 flex shrink-0 items-center justify-center px-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/logos/logo.svg"
                    alt="Shape"
                    width={14}
                    height={Math.round(14 * LOGO_ASPECT_RATIO)}
                    className="logo-invert pointer-events-none"
                    draggable={false}
                />
            </div>
            <div className="pointer-events-none relative z-0 min-w-0 flex-1" aria-hidden />
        </div>
    );
}

/**
 * Center-column top chrome: app menu + omnibar + layout toggles.
 * Window controls sit here when the right rail is closed.
 */
export function WorkbenchCenterChrome({
    showWindowControls,
}: {
    showWindowControls: boolean;
}) {
    useKeyboardShortcuts();

    const { active_file, project_path, open_files } = useProjectState();
    const [windowWidth, setWindowWidth] = useState(1200);
    const { isMaximized, minimize, toggleMaximize, close, closeWindow } = useWindowControls();
    const { repoHistory, clearHistory } = useRepoHistory(project_path);
    const { readLatestContent } = useEditorBuffer();

    const handleMenuClick = useMemo(
        () =>
            createMenuActionHandler({
                projectPath: project_path,
                activeFile: active_file,
                openFiles: open_files,
                readLatestContent,
                closeWindow,
            }),
        [project_path, active_file, open_files, readLatestContent, closeWindow],
    );

    useEffect(() => {
        setWindowWidth(window.innerWidth);
        const onResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    useEffect(() => {
        const onSaveAll = () => void handleMenuClick("Save All");
        window.addEventListener("save-all-request", onSaveAll);
        return () => window.removeEventListener("save-all-request", onSaveAll);
    }, [handleMenuClick]);

    return (
        <div className="relative z-20 flex h-titlebar w-full shrink-0 items-stretch bg-editor">
            <div className="titlebar-drag-region absolute inset-0 z-0" data-tauri-drag-region />
            <div className="relative z-10 flex shrink-0 items-center gap-0.5 pl-1">
                <TitlebarSidebarToggle />
                <TitlebarMenubar
                    windowWidth={windowWidth}
                    onAction={(label) => void handleMenuClick(label)}
                    repoHistory={repoHistory}
                    onClearHistory={clearHistory}
                />
            </div>
            <div className="pointer-events-none relative z-0 min-w-0 flex-1" aria-hidden />
            <div className="relative z-10 flex shrink-0 items-stretch justify-end">
                <div className="pointer-events-none flex items-center px-1">
                    <div className="pointer-events-auto w-[min(280px,28vw)] min-w-0">
                        <CommandOmnibar />
                    </div>
                </div>
                <div className="action-toolbar-container hidden shrink-0 items-center gap-0.5 px-1 sm:flex">
                    <TitlebarUpdateButton />
                    <TitlebarLayoutControls />
                    <AccountMenu />
                </div>
                {showWindowControls ? (
                    <WindowControls
                        isMaximized={isMaximized}
                        onMinimize={minimize}
                        onToggleMaximize={() => void toggleMaximize()}
                        onClose={close}
                    />
                ) : null}
            </div>
        </div>
    );
}
