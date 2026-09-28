"use client";

import { Add20Regular } from "@fluentui/react-icons/headless/svg/add";
import { ArrowLeft20Regular } from "@fluentui/react-icons/headless/svg/arrow-left";
import { ArrowRight20Regular } from "@fluentui/react-icons/headless/svg/arrow-right";
import { ArrowSync20Regular } from "@fluentui/react-icons/headless/svg/arrow-sync";
import { Camera20Filled } from "@fluentui/react-icons/headless/svg/camera";
import { Code20Regular } from "@fluentui/react-icons/headless/svg/code";
import { Color20Regular } from "@fluentui/react-icons/headless/svg/color";
import { Cursor20Filled } from "@fluentui/react-icons/headless/svg/cursor";
import { Database20Regular } from "@fluentui/react-icons/headless/svg/database";
import { Dismiss20Regular } from "@fluentui/react-icons/headless/svg/dismiss";
import { Globe20Regular } from "@fluentui/react-icons/headless/svg/globe";
import { History20Regular } from "@fluentui/react-icons/headless/svg/history";
import { Link20Regular } from "@fluentui/react-icons/headless/svg/link";
import { Open20Regular } from "@fluentui/react-icons/headless/svg/open";
import { Play20Filled } from "@fluentui/react-icons/headless/svg/play";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";
import { Shield20Regular } from "@fluentui/react-icons/headless/svg/shield";
import { Star20Regular } from "@fluentui/react-icons/headless/svg/star";
import { Target20Regular } from "@fluentui/react-icons/headless/svg/target";


import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Favicon } from "@/components/ui/favicon";
import { Icon } from "@/components/ui/icon";

import { Tooltip } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { commands, useProjectState } from "@/lib/backend";
import type { BrowserHistoryEntry, BrowserPickedElement, BrowserTab } from "@/lib/backend/types";
import { hostnameOf } from "@/lib/ui/favicon";
import { cn } from "@/lib/utils";
import { AgentControlBar, BrowseStage } from "@/features/chat/ui/blocks/browse-frame";
import { useBrowseFrame } from "@/features/agent/browser/session";
import { resolveBrowserInput } from "@/features/agent/browser/store";
import { getLastDevUrl, isLocalPreviewUrl, navigatePreview } from "@/features/preview/store";
import { isWebProject } from "@/features/detection/lib/lib";
import { ToolBtn } from "./tool";

const PreviewPanel = lazy(() => import("@/features/preview/ui/preview-panel"));

const PAGE_W = 1280;
const PAGE_H = 800;
const AGENT_TAB = "agent";
const BOOKMARKS_KEY = "shape-browser-bookmarks";
const BOOKMARK_BAR_KEY = "shape-browser-bookmark-bar";

type Bookmark = { url: string; title: string };

function loadJson<T>(key: string, fallback: T): T {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}

function saveJson(key: string, value: unknown) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* ignore */
    }
}

function fitPage(width: number, height: number) {
    const scale = Math.min(width / PAGE_W, height / PAGE_H);
    const w = PAGE_W * scale;
    const h = PAGE_H * scale;
    return { left: (width - w) / 2, top: (height - h) / 2, width: w, height: h };
}

function modifiersOf(e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) {
    return (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
}

function looksLikeUrl(raw: string) {
    const s = raw.trim();
    return /^(https?:\/\/|localhost|127\.0\.0\.1)/i.test(s) || (/^[\w-]+(\.[\w-]+)+/i.test(s) && !/\s/.test(s));
}

function displayUrl(url: string) {
    if (!url || url === "about:blank") return "";
    return url;
}

// ---------------------------------------------------------------------------
// Tab strip

function TabChip({
    active,
    title,
    url,
    favicon,
    loading,
    icon,
    onSelect,
    onClose,
}: {
    active: boolean;
    title: string;
    url: string;
    favicon?: string | null;
    loading?: boolean;
    icon?: React.ReactNode;
    onSelect: () => void;
    onClose?: () => void;
}) {
    return (
        <div
            role="tab"
            aria-selected={active}
            onMouseDown={(e) => {
                if (e.button === 1 && onClose) {
                    e.preventDefault();
                    onClose();
                    return;
                }
                if (e.button === 0) onSelect();
            }}
            className={cn(
                "group/tab flex h-7 min-w-0 max-w-44 flex-1 cursor-default select-none items-center gap-1.5 rounded-lg pl-2 pr-1 text-xs",
                "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                active
                    ? "bg-surface-2 text-text-primary"
                    : "text-text-muted hover:bg-panel-hover hover:text-text-secondary",
            )}
        >
            <span className="flex size-3.5 shrink-0 items-center justify-center">
                {loading ? (
                    <span className="size-3 animate-spin rounded-full border-[1.5px] border-text-muted border-t-transparent" />
                ) : icon ? (
                    icon
                ) : favicon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={favicon} alt="" className="size-3.5 rounded-sm object-contain" draggable={false} />
                ) : url ? (
                    <Favicon url={url} size={14} />
                ) : (
                    <Icon icon={Globe20Regular} className="text-text-muted" />
                )}
            </span>
            <span className="min-w-0 flex-1 truncate">{title}</span>
            {onClose ? (
                <button
                    type="button"
                    aria-label="Close tab"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                    className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded text-text-muted hover:bg-panel-active hover:text-text-primary",
                        active ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100",
                    )}
                >
                    <Icon icon={Dismiss20Regular} />
                </button>
            ) : null}
        </div>
    );
}

