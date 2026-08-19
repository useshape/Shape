"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ONBOARDING_CONFIG, isOnboardingComplete } from "@/features/onboarding/config";
import Main from "@/components/layout/main";
import { Titlebar, Status } from "@/features/workbench";
import { LoadingProvider } from "@/features/loading/context";
import { getProjectSnapshot, subscribeProjectState } from "@/lib/backend";
import { NotificationProvider } from "@/components/ui/notification";
import { GlobalContextMenu } from "@/core/providers/menu";
import { EditorViewProvider, EditorSplitProvider } from "@/core/providers/editor";
import { LayoutProvider, useLayout } from "@/core/providers/layout";
import { ChatStreamProvider } from "@/features/chat/lib/chat-stream-store";
import { initSettings } from "@/lib/settings";
import { initGitHubAuth } from "@/lib/github-auth/store";
import { LoginPromptDialog } from "@/features/workbench/ui/login-prompt-dialog";
import { WorkspaceTrustHost } from "@/features/workbench/ui/workspace-trust-dialog";
import { UpdateBootstrap } from "@/features/workbench/update-bootstrap";
import { InlineEditHost } from "@/features/editor/ui/inline-edit/inline-edit-host";
import { DesignPreviewCaptureHost } from "@/features/chat/ui/design-capture";
import { ProjectStatsActivityTracker } from "@/features/stats/ui/activity-tracker";
import { installBenignErrorFilters } from "@/lib/editor/benign-errors";
import { isMainTauriWindow, isTauriRuntime } from "@/lib/tauri-window";
import { FilterProvider } from "@/features/git/ui/manager/filter-context";
import { SuppressNativeTooltips } from "@/components/ui/suppress-native-tooltips";

function CommandPaletteBridge() {
    const CommandPalette = React.useMemo(
        () => React.lazy(() => import("@/features/editor/ui/main/ui/cmd-palette").then((m) => ({ default: m.CommandPalette }))),
        [],
    );
    return (
        <React.Suspense fallback={null}>
            <CommandPalette />
        </React.Suspense>
    );
}

