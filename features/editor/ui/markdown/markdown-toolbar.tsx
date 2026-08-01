"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
} from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { ShapeLogo } from "@/components/ui/shape-logo";
import { useTextRewrite, type TextRewriteAction } from "../main/lib/use-text-rewrite";
import type { MarkdownBlockKind, MarkdownInlineFormat, MarkdownSourceRange } from "./lib/markdown-format";

export type MarkdownSelection = {
    text: string;
    rect: { top: number; left: number; width: number; height: number };
    /** Preferred source offsets from DOM data-source-* mapping. */
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
    const pad = 8;
    const preferAbove = rect.top - toolbarH - 8;
    const top = preferAbove >= pad
        ? preferAbove
        : Math.min(window.innerHeight - toolbarH - pad, rect.top + rect.height + 8);
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
    onFormat: (format: MarkdownInlineFormat) => void;
    onBlock: (block: MarkdownBlockKind) => void;
    onList: (ordered: boolean) => void;
    onReplaceText: (newText: string) => void;
    onClose: () => void;
    onRectChange?: (rect: MarkdownSelection["rect"]) => void;
};

/** Notion-style floating toolbar shown when selecting text in the markdown preview. */
export function MarkdownToolbar({
    selection,
    scrollRoot,
    onFormat,
    onBlock,
    onList,
    onReplaceText,
    onClose,
    onRectChange,
}: MarkdownToolbarProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [liveRect, setLiveRect] = useState(selection.rect);
    const { rewrite, loading, loggedIn } = useTextRewrite();

    useEffect(() => {
        setLiveRect(selection.rect);
    }, [selection.rect.top, selection.rect.left, selection.rect.width, selection.rect.height, selection.text]);

    useEffect(() => {
        const sync = () => {
            const next = readLiveSelectionRect();
            if (!next) {
                onClose();
                return;
            }
            // Dismiss when selection scrolled fully out of the preview.
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
    }, [scrollRoot, onClose, onRectChange]);

    useLayoutEffect(() => {
        const el = panelRef.current;
        if (!el) return;
        const { width, height } = el.getBoundingClientRect();
        setPosition(clampToolbarPosition(liveRect, width || 360, height || 40));
    }, [liveRect.top, liveRect.left, liveRect.width, liveRect.height, selection.text]);

    const handleAi = async (action: TextRewriteAction) => {
        const next = await rewrite(selection.text, action);
        if (next) onReplaceText(next);
    };

    const toolbar = (
        <div
            ref={panelRef}
            className="fixed z-710 flex items-center gap-0.5 rounded-xl border border-border-subtle bg-surface-3 px-1 py-1 shadow-xl"
            style={{ top: position.top, left: position.left }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => e.stopPropagation()}
        >
            <Tooltip content={loggedIn ? "AI rewrite" : "Sign in to use AI"}>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={!loggedIn || loading}
                        >
                            {loading ? (
                                <div className="h-3.5 w-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                            ) : (
                                <ShapeLogo size={14} className={cn(!loggedIn && "opacity-40")} />
                            )}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                        <DropdownMenuLabel className="text-xs text-text-muted">AI</DropdownMenuLabel>
                        {AI_ACTIONS.map(({ action, label }) => (
                            <DropdownMenuItem key={action} onClick={() => void handleAi(action)}>
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

            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Bold" onClick={() => onFormat("bold")}>
                <Icon name="format_bold" size={16} />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Italic" onClick={() => onFormat("italic")}>
                <Icon name="format_italic" size={16} />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Strikethrough" onClick={() => onFormat("strike")}>
                <Icon name="format_strikethrough" size={16} />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Inline code" onClick={() => onFormat("code")}>
                <Icon name="code" size={16} />
            </Button>

            <div className="w-px h-5 bg-border-subtle mx-0.5" />

            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Bullet list" onClick={() => onList(false)}>
                <Icon name="format_list_bulleted" size={16} />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Numbered list" onClick={() => onList(true)}>
                <Icon name="format_list_numbered" size={16} />
            </Button>

            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 ml-0.5" title="Close" onClick={onClose}>
                <Icon name="close" size={14} />
            </Button>
        </div>
    );

    return createPortal(toolbar, document.body);
}
