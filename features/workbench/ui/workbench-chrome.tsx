"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

/** Activity-column top: logo centered in the activity rail (fully draggable). */
export function WorkbenchActivityChrome() {
    const logoH = 16;
    const logoW = Math.round(logoH * LOGO_ASPECT_RATIO);
    return (
        <div
            className="relative z-20 flex h-titlebar w-full shrink-0 items-center justify-center"
            data-tauri-drag-region
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src="/logos/logo.svg"
                alt="Shape"
                width={logoW}
                height={logoH}
                className="pointer-events-none relative z-10 block logo-invert"
                draggable={false}
            />
        </div>
    );
}

/**
 * Shared top chrome over primary sidebar + editor (File/Edit/View…).
 * The whole strip is a drag region; interactive controls opt out via CSS.
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
    const spacerRef = useRef<HTMLDivElement>(null);
    const [omnibarWidth, setOmnibarWidth] = useState(280);

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

    useEffect(() => {
        const el = spacerRef.current;
        if (!el) return;
        const measure = () => {
            const free = el.clientWidth;
            if (free < 152) setOmnibarWidth(0);
            else setOmnibarWidth(Math.min(280, free - 16));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div
            className="relative z-20 flex h-titlebar w-full shrink-0 items-stretch border-b border-border bg-panel"
            data-tauri-drag-region
        >
            <div className="relative z-10 flex shrink-0 items-center gap-0.5 pl-1" data-no-drag>
                <TitlebarSidebarToggle />
                <TitlebarMenubar
                    windowWidth={windowWidth}
                    onAction={(label) => void handleMenuClick(label)}
                    repoHistory={repoHistory}
                    onClearHistory={clearHistory}
                />
            </div>
            {/* Free space stays a drag region (attribute inherited from parent). */}
            <div ref={spacerRef} className="relative z-0 min-w-0 flex-1" data-tauri-drag-region>
                {omnibarWidth > 0 ? (
                    <div
                        className="absolute inset-y-0 right-0 z-10 flex items-center px-1"
                        style={{ width: omnibarWidth + 8 }}
                        data-no-drag
                    >
                        <div className="w-full min-w-0" style={{ width: omnibarWidth }}>
                            <CommandOmnibar />
                        </div>
                    </div>
                ) : null}
            </div>
            <div className="relative z-10 flex shrink-0 items-stretch justify-end" data-no-drag>
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

/**
 * Full-height column shell for Settings / Git / Stats.
 * Left chrome shows the window name; right chrome is drag + optional toolbar.
 */
export function StandaloneWindowShell({
    windowTitle,
    contentTitle,
    sidebar,
    toolbar,
    sidebarHeader,
    children,
}: {
    /** Name of the window — shown in the left column top chrome. */
    windowTitle: string;
    /** Optional section title in the content column (omit to avoid duplicating panel headers). */
    contentTitle?: string;
    sidebar: ReactNode;
    toolbar?: ReactNode;
    sidebarHeader?: ReactNode;
    children: ReactNode;
}) {
    const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();

    return (
        <div className="flex h-full w-full min-w-0 overflow-hidden bg-editor select-none">
            <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-panel">
                <div
                    className="relative z-20 flex h-titlebar w-full shrink-0 items-center gap-2 border-b border-border px-3"
                    data-tauri-drag-region
                >
                    <span className="min-w-0 truncate text-sm text-text-primary pointer-events-none">
                        {windowTitle}
                    </span>
                    {sidebarHeader ? (
                        <div className="ml-auto flex shrink-0 items-center" data-no-drag>
                            {sidebarHeader}
                        </div>
                    ) : null}
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{sidebar}</div>
            </aside>
            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-editor">
                <div
                    className="relative z-20 flex h-titlebar w-full shrink-0 items-stretch border-b border-border"
                    data-tauri-drag-region
                >
                    {contentTitle ? (
                        <div className="relative z-10 flex min-w-0 flex-1 items-center px-3 text-sm text-text-primary pointer-events-none">
                            {contentTitle}
                        </div>
                    ) : (
                        <div className="min-w-0 flex-1" data-tauri-drag-region />
                    )}
                    {toolbar ? (
                        <div className="relative z-10 flex shrink-0 items-center gap-1 px-1" data-no-drag>
                            {toolbar}
                        </div>
                    ) : null}
                    <div className="relative z-10 flex shrink-0 items-stretch" data-no-drag>
                        <WindowControls
                            isMaximized={isMaximized}
                            onMinimize={minimize}
                            onToggleMaximize={() => void toggleMaximize()}
                            onClose={close}
                        />
                    </div>
                </div>
                <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
            </section>
        </div>
    );
}