// ---------------------------------------------------------------------------
// URL bar with suggestions

type Suggestion =
    | { kind: "history"; url: string; title: string }
    | { kind: "search"; query: string; url: string }
    | { kind: "go"; url: string };

function UrlBar({
    value,
    onChange,
    onSubmit,
    disabled,
}: {
    value: string;
    onChange: (next: string) => void;
    onSubmit: (raw: string) => void;
    disabled?: boolean;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<Suggestion[]>([]);
    const [selected, setSelected] = useState(0);
    const debounce = useRef<number | null>(null);

    const buildSuggestions = useCallback(async (q: string) => {
        const trimmed = q.trim();
        let history: BrowserHistoryEntry[] = [];
        try {
            history = await commands.browserHistory(trimmed, 6);
        } catch {
            history = [];
        }
        const out: Suggestion[] = [];
        if (trimmed) {
            if (looksLikeUrl(trimmed)) {
                out.push({ kind: "go", url: resolveBrowserInput(trimmed) });
            }
        }
        for (const h of history) {
            if (out.some((s) => s.kind === "go" && s.url === h.url)) continue;
            out.push({ kind: "history", url: h.url, title: h.title });
        }
        if (trimmed && !looksLikeUrl(trimmed)) {
            out.push({ kind: "search", query: trimmed, url: resolveBrowserInput(trimmed) });
        }
        setItems(out.slice(0, 8));
        setSelected(0);
    }, []);

    useEffect(() => {
        if (!open) return;
        if (debounce.current) window.clearTimeout(debounce.current);
        debounce.current = window.setTimeout(() => void buildSuggestions(value), 70);
        return () => {
            if (debounce.current) window.clearTimeout(debounce.current);
        };
    }, [value, open, buildSuggestions]);

    useEffect(() => {
        const focusBar = () => {
            inputRef.current?.focus();
            inputRef.current?.select();
        };
        window.addEventListener("shape-browser-focus-url", focusBar);
        return () => window.removeEventListener("shape-browser-focus-url", focusBar);
    }, []);

    const commit = (raw: string) => {
        setOpen(false);
        inputRef.current?.blur();
        onSubmit(raw);
    };

    return (
        <div className="relative mx-1 min-w-0 flex-1">
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    const pick = open ? items[selected] : undefined;
                    if (pick) commit(pick.url);
                    else commit(value);
                }}
            >
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    disabled={disabled}
                    onChange={(e) => {
                        onChange(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={(e) => {
                        e.currentTarget.select();
                        setOpen(true);
                    }}
                    onBlur={() => window.setTimeout(() => setOpen(false), 120)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") {
                            e.preventDefault();
                            setOpen(false);
                            inputRef.current?.blur();
                            return;
                        }
                        if (!open || items.length === 0) return;
                        if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setSelected((i) => (i + 1) % items.length);
                        } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setSelected((i) => (i - 1 + items.length) % items.length);
                        }
                    }}
                    placeholder="Search or enter URL"
                    spellCheck={false}
                    autoComplete="off"
                    className={cn(
                        "h-6 w-full rounded-md bg-surface-1 px-2 text-xs text-text-primary",
                        "outline-none placeholder:text-text-muted focus:ring-1 focus:ring-border-focus",
                        "disabled:opacity-50",
                    )}
                />
            </form>
            {open && items.length > 0 ? (
                <div className="absolute bottom-full left-0 right-0 z-30 mb-1 flex flex-col gap-0.5 rounded-xl border border-border-subtle bg-surface-3 p-1 shadow-sm">
                    {items.map((item, index) => {
                        const active = index === selected;
                        return (
                            <button
                                key={`${item.kind}-${item.url}`}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onMouseEnter={() => setSelected(index)}
                                onClick={() => commit(item.url)}
                                className={cn(
                                    "flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs",
                                    "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                                    active ? "bg-panel-hover text-text-primary" : "text-text-secondary",
                                )}
                            >
                                {item.kind === "search" ? (
                                    <Icon icon={Search20Regular} className="shrink-0 text-text-muted" />
                                ) : item.kind === "go" ? (
                                    <Icon icon={Globe20Regular} className="shrink-0 text-text-muted" />
                                ) : (
                                    <Favicon url={item.url} size={14} />
                                )}
                                {item.kind === "search" ? (
                                    <span className="min-w-0 truncate">
                                        Search Google for <span className="text-text-primary">{item.query}</span>
                                    </span>
                                ) : item.kind === "go" ? (
                                    <span className="min-w-0 truncate text-text-primary">{item.url}</span>
                                ) : (
                                    <>
                                        <span className="min-w-0 shrink truncate text-text-primary">
                                            {item.title || hostnameOf(item.url)}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate text-text-muted">{item.url}</span>
                                    </>
                                )}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Page stage: the streamed frame plus input forwarding

function PageStage({
    tab,
    image,
    picking,
    onPicked,
}: {
    tab: BrowserTab;
    image: string | undefined;
    picking: boolean;
    onPicked: (el: BrowserPickedElement) => void;
}) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState({ w: 0, h: 0 });
    const [hover, setHover] = useState<BrowserPickedElement | null>(null);
    const lastMove = useRef(0);
    const lastPick = useRef(0);
    const pickSeq = useRef(0);

    useEffect(() => {
        const el = hostRef.current;
        if (!el) return;
        const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
        measure();
        const obs = new ResizeObserver(measure);
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    useEffect(() => {
        if (!picking) setHover(null);
    }, [picking]);

    const fitted = fitPage(box.w, box.h);

    const readPoint = (clientX: number, clientY: number) => {
        const host = hostRef.current;
        if (!host) return null;
        const bounds = host.getBoundingClientRect();
        const rect = fitPage(bounds.width, bounds.height);
        const x = clientX - bounds.left - rect.left;
        const y = clientY - bounds.top - rect.top;
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
        return { x: (x / rect.width) * 100, y: (y / rect.height) * 100 };
    };

    const send = useCallback(
        (event: Parameters<typeof commands.browserInput>[1]) => {
            void commands.browserInput(tab.id, event).catch(() => {});
        },
        [tab.id],
    );

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const p = readPoint(e.clientX, e.clientY);
        if (!p) {
            if (picking) setHover(null);
            return;
        }
        const now = performance.now();
        if (picking) {
            if (now - lastPick.current < 50) return;
            lastPick.current = now;
            const seq = ++pickSeq.current;
            void commands
                .browserPick(tab.id, p.x, p.y, false)
                .then((el) => {
                    if (seq === pickSeq.current) setHover(el);
                })
                .catch(() => {});
            return;
        }
        if (now - lastMove.current < 30) return;
        lastMove.current = now;
        send({ kind: "move", x: p.x, y: p.y, modifiers: modifiersOf(e) });
    };

    const button = (b: number): "left" | "right" | "middle" => (b === 2 ? "right" : b === 1 ? "middle" : "left");

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        hostRef.current?.focus({ preventScroll: true });
        const p = readPoint(e.clientX, e.clientY);
        if (!p) return;
        if (picking) {
            e.preventDefault();
            void commands
                .browserPick(tab.id, p.x, p.y, true)
                .then((el) => {
                    if (el) onPicked(el);
                })
                .catch(() => {});
            return;
        }
        send({ kind: "down", x: p.x, y: p.y, button: button(e.button), clicks: Math.max(1, e.detail || 1), modifiers: modifiersOf(e) });
    };

    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (picking) return;
        const p = readPoint(e.clientX, e.clientY);
        if (!p) return;
        send({ kind: "up", x: p.x, y: p.y, button: button(e.button), clicks: Math.max(1, e.detail || 1), modifiers: modifiersOf(e) });
    };

    const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        const p = readPoint(e.clientX, e.clientY);
        if (!p) return;
        const factor = e.deltaMode === 1 ? 16 : 1;
        send({ kind: "wheel", x: p.x, y: p.y, dx: e.deltaX * factor, dy: e.deltaY * factor, modifiers: modifiersOf(e) });
    };

    const onKeyDown = async (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (picking) return;
        const mods = modifiersOf(e);
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.key.toLowerCase() === "l") {
            e.preventDefault();
            window.dispatchEvent(new Event("shape-browser-focus-url"));
            return;
        }
        if (e.key === "F5" || (ctrl && e.key.toLowerCase() === "r")) {
            e.preventDefault();
            void commands.browserReload(tab.id, e.shiftKey);
            return;
        }
        if (e.altKey && e.key === "ArrowLeft") {
            e.preventDefault();
            void commands.browserBack(tab.id);
            return;
        }
        if (e.altKey && e.key === "ArrowRight") {
            e.preventDefault();
            void commands.browserForward(tab.id);
            return;
        }
        if (ctrl && e.key.toLowerCase() === "v") {
            e.preventDefault();
            try {
                const text = await navigator.clipboard.readText();
                if (text) send({ kind: "text", text });
            } catch {
                /* clipboard unavailable */
            }
            return;
        }
        e.preventDefault();
        if (e.key.length === 1 && !ctrl && !e.altKey) {
            send({ kind: "text", text: e.key });
            return;
        }
        send({ kind: "key", type: "keyDown", key: e.key, code: e.code, modifiers: mods });
    };

    const onKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (picking) return;
        if (e.key.length === 1 && !(e.ctrlKey || e.metaKey) && !e.altKey) return;
        send({ kind: "key", type: "keyUp", key: e.key, code: e.code, modifiers: modifiersOf(e) });
    };

    const hoverBox = hover && box.w > 0
        ? {
              left: fitted.left + (hover.rect.x / 100) * fitted.width,
              top: fitted.top + (hover.rect.y / 100) * fitted.height,
              width: (hover.rect.w / 100) * fitted.width,
              height: (hover.rect.h / 100) * fitted.height,
          }
        : null;

    return (
        <div
            ref={hostRef}
            tabIndex={0}
            role="application"
            aria-label={tab.title || "Page"}
            className={cn(
                "relative h-full w-full select-none overflow-hidden bg-editor outline-none",
                picking ? "cursor-crosshair" : "cursor-default",
            )}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setHover(null)}
            onWheel={onWheel}
            onKeyDown={(e) => void onKeyDown(e)}
            onKeyUp={onKeyUp}
            onContextMenu={(e) => e.preventDefault()}
        >
            {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={image}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                />
            ) : null}
            {hoverBox ? (
                <>
                    <div
                        className="pointer-events-none absolute z-10 rounded-sm border border-accent bg-accent/15"
                        style={hoverBox}
                    />
                    <span
                        className="pointer-events-none absolute z-10 rounded-md bg-accent px-1.5 py-0.5 font-mono text-2xs text-white"
                        style={{
                            left: Math.max(fitted.left, hoverBox.left),
                            top: Math.max(fitted.top, hoverBox.top - 20),
                        }}
                    >
                        {hover?.label}
                    </span>
                </>
            ) : null}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Error and new-tab pages

function ErrorPage({ tab }: { tab: BrowserTab }) {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <Icon icon={Globe20Regular} className="text-text-muted" />
            <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-text-primary">This site can&apos;t be reached</span>
                {tab.url ? <span className="text-xs text-text-muted">{hostnameOf(tab.url) || tab.url}</span> : null}
                <span className="text-xs text-text-secondary">{tab.error}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void commands.browserReload(tab.id, true)}>
                Try again
            </Button>
        </div>
    );
}

