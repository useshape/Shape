"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Chat from "@/features/chat/ui/chat";
import { useProjectState } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { OverlayRootProvider } from "@/lib/ui/overlay-root";
import { AgentSidebar, AGENT_SIDEBAR_NAV_SLOT } from "./sidebar";
import { ChatList } from "./sidebar/chats";
import { AgentChrome } from "./chrome";
import { AgentWorkspace } from "./workspace";
import { AgentOverlayView, type AgentOverlay } from "./overlay";
import { DevRunHost } from "@/features/terminal/dev-run-host";
import { TerminalDock } from "./terminal-dock";
import { ProjectQuickPickHost } from "@/features/chat/ui/shell/project-pick";
import { startAgentBackgroundExitToasts } from "@/features/chat/lib/agent-terminal-notify";
import { useWindowControls } from "@/features/agent/workbench/titlebar/hooks/use-window-controls";
import { WindowControls } from "@/features/agent/workbench/titlebar/ui/window-controls";
import { normalizePath } from "@/lib/path/utils";
import { useEdgeReveal } from "./edge-reveal";

const MIN_WORKSPACE = 360;
const MIN_WORKSPACE_SOFT = 280;
const MIN_CHAT = 700;
const SIDEBAR_EXPANDED = 304;
const WORKSPACE_GUTTER = 12;
const WINDOW_MIN_HEIGHT = 500;
const WINDOW_MIN_WIDTH = 1000;
const MAX_WORKSPACE_RATIO = 0.72;
const MAX_WORKSPACE_PX = 1200;
/** Cursor travel past the chat's comfort width before the panel springs on top. */
const WORKSPACE_RUBBER = 72;
const WORKSPACE_RUBBER_GAIN = 0.22;
const SPLASH_KEY = "shape-agent-splash-seen";

function layoutMinWidth(sidebarOpen: boolean, workspaceOpen: boolean) {
    const sidebar = sidebarOpen ? SIDEBAR_EXPANDED : 0;
    const workspace = workspaceOpen ? MIN_WORKSPACE + WORKSPACE_GUTTER : 0;
    return Math.max(WINDOW_MIN_WIDTH, sidebar + MIN_CHAT + workspace);
}

function isFlyoutUiTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("[data-sidebar-peek], [data-sidebar-peek-toggle]"));
}

