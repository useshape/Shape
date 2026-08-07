"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";

import { useProjectState, commands } from "@/lib/backend";
import Tabs from "@/features/editor/ui/tabs/tabs";
import { CompactTabBar } from "@/features/editor/ui/tabs/compact-tab-bar";
import { useEditorSplit } from "@/core/providers/editor";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings";

import { upsertRepoHistory } from "@/lib/repo-history";
import { loadLastProject, saveLastProject } from "@/lib/last-project";
import { clearExtraWorkspaceFolders } from "@/lib/workspace-folders";
import { clearClosedTabs } from "@/lib/closed-tabs";
import { isWebProject } from "@/features/detection/lib/lib";
import { Warning } from "@/features/detection/ui/warning";
import { isSettingsTab } from "@/lib/settings-tab";
import { SettingsView } from "@/features/settings/ui/settings";
import { DesignPreviewView } from "@/features/chat/ui/blocks/preview";
import { parseDesignPreviewTabPath } from "@/lib/design-preview-tab";
import { isBrowserTab } from "@/lib/browser-tab";
import { BrowserView } from "@/features/preview/ui/browser-view";
import FileViewer from "@/features/editor/ui/main/editor";
import type { EditorGroupId } from "@/core/providers/editor";
import {
    WelcomeCloneDialog,
    WelcomeOpenDialog,
    WelcomeSshDialog,
} from "./welcome-dialogs";
import { WelcomeScreen, useRecentFolders } from "./welcome-screen";
import { notifyWorkspaceOpened } from "@/lib/workspace-trust";
import { loginGitHub } from "@/lib/github-auth/store";
import { isMainTauriWindow, isTauriRuntime } from "@/lib/tauri-window";

function renderEditorContent(path: string, group: EditorGroupId) {
    const designPreviewId = parseDesignPreviewTabPath(path);
    if (designPreviewId) return <DesignPreviewView sessionId={designPreviewId} />;
    if (isBrowserTab(path)) return <BrowserView />;
    if (isSettingsTab(path)) return <SettingsView />;
    return <FileViewer path={path} group={group} />;
}

