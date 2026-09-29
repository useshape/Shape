"use client";

import { ArrowLeft20Regular } from "@fluentui/react-icons/headless/svg/arrow-left";
import { ArrowRight20Regular } from "@fluentui/react-icons/headless/svg/arrow-right";
import { ArrowSync20Regular } from "@fluentui/react-icons/headless/svg/arrow-sync";
import { Camera20Filled } from "@fluentui/react-icons/headless/svg/camera";
import { Code20Regular } from "@fluentui/react-icons/headless/svg/code";
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
import { WeatherMoon20Regular } from "@fluentui/react-icons/headless/svg/weather-moon";
import { WeatherSunny20Regular } from "@fluentui/react-icons/headless/svg/weather-sunny";


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { commands } from "@/lib/backend";
import type { BrowserHistoryEntry, BrowserPickedElement, BrowserTab } from "@/lib/backend/types";
import { hostnameOf } from "@/lib/ui/favicon";
import { cn } from "@/lib/utils";
import { AgentControlBar, BrowseStage } from "@/features/chat/ui/blocks/browse-frame";
import { useBrowseFrame } from "@/features/agent/browser/session";
import { resolveBrowserInput } from "@/features/agent/browser/store";
import { MAJOR_SITES } from "@/features/agent/browser/sites";
import { getLastDevUrl } from "@/features/preview/store";
import { iconFor } from "./model";
import { ToolBtn } from "./tool";

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

