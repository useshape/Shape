"use client";

import {
    RiAddLine,
    RiArrowGoBackLine,
    RiArrowLeftLine,
    RiArrowRightLine,
    RiCloseLine,
    RiEditBoxLine,
    RiRefreshLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { previewUrlsEqual } from "../store";
import type { DesignToolMode } from "./bottom-toolbar";

export type BrowserTab = {
    id: string;
    url: string;
    title: string;
    favicon: string | null;
    history: string[];
    index: number;
};

export function tabTitleFromUrl(url: string) {
    try {
        const parsed = new URL(url);
        const path = parsed.pathname === "/" ? "" : parsed.pathname;
        return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${path}`;
    } catch {
        return url || "New tab";
    }
}

export function faviconFromUrl(url: string) {
    try {
        return `${new URL(url).origin}/favicon.ico`;
    } catch {
        return null;
    }
}

export function createBrowserTab(url: string): BrowserTab {
    return {
        id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        url,
        title: tabTitleFromUrl(url) || "New tab",
        favicon: faviconFromUrl(url),
        history: url ? [url] : [],
        index: url ? 0 : -1,
    };
}

export function pushTabUrl(tab: BrowserTab, url: string): BrowserTab {
    if (!url) return tab;
    if (tab.index >= 0 && tab.history[tab.index] && previewUrlsEqual(tab.history[tab.index]!, url)) {
        return { ...tab, url };
    }
    const history = tab.history.slice(0, tab.index + 1);
    history.push(url);
    return { ...tab, url, history, index: history.length - 1 };
}

export function DesignToolbar({
    tabs,
    activeTabId,
    onSelectTab,
    onCloseTab,
    onNewTab,
    url,
    onUrlChange,
    onNavigate,
    onReload,
    onBack,
    onForward,
    canBack,
    canForward,
    onUndo,
    mode,
    onModeChange,
}: {
    tabs: BrowserTab[];
    activeTabId: string;
    onSelectTab: (id: string) => void;
    onCloseTab: (id: string) => void;
    onNewTab: () => void;
    url: string;
    onUrlChange: (url: string) => void;
    onNavigate: (url: string) => void;
    onReload: () => void;
    onBack: () => void;
    onForward: () => void;
    canBack: boolean;
    canForward: boolean;
    onUndo: () => void;
    mode: DesignToolMode;
    onModeChange: (mode: DesignToolMode) => void;
}) {
    const designOn = mode !== "normal";
    return (
        <div className="flex shrink-0 flex-col border-b border-border bg-panel">
            <div
                className="flex h-titlebar items-stretch gap-px bg-surface-2"
                data-tauri-drag-region
            >
                <div className="flex min-w-0 flex-1 items-stretch px-1 pt-1">
                    {tabs.map((tab) => {
                        const active = tab.id === activeTabId;
                        return (
                            <div
                                key={tab.id}
                                className={cn(
                                    "group flex min-w-0 max-w-56 flex-1 items-center gap-1.5 rounded-t-md px-2",
                                    active
                                        ? "bg-panel text-text-primary"
                                        : "bg-transparent text-text-secondary hover:bg-panel-hover",
                                )}
                                data-no-drag
                            >
                                {tab.favicon ? (
                                    <img
                                        src={tab.favicon}
                                        alt=""
                                        width={14}
                                        height={14}
                                        className="size-3.5 shrink-0"
                                        onError={(event) => {
                                            event.currentTarget.style.display = "none";
                                        }}
                                    />
                                ) : null}
                                <button
                                    type="button"
                                    className="min-w-0 flex-1 truncate text-left text-xs"
                                    onClick={() => onSelectTab(tab.id)}
                                >
                                    {tab.title || tabTitleFromUrl(tab.url) || "New tab"}
                                </button>
                                {tabs.length > 1 ? (
                                    <button
                                        type="button"
                                        aria-label="Close tab"
                                        className="flex size-4 shrink-0 items-center justify-center rounded-sm text-text-muted opacity-0 hover:bg-panel-active hover:text-text-primary group-hover:opacity-100"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onCloseTab(tab.id);
                                        }}
                                    >
                                        <Icon icon={RiCloseLine} size={12} />
                                    </button>
                                ) : null}
                            </div>
                        );
                    })}
                    <Tooltip content="New tab">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="New tab"
                            className="size-7 shrink-0 self-center text-text-muted"
                            data-no-drag
                            onClick={onNewTab}
                        >
                            <Icon icon={RiAddLine} size={ICON_SIZE_SM} />
                        </Button>
                    </Tooltip>
                </div>
            </div>
            <div className="flex h-10 items-center gap-1 bg-panel px-2">
                <Tooltip content="Back">
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Back"
                        disabled={!canBack}
                        onClick={onBack}
                    >
                        <Icon icon={RiArrowLeftLine} size={ICON_SIZE_SM} />
                    </Button>
                </Tooltip>
                <Tooltip content="Forward">
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Forward"
                        disabled={!canForward}
                        onClick={onForward}
                    >
                        <Icon icon={RiArrowRightLine} size={ICON_SIZE_SM} />
                    </Button>
                </Tooltip>
                <Tooltip content="Reload">
                    <Button variant="ghost" size="icon" aria-label="Reload" onClick={onReload}>
                        <Icon icon={RiRefreshLine} size={ICON_SIZE_SM} />
                    </Button>
                </Tooltip>
                <form
                    className="min-w-0 flex-1"
                    onSubmit={(event) => {
                        event.preventDefault();
                        onNavigate(url);
                    }}
                >
                    <input
                        value={url}
                        onChange={(event) => onUrlChange(event.target.value)}
                        onFocus={(event) => event.currentTarget.select()}
                        spellCheck={false}
                        aria-label="Address"
                        className="h-7 w-full rounded-full border border-border-subtle bg-surface-2 px-3 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-border-strong focus:bg-surface-1"
                        placeholder="Search or enter URL"
                    />
                </form>
                <Tooltip content="Undo">
                    <Button variant="ghost" size="icon" aria-label="Undo" onClick={onUndo}>
                        <Icon icon={RiArrowGoBackLine} size={ICON_SIZE_SM} />
                    </Button>
                </Tooltip>
                <Button
                    variant={designOn ? "secondary" : "ghost"}
                    size="sm"
                    className={cn("gap-1.5", designOn && "bg-panel-active")}
                    onClick={() => onModeChange(designOn ? "normal" : "select")}
                >
                    <Icon icon={RiEditBoxLine} size={ICON_SIZE_SM} />
                    Design Mode
                </Button>
            </div>
        </div>
    );
}
