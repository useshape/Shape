"use client";

import { GithubMark } from "@/components/ui/github-mark";
import { Compose20Regular } from "@fluentui/react-icons/headless/svg/compose";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";
import { SlideSettings24Regular } from "@fluentui/react-icons/headless/svg/slide-settings";

import { useCallback, useEffect, useRef, useState } from "react";
import { type IconGlyph, Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { loginGitHub, useGitHubAuth } from "@/lib/github/store";
import { openSettingsWindow } from "@/lib/window/open-settings";
import { ChatList } from "./chats";
import { AccountMenuButton } from "./menu";
import { useChromeKind } from "@/lib/ui/chrome-platform";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { SidebarToggleBtn, AGENT_SIDEBAR_BACK_SLOT } from "../chrome";
import type { AgentOverlay } from "../overlay";
import { useEdgeReveal } from "../edge-reveal";

export const AGENT_SIDEBAR_NAV_SLOT = "shape-agent-sidebar-nav";

function NavItem({
    label,
    icon,
    onClick,
    collapsed,
    active,
}: {
    label: string;
    icon: IconGlyph;
    onClick: () => void;
    collapsed?: boolean;
    active?: boolean;
}) {
    if (collapsed) {
        return (
            <Tooltip content={label} side="right" delayDuration={80}>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onClick}
                    aria-label={label}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                        "size-9 shrink-0 text-text-secondary hover:text-text-primary",
                        active && "bg-panel-active text-text-primary",
                    )}
                >
                    <Icon icon={icon} />
                </Button>
            </Tooltip>
        );
    }

    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClick}
            aria-current={active ? "page" : undefined}
            className={cn(
                "flex h-9 w-full items-center justify-start gap-2 px-1.5! text-left",
                active && "bg-panel-active",
            )}
        >
            <Icon icon={icon} className="shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
        </Button>
    );
}