function EnginePage({ error, onRetry }: { error: string; onRetry: () => void }) {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <Icon icon={Globe20Regular} className="text-text-muted" />
            <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-text-primary">The browser couldn&apos;t start</span>
                <span className="max-w-md text-xs text-text-secondary">{error}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={onRetry}>
                Try again
            </Button>
        </div>
    );
}

function NewTabPage({ onOpen }: { onOpen: (url: string) => void }) {
    const [recent, setRecent] = useState<BrowserHistoryEntry[]>([]);
    useEffect(() => {
        void commands.browserHistory("", 8).then(setRecent).catch(() => setRecent([]));
    }, []);
    const devUrl = getLastDevUrl();
    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
            {devUrl ? (
                <Button variant="secondary" size="sm" onClick={() => onOpen(devUrl)} className="gap-2 font-normal">
                    <Icon icon={Play20Filled} className="text-text-muted" />
                    <span className="truncate">{devUrl}</span>
                </Button>
            ) : null}
            {recent.length > 0 ? (
                <div className="grid w-full max-w-xl grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {recent.map((entry) => (
                        <button
                            key={entry.url}
                            type="button"
                            onClick={() => onOpen(entry.url)}
                            className={cn(
                                "flex min-w-0 flex-col items-start gap-1 rounded-lg bg-surface-1 px-2.5 py-2 text-left",
                                "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover",
                            )}
                        >
                            <Favicon url={entry.url} size={14} />
                            <span className="w-full truncate text-xs text-text-primary">{entry.title || hostnameOf(entry.url)}</span>
                            <span className="w-full truncate text-2xs text-text-muted">{hostnameOf(entry.url)}</span>
                        </button>
                    ))}
                </div>
            ) : (
                <span className="text-xs text-text-muted">Type a URL or search above.</span>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Browser view

type PageTab = {
    id: string;
    pending: boolean;
    url: string;
    title: string;
    canBack: boolean;
    canForward: boolean;
};

export function BrowserView() {
    const [tabs, setTabs] = useState<PageTab[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const agentFrame = useBrowseFrame();
    const agentActive = !!agentFrame && agentFrame.status !== "stopped";
    const [localActive, setLocalActive] = useState<string | null>(null);
    const [urlDraft, setUrlDraft] = useState<string | null>(null);
    const [picking, setPicking] = useState(false);
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [bookmarkBar, setBookmarkBar] = useState(false);
    const [designOn, setDesignOn] = useState(false);
    const [webProject, setWebProject] = useState(false);
    const { project_path } = useProjectState();
    const openedOnce = useRef(false);
    const stageRef = useRef<HTMLDivElement>(null);
    const currentUrlRef = useRef("");

    useEffect(() => {
        if (!project_path) {
            setWebProject(false);
            return;
        }
        void isWebProject(project_path).then(setWebProject).catch(() => setWebProject(false));
    }, [project_path]);

    useEffect(() => {
        setBookmarks(loadJson<Bookmark[]>(BOOKMARKS_KEY, []));
        setBookmarkBar(loadJson<boolean>(BOOKMARK_BAR_KEY, false));
    }, []);

    // Jump to the agent's tab when it starts driving; leave it when it stops.
    const wasAgentActive = useRef(false);
    useEffect(() => {
        if (agentActive && !wasAgentActive.current) setLocalActive(AGENT_TAB);
        if (!agentActive) setLocalActive((cur) => (cur === AGENT_TAB ? null : cur));
        wasAgentActive.current = agentActive;
    }, [agentActive]);

    // First open: an empty tab. The child webview is created on the first navigation.
    useEffect(() => {
        if (openedOnce.current) return;
        openedOnce.current = true;
        const last = getLastDevUrl();
        if (last) setUrlDraft(last);
        setTabs([{ id: "new-1", pending: true, url: "", title: "", canBack: false, canForward: false }]);
        setActiveId("new-1");
    }, []);

    useEffect(() => {
        let unlistenState: (() => void) | undefined;
        let unlistenPick: (() => void) | undefined;
        let unlistenAction: (() => void) | undefined;
        void import("@tauri-apps/api/event").then(({ listen }) => {
            void listen<PageTab>("browser-surface", (event) => {
                const next = event.payload;
                if (!next?.id) return;
                setTabs((prev) => prev.map((tab) => (tab.id === next.id ? { ...tab, ...next, pending: false } : tab)));
            }).then((fn) => { unlistenState = fn; });
            void listen<BrowserPickedElement>("browser-surface-pick", (event) => {
                const el = event.payload;
                if (!el?.tag) return;
                setPicking(false);
                window.dispatchEvent(new CustomEvent("shape-chat-attach-element", { detail: el }));
                window.dispatchEvent(new Event("shape-chat-focus-input"));
            }).then((fn) => { unlistenPick = fn; });
            void listen<string>("browser-surface-action", (event) => {
                if (event.payload === "pick") setPicking(true);
                if (event.payload === "copy" || event.payload === "external") {
                    window.dispatchEvent(new CustomEvent("shape-browser-surface-action", { detail: event.payload }));
                }
            }).then((fn) => { unlistenAction = fn; });
        });
        return () => {
            unlistenState?.();
            unlistenPick?.();
            unlistenAction?.();
            void commands.browserSurfaceHide();
        };
    }, []);

    const showAgent = localActive === AGENT_TAB && agentActive;
    const active = useMemo(() => tabs.find((t) => t.id === activeId) ?? null, [tabs, activeId]);
    const urlValue = urlDraft ?? (showAgent ? agentFrame?.url || "" : displayUrl(active?.url || ""));

    useEffect(() => {
        setUrlDraft(null);
        setPicking(false);
        setDesignOn(false);
    }, [activeId, showAgent]);

    const selectTab = (id: string) => {
        if (id === AGENT_TAB) {
            setLocalActive(AGENT_TAB);
            return;
        }
        setLocalActive(null);
        setActiveId(id);
        const tab = tabs.find((t) => t.id === id);
        if (tab && !tab.pending) void commands.browserSurfaceActivate(id);
        else void commands.browserSurfaceHide();
    };

    const submitUrl = (raw: string) => {
        setUrlDraft(null);
        const resolved = resolveBrowserInput(raw);
        if (!resolved) return;
        setLocalActive(null);
        if (active && !active.pending && !showAgent) {
            setTabs((prev) => prev.map((tab) => (tab.id === active.id ? { ...tab, url: resolved } : tab)));
            void commands.browserSurfaceNavigate(active.id, resolved);
            return;
        }
        void commands.browserSurfaceOpen(resolved).then((tab) => {
            setTabs((prev) => {
                if (active?.pending) return prev.map((item) => (item.id === active.id ? { ...tab, pending: false } : item));
                return [...prev, { ...tab, pending: false }];
            });
            setActiveId(tab.id);
        }).catch(() => {});
    };

    const currentUrl = showAgent ? agentFrame?.url || "" : active?.url || "";
    currentUrlRef.current = currentUrl;
    const surfaceShown = !showAgent && !designOn && !!active && !active.pending && !!active.url;

    useEffect(() => {
        const el = stageRef.current;
        if (!el) return;
        const send = () => {
            let node: HTMLElement | null = el;
            let hidden = false;
            while (node) {
                const style = getComputedStyle(node);
                if (style.visibility === "hidden" || style.display === "none") hidden = true;
                node = node.parentElement;
            }
            const rect = el.getBoundingClientRect();
            void commands.browserSurfaceBounds(rect.x, rect.y, rect.width, rect.height, surfaceShown && !hidden);
        };
        send();
        const obs = new ResizeObserver(send);
        obs.observe(el);
        const timer = window.setInterval(send, 300);
        return () => {
            obs.disconnect();
            window.clearInterval(timer);
        };
    }, [surfaceShown]);

    useEffect(() => {
        if (!active || active.pending) return;
        void commands.browserSurfacePick(active.id, picking && surfaceShown);
    }, [picking, active, surfaceShown]);

    useEffect(() => {
        const onAction = (event: Event) => {
            const action = (event as CustomEvent<string>).detail;
            const url = currentUrlRef.current;
            if (!url) return;
            if (action === "copy") void navigator.clipboard.writeText(url);
            if (action === "external") void commands.openUrlExternal(url);
        };
        window.addEventListener("shape-browser-surface-action", onAction);
        return () => window.removeEventListener("shape-browser-surface-action", onAction);
    }, []);
    const bookmarked = bookmarks.some((b) => b.url === currentUrl);
    const toggleBookmark = () => {
        if (!currentUrl || currentUrl === "about:blank") return;
        const next = bookmarked
            ? bookmarks.filter((b) => b.url !== currentUrl)
            : [...bookmarks, { url: currentUrl, title: (showAgent ? agentFrame?.title : active?.title) || hostnameOf(currentUrl) }];
        setBookmarks(next);
        saveJson(BOOKMARKS_KEY, next);
    };

    const canBack = showAgent ? false : Boolean(active?.canBack);
    const canForward = showAgent ? false : Boolean(active?.canForward);

    // Design mode inspects the running local site through the in-app frame.
    const designReady = !showAgent && webProject && isLocalPreviewUrl(currentUrl);
    const designTooltip = !webProject
        ? "Design mode is for websites. This project doesn't look like a web app."
        : !isLocalPreviewUrl(currentUrl)
          ? "Open the running local site to use Design mode."
          : designOn
            ? "Exit design mode"
            : "Design mode";
    useEffect(() => {
        if (!designReady && designOn) setDesignOn(false);
    }, [designReady, designOn]);
    const toggleDesign = () => {
        if (!designReady) return;
        if (!designOn) {
            setPicking(false);
            void navigatePreview(currentUrl);
        }
        setDesignOn((v) => !v);
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <AgentControlBar />
            <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border-subtle px-1" role="tablist">
                {agentActive ? (
                    <TabChip
                        active={showAgent}
                        title={agentFrame?.title || "Agent"}
                        url={agentFrame?.url || ""}
                        loading={agentFrame?.status === "loading"}
                        icon={<Icon icon={Cursor20Filled} className="text-accent" />}
                        onSelect={() => selectTab(AGENT_TAB)}
                    />
                ) : null}
                {tabs.map((tab) => (
                    <TabChip
                        key={tab.id}
                        active={!showAgent && tab.id === activeId}
                        title={tab.title || (tab.url ? hostnameOf(tab.url) : "New tab")}
                        url={tab.url}
                        onSelect={() => selectTab(tab.id)}
                        onClose={() => {
                            if (!tab.pending) void commands.browserSurfaceClose(tab.id);
                            setTabs((prev) => {
                                const next = prev.filter((item) => item.id !== tab.id);
                                if (next.length === 0) {
                                    const id = `new-${Date.now()}`;
                                    setActiveId(id);
                                    return [{ id, pending: true, url: "", title: "", canBack: false, canForward: false }];
                                }
                                if (tab.id === activeId) {
                                    const fallback = next[next.length - 1];
                                    setActiveId(fallback.id);
                                    if (!fallback.pending) void commands.browserSurfaceActivate(fallback.id);
                                }
                                return next;
                            });
                        }}
                    />
                ))}
                <Tooltip content="New tab" side="bottom" delayDuration={80}>
                    <button
                        type="button"
                        aria-label="New tab"
                        onClick={() => {
                            const id = `new-${Date.now()}`;
                            setTabs((prev) => [...prev, { id, pending: true, url: "", title: "", canBack: false, canForward: false }]);
                            setActiveId(id);
                            setLocalActive(null);
                            setUrlDraft("");
                            void commands.browserSurfaceHide();
                            window.setTimeout(() => window.dispatchEvent(new Event("shape-browser-focus-url")), 30);
                        }}
                        className="flex size-7 shrink-0 items-center justify-center rounded text-text-muted hover:bg-panel-hover hover:text-text-primary"
                    >
                        <Icon icon={Add20Regular} />
                    </button>
                </Tooltip>
            </div>

            <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border-subtle px-1">
                <ToolBtn label="Back" disabled={!canBack} onClick={() => active && !active.pending && void commands.browserSurfaceBack(active.id)}>
                    <Icon icon={ArrowLeft20Regular} />
                </ToolBtn>
                <ToolBtn label="Forward" disabled={!canForward} onClick={() => active && !active.pending && void commands.browserSurfaceForward(active.id)}>
                    <Icon icon={ArrowRight20Regular} />
                </ToolBtn>
                <ToolBtn
                    label="Reload"
                    disabled={showAgent || !active || active.pending || !active.url}
                    onClick={() => active && void commands.browserSurfaceReload(active.id, false)}
                >
                    <Icon icon={ArrowSync20Regular} />
                </ToolBtn>
                <ToolBtn label={bookmarked ? "Remove bookmark" : "Bookmark"} onClick={toggleBookmark} active={bookmarked} disabled={!currentUrl}>
                    <Icon icon={Star20Regular} className={bookmarked ? "text-accent" : undefined} />
                </ToolBtn>
                <UrlBar value={urlValue} onChange={setUrlDraft} onSubmit={submitUrl} />
                <Tooltip content={designTooltip} side="bottom" delayDuration={80}>
                    <span className="inline-flex">
                        <button
                            type="button"
                            aria-label={designTooltip}
                            aria-pressed={designOn}
                            disabled={!designReady}
                            onClick={toggleDesign}
                            className={cn(
                                "flex size-7 shrink-0 items-center justify-center rounded text-text-muted",
                                "hover:bg-panel-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-30",
                                designOn && "bg-panel-active text-accent",
                            )}
                        >
                            <Icon icon={Color20Regular} />
                        </button>
                    </span>
                </Tooltip>
                <Tooltip content={picking ? "Stop selecting" : "Select an element to mention it in chat"} side="bottom" delayDuration={80}>
                    <button
                        type="button"
                        aria-label="Select element"
                        aria-pressed={picking}
                        disabled={showAgent || designOn || !active || !active.url}
                        onClick={() => setPicking((v) => !v)}
                        className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded text-text-muted",
                            "hover:bg-panel-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-30",
                            picking && "bg-panel-active text-accent",
                        )}
                    >
                        <Icon icon={Target20Regular} />
                    </button>
                </Tooltip>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="flex size-7 shrink-0 items-center justify-center rounded text-text-muted hover:bg-panel-hover hover:text-text-primary data-[state=open]:bg-panel-hover data-[state=open]:text-text-primary"
                            aria-label="Developer tools"
                        >
                            <Icon icon={Code20Regular} />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top" className="w-56">
                        <DropdownMenuItem disabled>
                            <Icon icon={Camera20Filled} />
                            Take Screenshot
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            disabled={!active || showAgent}
                            onClick={() => active && !active.pending && void commands.browserSurfaceReload(active.id, true)}
                        >
                            <Icon icon={ArrowSync20Regular} />
                            Hard Reload
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            disabled={!currentUrl}
                            onClick={() => {
                                if (currentUrl) void navigator.clipboard.writeText(currentUrl);
                            }}
                        >
                            <Icon icon={Link20Regular} />
                            Copy Current URL
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            disabled={!currentUrl}
                            onClick={() => {
                                if (currentUrl) void commands.openUrlExternal(currentUrl);
                            }}
                        >
                            <Icon icon={Open20Regular} />
                            Open Externally
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem
                            checked={bookmarkBar}
                            onCheckedChange={(checked) => {
                                setBookmarkBar(checked);
                                saveJson(BOOKMARK_BAR_KEY, checked);
                            }}
                        >
                            Show Bookmark Bar
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => void commands.browserClear("history")}>
                            <Icon icon={History20Regular} />
                            Clear Browsing History
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void commands.browserClear("cookies")}>
                            <Icon icon={Shield20Regular} />
                            Clear Cookies
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void commands.browserClear("cache")}>
                            <Icon icon={Database20Regular} />
                            Clear Cache
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {bookmarkBar ? (
                <div className="flex h-7 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border-subtle px-1">
                    {bookmarks.length === 0 ? (
                        <span className="px-2 text-xs text-text-muted">Star a page to keep it here.</span>
                    ) : (
                        bookmarks.map((b) => (
                            <button
                                key={b.url}
                                type="button"
                                onClick={() => submitUrl(b.url)}
                                className="flex h-6 max-w-40 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                            >
                                <Favicon url={b.url} size={12} />
                                <span className="truncate">{b.title || hostnameOf(b.url)}</span>
                            </button>
                        ))
                    )}
                </div>
            ) : null}

            <div ref={stageRef} className="relative min-h-0 flex-1 bg-panel">
                {showAgent && agentFrame ? (
                    <div className="flex h-full min-h-0 flex-col">
                        {agentFrame.image ? (
                        <BrowseStage frame={agentFrame} interactive className="min-h-0 flex-1" />
                        ) : (
                            <div className="flex flex-1 items-center justify-center text-xs text-text-muted">
                                {agentFrame.status === "error" ? agentFrame.error : "Opening…"}
                            </div>
                        )}
                        {agentFrame.console.length ? (
                            <pre className="max-h-28 shrink-0 overflow-auto border-t border-border-subtle bg-surface-1 p-2 font-mono text-2xs text-text-secondary">
                                {agentFrame.console.join("\n")}
                            </pre>
                        ) : null}
                    </div>
                ) : active ? (
                    designOn && designReady ? (
                    <Suspense fallback={<div className="h-full bg-panel" />}>
                            <PreviewPanel hideToolbar design={designOn} onDesignChange={setDesignOn} />
                    </Suspense>
                    ) : !active.url || active.pending ? (
                        <NewTabPage onOpen={submitUrl} />
                    ) : null
                ) : (
                    <NewTabPage onOpen={submitUrl} />
                )}
            </div>
        </div>
    );
}
