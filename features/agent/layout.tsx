"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Chat from "@/features/chat/ui/chat";
import { useProjectState } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { AgentSidebar, AGENT_SIDEBAR_NAV_SLOT } from "./sidebar";
import { AgentChrome } from "./chrome";
import { AgentWorkspace } from "./workspace";
import { AgentOverlayView, type AgentOverlay } from "./overlay";
import { DevRunHost } from "@/features/terminal/dev-run-host";
import { TerminalDock } from "./terminal-dock";
import { ProjectQuickPickHost } from "@/features/chat/ui/shell/project-pick";
import { useWindowControls } from "@/features/agent/workbench/titlebar/hooks/use-window-controls";
import { WindowControls } from "@/features/agent/workbench/titlebar/ui/window-controls";

const MIN_WORKSPACE = 360;
const MIN_CHAT = 380;
const SIDEBAR_EXPANDED = 304;
const SIDEBAR_COLLAPSED = 48;
const MAX_WORKSPACE_RATIO = 0.72;
const MAX_WORKSPACE_PX = 1200;
const SPLASH_KEY = "shape-agent-splash-seen";

/**
 * Agent View — left sidebar (agent / settings / git / files nav),
 * center chrome + content; expanded workspace is full-height; rail under chrome.
 */
export function AgentLayout({ children }: { children: React.ReactNode }) {
    const { project_path, active_file } = useProjectState();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [workspaceOpen, setWorkspaceOpen] = useState(true);
    const [overlay, setOverlay] = useState<AgentOverlay>(null);
    const [workspaceWidth, setWorkspaceWidth] = useState(560);
    const [splash, setSplash] = useState(false);
    const [splashVisible, setSplashVisible] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [navSlot, setNavSlot] = useState<HTMLElement | null>(null);
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

    // Warm start-command + route map when a project opens (or fingerprint changes).
    useEffect(() => {
        if (!project_path) return;
        void import("@/features/preview/lib/project-warm").then(({ warmProjectAnalysis }) => {
            void warmProjectAnalysis(project_path);
        });
    }, [project_path]);

    // Resolve sidebar nav portal target when overlay / explorer needs it.
    useEffect(() => {
        if (!overlay) {
            setNavSlot(null);
            return;
        }
        const find = () => document.getElementById(AGENT_SIDEBAR_NAV_SLOT);
        setNavSlot(find());
        const id = window.setInterval(() => {
            const el = find();
            if (el) {
                setNavSlot(el);
                window.clearInterval(id);
            }
        }, 30);
        const stop = window.setTimeout(() => window.clearInterval(id), 1500);
        return () => {
            window.clearInterval(id);
            window.clearTimeout(stop);
        };
    }, [overlay, sidebarOpen]);

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
            const sidebar = sidebarOpen ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED;
            const maxByChat = Math.max(0, winW - sidebar - MIN_CHAT);
            const maxByRatio = Math.min(MAX_WORKSPACE_PX, Math.floor(winW * MAX_WORKSPACE_RATIO));
            const max = Math.min(maxByChat, maxByRatio);
            if (max < MIN_WORKSPACE) return 0;
            return Math.min(max, Math.max(MIN_WORKSPACE, x));
        },
        [sidebarOpen],
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
            if (["preview", "browser", "changes", "source", "graph", "git", "prs", "pulls", "agents"].includes(tabId)) {
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
            if (next < MIN_WORKSPACE) return;
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
            if (next === 0) {
                persistWorkspace(false);
                return;
            }
            if (next !== widthRef.current) {
                widthRef.current = next;
                setWorkspaceWidth(next);
            }
        };
        apply();
        window.addEventListener("resize", apply);
        return () => window.removeEventListener("resize", apply);
    }, [clampWorkspace, persistWorkspace, sidebarOpen]);

    const openBrowser = useCallback(() => {
        if (!project_path) return;
        persistWorkspace(true);
        window.dispatchEvent(
            new CustomEvent("shape-set-active-tab", { detail: "browser" }),
        );
    }, [project_path, persistWorkspace]);

    useEffect(() => {
        const onOpenBrowser = () => openBrowser();
        window.addEventListener("shape-toggle-design-mode", onOpenBrowser);
        window.addEventListener("shape-open-browser", onOpenBrowser);
        return () => {
            window.removeEventListener("shape-toggle-design-mode", onOpenBrowser);
            window.removeEventListener("shape-open-browser", onOpenBrowser);
        };
    }, [openBrowser]);

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

    const overlayOpen = overlay != null;
    const showWorkspace = Boolean(project_path) && !overlayOpen;
    const rightExpanded = workspaceOpen && showWorkspace;
    const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();

    return (
        <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-panel">
            <DevRunHost />
            <ProjectQuickPickHost />
            {splash ? (
                <div
                    className={cn(
                        "pointer-events-none absolute inset-0 z-[100] flex items-center justify-center bg-background",
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

            <AgentSidebar
                expanded={sidebarOpen}
                overlay={overlay}
                onToggleSidebar={toggleSidebar}
                showBrowser={Boolean(project_path)}
                onBrowser={openBrowser}
                onSearch={() => {
                    window.dispatchEvent(
                        new CustomEvent("shape-command-palette", {
                            detail: { placeholder: "Search…" },
                        }),
                    );
                }}
            />

            <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
                <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-panel">
                    <AgentChrome
                        rightOpen={rightExpanded}
                        onToggleRight={toggleWorkspace}
                        canToggleRight={Boolean(project_path) && !overlayOpen}
                        showRightToggle={!overlayOpen}
                        padWindowControls={!rightExpanded}
                    />
                    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                            {overlay ? (
                                <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                                    <AgentOverlayView
                                        overlay={overlay}
                                        onClose={() => setOverlay(null)}
                                        navPortalTarget={navSlot}
                                        sidebarExpanded={sidebarOpen}
                                    />
                                </div>
                            ) : project_path ? (
                                <>
                                    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                                        <Chat
                                            key={project_path.replace(/\//g, "\\").toLowerCase()}
                                            className="bg-panel"
                                        />
                                    </div>
                                    <TerminalDock />
                                </>
                            ) : (
                                <div className="h-full overflow-hidden bg-panel" data-tauri-drag-region>
                                    {children}
                                </div>
                            )}
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
                            <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-border-subtle transition-colors group-hover:bg-border-secondary group-active:bg-text-muted" />
                        </div>
                        <div
                            style={{
                                width: rightExpanded ? workspaceWidth : 0,
                                flex: "0 0 auto",
                            }}
                            className={cn(
                                "h-full overflow-hidden border-l border-border-subtle bg-panel",
                                !isResizing &&
                                    "transition-[width] duration-200 ease-[var(--ease-out)]",
                            )}
                        >
                            <div
                                style={{ width: workspaceWidth }}
                                className="flex h-full bg-panel"
                            >
                                <AgentWorkspace
                                    projectPath={project_path}
                                    expanded
                                    onExpand={() => persistWorkspace(true)}
                                />
                            </div>
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
            />
        </div>
    );
}