export function AgentSidebar({
    onSearch,
    expanded,
    open = true,
    overlay,
    onToggleSidebar,
}: {
    onSearch: () => void;
    expanded: boolean;
    open?: boolean;
    overlay: AgentOverlay;
    onBrowser?: () => void;
    showBrowser?: boolean;
    onToggleSidebar?: () => void;
}) {
    const github = useGitHubAuth();
    const macos = useChromeKind() === "macos";
    const showHostedNav = Boolean(overlay);
    const reveal = useEdgeReveal<HTMLElement>(open && expanded, "sidebar-edge");
    const [sideWidth, setSideWidth] = useState(320);
    const [sideResizing, setSideResizing] = useState(false);
    const [sideTabNear, setSideTabNear] = useState(false);
    const sideWidthRef = useRef(320);
    const sideDragging = useRef(false);
    const sideRef = useRef<HTMLElement>(null);
    const sideInnerRef = useRef<HTMLDivElement>(null);
    const sideTabRef = useRef<HTMLButtonElement>(null);

    const paintSidebar = useCallback((px: number) => {
        const shell = sideRef.current;
        const inner = sideInnerRef.current;
        if (shell) {
            shell.style.transition = "none";
            shell.style.width = `${px}px`;
            shell.style.flexBasis = `${px}px`;
        }
        if (inner) inner.style.width = `${px}px`;
    }, []);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!sideDragging.current) return;
            const shell = sideRef.current;
            const left = shell?.getBoundingClientRect().left ?? 0;
            const max = Math.max(220, Math.min(480, Math.round(window.innerWidth * 0.42)));
            const next = Math.max(200, Math.min(max, Math.round(e.clientX - left)));
            const tab = sideTabRef.current;
            if (tab) {
                const lean = Math.max(-5, Math.min(5, (e.clientX - tab.getBoundingClientRect().left) * 0.12));
                tab.style.transform = `translate(calc(-50% + ${lean}px), -50%)`;
            }
            sideWidthRef.current = next;
            paintSidebar(next);
        };
        const onUp = () => {
            if (!sideDragging.current) return;
            sideDragging.current = false;
            setSideResizing(false);
            setSideWidth(sideWidthRef.current);
            if (sideTabRef.current) sideTabRef.current.style.transform = "translate(-50%, -50%)";
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [paintSidebar]);

    const toggleSidebar = () => {
        if (onToggleSidebar) {
            onToggleSidebar();
            return;
        }
        window.dispatchEvent(
            new CustomEvent("shape-layout-toggle", {
                detail: { id: "primary-sidebar" },
            }),
        );
    };

    const newChat = () => {
        window.dispatchEvent(new Event("shape-chat-new"));
        window.dispatchEvent(new Event("shape-chat-focus-input"));
    };

    return (
        <>
        {reveal.filter}
        <aside
            ref={sideRef}
            aria-hidden={!open}
            style={{
                width: !open ? 0 : !expanded ? 48 : sideWidth,
                minWidth: 0,
                flexBasis: !open ? 0 : !expanded ? 48 : sideWidth,
                transition: sideResizing ? "none" : "width 420ms cubic-bezier(0.16, 1, 0.3, 1), flex-basis 420ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            className={cn(
                "relative z-20 flex h-full shrink-0 flex-col overflow-hidden bg-sidebar text-text-primary",
                !expanded && open && "w-12",
            )}
            onMouseMove={(e) => {
                if (!expanded || !open || sideDragging.current) return;
                const bounds = e.currentTarget.getBoundingClientRect();
                const dist = Math.hypot(e.clientX - bounds.right, e.clientY - (bounds.top + bounds.height / 2));
                const near = dist < 72;
                setSideTabNear((prev) => (prev === near ? prev : near));
            }}
            onMouseLeave={() => {
                if (!sideDragging.current) setSideTabNear(false);
            }}
        >
            <div
                ref={(node) => {
                    sideInnerRef.current = node;
                    reveal.bendRef.current = node;
                }}
                className={cn(
                    "relative flex h-full min-h-0 flex-col",
                    !open && "pointer-events-none",
                )}
                style={{ width: !open ? 0 : !expanded ? 48 : sideWidth }}
            >
                {showHostedNav ? (
                    <>
                        <div
                            className={cn(
                                "relative z-20 flex h-titlebar shrink-0 items-center",
                                expanded ? "justify-between pl-3 pr-2" : "justify-center px-1.5",
                            )}
                            data-chrome-leading="true"
                        >
                            <SidebarToggleBtn
                                open={expanded}
                                collapsed={!expanded}
                                onToggle={toggleSidebar}
                            />
                            {expanded ? (
                                <div id={AGENT_SIDEBAR_BACK_SLOT} className="flex items-center" />
                            ) : null}
                        </div>
                        <div
                            id={AGENT_SIDEBAR_NAV_SLOT}
                            className="flex min-h-0 flex-1 flex-col overflow-hidden"
                            data-collapsed={expanded ? "false" : "true"}
                        />
                    </>
                ) : (
                    <>
                        <div
                            className={cn(
                                "relative z-20 flex h-titlebar shrink-0 items-center gap-1",
                                expanded ? "justify-between pl-2 pr-2" : "justify-center px-1.5",
                            )}
                            data-chrome-leading="true"
                        >
                            {expanded && !macos ? <AccountMenuButton /> : null}
                            <SidebarToggleBtn
                                open={expanded}
                                collapsed={!expanded}
                                onToggle={toggleSidebar}
                            />
                        </div>

                        {expanded ? null : (
                            <nav className="flex shrink-0 flex-col items-center gap-0.5 px-1.5">
                                <NavItem label="New Chat" icon={Compose20Regular} onClick={newChat} collapsed />
                                <NavItem label="Command Palette" icon={Search20Regular} onClick={onSearch} collapsed />
                            </nav>
                        )}

                        {expanded ? (
                            <ChatList
                                onNewChat={() => {
                                    window.dispatchEvent(new Event("shape-chat-new"));
                                    window.dispatchEvent(new Event("shape-chat-focus-input"));
                                }}
                            />
                        ) : (
                            <div className="min-h-0 flex-1" />
                        )}
                    </>
                )}

                <div
                    className={cn(
                        "mt-auto shrink-0",
                        expanded ? "px-1 pb-1" : "flex flex-col items-center gap-1 px-1 pb-2",
                    )}
                >
                    {expanded ? (
                        <>
                            {!showHostedNav && !github.loggedIn ? (
                                <Button
                                    type="button"
                                    onClick={() => void loginGitHub()}
                                    className="mb-1 w-full justify-start rounded-md px-3"
                                    variant="ghost"
                                    size="md"
                                >
                                    <Icon icon={GithubMark} />
                                    Connect GitHub
                                </Button>
                            ) : null}
                            <div className="flex items-center gap-1">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={newChat}
                                    className="flex h-10 min-w-0 flex-1 items-center justify-start squircle-full! bg-panel-hover px-3 text-left"
                                >
                                    <Icon icon={Compose20Regular} className="shrink-0 text-text-muted" />
                                    <span className="min-w-0 flex-1 truncate">New chat</span>
                                </Button>
                                <Tooltip content="Settings" side="top" delayDuration={80}>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Settings"
                                        onClick={() => void openSettingsWindow()}
                                        className="size-10 shrink-0 squircle-full! bg-panel-hover"
                                    >
                                        <Icon icon={SlideSettings24Regular} className="text-text-muted" />
                                    </Button>
                                </Tooltip>
                            </div>
                        </>
                    ) : (
                        <NavItem label="Settings" icon={SlideSettings24Regular} onClick={() => void openSettingsWindow()} collapsed />
                    )}
                </div>
                {expanded && open ? (
                <button
                    ref={sideTabRef}
                    type="button"
                    aria-label="Resize sidebar"
                    className={cn(
                        "absolute top-1/2 right-0 z-40 flex h-11 w-4 -translate-y-1/2 cursor-col-resize items-center justify-center",
                        "transition-opacity duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        sideTabNear || sideResizing ? "opacity-100" : "opacity-0",
                    )}
                    style={{ transform: "translate(50%, -50%)" }}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        sideDragging.current = true;
                        setSideResizing(true);
                        setSideTabNear(true);
                        document.body.style.cursor = "col-resize";
                        document.body.style.userSelect = "none";
                    }}
                >
                    <span
                        className={cn(
                            "block w-[3px] rounded-full bg-text-muted/55 shadow-[0_1px_1px_rgba(0,0,0,0.45)]",
                            "transition-[height,background-color] duration-150",
                            sideResizing ? "h-9 bg-text-primary/80" : "h-7",
                        )}
                    />
                </button>
            ) : null}
            </div>
            {reveal.blur}
        </aside>
        </>
    );
}
