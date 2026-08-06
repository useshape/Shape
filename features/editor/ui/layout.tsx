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

    const leftPaneIndex = sidebarsFlipped ? 2 : 0;
    const rightPaneIndex = sidebarsFlipped ? 0 : 2;
    const rightIsTrailing = !sidebarsFlipped;

    const handleVisibleChange = useCallback(
        (index: number, visible: boolean) => {
            if (!project_path) return;
            if (index === leftPaneIndex) setLeftOpen(visible);
            else if (index === rightPaneIndex) setRightOpen(visible);
        },
        [project_path, setLeftOpen, setRightOpen, leftPaneIndex, rightPaneIndex],
    );

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

    /** Window controls belong on the trailing (rightmost) column. */
    const showCenterWindowControls = sidebarsFlipped
        ? !leftOpen
        : !rightOpen;

    const leftSidebarPane = project_path
        ? {
              id: "left-sidebar",
              visible: leftOpen,
              preferredSize: 280,
              minSize: 220,
              maxSize: 560,
              snap: true,
              children: (
                  <ColumnShell
                      border={sidebarsFlipped ? "l" : "r"}
                      className={sidebarsFlipped && leftOpen ? "relative" : undefined}
                  >
                      {sidebarsFlipped && leftOpen ? (
                          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-titlebar justify-end">
                              <div className="pointer-events-auto flex items-stretch">
                                  {windowControls}
                              </div>
                          </div>
                      ) : null}
                      {renderLeftPanel(activeTab)}
                  </ColumnShell>
              ),
          }
        : null;

    const rightSidebarPane = project_path
        ? {
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
          }
        : null;

    const centerPane = {
        id: "center",
        minSize: 200,
        flexible: true,
        children: (
            <div ref={containerRef} className="relative flex h-full min-h-0 flex-col bg-editor">
                <WorkbenchCenterChrome showWindowControls={showCenterWindowControls} />
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
        ),
    };

    const panes = [];
    if (sidebarsFlipped) {
        if (rightSidebarPane) panes.push(rightSidebarPane);
        panes.push(centerPane);
        if (leftSidebarPane) panes.push(leftSidebarPane);
    } else {
        if (leftSidebarPane) panes.push(leftSidebarPane);
        panes.push(centerPane);
        if (rightSidebarPane) panes.push(rightSidebarPane);
    }

    return (
        <Panel
            panes={panes}
            direction="horizontal"
            paneGap="0px"
            onVisibleChange={handleVisibleChange}
            storageKey={sidebarsFlipped ? "editor-layout-flipped" : "editor-layout"}
            hideSeparator
        />
    );
}