function EditorGroupPane({
    group,
    showActions,
}: {
    group: EditorGroupId;
    showActions?: boolean;
}) {
    const { splitEnabled, focusedGroup, setFocusedGroup, getGroupActiveFile } = useEditorSplit();
    const path = getGroupActiveFile(group);
    const settings = useSettings();
    const compactTabs = settings.editor.compactTabs;

    return (
        <div
            className={cn(
                "flex flex-col h-full w-full min-w-0 overflow-hidden",
                splitEnabled && focusedGroup === group && "ring-1 ring-inset ring-accent/20"
            )}
            onMouseDownCapture={() => {
                if (splitEnabled && focusedGroup !== group) setFocusedGroup(group);
            }}
        >
            {!compactTabs ? <Tabs group={group} showActions={showActions} /> : null}
            <div className="relative flex flex-1 min-h-0 flex-col overflow-hidden">
                {compactTabs ? <CompactTabBar group={group} showActions={showActions} /> : null}
                {path ? (
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        {renderEditorContent(path, group)}
                    </div>
                ) : splitEnabled ? (
                    <div className="flex-1 flex items-center justify-center text-sm text-text-muted h-full">
                        Open a file in this group
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function SplitEditorLayout({ focusedGroup }: { focusedGroup: EditorGroupId }) {
    const [ratio, setRatio] = useState(0.5);
    const dragging = React.useRef(false);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragging.current) return;
            const container = document.getElementById("editor-split-root");
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const next = Math.min(0.75, Math.max(0.25, (e.clientX - rect.left) / rect.width));
            setRatio(next);
        };
        const onUp = () => {
            dragging.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, []);

    return (
        <div id="editor-split-root" className="flex h-full w-full min-w-0 overflow-hidden">
            <div className="min-w-0 overflow-hidden" style={{ flex: ratio }}>
                <EditorGroupPane group="left" showActions={focusedGroup === "left"} />
            </div>
            <div
                className="w-1 shrink-0 cursor-col-resize bg-border-subtle/40 hover:bg-accent/40 transition-colors"
                onMouseDown={() => {
                    dragging.current = true;
                    document.body.style.cursor = "col-resize";
                    document.body.style.userSelect = "none";
                }}
            />
            <div className="min-w-0 overflow-hidden" style={{ flex: 1 - ratio }}>
                <EditorGroupPane group="right" showActions={focusedGroup === "right"} />
            </div>
        </div>
    );
}

export default function Home() {
    const { project_path, active_file, open_files } = useProjectState();
    const [warningOpen, setWarningOpen] = useState(false);
    const [pendingPath, setPendingPath] = useState<string | null>(null);
    const [cloneOpen, setCloneOpen] = useState(false);
    const [openProjectOpen, setOpenProjectOpen] = useState(false);
    const [sshOpen, setSshOpen] = useState(false);
    const recentFolders = useRecentFolders();
    const { splitEnabled, focusedGroup } = useEditorSplit();
    const [restoringProject, setRestoringProject] = useState(true);

    useEffect(() => {
        if (!project_path) return;
        upsertRepoHistory(project_path);
        saveLastProject(project_path);
        clearClosedTabs();
    }, [project_path]);

    const emitWorkspaceOpened = useCallback((path: string) => {
        notifyWorkspaceOpened(path);
    }, []);

    const handleOpenProject = useCallback(async (path: string) => {
        const normalized = path.trim().replace(/[\\/]+$/, "");
        clearExtraWorkspaceFolders();
        const isWeb = await isWebProject(normalized);
        const ignoredProjects = JSON.parse(localStorage.getItem("ignored-non-web-projects") || "[]");
        const isIgnored = ignoredProjects.includes(normalized);

        if (isWeb || isIgnored) {
            commands.setProjectPath(normalized);
            emitWorkspaceOpened(normalized);
        } else {
            setPendingPath(normalized);
            setWarningOpen(true);
        }
    }, [emitWorkspaceOpened]);

    // Restore last project on cold start of the main window only.
    // New Window launches with --fresh-window and stays on the welcome screen.
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                if (!isTauriRuntime()) return;
                const isMain = await isMainTauriWindow();
                if (!isMain || cancelled) return;
                const fresh = await commands.isFreshWindow().catch(() => false);
                if (fresh || cancelled) return;
                const last = loadLastProject();
                if (!last || cancelled) return;
                await handleOpenProject(last);
            } finally {
                if (!cancelled) setRestoringProject(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [handleOpenProject]);

    useEffect(() => {
        const handleEvent = (e: Event) => {
            const custom = e as CustomEvent<{ path: string }>;
            if (custom.detail?.path) handleOpenProject(custom.detail.path);
        };
        window.addEventListener("shape-open-project", handleEvent);
        return () => window.removeEventListener("shape-open-project", handleEvent);
    }, [handleOpenProject]);

    const warningDialog = pendingPath ? (
        <Warning
            isOpen={warningOpen}
            projectPath={pendingPath}
            onCancel={() => { setWarningOpen(false); setPendingPath(null); }}
            onContinue={(neverShowAgain) => {
                if (neverShowAgain) {
                    const ignored = JSON.parse(localStorage.getItem("ignored-non-web-projects") || "[]");
                    if (!ignored.includes(pendingPath)) {
                        ignored.push(pendingPath);
                        localStorage.setItem("ignored-non-web-projects", JSON.stringify(ignored));
                    }
                }
                commands.setProjectPath(pendingPath!);
                emitWorkspaceOpened(pendingPath!);
                setWarningOpen(false);
                setPendingPath(null);
            }}
        />
    ) : null;

    const hasOpenEditor = Boolean(active_file || open_files[0]?.path);

    if (restoringProject && !project_path) {
        return (
            <div className="flex h-full items-center justify-center bg-editor text-sm text-text-muted">
                Opening project…
            </div>
        );
    }

    if (hasOpenEditor) {
        return (
            <>
                <div className="h-full w-full min-w-0 overflow-hidden">
                    {splitEnabled ? <SplitEditorLayout focusedGroup={focusedGroup} /> : (
                        <EditorGroupPane group="left" showActions />
                    )}
                </div>
                {warningDialog}
            </>
        );
    }

    return (
        <>
            {!project_path ? (
                <WelcomeScreen
                    recentFolders={recentFolders}
                    onOpenProject={(path) => void handleOpenProject(path)}
                    onPickFolder={() => setOpenProjectOpen(true)}
                    onClone={() => setCloneOpen(true)}
                    onSsh={() => setSshOpen(true)}
                    onConnectGitHub={() => void loginGitHub()}
                />
            ) : (
                <div className="flex min-h-full flex-col items-center justify-center bg-editor px-6 py-10 text-text-secondary select-none">
                    <p className="w-full max-w-[28rem] text-center text-sm leading-relaxed text-text-muted">
                        Open a file from the explorer or press{" "}
                        <kbd className="rounded border border-border-subtle bg-panel px-1.5 py-0.5 text-xs text-text-secondary">
                            Ctrl+P
                        </kbd>{" "}
                        to start coding.
                    </p>
                </div>
            )}

            <WelcomeOpenDialog
                open={openProjectOpen}
                onOpenChange={setOpenProjectOpen}
                recentFolders={recentFolders}
                onOpen={(path) => void handleOpenProject(path)}
            />
            <WelcomeCloneDialog
                open={cloneOpen}
                onOpenChange={setCloneOpen}
                recentFolders={recentFolders}
                onCloned={(path) => void handleOpenProject(path)}
            />
            <WelcomeSshDialog open={sshOpen} onOpenChange={setSshOpen} />
            {warningDialog}
        </>
    );
}