function pathMatches(pathname: string | null, base: string) {
    if (!pathname) return false;
    return pathname === base || pathname === `${base}/` || pathname.startsWith(`${base}/`);
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    // Prod static export uses trailing slashes (`/settings/`); match both forms.
    const isOnboarding = pathMatches(pathname, "/onboarding");
    const isSettings = pathMatches(pathname, "/settings");
    const isBranch = pathMatches(pathname, "/branch") || pathMatches(pathname, "/git");
    const isStats = pathMatches(pathname, "/stats");
    const isPopout = pathMatches(pathname, "/popout");

    useEffect(() => {
        // Kick vscode-api init immediately (module load order beats Monaco).
        // This is the single authoritative warmup trigger — Monaco setup and
        // per-file LSP connect just await the same in-flight/completed promise.
        void import("@/features/editor/lsp/lsp-client").then(({ LspClientManager }) => {
            void LspClientManager.warmupServices();
        });
        void import("@/features/preview/design-mode/bridge-script").then(({ DESIGN_BRIDGE_SCRIPT }) => {
            void import("@/lib/backend").then(({ commands }) => {
                void commands.registerDesignBridge(DESIGN_BRIDGE_SCRIPT).catch(() => {});
            });
        });

        const bootstrap = async () => {
            void initSettings();
            initGitHubAuth();
            void import("@/lib/shape-auth/store").then(({ initShapeAuth }) => initShapeAuth());

            const isMain = !isTauriRuntime() || await isMainTauriWindow();
            if (!isMain) return;
            void import("@/lib/telemetry").then(({ initTelemetry, captureTelemetry }) => {
                initTelemetry();
                void captureTelemetry("ide_launched");
            });
            // Do not stop chat, kill PTYs, or abort preview captures on mount.
            // The Rust backend outlives a webview reload; ChatStreamProvider
            // resyncs an in-flight turn. Calling stop/pty_kill_all here caused
            // a launch loop on Windows (invalid window handle → reload → stop).
            void import("@/features/terminal/ui/terminal").then(({ reapOrphanedTerminalSessions }) => {
                reapOrphanedTerminalSessions();
            });
        };

        void bootstrap();
    }, []);

    // Tear down LSP connections/PTY servers when the open project changes.
    // Editor tabs track this too (scoped to package root), but that state
    // lives on a per-component ref — if every tab closes and reopens for a
    // different project the ref resets and that teardown never fires. This
    // app-level listener is the one path that always runs.
    useEffect(() => {
        let previousProjectPath: string | null | undefined;

        const teardownLsp = () => {
            void import("@/features/editor/lsp/lsp-client").then(({ LspClientManager }) => {
                void LspClientManager.disposeAll();
            });
            void import("@/lib/backend").then(({ commands }) => {
                commands.lspStopAll().catch(() => { });
            });
        };

        const unsubscribe = subscribeProjectState(() => {
            const next = getProjectSnapshot().project_path;
            if (previousProjectPath !== undefined && next !== previousProjectPath) {
                teardownLsp();
            }
            previousProjectPath = next;
        });

        return unsubscribe;
    }, []);

    // Re-ensure benign error filters (idempotent; instrumentation-client runs earlier).
    useEffect(() => {
        installBenignErrorFilters();
    }, []);

    useEffect(() => {
        if (isOnboarding || isSettings || isBranch || isStats || isPopout) return;
        let unlisten: (() => void) | undefined;
        let cancelled = false;

        void (async () => {
            try {
                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                const { confirm } = await import("@tauri-apps/plugin-dialog");
                const win = getCurrentWindow();
                if (win.label !== "main") return;

                unlisten = await win.onCloseRequested(async (event) => {
                    const { getProjectSnapshot, commands } = await import("@/lib/backend");
                    const dirty = getProjectSnapshot().open_files.filter((f) => f.is_dirty);
                    if (dirty.length === 0) return;

                    event.preventDefault();
                    const save = await confirm(
                        dirty.length === 1
                            ? `Save changes to ${dirty[0].name || dirty[0].path} before closing?`
                            : `Save changes to ${dirty.length} files before closing?`,
                        {
                            title: "Unsaved changes",
                            kind: "warning",
                            okLabel: "Save",
                            cancelLabel: "Don't save",
                        },
                    );

                    if (save) {
                        window.dispatchEvent(new Event("save-all-request"));
                        // Give save-all a moment; then close.
                        await new Promise((r) => setTimeout(r, 400));
                    } else {
                        const { clearDirtyBuffer } = await import("@/lib/dirty-buffers");
                        for (const f of dirty) {
                            clearDirtyBuffer(f.path);
                            void commands.markFileDirty(f.path, false);
                        }
                    }
                    if (!cancelled) await win.destroy();
                });
            } catch {
                /* browser / non-tauri */
            }
        })();

        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, [isOnboarding, isSettings, isBranch, isStats, isPopout]);

    // Block the native WebView context menu without breaking Radix menus.
    // Must be bubble phase: Radix opens on the target first; capture+preventDefault
    // made Radix skip open (it ignores events that are already defaultPrevented).
    useEffect(() => {
        const blockNative = (e: Event) => {
            e.preventDefault();
        };
        window.addEventListener("contextmenu", blockNative, false);
        return () => window.removeEventListener("contextmenu", blockNative, false);
    }, []);

    useEffect(() => {
        if (isOnboarding) return;

        const init = async () => {
            const { listen } = await import("@tauri-apps/api/event");
            const { getCurrentWindow, getAllWindows } = await import("@tauri-apps/api/window");

            try {
                const currentWindow = getCurrentWindow();
                if (currentWindow.label !== "main") return;

                const windows = await getAllWindows();
                const skipOnboarding = !ONBOARDING_CONFIG.enabled || isOnboardingComplete();

                if (!skipOnboarding) {
                    const onboarding = windows.find((w: { label: string | Promise<string> }) => w.label === "onboarding");
                    if (onboarding) {
                        await onboarding.show();
                        await onboarding.setFocus();
                    }

                    await listen("onboarding-complete", async () => {
                        const { refreshShapeAuth } = await import("@/lib/shape-auth/store");
                        await refreshShapeAuth();
                        await currentWindow.show();
                        await currentWindow.setFocus();
                    });
                } else {
                    const onboarding = windows.find((w: { label: string | Promise<string> }) => w.label === "onboarding");
                    if (onboarding) {
                        await onboarding.close();
                    }

                    const { initSettings } = await import("@/lib/settings");
                    await initSettings();
                    await currentWindow.show();
                }
            } catch (e) {
                console.error("Failed to manage window flow:", e);
            }
        };
        void init();
    }, [isOnboarding]);

    if (isOnboarding) {
        return (
            <div className="w-full h-screen flex flex-col font-sans text-text-primary text-sm overflow-hidden">
                <main className="flex-1 overflow-hidden min-h-0">
                    {children}
                </main>
            </div>
        );
    }

    if (isPopout) {
        return (
            <LoadingProvider>
                <NotificationProvider>
                    <SuppressNativeTooltips />
                    <GlobalContextMenu>
                        <EditorViewProvider>
                            <EditorSplitProvider>
                                <div
                                    id="shape-popout"
                                    className="flex h-screen w-full flex-col overflow-hidden bg-titlebar font-sans text-sm text-text-primary select-none"
                                >
                                    <Titlebar focus />
                                    <main className="min-h-0 flex-1 overflow-hidden bg-editor">
                                        {children}
                                    </main>
                                    <CommandPaletteBridge />
                                </div>
                            </EditorSplitProvider>
                        </EditorViewProvider>
                    </GlobalContextMenu>
                </NotificationProvider>
            </LoadingProvider>
        );
    }

    if (isSettings || isBranch || isStats) {
        const windowTitle = isBranch ? "Git" : isStats ? "Statistics" : "Settings";
        const body = (
            <div id="shape-settings" className="flex h-screen w-full flex-col overflow-hidden bg-background font-sans text-sm text-text-primary select-none">
                <Titlebar settings title={windowTitle} />
                <main className="min-h-0 flex-1 overflow-hidden bg-background">
                    {children}
                </main>
            </div>
        );
        return (
            <LoadingProvider>
                <NotificationProvider>
                    <SuppressNativeTooltips />
                    <GlobalContextMenu>
                        {isBranch ? <FilterProvider>{body}</FilterProvider> : body}
                    </GlobalContextMenu>
                </NotificationProvider>
            </LoadingProvider>
        );
    }

    return (
        <LoadingProvider>
                <NotificationProvider>
                    <SuppressNativeTooltips />
                    <LayoutProvider>
                    <GlobalContextMenu>
                        <EditorViewProvider>
                            <EditorSplitProvider>
                                <ChatStreamProvider>
                                    <Content>
                                        {children}
                                    </Content>
                                </ChatStreamProvider>
                            </EditorSplitProvider>
                        </EditorViewProvider>
                    </GlobalContextMenu>
                </LayoutProvider>
            </NotificationProvider>
        </LoadingProvider>
    );
}

function Content({ children }: { children: React.ReactNode }) {
    const { zenMode } = useLayout();

    return (
        <div
            id="shape-workbench"
            className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-background select-none"
        >
            <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col">
                <Titlebar />
                <Main>{children}</Main>
                {!zenMode && <Status />}
                <LoginPromptDialog />
                <WorkspaceTrustHost />
                <UpdateBootstrap />
                <InlineEditHost />
                <DesignPreviewCaptureHost />
                <ProjectStatsActivityTracker />
            </div>
        </div>
    );
}
