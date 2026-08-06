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
import { AgentChatSearch } from "@/features/agent/ui/agent-chat-search";
import { AccountMenu } from "../ui/account-menu";
import { WindowControls } from "../ui/window-controls";
import { TitlebarLayoutControls, TitlebarSidebarToggle } from "../ui/layout-controls";
import { TitlebarUpdateButton } from "../ui/update-button";
import { TitlebarSearch } from "@/features/git/ui/manager/titlebar-search";
import { focusMainWindow } from "@/lib/open-agent-window";

const LOGO_ASPECT_RATIO = 46 / 56;

export default function Titlebar({ onboarding, settings, focus, agent, title, onBack }: TitlebarProps) {
    useKeyboardShortcuts();

    const { active_file, project_path, open_files } = useProjectState();
    const isCompact = Boolean(onboarding || settings);
    const isFocus = Boolean(focus);
    const [windowWidth, setWindowWidth] = useState(1200);
    const showSearch = agent ? windowWidth >= 640 : windowWidth >= 900;

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

    if (agent && !isCompact) {
        return (
            <div
                className="titlebar-container relative flex h-titlebar w-full shrink-0 select-none items-center border-b border-border bg-panel text-sm font-normal leading-none text-text-primary"
                data-tauri-drag-region
            >
                <div className="relative z-20 flex shrink-0 items-center gap-1 pl-1" data-no-drag>
                    <div className="window-appicon flex h-full w-11 shrink-0 items-center justify-center pointer-events-none">
                        <Image
                            src="/logos/logo.svg"
                            alt="Logo"
                            width={Math.round(16 * LOGO_ASPECT_RATIO)}
                            height={16}
                            className="logo-invert rounded-sm"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => void focusMainWindow()}
                        className="inline-flex h-7 items-center rounded-md px-2.5 text-sm font-medium text-text-secondary transition-[color,background-color] duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary"
                        title="Show IDE window"
                        aria-label="Show IDE window"
                    >
                        IDE
                    </button>
                </div>

                <div className="min-w-0 flex-1" data-tauri-drag-region aria-hidden />

                <div className="relative z-20 flex h-full shrink-0 items-center gap-0.5" data-no-drag>
                    {showSearch ? (
                        <div className="flex h-full items-center px-1">
                            <AgentChatSearch />
                        </div>
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

    return (
        <div
            className="titlebar-container relative flex h-titlebar w-full shrink-0 select-none items-center border-b border-border bg-panel text-sm font-normal leading-none text-text-primary"
            data-tauri-drag-region
        >
            <div className="relative z-20 flex shrink-0 items-center" data-no-drag>
                {!isCompact ? (
                    <>
                        <div className="flex shrink-0 items-center">
                            <div className="window-appicon flex h-full w-11 shrink-0 items-center justify-center pointer-events-none">
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
                ) : title ? (
                    <div className="flex items-center gap-2.5 px-3 py-1 text-sm text-text-primary pointer-events-none">
                        <Image
                            src="/logos/logo.svg"
                            alt="Logo"
                            width={Math.round(16 * LOGO_ASPECT_RATIO)}
                            height={16}
                            className="logo-invert rounded-sm"
                        />
                        <span>{title}</span>
                    </div>
                ) : null}
                {onBack ? (
                    <button
                        type="button"
                        onClick={onBack}
                        className="ml-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded text-text-muted transition-colors hover:bg-panel-hover hover:text-text-primary"
                    >
                        <Icon name="chevron_left" size={16} filled />
                    </button>
                ) : null}
            </div>

            <div className="min-w-0 flex-1" data-tauri-drag-region aria-hidden />

            <div className="relative z-20 flex h-full shrink-0 items-center" data-no-drag>
                {settings && title === "Git" ? (
                    <div className="flex h-full items-center px-1">
                        <TitlebarSearch />
                    </div>
                ) : null}
                {!isCompact && showSearch ? (
                    <div className="flex h-full w-[min(280px,28vw)] min-w-0 shrink items-center px-1">
                        <CommandOmnibar />
                    </div>
                ) : null}
                {!isCompact && !isFocus && (
                    <div className="action-toolbar-container hidden items-center gap-0.5 px-1 sm:flex">
                        <TitlebarUpdateButton />
                        <TitlebarLayoutControls />
                        <AccountMenu />
                    </div>
                )}
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
