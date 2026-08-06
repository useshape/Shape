"use client";

import React, { useCallback, useRef, useState, useEffect, type ReactNode } from "react";
import { Panel } from "@/features/panels";
import Explorer from "@/features/explorer/ui/explorer";
import Source from "@/features/git/ui/source/source";
import NavigatorSearch from "@/features/search/ui/search";
import Chat from "@/features/chat/ui/chat";
import Terminal from "@/features/terminal/ui/terminal";
import OutlinePanel from "@/features/outline/ui/outline";
import Graph from "@/features/git/ui/graph/graph";
import { useProjectState } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { WorkbenchCenterChrome } from "@/features/workbench/ui/workbench-chrome";
import { WindowControls } from "@/features/workbench/titlebar/ui/window-controls";
import { useWindowControls } from "@/features/workbench/titlebar/hooks/use-window-controls";

function renderLeftPanel(activeTab: string) {
    switch (activeTab) {
        case "source":
            return <Source />;
        case "graph":
            return <Graph />;
        case "search":
            return <NavigatorSearch />;
        case "outline":
            return <OutlinePanel />;
        default:
            return <Explorer />;
    }
}

function ColumnShell({
    className,
    border,
    children,
}: {
    className?: string;
    border?: "r" | "l";
    children: ReactNode;
}) {
    return (
        <div
            className={cn(
                "flex h-full min-h-0 w-full flex-col overflow-hidden bg-panel",
                border === "r" && "border-r border-border",
                border === "l" && "border-l border-border",
                className,
            )}
        >
            {children}
        </div>
    );
}

