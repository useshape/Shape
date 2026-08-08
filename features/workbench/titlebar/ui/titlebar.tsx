"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Icon } from "@/components/ui/icon";
import { useProjectState } from "@/lib/backend";
import { useKeyboardShortcuts } from "@/lib/ui/shortcuts";
import type { TitlebarProps } from "../types";
import { createMenuActionHandler } from "../menu-actions";
import { useWindowControls } from "../hooks/use-window-controls";
import { useRepoHistory } from "../hooks/use-repo-history";
import { useEditorBuffer } from "../hooks/use-editor-buffer";
import { TitlebarMenubar } from "../ui/app-menu";
import { CommandOmnibar } from "../ui/command-center";
import { AccountMenu } from "../ui/account-menu";
import { WindowControls } from "../ui/window-controls";
import { TitlebarLayoutControls, TitlebarSidebarToggle } from "../ui/layout-controls";
import { TitlebarUpdateButton } from "../ui/update-button";
import { TitlebarSearch } from "@/features/git/ui/manager/titlebar-search";

// logo.svg is 46x56 — width must scale with height to avoid Next Image's
// aspect-ratio warning (and the visual squish into a square icon).
const LOGO_ASPECT_RATIO = 46 / 56;

export default function Titlebar({ onboarding, settings, focus, title, onBack }: TitlebarProps) {
    useKeyboardShortcuts();

    const { active_file, project_path, open_files } = useProjectState();
    const isCompact = Boolean(onboarding || settings);
    const isFocus = Boolean(focus);
    const [windowWidth, setWindowWidth] = useState(1200);
    const showSearch = windowWidth >= 900;

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
        <div className="titlebar-container relative flex h-titlebar w-full shrink-0 select-none items-center bg-background text-sm font-normal leading-none text-text-primary">
            <div className="titlebar-drag-region absolute left-0 top-0 z-0 h-full w-full" data-tauri-drag-region />

            <div className="titlebar-left relative z-20 flex shrink-0 items-center">
                {!isCompact ? (
                    <>
                        <div className="flex shrink-0 items-center">
                            <div className="window-appicon flex h-full w-11 shrink-0 items-center justify-center">
                                <Image
                                    src="/logos/logo.svg"
                                    alt="Logo"
                                    width={Math.round(16 * LOGO_ASPECT_RATIO)}
                                    height={16}
                                    className="logo-invert rounded-sm"
                                />
                            </div>
                            {!isFocus ? <TitlebarSidebarToggle /> : null}
                        </div>
                        {!isFocus ? (
                            <TitlebarMenubar
                                windowWidth={windowWidth}
                                onAction={(label) => void handleMenuClick(label)}
                                repoHistory={repoHistory}
                                onClearHistory={clearHistory}
                            />
                        ) : null}
                    </>
                ) : isCompact ? (
                    <div className="relative z-20 flex h-full shrink-0 items-center">
                        <div className="window-appicon flex h-full w-11 shrink-0 items-center justify-center">
                            <Image
                                src="/logos/logo.svg"
                                alt="Logo"
                                width={Math.round(16 * LOGO_ASPECT_RATIO)}
                                height={16}
                                className="logo-invert rounded-sm"
                            />
                        </div>
                        {title ? (
                            <span className="pr-2 text-sm font-normal text-text-primary">{title}</span>
                        ) : null}
                    </div>
                ) : title ? (
                    <div className="flex items-center gap-1 px-4 text-sm font-normal text-text-primary">
                        {onBack && (
                            <button
                                type="button"
                                onClick={onBack}
                                className="-ml-2 -mt-0.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded text-text-muted transition-colors hover:bg-panel-hover hover:text-text-primary"
                            >
                                <Icon name="chevron_left" size={16} filled />
                            </button>
                        )}
                        <span>{title}</span>
                    </div>
                ) : null}
            </div>

            <div className="pointer-events-none min-w-0 flex-1" aria-hidden />

            <div className="titlebar-right relative z-20 flex h-full shrink-0 items-center gap-0.5 px-1">
                {settings && title === "Git" ? <TitlebarSearch /> : null}
                {!isCompact && !isFocus ? (
                    <>
                        {showSearch ? <CommandOmnibar /> : null}
                        <TitlebarUpdateButton />
                        <TitlebarLayoutControls />
                        <AccountMenu />
                    </>
                ) : null}
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
