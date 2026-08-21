"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { ShapeLogo } from "@/components/ui/shape-logo";
import type { TextRewriteAction } from "../main/lib/use-text-rewrite";
import type { MarkdownBlockKind, MarkdownInlineFormat, MarkdownSourceRange } from "./lib/markdown-format";

export type MarkdownSelection = {
    text: string;
    rect: { top: number; left: number; width: number; height: number };
    sourceRange?: MarkdownSourceRange | null;
};

const BLOCK_OPTIONS: { block: MarkdownBlockKind; label: string }[] = [
    { block: "h1", label: "Heading 1" },
    { block: "h2", label: "Heading 2" },
    { block: "h3", label: "Heading 3" },
    { block: "p", label: "Paragraph" },
];

const AI_ACTIONS: { action: TextRewriteAction; label: string }[] = [
    { action: "rewrite", label: "Rewrite" },
    { action: "shorter", label: "Shorter" },
    { action: "longer", label: "Longer" },
    { action: "professional", label: "Professional tone" },
    { action: "casual", label: "Casual tone" },
    { action: "friendly", label: "Friendly tone" },
];

function clampToolbarPosition(
    rect: MarkdownSelection["rect"],
    toolbarW: number,
    toolbarH: number,
) {
    const pad = 10;
    const preferAbove = rect.top - toolbarH - 10;
    const top = preferAbove >= pad
        ? preferAbove
        : Math.min(window.innerHeight - toolbarH - pad, rect.top + rect.height + 10);
    const left = Math.min(
        Math.max(pad, rect.left + rect.width / 2 - toolbarW / 2),
        window.innerWidth - toolbarW - pad,
    );
    return { top, left };
}

