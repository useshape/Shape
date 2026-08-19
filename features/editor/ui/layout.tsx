"use client";

import React, { useCallback, useRef, useState, useEffect } from "react";
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
import { getDesignBridge, subscribeDesignBridge, useDesignModeStore } from "@/features/preview/design-mode/store";
import { DesignLayersPanel } from "@/features/preview/ui/design/layers";
import { DesignInspectorPanel } from "@/features/preview/ui/design/inspector";
import type { DesignBridgeApi } from "@/features/preview/design-mode/types";

function renderLeftPanel(activeTab: string) {
    switch (activeTab) {
        case "source": return <Source />;
        case "graph": return <Graph />;
        case "search": return <NavigatorSearch />;
        case "outline": return <OutlinePanel />;
        default: return <Explorer />;
    }
}

function KeepAliveSwap({
    design,
    rest,
    designOn,
}: {
    design: React.ReactNode;
    rest: React.ReactNode;
    designOn: boolean;
}) {
    return (
        <div className="relative h-full min-h-0 w-full overflow-hidden">
            <div
                className={cn(
                    "absolute inset-0 flex min-h-0 flex-col overflow-hidden",
                    designOn ? "hidden" : "flex",
                )}
                aria-hidden={designOn}
            >
                {rest}
            </div>
            <div
                className={cn(
                    "absolute inset-0 flex min-h-0 flex-col overflow-hidden",
                    designOn ? "flex" : "hidden",
                )}
                aria-hidden={!designOn}
            >
                {design}
            </div>
        </div>
    );
}

function useDesignBridgeApi(): DesignBridgeApi | null {
    const [api, setApi] = useState<DesignBridgeApi | null>(null);
    useEffect(() => {
        const sync = () => setApi(getDesignBridge());
        sync();
        return subscribeDesignBridge(sync);
    }, []);
    return api;
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
    const design = useDesignModeStore();
    const bridge = useDesignBridgeApi();

    const [terminalHeight, setTerminalHeight] = useState(280);
    const isResizingRef = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const leftPaneIndex = sidebarsFlipped ? 2 : 0;
    const rightPaneIndex = sidebarsFlipped ? 0 : 2;

    const handleVisibleChange = useCallback((index: number, visible: boolean) => {
        if (!project_path) return;
        if (index === leftPaneIndex) setLeftOpen(visible);
        else if (index === rightPaneIndex) setRightOpen(visible);
    }, [project_path, setLeftOpen, setRightOpen, leftPaneIndex, rightPaneIndex]);

    const startResizing = useCallback((e: React.MouseEvent) => {
        isResizingRef.current = true;
        document.body.classList.add("resizing-vertical");
        document.body.setAttribute("data-resizing", "true");
        document.body.style.userSelect = "none";
        e.preventDefault();
    }, []);

    const stopResizing = useCallback(() => {
        isResizingRef.current = false;
        document.body.classList.remove("resizing-vertical");
        document.body.removeAttribute("data-resizing");
        document.body.style.userSelect = "";
        window.dispatchEvent(new Event("shape-terminal-refit"));
    }, []);

    const resize = useCallback((e: MouseEvent) => {
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
    }, [terminalOpen, setTerminalOpen]);

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

    const layersPanel = (
        <DesignLayersPanel onSelectId={(id) => bridge?.select(id)} />
    );
    const inspectorPanel = <DesignInspectorPanel bridge={bridge} />;
    const designLeft = sidebarsFlipped ? inspectorPanel : layersPanel;
    const designRight = sidebarsFlipped ? layersPanel : inspectorPanel;

    const leftSidebarPane = project_path ? {
        id: "left-sidebar",
        visible: leftOpen,
        preferredSize: 320,
        minSize: 260,
        maxSize: 600,
        snap: true,
        children: (
            <div className="workbench-panel flex h-full min-h-0 flex-col bg-panel overflow-hidden">
                <KeepAliveSwap
                    designOn={design.enabled}
                    rest={renderLeftPanel(activeTab)}
                    design={designLeft}
                />
            </div>
        ),
    } : null;

    const rightSidebarPane = project_path ? {
        id: "right-sidebar",
        visible: rightOpen,
        preferredSize: 340,
        minSize: 280,
        maxSize: 800,
        snap: true,
        children: (
            <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden bg-panel">
                <KeepAliveSwap
                    designOn={design.enabled}
                    rest={<Chat onClose={() => setRightOpen(false)} sidebarSide={sidebarsFlipped ? "left" : "right"} />}
                    design={designRight}
                />
            </div>
        ),
    } : null;

    const centerPane = {
        id: "center",
        minSize: 200,
        flexible: true,
        children: (
            <div
                ref={containerRef}
                className={cn(
                    "relative flex h-full min-h-0 flex-col",
                )}
            >
                <div className="workbench-panel flex min-h-0 flex-1 flex-col overflow-hidden bg-editor border border-border">
                    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-editor">
                        {children}
                    </main>
                </div>

                {terminalOpen ? (
                    <>
                        <div
                            className="relative z-50 h-px pb-2.5 w-full shrink-0 cursor-row-resize bg-transparent"
                            onMouseDown={startResizing}
                        >
                            <div className="absolute inset-x-0 -top-1.5 h-4 w-full" />
                        </div>
                        <div
                            style={{ height: `${terminalHeight}px` }}
                            className="workbench-panel shrink-0 overflow-hidden bg-panel"
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
            paneGap="var(--workbench-gap)"
            onVisibleChange={handleVisibleChange}
            storageKey={sidebarsFlipped ? "editor-layout-flipped" : "editor-layout"}
            hideSeparator
        />
    );
}
