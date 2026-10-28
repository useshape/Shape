"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Chat from "@/features/chat/ui/chat";
import { useProjectState } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { ChatChromeTabs } from "./chat-tabs";
import { ChatSearch } from "@/features/chat/ui/shell/chat-search";
import { AgentWorkspace } from "./workspace";
import { AgentOverlayView, type AgentOverlay } from "./overlay";
import { DevRunHost } from "@/features/terminal/dev-run-host";
import { TerminalDock } from "./terminal-dock";
import { ProjectQuickPickHost } from "@/features/chat/ui/shell/project-pick";
import { TrustFolderHost } from "@/features/agent/workspace/trust-dialog";
import { startAgentBackgroundExitToasts } from "@/features/chat/lib/agent-terminal-notify";
import { useWindowControls } from "@/features/agent/workbench/titlebar/hooks/use-window-controls";
import { setWorkspaceMode, useWorkspaceMode, type WorkspaceModeId } from "@/lib/ui/workspace-mode";
import { WindowControls } from "@/features/agent/workbench/titlebar/ui/window-controls";

const MIN_WORKSPACE = 360;
const MIN_WORKSPACE_SOFT = 280;
const MIN_CHAT = 380;
const WORKSPACE_GUTTER = 12;
const WINDOW_MIN_HEIGHT = 500;
const WINDOW_MIN_WIDTH = 1000;
const MAX_WORKSPACE_RATIO = 0.72;
const MAX_WORKSPACE_PX = 1200;
const SPLASH_KEY = "shape-agent-splash-seen";

function layoutMinWidth(_sidebarOpen: boolean, workspaceOpen: boolean) {
    const sidebar = 0;
    const workspace = workspaceOpen ? MIN_WORKSPACE + WORKSPACE_GUTTER : 0;
    return Math.max(WINDOW_MIN_WIDTH, sidebar + MIN_CHAT + workspace);
}

/**
 * Agent view — chrome tabs across the top, chat underneath,
 * workspace on the right when a project is open.
 */