function siteMatches(query: string, host: string, title: string) {
    const q = query.toLowerCase();
    if (!q) return false;
    const name = host.toLowerCase().replace(/^www\./, "");
    if (name.startsWith(q)) return true;
    const label = name.split(".")[0] ?? "";
    if (label.startsWith(q)) return true;
    const heading = title.toLowerCase();
    if (heading.startsWith(q)) return true;
    if (q.length >= 3 && heading.split(/[^a-z0-9]+/).some((word) => word.startsWith(q))) return true;
    return false;
}

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
        const query = trimmed.toLowerCase();
        let history: BrowserHistoryEntry[] = [];
        try {
            history = await commands.browserHistory("", 40);
        } catch {
            history = [];
        }
        const out: Suggestion[] = [];
        const seen = new Set<string>();
        const addSite = (url: string, title: string) => {
            const host = hostnameOf(url);
            if (!host || seen.has(host)) return;
            if (query && !siteMatches(query, host, title)) return;
            seen.add(host);
            out.push({ kind: "history", url, title });
        };
        if (trimmed && looksLikeUrl(trimmed)) {
            out.push({ kind: "go", url: resolveBrowserInput(trimmed) });
        }
        if (!query) {
            for (const entry of history) {
                addSite(entry.url, entry.title);
                if (out.length >= 6) break;
            }
        } else {
            for (const entry of history) addSite(entry.url, entry.title);
            for (const host of MAJOR_SITES) {
                if (out.filter((item) => item.kind === "history").length >= 6) break;
                addSite(`https://${host}`, host.split(".")[0] ?? host);
            }
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
                <div data-shape-float="" className="absolute top-full left-0 right-0 z-30 mt-1 flex max-h-64 flex-col gap-0.5 overflow-auto rounded-xl border border-border-subtle bg-surface-3 p-1 shadow-sm">
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

function NewTabPage({
    onOpen,
    onUseTool,
}: {
    onOpen: (url: string) => void;
    onUseTool?: (kind: "files" | "graph" | "prs") => void;
}) {
    const [recent, setRecent] = useState<BrowserHistoryEntry[]>([]);
    useEffect(() => {
        void commands.browserHistory("", 8).then(setRecent).catch(() => setRecent([]));
    }, []);
    const devUrl = getLastDevUrl();
    const tools: { kind: "files" | "graph" | "prs"; label: string; shortcut?: string }[] = [
        { kind: "files", label: "Files", shortcut: "Ctrl+G" },
        { kind: "graph", label: "Graph" },
        { kind: "prs", label: "Pull requests" },
    ];
    return (
        <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
            {onUseTool ? (
                <div className="flex w-full max-w-xl flex-col gap-2">
                    <span className="text-sm text-text-primary">Tools</span>
                    <div className="grid grid-cols-2 gap-2">
                        {tools.map((tool) => (
                            <button
                                key={tool.kind}
                                type="button"
                                onClick={() => onUseTool(tool.kind)}
                                className={cn(
                                    "flex h-10 min-w-0 items-center gap-2 rounded-lg bg-surface-1 px-2.5 text-left",
                                    "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover",
                                )}
                            >
                                <Icon icon={iconFor(tool.kind)} className="text-text-muted" />
                                <span className="min-w-0 flex-1 truncate text-xs text-text-primary">{tool.label}</span>
                                {tool.shortcut ? <span className="text-2xs text-text-muted">{tool.shortcut}</span> : null}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
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
            ) : !onUseTool ? (
                <span className="text-xs text-text-muted">Type a URL or search above.</span>
            ) : null}
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
    favicon: string;
    entries: string[];
    index: number;
    error: string | null;
};

function blankTab(id: string): PageTab {
    return { id, pending: true, url: "", title: "", favicon: "", entries: [], index: 0, error: null };
}

const SCHEME_KEY = "shape-browser-scheme";
type ColorScheme = "system" | "light" | "dark";

export function BrowserView({
    tabId = null,
    tabIds,
    onMeta,
    onUseTool,
}: {
    tabId?: string | null;
    tabIds?: string[];
    onMeta?: (id: string, title: string, url: string, favicon?: string) => void;
    onUseTool?: (kind: "files" | "graph" | "prs") => void;
} = {}) {
    const controlled = Array.isArray(tabIds);
    const [tabs, setTabs] = useState<PageTab[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const agentFrame = useBrowseFrame();
    const agentActive = !!agentFrame && agentFrame.status !== "stopped";
    const [localActive, setLocalActive] = useState<string | null>(null);
    const [urlDraft, setUrlDraft] = useState<string | null>(null);
    const [picking, setPicking] = useState(false);
    const [hover, setHover] = useState<{ label: string; rect: { x: number; y: number; w: number; h: number } } | null>(null);
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [bookmarkBar, setBookmarkBar] = useState(false);
    const [scheme, setScheme] = useState<ColorScheme>(() => {
        if (typeof window === "undefined") return "system";
        const saved = loadJson<ColorScheme>(SCHEME_KEY, "system");
        return saved === "light" || saved === "dark" ? saved : "system";
    });
    const [toolsUrl, setToolsUrl] = useState<string | null>(null);
    const [toolsError, setToolsError] = useState<string | null>(null);
    const [frameSrc, setFrameSrc] = useState("about:blank");
    const [reloadKey, setReloadKey] = useState(0);
    const [pageMenu, setPageMenu] = useState<{ x: number; y: number } | null>(null);
    const openedOnce = useRef(false);
    const frameRef = useRef<HTMLIFrameElement>(null);
    const activeIdRef = useRef<string | null>(null);
    const rustNav = useRef(false);
    const travelUntil = useRef(0);
    const frameTab = useRef<string | null>(null);
    const currentUrlRef = useRef("");

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

    useEffect(() => {
        if (controlled) return;
        if (openedOnce.current) return;
        openedOnce.current = true;
        const last = getLastDevUrl();
        if (last) setUrlDraft(last);
        setTabs([blankTab("new-1")]);
        setActiveId("new-1");
    }, [controlled]);

    useEffect(() => {
        if (!controlled || !tabIds) return;
        setTabs((prev) => {
            if (prev.length === tabIds.length && prev.every((tab, index) => tab.id === tabIds[index])) return prev;
            return tabIds.map((id) => prev.find((tab) => tab.id === id) ?? blankTab(id));
        });
        if (tabId) setActiveId(tabId);
    }, [controlled, tabIds, tabId]);

    const noteNavigation = useCallback((url: string, title: string | undefined, error: string | null, travel = false, favicon?: string) => {
        if (!url || url === "about:blank") return;
        const id = activeIdRef.current;
        if (!id) return;
        const traveling = travel || Date.now() < travelUntil.current;
        setTabs((prev) => prev.map((tab) => {
            if (tab.id !== id || tab.pending) return tab;
            const nextTitle = title?.trim() && !/^https?:\/\//i.test(title.trim()) ? title.trim() : tab.title;
            const nextIcon = favicon || tab.favicon;
            if (traveling) {
                const found = tab.entries.lastIndexOf(url);
                return {
                    ...tab,
                    url,
                    title: nextTitle,
                    favicon: nextIcon,
                    index: found >= 0 ? found : tab.index,
                    error,
                };
            }
            let entries = tab.entries;
            let index = tab.index;
            if (entries[index] !== url) {
                entries = [...entries.slice(0, index + 1), url];
                index = entries.length - 1;
            }
            return {
                ...tab,
                url,
                title: nextTitle,
                favicon: nextIcon,
                entries,
                index,
                error,
            };
        }));
    }, []);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        void import("@tauri-apps/api/event").then(({ listen }) => {
            void listen<{ url: string; ok: boolean; error: string }>("browser-frame", (event) => {
                const next = event.payload;
                if (!next?.url) return;
                rustNav.current = true;
                noteNavigation(next.url, undefined, next.ok ? null : next.error || "This page can't be shown in the app.", Date.now() < travelUntil.current);
            }).then((fn) => { unlisten = fn; });
        });
        return () => unlisten?.();
    }, [noteNavigation]);

    const showAgent = localActive === AGENT_TAB && agentActive;
    const active = useMemo(() => tabs.find((t) => t.id === activeId) ?? null, [tabs, activeId]);
    const pageUrlRef = useRef("");
    pageUrlRef.current = active?.url ?? "";
    useEffect(() => {
        setToolsUrl(null);
        setToolsError(null);
    }, [active?.url]);
    const urlValue = urlDraft ?? (showAgent ? agentFrame?.url || "" : displayUrl(active?.url || ""));

    useEffect(() => {
        setUrlDraft(null);
        setPicking(false);
        setHover(null);
    }, [activeId, showAgent]);

    activeIdRef.current = activeId;

    const selectTab = (id: string) => {
        if (id === AGENT_TAB) {
            setLocalActive(AGENT_TAB);
            return;
        }
        setLocalActive(null);
        setActiveId(id);
        const tab = tabs.find((t) => t.id === id);
        setFrameSrc(tab && !tab.pending && tab.url ? tab.url : "about:blank");
    };

    const submitUrl = (raw: string) => {
        setUrlDraft(null);
        const resolved = resolveBrowserInput(raw);
        if (!resolved) return;
        setLocalActive(null);
        setPageMenu(null);
        const current = active;
        if (current && !showAgent) {
            const entries = current.entries.slice(0, current.index + 1);
            if (entries[entries.length - 1] !== resolved) entries.push(resolved);
            setTabs((prev) => prev.map((tab) => (tab.id === current.id
                ? { ...tab, pending: false, url: resolved, title: "", favicon: "", error: null, entries, index: entries.length - 1 }
                : tab)));
            setFrameSrc(resolved);
            frameTab.current = current.id;
            if (frameRef.current) frameRef.current.src = resolved;
            return;
        }
        const id = `tab-${Date.now()}`;
        setTabs((prev) => [...prev, {
            id,
            pending: false,
            url: resolved,
            title: "",
            favicon: "",
            entries: [resolved],
            index: 0,
            error: null,
        }]);
        setActiveId(id);
        setFrameSrc(resolved);
    };

    const currentUrl = showAgent ? agentFrame?.url || "" : active?.url || "";
    currentUrlRef.current = currentUrl;
    useEffect(() => {
        if (!active?.url || !onMeta) return;
        onMeta(active.id, active.title, active.url, active.favicon);
    }, [active?.id, active?.title, active?.url, active?.favicon, onMeta]);
    const showPage = !showAgent && !!active && !active.pending && !!active.url;

    const goHistory = (delta: number) => {
        if (!active || active.pending || showAgent) return;
        const index = active.index + delta;
        const url = active.entries[index];
        if (!url) return;
        travelUntil.current = Date.now() + 800;
        setTabs((prev) => prev.map((tab) => (tab.id === active.id ? { ...tab, index, url, error: null } : tab)));
        frameRef.current?.contentWindow?.postMessage({
            type: "shape-browser-host",
            history: delta < 0 ? "back" : "forward",
            goto: url,
        }, "*");
    };

    const reloadPage = () => {
        if (!active?.url || showAgent) return;
        setTabs((prev) => prev.map((tab) => (tab.id === active.id ? { ...tab, error: null } : tab)));
        frameRef.current?.contentWindow?.postMessage({ type: "shape-browser-host", reload: true }, "*");
    };

    const chooseScheme = (next: ColorScheme) => {
        setScheme(next);
        saveJson(SCHEME_KEY, next);
    };

    const seenScheme = useRef<ColorScheme | null>(null);
    useEffect(() => {
        let cancel = false;
        const changed = seenScheme.current !== null && seenScheme.current !== scheme;
        seenScheme.current = scheme;
        void commands.browserSurfaceScheme(scheme).then(() => {
            if (cancel) return;
            const frame = frameRef.current?.contentWindow;
            frame?.postMessage({ type: "shape-browser-host", scheme }, "*");
            if (changed) frame?.postMessage({ type: "shape-browser-host", reload: true }, "*");
        });
        return () => {
            cancel = true;
        };
    }, [scheme]);

    useEffect(() => {
        const frame = frameRef.current;
        if (!frame || !active?.id) return;
        if (frameTab.current === active.id) return;
        frameTab.current = active.id;
        frame.src = /^https?:\/\//i.test(active.url) ? active.url : "about:blank";
    }, [active?.id, active?.url]);

    useEffect(() => {
        const frame = frameRef.current;
        if (!frame) return;
        const send = () => frame.contentWindow?.postMessage({ type: "shape-browser-host", pick: picking }, "*");
        send();
        frame.addEventListener("load", send);
        return () => frame.removeEventListener("load", send);
    }, [picking, frameSrc, reloadKey, showPage]);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            const frame = frameRef.current;
            if (!frame || event.source !== frame.contentWindow) return;
            const data = event.data as {
                type?: string;
                url?: string;
                title?: string;
                favicon?: string;
                x?: number;
                y?: number;
                tag?: string;
                label?: string;
                travel?: boolean;
                rect?: { x: number; y: number; w: number; h: number };
            } | null;
            if (!data || typeof data.type !== "string") return;
            if (data.type === "shape-browser-page" && data.url) {
                noteNavigation(data.url, data.title, null, !!data.travel, data.favicon);
                return;
            }
            if (data.type === "shape-browser-hover") {
                if (!data.rect || !data.label) setHover(null);
                else setHover({ label: data.label, rect: data.rect });
                return;
            }
            if (data.type === "shape-browser-menu") {
                const rect = frame.getBoundingClientRect();
                setPageMenu({ x: rect.left + (data.x || 0), y: rect.top + (data.y || 0) });
                return;
            }
            if (data.type === "shape-browser-pick" && data.tag) {
                setPicking(false);
                const el = data as BrowserPickedElement;
                window.dispatchEvent(new CustomEvent("shape-chat-attach-element", { detail: el }));
                window.dispatchEvent(new Event("shape-chat-focus-input"));
            }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [noteNavigation]);
    const bookmarked = bookmarks.some((b) => b.url === currentUrl);
    const toggleBookmark = () => {
        if (!currentUrl || currentUrl === "about:blank") return;
        const next = bookmarked
            ? bookmarks.filter((b) => b.url !== currentUrl)
            : [...bookmarks, { url: currentUrl, title: (showAgent ? agentFrame?.title : active?.title) || hostnameOf(currentUrl) }];
        setBookmarks(next);
        saveJson(BOOKMARKS_KEY, next);
    };

    const closeTools = () => {
        setToolsUrl(null);
        setToolsError(null);
    };
    const openTools = () => {
        if (!active?.url) return;
        const pageUrl = active.url;
        void commands.browserSurfaceDevtools(pageUrl).then((next) => {
            if (!next || pageUrlRef.current !== pageUrl) return;
            setToolsError(null);
            setToolsUrl(next);
        }).catch((err: unknown) => {
            setToolsUrl(null);
            const message = typeof err === "string" ? err : err instanceof Error ? err.message : "";
            setToolsError(message || "This page doesn't have developer tools yet.");
        });
    };

    const canBack = !showAgent && !!active && active.index > 0;
    const canForward = !showAgent && !!active && active.index < active.entries.length - 1;

    return (
        <div className="flex h-full min-h-0 flex-col">
            <AgentControlBar />
            <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border-subtle px-1">
                <ToolBtn label="Back" disabled={!canBack} onClick={() => goHistory(-1)}>
                    <Icon icon={ArrowLeft20Regular} />
                </ToolBtn>
                <ToolBtn label="Forward" disabled={!canForward} onClick={() => goHistory(1)}>
                    <Icon icon={ArrowRight20Regular} />
                </ToolBtn>
                <ToolBtn
                    label="Reload"
                    disabled={showAgent || !active || active.pending || !active.url}
                    onClick={reloadPage}
                >
                    <Icon icon={ArrowSync20Regular} />
                </ToolBtn>
                <ToolBtn label={bookmarked ? "Remove bookmark" : "Bookmark"} onClick={toggleBookmark} active={bookmarked} disabled={!currentUrl}>
                    <Icon icon={Star20Regular} className={bookmarked ? "text-accent" : undefined} />
                </ToolBtn>
                <UrlBar value={urlValue} onChange={setUrlDraft} onSubmit={submitUrl} />
                <Tooltip content={picking ? "Stop selecting" : "Select an element to mention it in chat"} side="bottom" delayDuration={80}>
                    <button
                        type="button"
                        aria-label="Select element"
                        aria-pressed={picking}
                        disabled={showAgent || !active || !active.url}
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
                    <DropdownMenuContent align="end" side="bottom" className="w-56">
                        <DropdownMenuCheckboxItem
                            checked={!!toolsUrl || !!toolsError}
                            disabled={!active || active.pending || showAgent || !active.url}
                            onCheckedChange={(checked) => {
                                if (!checked) closeTools();
                                else if (!toolsUrl) openTools();
                            }}
                        >
                            <Icon icon={Code20Regular} />
                            Developer tools
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuItem disabled>
                            <Icon icon={Camera20Filled} />
                            Take Screenshot
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            disabled={!active || showAgent}
                            onClick={() => active && !active.pending && reloadPage()}
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
                        <DropdownMenuCheckboxItem checked={scheme === "system"} onCheckedChange={() => chooseScheme("system")}>
                            System theme
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem checked={scheme === "light"} onCheckedChange={() => chooseScheme("light")}>
                            <Icon icon={WeatherSunny20Regular} />
                            Light
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem checked={scheme === "dark"} onCheckedChange={() => chooseScheme("dark")}>
                            <Icon icon={WeatherMoon20Regular} />
                            Dark
                        </DropdownMenuCheckboxItem>
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

            <div className="flex min-h-0 flex-1 bg-panel">
                <div className="relative min-h-0 min-w-0 flex-1">
                <iframe
                    ref={frameRef}
                    name="shape-browser"
                    title={active?.title || "Browser"}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
                    className={cn(
                        "absolute inset-0 h-full w-full border-0 bg-panel",
                        showPage ? "block" : "hidden",
                    )}
                />
                {showAgent && agentFrame ? (
                    <div className="relative z-[1] flex h-full min-h-0 flex-col bg-panel">
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
                ) : !showPage ? (
                    <NewTabPage onOpen={submitUrl} onUseTool={onUseTool} />
                ) : null}
                {showPage && picking && hover ? (
                    <div className="pointer-events-none absolute z-10" style={{ left: `${hover.rect.x}%`, top: `${hover.rect.y}%`, width: `${hover.rect.w}%`, height: `${hover.rect.h}%` }}>
                        <div className="h-full w-full rounded-sm border border-accent bg-accent/15" />
                        <span className="absolute left-0 top-0 -translate-y-full rounded-md bg-accent px-1.5 py-0.5 font-mono text-2xs text-white">
                            {hover.label}
                        </span>
                    </div>
                ) : null}
                {showPage && active?.error ? (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-panel px-6 text-center">
                        <Icon icon={Globe20Regular} className="text-text-muted" />
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-text-primary">This page can&apos;t be shown</span>
                            <span className="max-w-md text-xs text-text-secondary">{active.error}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="secondary" size="sm" onClick={reloadPage}>Try again</Button>
                            <Button variant="secondary" size="sm" onClick={() => void commands.openUrlExternal(active.url)}>Open externally</Button>
                        </div>
                    </div>
                ) : null}
                </div>
                {toolsUrl && showPage ? (
                    <iframe
                        name="shape-devtools"
                        title="Developer tools"
                        src={toolsUrl}
                        className="h-full w-[min(440px,46%)] shrink-0 border-l border-border-subtle bg-panel"
                    />
                ) : toolsError && showPage ? (
                    <div className="flex h-full w-[min(440px,46%)] shrink-0 items-center border-l border-border-subtle bg-panel px-4">
                        <p className="text-xs text-text-secondary">{toolsError}</p>
                    </div>
                ) : null}
            </div>
                {pageMenu ? (
                    <DropdownMenu open onOpenChange={(open) => { if (!open) setPageMenu(null); }}>
                        <DropdownMenuTrigger asChild>
                            <span className="fixed z-20 size-px" style={{ left: pageMenu.x, top: pageMenu.y }} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem disabled={!canBack} onClick={() => goHistory(-1)}>
                                <Icon icon={ArrowLeft20Regular} />
                                Back
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!canForward} onClick={() => goHistory(1)}>
                                <Icon icon={ArrowRight20Regular} />
                                Forward
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!active?.url} onClick={reloadPage}>
                                <Icon icon={ArrowSync20Regular} />
                                Reload
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled={!active?.url} onClick={() => setPicking(true)}>
                                <Icon icon={Target20Regular} />
                                Select Element
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
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : null}
        </div>
    );
}