function SidebarPeek({
    shown,
    onEnter,
    onLeave,
}: {
    shown: boolean;
    onEnter: () => void;
    onLeave: () => void;
}) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [host, setHost] = useState<HTMLElement>();
    const [mounted, setMounted] = useState(shown);

    useLayoutEffect(() => {
        setHost(hostRef.current ?? undefined);
    }, []);

    useEffect(() => {
        if (shown) {
            setMounted(true);
            return;
        }
        const t = window.setTimeout(() => setMounted(false), 200);
        return () => window.clearTimeout(t);
    }, [shown]);

    return (
        <div
            ref={hostRef}
            data-sidebar-peek=""
            className={cn(
                "fixed z-30 flex w-82 flex-col overflow-visible transition-opacity duration-200 ease-[var(--ease-out)]",
                shown ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            style={{ top: 0, bottom: 8, left: 8 }}
            onMouseEnter={onEnter}
            onMouseLeave={(e) => {
                if (isFlyoutUiTarget(e.relatedTarget)) return;
                onLeave();
            }}
        >
            <div className="h-titlebar w-10 shrink-0" aria-hidden />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden squircle-2xl border border-border-subtle bg-sidebar shadow-md/40">
                {mounted && host ? (
                    <OverlayRootProvider value={host}>
                        <ChatList
                            onNewChat={() => {
                                window.dispatchEvent(new Event("shape-chat-new"));
                                window.dispatchEvent(new Event("shape-chat-focus-input"));
                            }}
                        />
                    </OverlayRootProvider>
                ) : null}
            </div>
        </div>
    );
}

/**
 * Agent View — left sidebar, top chrome, then chat and the right panel side by side.
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
    const [floatPanel, setFloatPanel] = useState(false);
    const [dockedWidth, setDockedWidth] = useState<number | null>(null);
    const [tabShift, setTabShift] = useState(0);
    const [tabNear, setTabNear] = useState(false);
    const [navSlot, setNavSlot] = useState<HTMLElement | null>(null);
    const [sidebarFlyout, setSidebarFlyout] = useState(false);
    const flyoutTimer = useRef<number | null>(null);
    const peekArmed = useRef(true);
    const dragging = useRef(false);
    const floatRef = useRef(false);
    const dockedRef = useRef(0);
    const shellRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const tabRef = useRef<HTMLButtonElement>(null);
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

    useEffect(() => startAgentBackgroundExitToasts(), []);

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
            }, 420);
        }, 1600);
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

    const workspaceLimits = useCallback(
        (winW = typeof window === "undefined" ? 1280 : window.innerWidth) => {
            const sidebar = sidebarOpen ? SIDEBAR_EXPANDED : 0;
            const comfort = Math.max(MIN_WORKSPACE_SOFT, winW - sidebar - MIN_CHAT - WORKSPACE_GUTTER);
            const overlayCap = Math.max(comfort, Math.min(MAX_WORKSPACE_PX, winW - sidebar - 120));
            const maxByRatio = Math.min(MAX_WORKSPACE_PX, Math.floor(winW * MAX_WORKSPACE_RATIO));
            return { comfort, overlayCap, dockMax: Math.min(comfort, maxByRatio) };
        },
        [sidebarOpen],
    );

    const clampWorkspace = useCallback(
        (x: number, winW = typeof window === "undefined" ? 1280 : window.innerWidth) => {
            const { dockMax } = workspaceLimits(winW);
            if (dockMax < MIN_WORKSPACE_SOFT) return 0;
            return Math.min(dockMax, Math.max(MIN_WORKSPACE_SOFT, x));
        },
        [workspaceLimits],
    );

    const springTo = useCallback((next: boolean) => {
        setFloatPanel(next);
        floatRef.current = next;
    }, []);

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
        setSidebarFlyout(false);
        setSidebarOpen((prev) => {
            const next = !prev;
            if (!next) peekArmed.current = false;
            try {
                localStorage.setItem("shape-agent-sidebar", String(next));
            } catch {
                /* ignore */
            }
            return next;
        });
    }, []);

    const openSidebarFlyout = useCallback(() => {
        if (!peekArmed.current) return;
        if (flyoutTimer.current) window.clearTimeout(flyoutTimer.current);
        flyoutTimer.current = null;
        setSidebarFlyout(true);
    }, []);

    const closeSidebarFlyout = useCallback(() => {
        peekArmed.current = true;
        if (flyoutTimer.current) window.clearTimeout(flyoutTimer.current);
        flyoutTimer.current = window.setTimeout(() => setSidebarFlyout(false), 180);
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
        const paint = (panelPx: number, slotPx: number) => {
            const shell = shellRef.current;
            const panel = panelRef.current;
            if (shell) {
                shell.style.transition = "none";
                shell.style.width = `${slotPx}px`;
                shell.style.flexBasis = `${slotPx}px`;
            }
            if (panel) {
                panel.style.transition = "none";
                panel.style.width = `${panelPx}px`;
            }
        };
        const onMove = (e: MouseEvent) => {
            if (!dragging.current) return;
            const { comfort, overlayCap } = workspaceLimits();
            const pointer = Math.max(MIN_WORKSPACE_SOFT, window.innerWidth - e.clientX - WORKSPACE_GUTTER);
            const handle = tabRef.current;
            if (handle) {
                const lean = Math.max(-5, Math.min(5, (handle.getBoundingClientRect().left - e.clientX) * 0.12));
                handle.style.transform = `translate(calc(-50% + ${lean}px), -50%)`;
            }
            if (!floatRef.current) {
                if (pointer <= comfort) {
                    widthRef.current = pointer;
                    paint(pointer, pointer + 12);
                    return;
                }
                const over = pointer - comfort;
                if (over < WORKSPACE_RUBBER) {
                    const resisted = comfort + over * WORKSPACE_RUBBER_GAIN;
                    widthRef.current = resisted;
                    paint(resisted, resisted + 12);
                    return;
                }
                const frozen = widthRef.current;
                dockedRef.current = frozen;
                setDockedWidth(frozen);
                springTo(true);
                const next = Math.min(overlayCap, pointer);
                widthRef.current = next;
                setWorkspaceWidth(next);
                paint(next, frozen + 12);
                return;
            }
            const docked = dockedRef.current || comfort;
            if (pointer < comfort - 28) {
                dockedRef.current = 0;
                setDockedWidth(null);
                springTo(false);
                const next = Math.min(comfort, pointer);
                widthRef.current = next;
                setWorkspaceWidth(next);
                paint(next, next + 12);
                return;
            }
            const next = Math.min(overlayCap, Math.max(comfort, pointer));
            widthRef.current = next;
            paint(next, docked + 12);
        };
        const onUp = () => {
            if (!dragging.current) return;
            dragging.current = false;
            setIsResizing(false);
            setTabShift(0);
            setWorkspaceWidth(widthRef.current);
            if (tabRef.current) tabRef.current.style.transform = "translate(-50%, -50%)";
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            if (!floatRef.current) {
                const { comfort } = workspaceLimits();
                if (widthRef.current > comfort) {
                    widthRef.current = comfort;
                    setWorkspaceWidth(comfort);
                }
            }
            try {
                localStorage.setItem("shape-agent-workspace-width", String(Math.round(widthRef.current)));
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
    }, [springTo, workspaceLimits]);

    useEffect(() => {
        const apply = () => {
            const { comfort, overlayCap, dockMax } = workspaceLimits();
            if (floatRef.current) {
                const next = Math.min(overlayCap, Math.max(comfort, widthRef.current));
                if (next <= comfort) {
                    floatRef.current = false;
                    setFloatPanel(false);
                }
                setWorkspaceFits(true);
                setWorkspaceWidth((prev) => (prev === next ? prev : next));
                widthRef.current = next;
                return;
            }
            const next = dockMax < MIN_WORKSPACE_SOFT ? 0 : Math.min(dockMax, Math.max(MIN_WORKSPACE_SOFT, widthRef.current));
            setWorkspaceFits(next > 0);
            if (next > 0) {
                setWorkspaceWidth((prev) => (prev === next ? prev : next));
                widthRef.current = next;
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
    }, [sidebarOpen, workspaceLimits]);

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

    const overlayOpen = overlay != null;
    const showWorkspace = Boolean(project_path) && !overlayOpen;
    const rightExpanded = workspaceOpen && showWorkspace && workspaceFits;
    const workspaceReveal = useEdgeReveal<HTMLDivElement>(rightExpanded, "workspace-edge", {
        strength: 0.72,
        origin: 0,
    });
    const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();

    return (
        <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-sidebar">
            <DevRunHost />
            <ProjectQuickPickHost />
            {splash ? (
                <div
                    className={cn(
                        "absolute inset-0 z-[100] flex items-center justify-center bg-sidebar",
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
                expanded
                open={sidebarOpen}
                overlay={overlay}
                onToggleSidebar={toggleSidebar}
                onSearch={() => {
                    window.dispatchEvent(
                        new CustomEvent("shape-command-palette", {
                            detail: { placeholder: "Search…" },
                        }),
                    );
                }}
            />
            {sidebarOpen ? null : (
                <SidebarPeek shown={sidebarFlyout} onEnter={openSidebarFlyout} onLeave={closeSidebarFlyout} />
            )}

            <div className={cn(
                "relative mb-1 mr-1 mt-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-panel squircle-l-2xl rounded-r-lg",
                sidebarOpen ? "ml-1" : "ml-0",
            )}>
                <AgentChrome
                    rightOpen={rightExpanded}
                    onToggleRight={toggleWorkspace}
                    canToggleRight={Boolean(project_path) && !overlayOpen}
                    showRightToggle={!overlayOpen}
                    padWindowControls
                    sidebarOpen={sidebarOpen}
                    onToggleSidebar={toggleSidebar}
                    onSidebarHoverStart={openSidebarFlyout}
                    onSidebarHoverEnd={closeSidebarFlyout}
                />
                <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
                <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
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
                                <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                                    <Chat
                                        key={normalizePath(project_path).toLowerCase()}
                                        className="bg-transparent"
                                    />
                                </div>
                            ) : (
                                <div className="h-full overflow-hidden bg-transparent" data-tauri-drag-region>
                                    {children}
                                </div>
                            )}
                            {project_path ? <TerminalDock /> : null}
                    </div>
                </div>
                {showWorkspace && project_path ? (
                    <>
                        {workspaceReveal.filter}
                        <div
                            ref={shellRef}
                            style={
                                floatPanel
                                    ? {
                                          width: (dockedWidth ?? workspaceWidth) + 12,
                                          minWidth: 0,
                                          flexGrow: 0,
                                          flexShrink: 0,
                                          flexBasis: (dockedWidth ?? workspaceWidth) + 12,
                                      }
                                    : {
                                          width: rightExpanded ? workspaceWidth + 12 : 0,
                                          minWidth: 0,
                                          flexGrow: 0,
                                          flexShrink: 0,
                                          flexBasis: rightExpanded ? workspaceWidth + 12 : 0,
                                          transition:
                                              isResizing
                                                  ? "none"
                                                  : "width 420ms cubic-bezier(0.16, 1, 0.3, 1), flex-basis 420ms cubic-bezier(0.16, 1, 0.3, 1)",
                                      }
                            }
                            className={cn(
                                "relative h-full overflow-visible",
                                (rightExpanded || workspaceReveal.present) && "pr-1",
                                !rightExpanded && "pointer-events-none",
                            )}
                            aria-hidden={!rightExpanded}
                        >
                            {workspaceReveal.present ? (
                                <div
                                    ref={(node) => {
                                        panelRef.current = node;
                                        workspaceReveal.bendRef.current = node;
                                    }}
                                    style={{ width: workspaceWidth }}
                                    className={cn(
                                        "relative flex h-full min-w-0 flex-col",
                                        floatPanel && "absolute inset-y-0 right-0 z-30",
                                    )}
                                    onMouseMove={(e) => {
                                        const bounds = e.currentTarget.getBoundingClientRect();
                                        const dist = Math.hypot(e.clientX - bounds.left, e.clientY - (bounds.top + bounds.height / 2));
                                        setTabNear(dist < 72);
                                    }}
                                    onMouseLeave={() => {
                                        if (!dragging.current) setTabNear(false);
                                    }}
                                >
                                    {rightExpanded ? (
                                        <button
                                            ref={tabRef}
                                            type="button"
                                            aria-label="Resize workspace"
                                            className={cn(
                                                "absolute top-1/2 left-0 z-40 flex h-11 w-4 -translate-y-1/2 cursor-col-resize items-center justify-center",
                                                "transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                                tabNear || isResizing ? "opacity-100" : "opacity-0",
                                            )}
                                            style={{ transform: `translate(calc(-50% + ${tabShift}px), -50%)` }}
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                dragging.current = true;
                                                setIsResizing(true);
                                                setTabNear(true);
                                                document.body.style.cursor = "col-resize";
                                                document.body.style.userSelect = "none";
                                            }}
                                        >
                                            <span
                                                className={cn(
                                                    "block w-[3px] rounded-full bg-text-muted/55 shadow-[0_1px_1px_rgba(0,0,0,0.45)]",
                                                    "transition-[height,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                                    isResizing ? "h-9 bg-text-primary/80" : "h-7",
                                                )}
                                            />
                                        </button>
                                    ) : null}
                                    <AgentWorkspace
                                        projectPath={project_path}
                                        expanded
                                        onExpand={() => persistWorkspace(true)}
                                    />
                                    {workspaceReveal.blur}
                                </div>
                            ) : null}
                        </div>
                    </>
                ) : null}
                </div>
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