function readLiveSelectionRect(): MarkdownSelection["rect"] | null {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export type MarkdownToolbarProps = {
    selection: MarkdownSelection;
    scrollRoot?: HTMLElement | null;
    loading?: boolean;
    loggedIn?: boolean;
    onFormat: (format: MarkdownInlineFormat) => void;
    onBlock: (block: MarkdownBlockKind) => void;
    onList: (ordered: boolean) => void;
    onQuote: () => void;
    onFence: () => void;
    onLink: (url: string) => void;
    onInsertTable: () => void;
    onInsertRule: () => void;
    onInsertImage: (src: string) => void;
    onAi: (action: TextRewriteAction) => void;
    onClose: () => void;
    onRectChange?: (rect: MarkdownSelection["rect"]) => void;
};

export function MarkdownToolbar({
    selection,
    scrollRoot,
    loading = false,
    loggedIn = false,
    onFormat,
    onBlock,
    onList,
    onQuote,
    onFence,
    onLink,
    onInsertTable,
    onInsertRule,
    onInsertImage,
    onAi,
    onClose,
    onRectChange,
}: MarkdownToolbarProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [liveRect, setLiveRect] = useState(selection.rect);
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState("");
    const [imageOpen, setImageOpen] = useState(false);
    const [imageSrc, setImageSrc] = useState("");

    useEffect(() => {
        setLiveRect(selection.rect);
        setLinkOpen(false);
        setImageOpen(false);
    }, [selection.rect.top, selection.rect.left, selection.rect.width, selection.rect.height, selection.text]);

    useEffect(() => {
        const sync = () => {
            if (loading) return;
            const next = readLiveSelectionRect();
            if (!next) {
                onClose();
                return;
            }
            if (scrollRoot) {
                const rootRect = scrollRoot.getBoundingClientRect();
                const visible =
                    next.top < rootRect.bottom && next.top + next.height > rootRect.top;
                if (!visible) {
                    onClose();
                    return;
                }
            }
            setLiveRect(next);
            onRectChange?.(next);
        };

        const root = scrollRoot;
        root?.addEventListener("scroll", sync, { passive: true });
        window.addEventListener("scroll", sync, true);
        window.addEventListener("resize", sync);
        document.addEventListener("selectionchange", sync);

        return () => {
            root?.removeEventListener("scroll", sync);
            window.removeEventListener("scroll", sync, true);
            window.removeEventListener("resize", sync);
            document.removeEventListener("selectionchange", sync);
        };
    }, [scrollRoot, onClose, onRectChange, loading]);

    useLayoutEffect(() => {
        const el = panelRef.current;
        if (!el) return;
        const { width, height } = el.getBoundingClientRect();
        setPosition(clampToolbarPosition(liveRect, width || 420, height || 44));
    }, [liveRect.top, liveRect.left, liveRect.width, liveRect.height, selection.text, linkOpen, imageOpen]);

    const toolbar = (
        <div
            ref={panelRef}
            className={cn(
                "fixed z-dropdown flex items-center gap-0.5 rounded-xl",
                "animate-in fade-in zoom-in-95 duration-200",
                "border border-accent-text/25 bg-surface-3/95 px-1 py-1",
                "shadow-[0_12px_40px_-12px_rgba(0,0,0,0.65),0_0_0_1px_color-mix(in_srgb,var(--accent-text)_18%,transparent)]",
                "backdrop-blur-md transition-[top,left] duration-200 ease-out",
            )}
            style={{ top: position.top, left: position.left }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => e.stopPropagation()}
        >
            <Tooltip content={loggedIn ? "Rewrite with AI" : "Sign in to use AI"}>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-accent-text"
                            disabled={!loggedIn || loading}
                        >
                            {loading ? (
                                <span className="size-3.5 rounded-full border-2 border-accent-text border-t-transparent animate-spin" />
                            ) : (
                                <ShapeLogo size={14} className={cn(!loggedIn && "opacity-40")} />
                            )}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-52">
                        <DropdownMenuLabel className="text-xs text-text-muted">Rewrite selection</DropdownMenuLabel>
                        {AI_ACTIONS.map(({ action, label }) => (
                            <DropdownMenuItem key={action} onClick={() => onAi(action)}>
                                {label}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </Tooltip>

            <div className="w-px h-5 bg-border-subtle mx-0.5" />

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs font-medium">
                        Turn into
                        <Icon name="expand_more" size={14} className="text-text-muted" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    {BLOCK_OPTIONS.map(({ block, label }) => (
                        <DropdownMenuItem key={block} onClick={() => onBlock(block)}>
                            {label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            <div className="w-px h-5 bg-border-subtle mx-0.5" />

            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 font-semibold" title="Bold" onClick={() => onFormat("bold")}>
                B
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 italic" title="Italic" onClick={() => onFormat("italic")}>
                <Icon name="format_italic" size={16} />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Strikethrough" onClick={() => onFormat("strike")}>
                <Icon name="format_strikethrough" size={16} />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Inline code" onClick={() => onFormat("code")}>
                <Icon name="code" size={16} />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Link" onClick={() => { setImageOpen(false); setLinkOpen((v) => !v); }}>
                <Icon name="link" size={16} />
            </Button>

            <div className="w-px h-5 bg-border-subtle mx-0.5" />

            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Bullet list" onClick={() => onList(false)}>
                <Icon name="format_list_bulleted" size={16} />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Numbered list" onClick={() => onList(true)}>
                <Icon name="format_list_numbered" size={16} />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Quote" onClick={onQuote}>
                <Icon name="format_align_left" size={16} />
            </Button>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Insert">
                        <Icon name="add" size={16} />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={onFence}>Code block</DropdownMenuItem>
                    <DropdownMenuItem onClick={onInsertTable}>Table</DropdownMenuItem>
                    <DropdownMenuItem onClick={onInsertRule}>Divider</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { setLinkOpen(false); setImageOpen(true); }}>
                        Image…
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 ml-0.5" title="Close" onClick={onClose}>
                <Icon name="close" size={14} />
            </Button>

            {linkOpen && (
                <form
                    className="absolute top-full left-0 mt-1.5 flex w-72 items-center gap-1 rounded-xl border border-border-subtle bg-surface-3 p-1 shadow-md"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (linkUrl.trim()) onLink(linkUrl.trim());
                        setLinkOpen(false);
                        setLinkUrl("");
                    }}
                >
                    <Input
                        autoFocus
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="https://"
                        className="h-8"
                    />
                    <Button type="submit" size="sm" className="h-8 px-2">Apply</Button>
                </form>
            )}

            {imageOpen && (
                <form
                    className="absolute top-full left-0 mt-1.5 flex w-72 items-center gap-1 rounded-xl border border-border-subtle bg-surface-3 p-1 shadow-md"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (imageSrc.trim()) onInsertImage(imageSrc.trim());
                        setImageOpen(false);
                        setImageSrc("");
                    }}
                >
                    <Input
                        autoFocus
                        value={imageSrc}
                        onChange={(e) => setImageSrc(e.target.value)}
                        placeholder="Image URL or path"
                        className="h-8"
                    />
                    <Button type="submit" size="sm" className="h-8 px-2">Insert</Button>
                </form>
            )}
        </div>
    );

    return createPortal(toolbar, document.body);
}
