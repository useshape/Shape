"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import { commands } from "@/lib/backend";
import { notificationStore } from "@/features/notifications";
import { useTextRewrite, type TextRewriteAction } from "../main/lib/use-text-rewrite";
import { MarkdownToolbar, type MarkdownSelection } from "./markdown-toolbar";
import { MarkdownAiOverlay, type MarkdownAiOverlayState } from "./markdown-ai-overlay";
import { MarkdownEditorContextMenu } from "./markdown-context-menu";
import { MarkdownImageBox, type ImageHandle } from "./markdown-image-box";
import { MarkdownPreviewProvider, type SelectedMarkdownImage } from "./markdown-context";
import { markdownComponents } from "./markdown-components";
import { resolveMarkdownImageUrls } from "./markdown-image";
import { remarkSourcePositions } from "./lib/remark-source-positions";
import { remarkGithubAlerts } from "./lib/remark-github-alerts";
import {
    applyInlineMarkdownFormat,
    applyMarkdownBlock,
    applyMarkdownFence,
    applyMarkdownLink,
    applyMarkdownList,
    applyMarkdownQuote,
    replaceMarkdownText,
    selectionToSourceRange,
    sourceRangeFromElement,
    toggleMarkdownTask,
    type MarkdownBlockKind,
    type MarkdownInlineFormat,
    type MarkdownSourceRange,
} from "./lib/markdown-format";
import {
    deleteBlock,
    findImageSpan,
    insertEmptyParagraphAfter,
    insertEmptyParagraphAtEnd,
    insertHorizontalRule,
    insertImageSnippet,
    insertTableSnippet,
    isEmptyParagraphSlice,
    moveMarkdownRange,
    replaceBlockVisibleText,
    setImageWidth,
} from "./lib/markdown-edit";

interface MarkdownPreviewProps {
    content: string;
    className?: string;
    filePath?: string;
    projectPath?: string | null;
    onApplyContent?: (next: string) => void;
}

const LARGE_MARKDOWN_CHARS = 80_000;
const REMARK_PLUGINS = [remarkGfm, remarkGithubAlerts, remarkSourcePositions];
const REHYPE_PLUGINS = [rehypeRaw];

function isExternalHref(href: string): boolean {
    return /^(https?:|mailto:|tel:)/i.test(href);
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function caretOffsetIn(el: HTMLElement): number {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return (el.innerText || "").length;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.endContainer)) return (el.innerText || "").length;
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
}

const MarkdownTree = memo(function MarkdownTree({ content }: { content: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={REMARK_PLUGINS}
            rehypePlugins={REHYPE_PLUGINS}
            components={markdownComponents}
        >
            {content}
        </ReactMarkdown>
    );
});

