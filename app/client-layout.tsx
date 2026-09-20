"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ONBOARDING_CONFIG, isOnboardingComplete } from "@/features/onboarding/config";
import Main from "@/components/layout/main";
import { Titlebar } from "@/features/agent/workbench";
import { LoadingProvider } from "@/features/loading/context";
import { NotificationProvider } from "@/components/ui/notification";
import { GlobalContextMenu } from "@/core/providers/menu";
import { ChatStreamProvider } from "@/features/chat/lib/chat-stream-store";
import { initSettings } from "@/lib/settings";
import { initGitHubAuth } from "@/lib/github/store";
import { useShapeAuth } from "@/lib/cloud/store";
import { LoginPromptDialog } from "@/features/agent/workbench/ui/login-prompt-dialog";
import { CheckpointRestoreDialog } from "@/features/chat/ui/shell/checkpoint-restore-dialog";
import { UpdateBootstrap } from "@/features/agent/workbench/update-bootstrap";
import { installBenignErrorFilters } from "@/lib/editor/benign-errors";
import { isMainTauriWindow, isTauriRuntime } from "@/lib/window/tauri-window";
import { FilterProvider } from "@/features/git/ui/manager/filter-context";
import { SuppressNativeTooltips } from "@/components/ui/suppress-native-tooltips";
import { CommandPaletteBridge } from "@/features/agent/palette";
import Onboarding from "@/features/onboarding/ui/view";
import { PromoCardHost } from "@/features/promo/host";
import { DesignPreviewCaptureHost } from "@/features/chat/ui/design-capture";

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

    const isPopout = pathMatches(pathname, "/popout");
    const isPlayground = pathMatches(pathname, "/playground");

    useEffect(() => {
        const bootstrap = async () => {
            void initSettings();
            initGitHubAuth();
            void import("@/lib/cloud/store").then(({ initShapeAuth }) => initShapeAuth());

            // MCP: sync user mcp.json so the agent sees tools without visiting Settings.
            void (async () => {
                try {
                    const { loadMcpServersFromFile } = await import("@/lib/mcp/config");
                    const { commands } = await import("@/lib/backend");
                    const servers = await loadMcpServersFromFile();
                    if (servers.length > 0) await commands.syncMcpServers(servers);
                } catch {
                    /* ignore */
                }
            })();

            const isMain = !isTauriRuntime() || await isMainTauriWindow();
            if (!isMain) return;
            void import("@/lib/telemetry").then(({ initTelemetry, captureTelemetry }) => {
                initTelemetry();
                void captureTelemetry("agent_launched");
            });
        };

        void bootstrap();
    }, []);

    // Re-ensure benign error filters (idempotent; instrumentation-client runs earlier).
    useEffect(() => {
        installBenignErrorFilters();
    }, []);

    useEffect(() => {
        if (isOnboarding || isSettings || isBranch || isPopout || isPlayground) return;
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
                        const { clearDirtyBuffer } = await import("@/lib/workspace/dirty-buffers");
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
    }, [isOnboarding, isSettings, isBranch, isPopout, isPlayground]);

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
            const { getCurrentWindow, getAllWindows } = await import("@tauri-apps/api/window");

            try {
                const currentWindow = getCurrentWindow();
                if (currentWindow.label !== "main") return;

                // Prefer in-app onboarding — close the legacy onboarding webview if present.
                const windows = await getAllWindows();
                const onboarding = windows.find((w: { label: string | Promise<string> }) => w.label === "onboarding");
                if (onboarding) {
                    try {
                        await onboarding.close();
                    } catch {
                        /* ignore */
                    }
                }

                const { initSettings } = await import("@/lib/settings");
                await initSettings();
                await currentWindow.show();
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
                        <div
                            id="shape-popout"
                            className="relative flex h-screen w-full flex-col overflow-hidden bg-titlebar font-sans text-sm text-text-primary select-none"
                        >
                            <Titlebar focus />
                            <main className="min-h-0 flex-1 overflow-hidden bg-editor">
                                {children}
                            </main>
                            <CommandPaletteBridge />
                            <div id="shape-overlays" />
                        </div>
                    </GlobalContextMenu>
                </NotificationProvider>
            </LoadingProvider>
        );
    }

    if (isPlayground) {
        return (
            <div className="flex h-screen w-full flex-col overflow-hidden bg-background font-sans text-sm text-text-primary">
                <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
            </div>
        );
    }

    if (isSettings || isBranch) {
        const windowTitle = isBranch ? "Git" : "Settings";
        const body = (
            <div id="shape-settings" className="relative flex h-screen w-full flex-col overflow-hidden bg-background font-sans text-sm text-text-primary select-none">
                <Titlebar settings title={windowTitle} />
                <main className="min-h-0 flex-1 overflow-hidden bg-background" data-tauri-drag-region>
                    {children}
                </main>
                <RequireShapeLogin />
                <div id="shape-overlays" />
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
                <GlobalContextMenu>
                    <ChatStreamProvider>
                        <Content>{children}</Content>
                    </ChatStreamProvider>
                </GlobalContextMenu>
            </NotificationProvider>
        </LoadingProvider>
    );
}

function Content({ children }: { children: React.ReactNode }) {
    const [showOnboarding, setShowOnboarding] = React.useState(false);
    const auth = useShapeAuth();
    const needsLogin = !auth.loggedIn;

    React.useEffect(() => {
        const refresh = () => {
            setShowOnboarding(ONBOARDING_CONFIG.enabled && !isOnboardingComplete());
        };
        refresh();
        window.addEventListener("shape-onboarding-complete", refresh);
        window.addEventListener("shape-onboarding-restart", refresh);
        return () => {
            window.removeEventListener("shape-onboarding-complete", refresh);
            window.removeEventListener("shape-onboarding-restart", refresh);
        };
    }, []);

    return (
        <div
            id="shape-workbench"
            className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-background select-none"
        >
            <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col">
                <Main>{children}</Main>
                <LoginPromptDialog />
                <CheckpointRestoreDialog />
                <UpdateBootstrap />
                <CommandPaletteBridge />
                <PromoCardHost />
                <DesignPreviewCaptureHost />
            </div>
            {needsLogin ? (
                <div className="absolute inset-0 z-[80] bg-background">
                    {auth.isLoading ? null : (
                        <Onboarding embedded loginOnly />
                    )}
                </div>
            ) : showOnboarding ? (
                <div className="absolute inset-0 z-[80] bg-background">
                    <Onboarding
                        embedded
                        onComplete={() => setShowOnboarding(false)}
                    />
                </div>
            ) : null}
            <div id="shape-overlays" />
        </div>
    );
}

function RequireShapeLogin() {
    const auth = useShapeAuth();
    if (auth.loggedIn) return null;
    return (
        <div className="absolute inset-0 z-[80] bg-background">
            {auth.isLoading ? null : <Onboarding embedded loginOnly />}
        </div>
    );
}
