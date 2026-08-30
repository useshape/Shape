"use client";

import { useState, useEffect } from "react";
import { useProjectState, commands, getProjectSnapshot } from "@/lib/backend";
import { usePathname } from "next/navigation";
import { AgentLayout, openProject, normalizeProjectPath } from "@/features/agent";
import { dispatchShortcutAction } from "@/lib/ui/shortcut-actions";
import { upsertRepoHistory } from "@/lib/repo-history";
import { saveLastProject, loadLastProject } from "@/lib/last-project";
import { clearClosedTabs } from "@/lib/closed-tabs";
import { isMainTauriWindow, isTauriRuntime } from "@/lib/tauri-window";

function TauriShortcutBridge() {
    useEffect(() => {
        let unlistenFind: (() => void) | undefined;
        let unlistenReplace: (() => void) | undefined;
        let unlistenSaveAll: (() => void) | undefined;

        void import("@tauri-apps/api/event").then(({ listen }) => {
            void listen("open-find-in-files", () => {
                dispatchShortcutAction("Find in Files", "Ctrl+Shift+F");
            }).then((fn) => { unlistenFind = fn; });
            void listen("open-replace-in-files", () => {
                dispatchShortcutAction("Replace in Files", "Ctrl+H");
            }).then((fn) => { unlistenReplace = fn; });
            void listen("save-all-request", () => {
                window.dispatchEvent(new Event("save-all-request"));
            }).then((fn) => { unlistenSaveAll = fn; });
        });

        return () => {
            unlistenFind?.();
            unlistenReplace?.();
            unlistenSaveAll?.();
        };
    }, []);

    return null;
}

function ProjectOpenHost() {
    const { project_path } = useProjectState();

    useEffect(() => {
        if (!project_path) return;
        upsertRepoHistory(project_path);
        saveLastProject(project_path);
        clearClosedTabs();
    }, [project_path]);

    useEffect(() => {
        const handleEvent = (e: Event) => {
            const custom = e as CustomEvent<{ path: string }>;
            if (custom.detail?.path) void openProject(custom.detail.path);
        };
        window.addEventListener("shape-open-project", handleEvent);
        return () => window.removeEventListener("shape-open-project", handleEvent);
    }, []);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                if (getProjectSnapshot().project_path) return;
                if (!isTauriRuntime()) return;
                const isMain = await isMainTauriWindow();
                if (!isMain || cancelled) return;
                const fresh = await commands.isFreshWindow().catch(() => false);
                if (fresh || cancelled) return;
                const last = loadLastProject();
                if (!last || cancelled) return;
                await openProject(last);
            } catch {
                /* ignore */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    return null;
}

export default function Main({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    useEffect(() => {
        const handleOpenSettings = () => {
            void import("@/lib/open-settings").then(({ openSettingsWindow }) => openSettingsWindow());
        };
        const handleOpenFileRequest = async () => {
            const { open } = await import("@tauri-apps/plugin-dialog");
            const selected = await open({ directory: false, multiple: false });
            if (typeof selected === "string") {
                const name = selected.split(/[\\/]/).pop() || selected;
                await commands.openFile(selected, name);
            }
        };
        const handleOpenFolderRequest = async () => {
            const { open } = await import("@tauri-apps/plugin-dialog");
            const selected = await open({ directory: true, multiple: false });
            if (typeof selected === "string" && selected.trim()) {
                await openProject(normalizeProjectPath(selected));
            }
        };

        window.addEventListener("shape-open-settings", handleOpenSettings);
        window.addEventListener("open-file-request", handleOpenFileRequest);
        window.addEventListener("open-folder-request", handleOpenFolderRequest);

        return () => {
            window.removeEventListener("shape-open-settings", handleOpenSettings);
            window.removeEventListener("open-file-request", handleOpenFileRequest);
            window.removeEventListener("open-folder-request", handleOpenFolderRequest);
        };
    }, []);

    if (
        pathname === "/settings" || pathname === "/settings/" || pathname.startsWith("/settings/")
        || pathname === "/branch" || pathname === "/branch/" || pathname.startsWith("/branch/")
        || pathname === "/git" || pathname === "/git/" || pathname.startsWith("/git/")
        || pathname === "/popout" || pathname.startsWith("/popout/")
    ) {
        return <main className="flex h-full w-full flex-col overflow-hidden">{children}</main>;
    }

    return (
        <div
            className="relative flex min-h-0 flex-1 flex-row overflow-hidden bg-background text-md text-text-primary"
            data-workbench-main
        >
            <div className="relative z-10 flex min-w-0 flex-1 overflow-hidden">
                <AgentLayout>{children}</AgentLayout>
            </div>
            <ProjectOpenHost />
            <TauriShortcutBridge />
        </div>
    );
}