export function AgentLayout({ children }: { children: React.ReactNode }) {
    const { project_path, active_file } = useProjectState();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [workspaceOpen, setWorkspaceOpen] = useState(true);
    const [overlay, setOverlay] = useState<AgentOverlay>(null);
    const [workspaceWidth, setWorkspaceWidth] = useState(560);
    const [workspaceFits, setWorkspaceFits] = useState(true);
    const [splash, setSplash] = useState(false);
    const [splashVisible, setSplashVisible] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [chatSearch, setChatSearch] = useState(false);
    const dragging = useRef(false);
    const widthRef = useRef(560);

    useEffect(() => {
        try {
            const w = Number(localStorage.getItem("shape-agent-workspace-width"));
            if (w >= MIN_WORKSPACE && w <= MAX_WORKSPACE_PX) {
                setWorkspaceWidth(w);
                widthRef.current = w;
            }
            setWorkspaceOpen(localStorage.getItem("shape-agent-workspace") !== "false");
            setSidebarOpen(localStorage.getItem("shape-agent-sidebar") !== "false");
            if (sessionStorage.getItem(SPLASH_KEY) !== "1") {
                setSplash(true);
            }
        } catch {
            /* ignore */
        }
    }, []);

    useEffect(() => {
        const onMode = (event: Event) => {
            const id = (event as CustomEvent<{ id?: WorkspaceModeId }>).detail?.id;
            if (id === "Code" || id === "Chat") setWorkspaceMode(id);
        };
        window.addEventListener("shape-set-workspace-mode", onMode as EventListener);
        return () => window.removeEventListener("shape-set-workspace-mode", onMode as EventListener);
    }, []);

    // Warm start-command + route map when a project opens (or fingerprint changes).
    useEffect(() => {
        if (!project_path) return;
        void import("@/features/preview/lib/project-warm").then(({ warmProjectAnalysis }) => {
            void warmProjectAnalysis(project_path);
        });
    }, [project_path]);

    useEffect(() => startAgentBackgroundExitToasts(), []);

    useEffect(() => {
        const openSearch = () => setChatSearch(true);
        window.addEventListener("shape-open-chat-search", openSearch);
        return () => window.removeEventListener("shape-open-chat-search", openSearch);
    }, []);

    useEffect(() => {
        if (!splash) return;
        let t2: number | undefined;
        const raf = requestAnimationFrame(() => setSplashVisible(true));
        const t1 = window.setTimeout(() => {
            setSplashVisible(false);
            t2 = window.setTimeout(() => {
                try {
                    sessionStorage.setItem(SPLASH_KEY, "1");
                } catch {
                    /* ignore */
                }
                setSplash(false);
            }, 280);
        }, 700);
        return () => {
            cancelAnimationFrame(raf);
            if (t1 !== undefined) window.clearTimeout(t1);
            if (t2 !== undefined) window.clearTimeout(t2);
        };
    }, [splash]);

    const persistWorkspace = useCallback((next: boolean) => {
        setWorkspaceOpen(next);
        try {
            localStorage.setItem("shape-agent-workspace", String(next));
        } catch {
            /* ignore */
        }
    }, []);

    const clampWorkspace = useCallback(
        (x: number, winW = typeof window === "undefined" ? 1280 : window.innerWidth) => {
            const sidebar = 0;
            const maxByChat = Math.max(0, winW - sidebar - MIN_CHAT - WORKSPACE_GUTTER);
            const maxByRatio = Math.min(MAX_WORKSPACE_PX, Math.floor(winW * MAX_WORKSPACE_RATIO));
            const max = Math.min(maxByChat, maxByRatio);
            if (max < MIN_WORKSPACE_SOFT) return 0;
            return Math.min(max, Math.max(MIN_WORKSPACE_SOFT, x));
        },
        [],
    );

    const prevActiveFile = useRef<string | null>(null);
    useEffect(() => {
        if (!active_file || active_file === prevActiveFile.current) {
            prevActiveFile.current = active_file;
            return;
        }
        prevActiveFile.current = active_file;
        setOverlay(null);
        persistWorkspace(true);
        window.dispatchEvent(
            new CustomEvent("shape-open-workspace-file", { detail: { path: active_file } }),
        );
    }, [active_file, persistWorkspace]);

    useEffect(() => {
        const onView = (e: Event) => {
            const v = (e as CustomEvent<string>).detail;
            if (v === "editor") {
                setOverlay(null);
                persistWorkspace(true);
            }
            if (v === "chat") setOverlay(null);
        };
        const onFileDiff = () => {
            setOverlay(null);
            persistWorkspace(true);
        };
        window.addEventListener("shape-center-view", onView as EventListener);
        window.addEventListener("shape-open-file-diff", onFileDiff as EventListener);
        return () => {
            window.removeEventListener("shape-center-view", onView as EventListener);
            window.removeEventListener("shape-open-file-diff", onFileDiff as EventListener);
        };
    }, [persistWorkspace]);

    const toggleSidebar = useCallback(() => {
        setSidebarOpen((prev) => {
            const next = !prev;
            try {
                localStorage.setItem("shape-agent-sidebar", String(next));
            } catch {
                /* ignore */
            }
            return next;
        });
    }, []);

    const toggleWorkspace = useCallback(() => {
        if (!project_path) return;
        setWorkspaceOpen((prev) => {
            const next = !prev;
            try {
                localStorage.setItem("shape-agent-workspace", String(next));
            } catch {
                /* ignore */
            }
            return next;
        });
    }, [project_path]);

    useEffect(() => {
        const onTab = (e: Event) => {
            const tabId = (e as CustomEvent<string>).detail?.toLowerCase();
            if (!tabId || !project_path) return;
            if (tabId === "files" || tabId === "explorer") {
                setOverlay(null);
                persistWorkspace(true);
                return;
            }
            if (["preview", "browser", "source", "graph", "git", "prs", "pulls", "agents"].includes(tabId)) {
                setOverlay(null);
                persistWorkspace(true);
            }
        };
        const onToggle = (e: Event) => {
            const detail = (e as CustomEvent<{ id?: string; value?: boolean }>).detail;
            const id = detail?.id;
            if (id === "primary-sidebar" || id === "agent-sidebar") {
                toggleSidebar();
            }
            if (id === "secondary-sidebar" || id === "agent-workspace") {
                if (detail?.value === false) persistWorkspace(false);
                else if (detail?.value === true) persistWorkspace(true);
                else toggleWorkspace();
            }
            if (id === "panel" || id === "terminal") {
                setOverlay(null);
                return;
            }
            if (id === "files-mode" || id === "explorer") {
                setOverlay(null);
                persistWorkspace(true);
                window.setTimeout(() => {
                    window.dispatchEvent(
                        new CustomEvent("shape-set-active-tab", { detail: "files" }),
                    );
                }, 80);
            }
        };
        const onOverlay = (e: Event) => {
            const detail = (e as CustomEvent<AgentOverlay>).detail;
            if (!detail || !detail.type) {
                setOverlay(null);
                return;
            }
            // Git Manager overlay removed — Graph lives in the right workspace tab.
            if (detail.type === "git") {
                setOverlay(null);
                persistWorkspace(true);
                window.setTimeout(() => {
                    window.dispatchEvent(
                        new CustomEvent("shape-set-active-tab", { detail: "graph" }),
                    );
                }, 80);
                return;
            }
            setOverlay(detail);
            setSidebarOpen(true);
            try {
                localStorage.setItem("shape-agent-sidebar", "true");
            } catch {
                /* ignore */
            }
        };
        const onPrs = () => {
            setOverlay(null);
            persistWorkspace(true);
            window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "prs" }));
        };
        window.addEventListener("shape-set-active-tab", onTab as EventListener);
        window.addEventListener("shape-layout-toggle", onToggle as EventListener);
        window.addEventListener("shape-agent-overlay", onOverlay as EventListener);
        window.addEventListener("shape-open-pull-requests", onPrs);
        return () => {
            window.removeEventListener("shape-set-active-tab", onTab as EventListener);
            window.removeEventListener("shape-layout-toggle", onToggle as EventListener);
            window.removeEventListener("shape-agent-overlay", onOverlay as EventListener);
            window.removeEventListener("shape-open-pull-requests", onPrs);
        };
    }, [project_path, persistWorkspace, toggleSidebar, toggleWorkspace]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragging.current) return;
            const next = clampWorkspace(window.innerWidth - e.clientX);
            if (next < MIN_WORKSPACE_SOFT) return;
            widthRef.current = next;
            setWorkspaceWidth(next);
        };
        const onUp = () => {
            if (!dragging.current) return;
            dragging.current = false;
            setIsResizing(false);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            try {
                localStorage.setItem("shape-agent-workspace-width", String(widthRef.current));
            } catch {
                /* ignore */
            }
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [clampWorkspace]);

    useEffect(() => {
        const apply = () => {
            const next = clampWorkspace(widthRef.current);
            setWorkspaceFits(next > 0);
            if (next > 0) {
                setWorkspaceWidth((prev) => (prev === next ? prev : next));
            }
        };
        apply();
        window.addEventListener("resize", apply);
        let unlisten: (() => void) | undefined;
        let cancelled = false;
        void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
            const stop = await getCurrentWindow().listen("tauri://resize", apply);
            if (cancelled) {
                stop();
                return;
            }
            unlisten = stop;
        });
        return () => {
            cancelled = true;
            window.removeEventListener("resize", apply);
            unlisten?.();
        };
    }, [clampWorkspace, sidebarOpen]);

    useEffect(() => {
        const wantWorkspace = workspaceOpen && Boolean(project_path);
        const minWidth = layoutMinWidth(sidebarOpen, wantWorkspace);
        let cancelled = false;
        void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
            const { LogicalSize } = await import("@tauri-apps/api/dpi");
            const win = getCurrentWindow();
            await win.setMinSize(new LogicalSize(minWidth, WINDOW_MIN_HEIGHT));
            if (cancelled) return;
            const maximized = await win.isMaximized().catch(() => false);
            if (cancelled || maximized) return;
            const factor = await win.scaleFactor();
            const inner = await win.innerSize();
            const logicalW = inner.width / factor;
            const logicalH = inner.height / factor;
            if (logicalW + 1 < minWidth) {
                await win.setSize(new LogicalSize(minWidth, logicalH));
            }
        }).catch(() => {
            /* browser / tests */
        });
        return () => {
            cancelled = true;
        };
    }, [project_path, sidebarOpen, workspaceOpen]);

    useEffect(() => {
        const onOpenFiles = () => {
            if (!project_path) return;
            persistWorkspace(true);
            window.dispatchEvent(
                new CustomEvent("shape-set-active-tab", { detail: "files" }),
            );
        };
        window.addEventListener("shape-toggle-design-mode", onOpenFiles);
        window.addEventListener("shape-open-browser", onOpenFiles);
        return () => {
            window.removeEventListener("shape-toggle-design-mode", onOpenFiles);
            window.removeEventListener("shape-open-browser", onOpenFiles);
        };
    }, [project_path, persistWorkspace]);

    /** Terminal lives in the chat column dock, not the right workspace. */
    const openWorkspaceTerminal = useCallback(() => {
        setOverlay(null);
        window.dispatchEvent(
            new CustomEvent("shape-layout-toggle", { detail: { id: "terminal", value: true } }),
        );
    }, []);

    useEffect(() => {
        const onOpenTerminal = () => openWorkspaceTerminal();
        const onShortcut = (e: Event) => {
            const detail = (e as CustomEvent<{ action?: string }>).detail;
            if (detail?.action === "open" || detail?.action === "toggle" || !detail?.action) {
                openWorkspaceTerminal();
            }
        };
        window.addEventListener("shape-open-workspace-terminal", onOpenTerminal);
        window.addEventListener("shape-terminal-shortcut", onShortcut as EventListener);
        return () => {
            window.removeEventListener("shape-open-workspace-terminal", onOpenTerminal);
            window.removeEventListener("shape-terminal-shortcut", onShortcut as EventListener);
        };
    }, [openWorkspaceTerminal]);

    const mode = useWorkspaceMode();
    const overlayOpen = overlay != null;
    const codeWorkspace = mode === "Code";
    const showWorkspace = codeWorkspace && Boolean(project_path) && !overlayOpen;
    const rightExpanded = workspaceOpen && showWorkspace && workspaceFits;
    const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();

    return (
        <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-transparent">
            <DevRunHost />
            <ProjectQuickPickHost />
            <TrustFolderHost />
            {splash ? (
                <div
                    className={cn(
                        "pointer-events-none absolute inset-0 z-[100] flex items-center justify-center bg-transparent",
                        "transition-opacity duration-300 ease-[var(--ease-out)]",
                        splashVisible ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                >
                    <Image
                        src="/logos/logo.svg"
                        alt="Shape"
                        width={52}
                        height={64}
                        priority
                        style={{ width: 52, height: "auto" }}
                        className={cn(
                            "logo-invert transition-opacity duration-500 ease-[var(--ease-out)]",
                            splashVisible ? "opacity-100" : "opacity-0",
                        )}
                    />
                </div>
            ) : null}

            <ChatChromeTabs />
            <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-surface-3">
                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-panel">
                    {chatSearch && codeWorkspace ? (
                        <>
                            <button
                                type="button"
                                aria-label="Close chat search"
                                className="absolute inset-0 z-30 cursor-default"
                                onClick={() => setChatSearch(false)}
                            />
                            <div className="absolute inset-x-3 top-2 z-40">
                                <ChatSearch onClose={() => setChatSearch(false)} />
                            </div>
                        </>
                    ) : null}
                    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                        {overlay ? (
                            <AgentOverlayView
                                overlay={overlay}
                                onClose={() => setOverlay(null)}
                                navPortalTarget={null}
                                sidebarExpanded
                            />
                        ) : (
                            <Chat className="bg-transparent" />
                        )}
                        <div className="hidden">{children}</div>
                        {codeWorkspace && project_path ? <TerminalDock /> : null}
                    </div>
                </div>
                {showWorkspace && project_path ? (
                    <>
                        <div
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize workspace"
                            className={cn(
                                "group relative z-30 w-0 shrink-0",
                                !rightExpanded && "pointer-events-none opacity-0",
                            )}
                            onMouseDown={(e) => {
                                if (!rightExpanded) return;
                                e.preventDefault();
                                dragging.current = true;
                                setIsResizing(true);
                                document.body.style.cursor = "col-resize";
                                document.body.style.userSelect = "none";
                            }}
                        >
                            <div className="absolute inset-y-0 -left-1.5 w-3 cursor-col-resize" />
                        </div>
                        <div
                            style={{ width: rightExpanded ? workspaceWidth : 0 }}
                            className={cn(
                                "h-full min-h-0 min-w-0 overflow-hidden border-l border-border-subtle bg-sidebar rounded-l-xl",
                                !rightExpanded && "pointer-events-none border-l-transparent",
                                !isResizing && "transition-[width] duration-200 ease-[var(--ease-out)]",
                            )}
                            aria-hidden={!rightExpanded}
                        >
                            {rightExpanded ? (
                                <AgentWorkspace
                                    projectPath={project_path}
                                    expanded
                                    onExpand={() => persistWorkspace(true)}
                                />
                            ) : null}
                        </div>
                    </>
                ) : null}
            </div>
            <WindowControls
                isMaximized={isMaximized}
                onMinimize={minimize}
                onToggleMaximize={() => void toggleMaximize()}
                onClose={close}
                surface="panel"
                spacer={false}
                bare
            />
        </div>
    );
}