export function EditorLayout({
    children,
    activeTab,
    leftOpen,
    rightOpen,
    terminalOpen,
    sidebarsFlipped,
    setLeftOpen,
    setRightOpen,
    setTerminalOpen,
}: {
    children: React.ReactNode;
    activeTab: string;
    leftOpen: boolean;
    rightOpen: boolean;
    terminalOpen: boolean;
    sidebarsFlipped: boolean;
    setLeftOpen: (v: boolean) => void;
    setRightOpen: (v: boolean) => void;
    setTerminalOpen: (v: boolean) => void;
}) {
    const { project_path } = useProjectState();
    const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();

    const [terminalHeight, setTerminalHeight] = useState(280);
    const isResizingRef = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const rightIsTrailing = !sidebarsFlipped;

    const startResizing = useCallback((e: React.MouseEvent) => {
        isResizingRef.current = true;
        document.body.classList.add("resizing-vertical");
        document.body.style.userSelect = "none";
        e.preventDefault();
    }, []);

    const stopResizing = useCallback(() => {
        isResizingRef.current = false;
        document.body.classList.remove("resizing-vertical");
        document.body.style.userSelect = "";
    }, []);

    const resize = useCallback(
        (e: MouseEvent) => {
            if (!isResizingRef.current || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const newHeight = rect.bottom - e.clientY;
            const MIN_SIZE = 120;
            const SNAP_THRESHOLD = 50;

            if (!terminalOpen) {
                if (newHeight > MIN_SIZE) {
                    setTerminalOpen(true);
                    setTerminalHeight(newHeight);
                }
                return;
            }

            if (newHeight < SNAP_THRESHOLD) {
                setTerminalOpen(false);
                return;
            }

            if (newHeight < MIN_SIZE) {
                setTerminalHeight(MIN_SIZE);
                return;
            }

            const capped = Math.min(newHeight, rect.height - 40);
            setTerminalHeight(capped);
        },
        [terminalOpen, setTerminalOpen],
    );

    useEffect(() => {
        const onBlur = () => stopResizing();
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        window.addEventListener("blur", onBlur);
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
            window.removeEventListener("blur", onBlur);
            document.body.classList.remove("resizing-vertical");
            document.body.style.userSelect = "";
        };
    }, [resize, stopResizing]);

    const windowControls = (
        <WindowControls
            isMaximized={isMaximized}
            onMinimize={minimize}
            onToggleMaximize={() => void toggleMaximize()}
            onClose={close}
        />
    );

    /** Window controls on the shared chrome when the trailing chat column is closed. */
    const showMainWindowControls = sidebarsFlipped ? !leftOpen : !rightOpen;

    const centerBody = (
        <div ref={containerRef} className="relative flex h-full min-h-0 flex-col bg-editor">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-editor">
                <main className="flex h-full min-h-0 flex-col overflow-hidden bg-editor">
                    {children}
                </main>
            </div>

            {terminalOpen ? (
                <>
                    <div
                        className="relative z-50 h-px w-full shrink-0 cursor-row-resize border-t border-border bg-transparent"
                        onMouseDown={startResizing}
                    >
                        <div className="absolute inset-x-0 -top-1.5 h-4 w-full" />
                    </div>
                    <div
                        style={{ height: `${terminalHeight}px` }}
                        className="shrink-0 overflow-hidden bg-panel"
                    >
                        <Terminal onClose={() => setTerminalOpen(false)} isOpen={terminalOpen} />
                    </div>
                </>
            ) : (
                <div
                    className="absolute inset-x-0 bottom-0 z-50 h-2 cursor-row-resize"
                    onMouseDown={startResizing}
                />
            )}
        </div>
    );

    /**
     * File/Edit/View chrome spans primary sidebar + editor (below activity bar),
     * and stops before the secondary (chat) column.
     */
    const mainWorkbench = (
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-editor">
            <WorkbenchCenterChrome showWindowControls={showMainWindowControls} />
            <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                {project_path ? (
                    <Panel
                        panes={
                            sidebarsFlipped
                                ? [
                                      {
                                          id: "center",
                                          minSize: 200,
                                          flexible: true,
                                          children: centerBody,
                                      },
                                      {
                                          id: "left-sidebar",
                                          visible: leftOpen,
                                          preferredSize: 280,
                                          minSize: 220,
                                          maxSize: 560,
                                          snap: true,
                                          children: (
                                              <ColumnShell border="l">
                                                  {renderLeftPanel(activeTab)}
                                              </ColumnShell>
                                          ),
                                      },
                                  ]
                                : [
                                      {
                                          id: "left-sidebar",
                                          visible: leftOpen,
                                          preferredSize: 280,
                                          minSize: 220,
                                          maxSize: 560,
                                          snap: true,
                                          children: (
                                              <ColumnShell border="r">
                                                  {renderLeftPanel(activeTab)}
                                              </ColumnShell>
                                          ),
                                      },
                                      {
                                          id: "center",
                                          minSize: 200,
                                          flexible: true,
                                          children: centerBody,
                                      },
                                  ]
                        }
                        direction="horizontal"
                        paneGap="0px"
                        storageKey={sidebarsFlipped ? "editor-main-flipped" : "editor-main"}
                        hideSeparator
                        onVisibleChange={(index, visible) => {
                            const leftIndex = sidebarsFlipped ? 1 : 0;
                            if (index === leftIndex) setLeftOpen(visible);
                        }}
                    />
                ) : (
                    centerBody
                )}
            </div>
        </div>
    );

    if (!project_path) {
        return mainWorkbench;
    }

    const rightSidebarPane = {
        id: "right-sidebar",
        visible: rightOpen,
        preferredSize: 340,
        minSize: 280,
        maxSize: 800,
        snap: true,
        children: (
            <ColumnShell border={rightIsTrailing ? "l" : "r"}>
                <Chat
                    onClose={() => setRightOpen(false)}
                    sidebarSide={sidebarsFlipped ? "left" : "right"}
                    embedWindowControls={
                        rightIsTrailing && rightOpen ? windowControls : undefined
                    }
                    columnChrome
                />
            </ColumnShell>
        ),
    };

    if (sidebarsFlipped) {
        return (
            <Panel
                panes={[
                    rightSidebarPane,
                    {
                        id: "main-workbench",
                        minSize: 320,
                        flexible: true,
                        children: mainWorkbench,
                    },
                ]}
                direction="horizontal"
                paneGap="0px"
                storageKey="editor-layout-flipped-outer"
                hideSeparator
                onVisibleChange={(index, visible) => {
                    if (index === 0) setRightOpen(visible);
                }}
            />
        );
    }

    return (
        <Panel
            panes={[
                {
                    id: "main-workbench",
                    minSize: 320,
                    flexible: true,
                    children: mainWorkbench,
                },
                rightSidebarPane,
            ]}
            direction="horizontal"
            paneGap="0px"
            storageKey="editor-layout-outer"
            hideSeparator
            onVisibleChange={(index, visible) => {
                if (index === 1) setRightOpen(visible);
            }}
        />
    );
}