export const MarkdownPreview = React.forwardRef<HTMLDivElement, MarkdownPreviewProps>(
    ({ content, className, filePath, projectPath, onApplyContent }, ref) => {
        const [selection, setSelection] = useState<MarkdownSelection | null>(null);
        const [ai, setAi] = useState<MarkdownAiOverlayState | null>(null);
        const [selectedImage, setSelectedImage] = useState<SelectedMarkdownImage | null>(null);
        const [dropY, setDropY] = useState<number | null>(null);
        const [pendingCaret, setPendingCaret] = useState<MarkdownSourceRange | null>(null);

        const scrollRef = useRef<HTMLDivElement | null>(null);
        const contentRef = useRef(content);
        contentRef.current = content;
        const editingRef = useRef<HTMLElement | null>(null);
        const pointerRef = useRef<{ x: number; y: number } | null>(null);
        const imageDragRef = useRef<
            | {
                type: "resize";
                handle: ImageHandle;
                startX: number;
                startY: number;
                startW: number;
                startH: number;
                aspect: number;
                el: HTMLImageElement;
            }
            | { type: "move"; startX: number; startY: number; el: HTMLImageElement }
            | null
        >(null);

        const { rewrite, loading: rewriteLoading, loggedIn } = useTextRewrite();
        const isHugeDoc = content.length > LARGE_MARKDOWN_CHARS;
        const editable = Boolean(onApplyContent);

        const setRefs = useCallback((node: HTMLDivElement | null) => {
            scrollRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
        }, [ref]);

        const applyContent = useCallback((next: string) => {
            if (next === contentRef.current) return;
            onApplyContent?.(next);
        }, [onApplyContent]);

        const applyOrWarn = useCallback((next: string | null) => {
            if (next === null) {
                notificationStore.add(
                    "Could not locate the selected text in the source",
                    "warning",
                    undefined,
                    { autoHide: true },
                );
                return;
            }
            applyContent(next);
            setSelection(null);
            window.getSelection()?.removeAllRanges();
        }, [applyContent]);

        const resolveImageUrls = useCallback((src: string) => {
            return resolveMarkdownImageUrls(src, filePath, projectPath);
        }, [filePath, projectPath]);

        const basePath = useMemo(() => {
            if (!filePath) return "";
            const parts = filePath.replace(/\\/g, "/").split("/");
            parts.pop();
            return parts.join("/");
        }, [filePath]);

        const resolveLocalHref = useCallback((href: string): string | null => {
            const raw = href.split("#")[0]?.split("?")[0] ?? "";
            if (!raw) return null;
            const clean = decodeURIComponent(raw.replace(/\\/g, "/"));
            const safeProjectPath = projectPath ? projectPath.replace(/\\/g, "/").replace(/\/$/, "") : "";
            if (/^[a-zA-Z]:\//.test(clean) || clean.startsWith("//")) return clean.replace(/\//g, "\\");
            if (clean.startsWith("/") && safeProjectPath) return `${safeProjectPath}${clean}`;
            if (basePath) return `${basePath}/${clean}`.replace(/\/+/g, "/");
            if (safeProjectPath) return `${safeProjectPath}/${clean}`.replace(/\/+/g, "/");
            return null;
        }, [basePath, projectPath]);

        const handleMarkdownLinkClick = useCallback((e: React.MouseEvent, href?: string | null) => {
            if (!href) return;
            const trimmed = href.trim();
            if (!trimmed || trimmed === "#") {
                e.preventDefault();
                return;
            }
            if (trimmed.startsWith("#")) {
                e.preventDefault();
                const id = decodeURIComponent(trimmed.slice(1));
                const root = scrollRef.current;
                const target =
                    root?.querySelector(`#${CSS.escape(id)}`)
                    ?? root?.querySelector(`[name="${CSS.escape(id)}"]`);
                target?.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
            }
            if (isExternalHref(trimmed)) {
                e.preventDefault();
                e.stopPropagation();
                void commands.openUrlExternal(trimmed);
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const localPath = resolveLocalHref(trimmed);
            if (!localPath) return;
            const name = localPath.split(/[\\/]/).pop() || localPath;
            void commands.openFile(localPath, name).catch(() => {
                notificationStore.add(`Could not open ${name}`, "warning", undefined, { autoHide: true });
            });
        }, [resolveLocalHref]);

        const commitEdit = useCallback(() => {
            const el = editingRef.current;
            if (!el) return;
            editingRef.current = null;
            el.removeAttribute("contenteditable");
            const root = scrollRef.current;
            const range = sourceRangeFromElement(el, root, contentRef.current.length);
            if (!range || !onApplyContent) return;
            const text = (el.innerText || "").replace(/\u00a0/g, " ").replace(/\u200b/g, "").replace(/\n+$/, "");
            const slice = contentRef.current.slice(range.start, range.end);
            if (!text.trim() && isEmptyParagraphSlice(slice)) {
                applyContent(deleteBlock(contentRef.current, range));
                return;
            }
            const next = replaceBlockVisibleText(contentRef.current, range, text);
            if (next) applyContent(next);
        }, [applyContent, onApplyContent]);

        const beginEdit = useCallback((el: HTMLElement) => {
            if (!onApplyContent) return;
            if (el.closest("a, pre, [data-md-code], [data-md-chart]")) return;
            if (editingRef.current && editingRef.current !== el) commitEdit();
            editingRef.current = el;
            el.setAttribute("contenteditable", "plaintext-only");
            el.focus();
        }, [commitEdit, onApplyContent]);

        useEffect(() => {
            if (!pendingCaret || !scrollRef.current) return;
            const root = scrollRef.current;
            const nodes = root.querySelectorAll<HTMLElement>("[data-source-start]");
            let match: HTMLElement | null = null;
            for (const node of nodes) {
                const start = Number(node.getAttribute("data-source-start"));
                if (start === pendingCaret.start) {
                    match = node;
                    break;
                }
            }
            if (!match) {
                for (const node of nodes) {
                    const start = Number(node.getAttribute("data-source-start"));
                    const end = Number(node.getAttribute("data-source-end"));
                    if (start <= pendingCaret.start && end >= pendingCaret.end) {
                        match = node;
                        break;
                    }
                }
            }
            setPendingCaret(null);
            if (match) beginEdit(match);
        }, [content, pendingCaret, beginEdit]);

        const insertLineAfter = useCallback((block: MarkdownSourceRange, visible: string) => {
            const src = contentRef.current;
            const replaced = replaceBlockVisibleText(src, block, visible) ?? src;
            const after = src.slice(block.end);
            const midEnd = replaced.endsWith(after) ? replaced.length - after.length : replaced.length;
            const { next, caret } = insertEmptyParagraphAfter(replaced, midEnd);
            applyContent(next);
            setPendingCaret(caret);
        }, [applyContent]);

        const selectImage = useCallback((el: HTMLImageElement) => {
            if (!onApplyContent) return;
            commitEdit();
            const src = el.getAttribute("data-md-src") || el.getAttribute("src") || "";
            const range = findImageSpan(
                contentRef.current,
                src,
                sourceRangeFromElement(el, scrollRef.current, contentRef.current.length),
            );
            setSelectedImage({ el, src, range });
            setSelection(null);
        }, [commitEdit, onApplyContent]);

        const toggleTask = useCallback((range: MarkdownSourceRange) => {
            const next = toggleMarkdownTask(contentRef.current, range);
            if (next) applyContent(next);
        }, [applyContent]);

        const api = useMemo(() => ({
            content,
            editable,
            filePath,
            projectPath,
            resolveImageUrls,
            selectImage,
            toggleTask,
            applyContent,
        }), [content, editable, filePath, projectPath, resolveImageUrls, selectImage, toggleTask, applyContent]);

        const captureSelection = useCallback((): MarkdownSelection | null => {
            if (!onApplyContent) return null;
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
            const text = sel.toString();
            if (!text.trim()) return null;
            const anchor = sel.anchorNode;
            if (anchor && scrollRef.current && !scrollRef.current.contains(anchor)) return null;
            const r = sel.getRangeAt(0).getBoundingClientRect();
            const sourceRange = scrollRef.current
                ? selectionToSourceRange(contentRef.current, sel, scrollRef.current)
                : null;
            return {
                text,
                rect: { top: r.top, left: r.left, width: r.width, height: r.height },
                sourceRange,
            };
        }, [onApplyContent]);

        const handlePointerDown = useCallback((e: React.PointerEvent) => {
            pointerRef.current = { x: e.clientX, y: e.clientY };
        }, []);

        const handlePointerUp = useCallback((e: React.PointerEvent) => {
            if (!onApplyContent) return;
            if (imageDragRef.current) return;
            const start = pointerRef.current;
            pointerRef.current = null;
            const dx = start ? Math.abs(e.clientX - start.x) : 0;
            const dy = start ? Math.abs(e.clientY - start.y) : 0;
            const dragged = dx > 4 || dy > 4;

            const target = e.target;
            if (target instanceof Element) {
                if (target.closest("img")) return;
                if (target.closest("a, button, input, textarea, [data-md-code], [data-md-chart], [data-md-add]")) {
                    if (!dragged) setSelection(null);
                    return;
                }
            }

            if (dragged) {
                const next = captureSelection();
                setSelection(next);
                if (next) commitEdit();
                return;
            }

            setSelection(null);
            const el = target instanceof Element
                ? target.closest("p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote") as HTMLElement | null
                : null;
            if (el && scrollRef.current?.contains(el)) {
                beginEdit(el);
            } else if (editingRef.current) {
                commitEdit();
            }
        }, [beginEdit, captureSelection, commitEdit, onApplyContent]);

        const handleFormat = useCallback((format: MarkdownInlineFormat) => {
            if (!selection) return;
            applyOrWarn(
                applyInlineMarkdownFormat(contentRef.current, selection.text, format, selection.sourceRange),
            );
        }, [applyOrWarn, selection]);

        const handleBlock = useCallback((block: MarkdownBlockKind) => {
            if (!selection) return;
            applyOrWarn(
                applyMarkdownBlock(contentRef.current, selection.text, block, selection.sourceRange),
            );
        }, [applyOrWarn, selection]);

        const handleList = useCallback((ordered: boolean) => {
            if (!selection) return;
            applyOrWarn(
                applyMarkdownList(contentRef.current, selection.text, ordered, selection.sourceRange),
            );
        }, [applyOrWarn, selection]);

        const handleQuote = useCallback(() => {
            if (!selection) return;
            applyOrWarn(
                applyMarkdownQuote(contentRef.current, selection.text, selection.sourceRange),
            );
        }, [applyOrWarn, selection]);

        const handleFence = useCallback(() => {
            if (!selection) return;
            applyOrWarn(
                applyMarkdownFence(contentRef.current, selection.text, selection.sourceRange),
            );
        }, [applyOrWarn, selection]);

        const handleLink = useCallback((url: string) => {
            if (!selection) return;
            applyOrWarn(
                applyMarkdownLink(contentRef.current, selection.text, url, selection.sourceRange),
            );
        }, [applyOrWarn, selection]);

        const insertAt = useCallback((fn: (content: string, at: number) => string) => {
            const at = selection?.sourceRange?.end
                ?? selectedImage?.range?.end
                ?? contentRef.current.length;
            applyContent(fn(contentRef.current, at));
            setSelection(null);
        }, [applyContent, selection, selectedImage]);

        const handleAi = useCallback(async (action: TextRewriteAction) => {
            const sel = selection ?? captureSelection();
            if (!sel) return;
            setSelection(sel);
            setAi({ rect: sel.rect, oldText: sel.text, phase: "thinking" });
            const next = await rewrite(sel.text, action);
            if (!next) {
                setAi(null);
                return;
            }
            setAi({ rect: sel.rect, oldText: sel.text, newText: next, phase: "swapping" });
            await wait(420);
            applyOrWarn(
                replaceMarkdownText(contentRef.current, sel.text, next, sel.sourceRange),
            );
            setAi(null);
        }, [applyOrWarn, captureSelection, rewrite, selection]);

        const currentSelection = () => selection ?? captureSelection();

        const handleCut = useCallback(() => {
            const sel = currentSelection();
            if (!sel) return;
            void navigator.clipboard.writeText(sel.text);
            applyOrWarn(replaceMarkdownText(contentRef.current, sel.text, "", sel.sourceRange));
        }, [applyOrWarn, captureSelection, selection]);

        const handleCopy = useCallback(() => {
            const sel = currentSelection();
            const text = sel?.text || window.getSelection()?.toString() || "";
            if (text) void navigator.clipboard.writeText(text);
        }, [captureSelection, selection]);

        const handlePaste = useCallback(async () => {
            const text = await navigator.clipboard.readText().catch(() => "");
            if (!text || !onApplyContent) return;
            if (editingRef.current) {
                document.execCommand("insertText", false, text);
                return;
            }
            const sel = currentSelection();
            if (sel) {
                applyOrWarn(replaceMarkdownText(contentRef.current, sel.text, text, sel.sourceRange));
                return;
            }
            applyContent(contentRef.current + (contentRef.current.endsWith("\n") ? "" : "\n") + text);
        }, [applyContent, applyOrWarn, captureSelection, onApplyContent, selection]);

        const handleSelectAll = useCallback(() => {
            const root = scrollRef.current;
            if (!root) return;
            const range = document.createRange();
            range.selectNodeContents(root.querySelector("[data-md-body]") || root);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            const next = captureSelection();
            setSelection(next);
        }, [captureSelection]);

        const onResizeStart = useCallback((handle: ImageHandle, e: React.PointerEvent) => {
            if (!selectedImage) return;
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            const el = selectedImage.el;
            const box = el.getBoundingClientRect();
            imageDragRef.current = {
                type: "resize",
                handle,
                startX: e.clientX,
                startY: e.clientY,
                startW: box.width,
                startH: box.height,
                aspect: box.height ? box.width / box.height : 1,
                el,
            };
        }, [selectedImage]);

        const onMoveStart = useCallback((e: React.PointerEvent) => {
            if (!selectedImage) return;
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            imageDragRef.current = {
                type: "move",
                startX: e.clientX,
                startY: e.clientY,
                el: selectedImage.el,
            };
        }, [selectedImage]);

        useEffect(() => {
            const onMove = (e: PointerEvent) => {
                const drag = imageDragRef.current;
                if (!drag) return;
                if (drag.type === "resize") {
                    const dx = drag.handle.includes("w")
                        ? drag.startX - e.clientX
                        : drag.handle.includes("e")
                            ? e.clientX - drag.startX
                            : 0;
                    const dy = drag.handle.includes("n")
                        ? drag.startY - e.clientY
                        : drag.handle.includes("s")
                            ? e.clientY - drag.startY
                            : 0;
                    let width = drag.startW + dx;
                    if (!drag.handle.includes("e") && !drag.handle.includes("w")) {
                        width = drag.startH + dy > 0 ? (drag.startH + dy) * drag.aspect : drag.startW;
                    }
                    width = Math.max(40, width);
                    drag.el.style.width = `${Math.round(width)}px`;
                    drag.el.style.height = "auto";
                    drag.el.style.maxWidth = "100%";
                    return;
                }
                const root = scrollRef.current;
                if (!root) return;
                const blocks = root.querySelectorAll<HTMLElement>("[data-source-start]");
                let line: number | null = null;
                for (const block of blocks) {
                    const r = block.getBoundingClientRect();
                    if (e.clientY < r.top + r.height / 2) {
                        line = r.top - root.getBoundingClientRect().top + root.scrollTop;
                        break;
                    }
                    line = r.bottom - root.getBoundingClientRect().top + root.scrollTop;
                }
                setDropY(line);
            };
            const onUp = (e: PointerEvent) => {
                const drag = imageDragRef.current;
                if (!drag) return;
                imageDragRef.current = null;
                setDropY(null);
                if (drag.type === "resize") {
                    const width = drag.el.getBoundingClientRect().width;
                    const range = selectedImage?.range ?? findImageSpan(
                        contentRef.current,
                        drag.el.getAttribute("data-md-src") || "",
                    );
                    if (!range) return;
                    const next = setImageWidth(contentRef.current, range, width);
                    if (next) applyContent(next);
                    setSelectedImage(null);
                    return;
                }
                const moved = Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY);
                if (moved < 6) return;
                const under = document.elementFromPoint(e.clientX, e.clientY);
                const block = under instanceof Element
                    ? under.closest("[data-source-start]") as HTMLElement | null
                    : null;
                const range = selectedImage?.range ?? findImageSpan(
                    contentRef.current,
                    drag.el.getAttribute("data-md-src") || "",
                );
                if (!range || !block) return;
                const target = Number(block.getAttribute("data-source-start"));
                if (!Number.isFinite(target)) return;
                applyContent(moveMarkdownRange(contentRef.current, range, target));
                setSelectedImage(null);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
            return () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
            };
        }, [applyContent, selectedImage]);

        useEffect(() => {
            const onKey = (e: KeyboardEvent) => {
                const root = scrollRef.current;
                if (!root || !onApplyContent) return;
                const inPreview = root.contains(document.activeElement) || editingRef.current;
                if (e.key === "Escape") {
                    commitEdit();
                    setSelection(null);
                    setSelectedImage(null);
                    return;
                }
                if ((e.key === "Delete" || e.key === "Backspace") && selectedImage?.range && !editingRef.current) {
                    e.preventDefault();
                    applyContent(deleteBlock(contentRef.current, selectedImage.range));
                    setSelectedImage(null);
                    return;
                }
                if (e.key === "Enter" && editingRef.current && !e.shiftKey) {
                    e.preventDefault();
                    const el = editingRef.current;
                    const range = sourceRangeFromElement(el, root, contentRef.current.length);
                    if (!range) return;
                    const text = (el.innerText || "").replace(/\n+$/, "");
                    editingRef.current = null;
                    el.removeAttribute("contenteditable");
                    insertLineAfter(range, text);
                    return;
                }
                if (e.key === "Backspace" && editingRef.current) {
                    const el = editingRef.current;
                    const empty = !(el.innerText || "").replace(/\u00a0/g, "").trim();
                    const atStart = caretOffsetIn(el) === 0;
                    if (empty || (atStart && empty)) {
                        e.preventDefault();
                        const range = sourceRangeFromElement(el, root, contentRef.current.length);
                        editingRef.current = null;
                        el.removeAttribute("contenteditable");
                        if (range) applyContent(deleteBlock(contentRef.current, range));
                    }
                    return;
                }
                if (!inPreview && !selection) return;
                if (!(e.ctrlKey || e.metaKey)) return;
                if (e.key === "b") {
                    e.preventDefault();
                    handleFormat("bold");
                } else if (e.key === "i") {
                    e.preventDefault();
                    handleFormat("italic");
                } else if (e.key === "e") {
                    e.preventDefault();
                    handleFormat("code");
                }
            };
            window.addEventListener("keydown", onKey);
            return () => window.removeEventListener("keydown", onKey);
        }, [applyContent, commitEdit, handleFormat, insertLineAfter, onApplyContent, selectedImage, selection]);

        const handleUndo = useCallback(() => {
            window.dispatchEvent(new CustomEvent("shape-editor-action", { detail: { action: "undo" } }));
        }, []);

        const handleRedo = useCallback(() => {
            window.dispatchEvent(new CustomEvent("shape-editor-action", { detail: { action: "redo" } }));
        }, []);

        const hasSelection = Boolean(selection?.text);

        return (
            <MarkdownPreviewProvider value={api}>
                <MarkdownEditorContextMenu
                    hasSelection={hasSelection}
                    canEdit={editable}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    onCut={handleCut}
                    onCopy={handleCopy}
                    onPaste={() => void handlePaste()}
                    onSelectAll={handleSelectAll}
                >
                    <div
                        ref={setRefs}
                        onPointerDown={handlePointerDown}
                        onPointerUp={handlePointerUp}
                        onContextMenu={(e) => {
                            const el = e.target;
                            if (!(el instanceof Element)) return;
                            const img = el instanceof HTMLImageElement ? el : el.closest("img");
                            if (img instanceof HTMLImageElement) selectImage(img);
                        }}
                        onClickCapture={(e) => {
                            const el = e.target;
                            if (!(el instanceof Element)) return;
                            const anchor = el.closest("a");
                            if (!anchor || !scrollRef.current?.contains(anchor)) return;
                            if (editingRef.current) return;
                            const href = anchor.getAttribute("href");
                            if (!href) return;
                            handleMarkdownLinkClick(e as unknown as React.MouseEvent, href);
                        }}
                        className={cn(
                            "h-full overflow-auto p-12 bg-editor border-l border-border text-text-primary custom-scrollbar selection:bg-accent-text/20",
                            className,
                        )}
                    >
                        {selection && onApplyContent && !ai && (
                            <MarkdownToolbar
                                selection={selection}
                                scrollRoot={scrollRef.current}
                                loading={rewriteLoading || Boolean(ai)}
                                loggedIn={loggedIn}
                                onFormat={handleFormat}
                                onBlock={handleBlock}
                                onList={handleList}
                                onQuote={handleQuote}
                                onFence={handleFence}
                                onLink={handleLink}
                                onInsertTable={() => insertAt(insertTableSnippet)}
                                onInsertRule={() => insertAt(insertHorizontalRule)}
                                onInsertImage={(src) => insertAt((c, at) => insertImageSnippet(c, at, src))}
                                onAi={(action) => void handleAi(action)}
                                onClose={() => setSelection(null)}
                                onRectChange={(rect) => {
                                    setSelection((prev) => (prev ? { ...prev, rect } : prev));
                                }}
                            />
                        )}
                        {ai && <MarkdownAiOverlay state={ai} />}
                        {selectedImage && onApplyContent && (
                            <MarkdownImageBox
                                el={selectedImage.el}
                                onResizeStart={onResizeStart}
                                onMoveStart={onMoveStart}
                            />
                        )}
                        <div className="relative mx-auto w-full max-w-4xl">
                            {dropY != null && (
                                <div
                                    className="pointer-events-none absolute right-0 left-0 z-10 h-0.5 bg-accent-text shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent-text)_40%,transparent)]"
                                    style={{ top: dropY }}
                                />
                            )}
                            <div
                                data-md-body
                                className="cursor-text select-text text-[16px] leading-normal wrap-break-word *:first:mt-0 *:last:mb-0 [&_[contenteditable]]:caret-accent-text [&_[contenteditable]]:outline-none [&_[contenteditable]]:shadow-[inset_0_-1px_0_color-mix(in_srgb,var(--accent-text)_45%,transparent)] [&_sub]:relative [&_sub]:bottom-[-0.25em] [&_sub]:align-baseline [&_sub]:text-[75%] [&_sup]:relative [&_sup]:top-[-0.5em] [&_sup]:align-baseline [&_sup]:text-[75%]"
                            >
                                {isHugeDoc ? (
                                    <pre className="whitespace-pre-wrap wrap-break-word font-mono text-sm text-text-secondary">
                                        {content.slice(0, LARGE_MARKDOWN_CHARS)}
                                        {"\n\n… Preview truncated for performance. Open the source tab to edit the full file."}
                                    </pre>
                                ) : (
                                    <MarkdownTree content={content} />
                                )}
                            </div>
                            {onApplyContent && !isHugeDoc && (
                                <button
                                    type="button"
                                    data-md-add
                                    className="mt-1 block min-h-10 w-full cursor-text rounded-lg border-0 bg-transparent hover:bg-accent-text/10"
                                    title="Add a paragraph"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        commitEdit();
                                        const { next, caret } = insertEmptyParagraphAtEnd(contentRef.current);
                                        applyContent(next);
                                        setPendingCaret(caret);
                                    }}
                                />
                            )}
                        </div>
                    </div>
                </MarkdownEditorContextMenu>
            </MarkdownPreviewProvider>
        );
    },
);

MarkdownPreview.displayName = "MarkdownPreview";
