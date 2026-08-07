"use client";

import { useState, useEffect } from "react";
import { useProjectState, commands } from "@/lib/backend";
import { usePathname } from "next/navigation";
import { CommandPalette } from "@/features/editor/ui/main/ui/cmd-palette";
import { EditorLayout } from "@/features/editor/ui/layout";
import { ActivityBar } from "@/features/activity-bar";
import { dispatchShortcutAction } from "@/lib/ui/shortcut-actions";
import { useLayout } from "@/core/providers/layout";

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

export default function Main({ children }: { children: React.ReactNode }) {
    const { zenMode } = useLayout();
    const pathname = usePathname();
    const [activeTab, setActiveTab] = useState("explorer");

    const [leftOpen, setLeftOpen] = useState(true);
    const [rightOpen, setRightOpen] = useState(true);
    const [terminalOpen, setTerminalOpen] = useState(false);
    const [sidebarsFlipped, setSidebarsFlipped] = useState(false);

    useEffect(() => {
        try {
            setSidebarsFlipped(localStorage.getItem("shape-sidebars-flipped") === "true");
        } catch { /* ignore */ }
    }, []);

    const projectState = useProjectState();
    const { project_path } = projectState;

    useEffect(() => {
        const handleOpenSettings = () => {
            void import("@/lib/open-settings").then(({ openSettingsWindow }) => openSettingsWindow());
        };
        const handleOpenFileRequest = async () => {
            const { open } = await import("@tauri-apps/plugin-dialog");
            const selected = await open({ directory: false, multiple: false });
            if (typeof selected === "string") {
                const name = selected.split(/[\\/]/).pop() || selected;
                commands.openFile(selected, name);
            }
        };
        const handleOpenFolderRequest = async () => {
            const { open } = await import("@tauri-apps/plugin-dialog");
            const selected = await open({ directory: true, multiple: false });
            if (typeof selected === "string") {
                window.dispatchEvent(
                    new CustomEvent("shape-open-project", { detail: { path: selected } }),
                );
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

    useEffect(() => {
        const handleToggle = (e: Event) => {
            const custom = e as CustomEvent<{ id: string, value?: boolean }>;
            const { id, value } = custom.detail || {};

            if (id === "primary-sidebar") {
                setLeftOpen(prev => value !== undefined ? value : !prev);
            } else if (id === "panel") {
                setTerminalOpen(prev => value !== undefined ? value : !prev);
            } else if (id === "secondary-sidebar") {
                setRightOpen(prev => value !== undefined ? value : !prev);
            }
        };

        const handleSetTab = (e: Event) => {
            const custom = e as CustomEvent<string>;
            const tabId = custom.detail?.toLowerCase();
            if (!tabId) return;

            const normalizedTab = ["files", "explorer", "navigation", "navigator"].includes(tabId) ? "explorer" : tabId;
            setActiveTab(normalizedTab);

            if (["explorer", "source", "graph", "search", "outline"].includes(normalizedTab)) {
                if (!leftOpen && project_path) setLeftOpen(true);
            }
        };

        const handleSwapSidebars = () => {
            setSidebarsFlipped((prev) => {
                const next = !prev;
                try {
                    localStorage.setItem("shape-sidebars-flipped", String(next));
                } catch { /* ignore */ }
                return next;
            });
        };

        const handleRequestTab = () => {
            window.dispatchEvent(new CustomEvent("shape-active-tab", { detail: activeTab }));
        };

        window.addEventListener("shape-layout-toggle", handleToggle as EventListener);
        window.addEventListener("shape-set-active-tab", handleSetTab as EventListener);
        window.addEventListener("shape-swap-sidebars", handleSwapSidebars);
        window.addEventListener("shape-request-active-tab", handleRequestTab);

        return () => {
            window.removeEventListener("shape-layout-toggle", handleToggle as EventListener);
            window.removeEventListener("shape-set-active-tab", handleSetTab as EventListener);
            window.removeEventListener("shape-swap-sidebars", handleSwapSidebars);
            window.removeEventListener("shape-request-active-tab", handleRequestTab);
        };
    }, [leftOpen, activeTab, project_path]);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent("shape-active-tab", { detail: activeTab }));
    }, [activeTab]);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent("shape-layout-state", {
            detail: {
                primarySidebarOpen: leftOpen,
                panelOpen: terminalOpen,
                secondarySidebarOpen: rightOpen,
            }
        }));
    }, [leftOpen, terminalOpen, rightOpen]);

    if (
        pathname === "/settings" || pathname === "/settings/" || pathname.startsWith("/settings/")
        || pathname === "/branch" || pathname === "/branch/" || pathname.startsWith("/branch/")
        || pathname === "/git" || pathname === "/git/" || pathname.startsWith("/git/")
        || pathname === "/popout" || pathname.startsWith("/popout/")
    ) {
        return <main className="h-full w-full overflow-hidden flex flex-col">{children}</main>;
    }

    return (
        <div
            className="flex flex-row flex-1 min-h-0 overflow-hidden relative text-text-primary text-md bg-background"
            data-workbench-main
        >
            {!zenMode && (
                <div className="z-20 h-full shrink-0 bg-transparent">
                    <ActivityBar
                        activeTab={activeTab}
                        toggleTab={(id) => {
                            if (activeTab === id) {
                                window.dispatchEvent(
                                    new CustomEvent("shape-layout-toggle", {
                                        detail: { id: "primary-sidebar" },
                                    }),
                                );
                            } else {
                                window.dispatchEvent(
                                    new CustomEvent("shape-set-active-tab", { detail: id }),
                                );
                            }
                        }}
                    />
                </div>
            )}

            <div className="flex-1 flex overflow-hidden pointer-events-auto relative z-10 min-w-0">
                <EditorLayout
                    activeTab={activeTab}
                    leftOpen={zenMode ? false : leftOpen}
                    rightOpen={zenMode ? false : rightOpen}
                    terminalOpen={zenMode ? false : terminalOpen}
                    sidebarsFlipped={sidebarsFlipped}
                    setLeftOpen={setLeftOpen}
                    setRightOpen={setRightOpen}
                    setTerminalOpen={setTerminalOpen}
                >
                    {children}
                </EditorLayout>
            </div>

            <TauriShortcutBridge />
            <CommandPalette />
        </div>
    );
}
