"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useProjectState } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { ChatChromeTabs } from "./chat-tabs";
import { AGENT_TAB_SIDEBAR_SLOT } from "./chrome";
import { FileTree } from "@/features/agent/workspace/tree";
import { AccountMenu, ProfileAvatar } from "./sidebar/menu";
import { useShapeAuth } from "@/lib/cloud/store";
import { useGitHubAuth } from "@/lib/github/store";
import { MoreHorizontal20Regular } from "@fluentui/react-icons/headless/svg/more-horizontal";
import { Icon } from "@/components/ui/icon";
import { ChatSearch } from "@/features/chat/ui/shell/chat-search";
import { AgentOverlayView, type AgentOverlay } from "./overlay";
import { DevRunHost } from "@/features/terminal/dev-run-host";
import { PaneGrid } from "./panes/grid";
import { openFileTab } from "./strip";
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
const WINDOW_MIN_HEIGHT = 800;
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
    const [filesOpen, setFilesOpen] = useState(false);
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
            if (id === "Code") setWorkspaceMode(id);
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
        openFileTab(active_file);
    }, [active_file]);

    useEffect(() => {
        const onView = (e: Event) => {
            const v = (e as CustomEvent<string>).detail;
            if (v === "editor") {
                setOverlay(null);
                persistWorkspace(true);
            }
            if (v === "chat") setOverlay(null);
        };
        const onFile = (event: Event) => {
            const path = (event as CustomEvent<{ path?: string }>).detail?.path;
            if (!path || path.startsWith("shape://")) return;
            setOverlay(null);
            openFileTab(path);
        };
        window.addEventListener("shape-center-view", onView as EventListener);
        window.addEventListener("shape-open-file-diff", onFile as EventListener);
        window.addEventListener("shape-open-workspace-file", onFile as EventListener);
        return () => {
            window.removeEventListener("shape-center-view", onView as EventListener);
            window.removeEventListener("shape-open-file-diff", onFile as EventListener);
            window.removeEventListener("shape-open-workspace-file", onFile as EventListener);
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
        let frame = 0;
        const apply = () => {
            const next = clampWorkspace(widthRef.current);
            setWorkspaceFits((prev) => (prev === (next > 0) ? prev : next > 0));
            if (next > 0) {
                setWorkspaceWidth((prev) => (prev === next ? prev : next));
            }
        };
        const schedule = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(() => {
                frame = 0;
                apply();
            });
        };
        apply();
        window.addEventListener("resize", schedule);
        let unlisten: (() => void) | undefined;
        let cancelled = false;
        void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
            const stop = await getCurrentWindow().listen("tauri://resize", schedule);
            if (cancelled) {
                stop();
                return;
            }
            unlisten = stop;
        });
        return () => {
            cancelled = true;
            window.removeEventListener("resize", schedule);
            if (frame) window.cancelAnimationFrame(frame);
            unlisten?.();
        };
    }, [clampWorkspace, sidebarOpen]);

    useEffect(() => {
        const minWidth = layoutMinWidth(sidebarOpen, false);
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
    const codeWorkspace = mode === "Code";
    const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();
    const shapeAuth = useShapeAuth();
    const github = useGitHubAuth();
    const accountName =
        (shapeAuth.name && !/^n\/?a$/i.test(shapeAuth.name.trim()) ? shapeAuth.name.trim() : null)
        ?? (github.loggedIn && github.username ? github.username : null)
        ?? "Account";

    return (
        <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-chrome text-text-primary">
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

            <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden" data-no-drag>
                <aside className="flex w-[220px] shrink-0 flex-col bg-chrome">
                    <div
                        id={AGENT_TAB_SIDEBAR_SLOT}
                        className="flex min-h-0 flex-1 flex-col overflow-hidden px-1.5 pt-1"
                    />
                    {filesOpen && project_path ? (
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border-subtle">
                            <FileTree
                                projectPath={project_path}
                                activePath={active_file}
                                onOpenFile={(path) => openFileTab(path)}
                            />
                        </div>
                    ) : null}
                    <div className="shrink-0 p-1.5">
                        <AccountMenu side="top">
                            <button
                                type="button"
                                aria-label={accountName}
                                className="flex w-full items-center gap-2 rounded-full px-1.5 py-1 text-left hover:bg-panel-hover"
                            >
                                <ProfileAvatar
                                    gitAvatarUrl={github.loggedIn ? github.avatarUrl : null}
                                    shapeUserId={shapeAuth.userId}
                                    offline={Boolean(shapeAuth.offline)}
                                    name={accountName}
                                    size={22}
                                />
                                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                                    {accountName}
                                </span>
                                <Icon icon={MoreHorizontal20Regular} className="shrink-0 text-text-muted" />
                            </button>
                        </AccountMenu>
                    </div>
                </aside>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <ChatChromeTabs filesOpen={filesOpen} onToggleFiles={() => setFilesOpen((open) => !open)} />
            <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
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
                {overlay?.type === "settings" ? (
                    <div className="relative m-0.5 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-t-[15px] border border-white/9 bg-panel squircle-b-[10px]">
                        <AgentOverlayView
                            overlay={overlay}
                            onClose={() => setOverlay(null)}
                            navPortalTarget={null}
                            sidebarExpanded
                        />
                    </div>
                ) : (
                    <PaneGrid />
                )}
                <div className="hidden">{children}</div>
            </div>
                </div>
            </div>
            <WindowControls
                isMaximized={isMaximized}
                onMinimize={minimize}
                onToggleMaximize={() => void toggleMaximize()}
                onClose={close}
                surface="panel"
                spacer={false}
                bare
                barClass="h-9"
            />
        </div>
    );
}
