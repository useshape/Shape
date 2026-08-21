"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { ThinkingPixels } from "@/features/chat/ui/blocks/loading-state";
import { notify } from "@/features/notifications";
import { getShapeAccessToken, useShapeAuth } from "@/lib/shape-auth/store";
import { commentTagToken, formatCommentTime, tagsFromCommentBody, type CommentTag, type FileComment } from "@/lib/editor-comments";
import { cn } from "@/lib/utils";
import { CommentChip } from "./comment-chips";
import { CommentTagPicker, type GitPerson } from "./comment-picker";

export function CommentZone({
    mode,
    comment,
    people,
    remoteUrl,
    onSave,
    onCancel,
    onDelete,
    onHeight,
    onAskAi,
}: {
    mode: "compose" | "view";
    comment?: FileComment;
    people: GitPerson[];
    remoteUrl?: string | null;
    onSave: (body: string, tags: CommentTag[]) => void;
    onCancel: () => void;
    onDelete?: () => void;
    onHeight: (height: number) => void;
    onAskAi?: (instruction: string) => Promise<string>;
}) {
    const shapeAuth = useShapeAuth();
    const [editing, setEditing] = useState(mode === "compose");
    const [body, setBody] = useState(comment?.body ?? "");
    const [tags, setTags] = useState<CommentTag[]>(comment?.tags ?? []);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerQuery, setPickerQuery] = useState("");
    const [atIndex, setAtIndex] = useState(0);
    const [aiLoading, setAiLoading] = useState(false);
    const [textSwapPhase, setTextSwapPhase] = useState<"idle" | "out" | "in">("idle");
    const [overflowing, setOverflowing] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const clampRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const signedIn = shapeAuth.loggedIn && !shapeAuth.isLoading;
    const hasText = body.trim().length > 0;
    const { head, tail } = useMemo(() => splitComposer(body, tags), [body, tags]);
    const headText = useMemo(() => serializeComposer(head), [head]);

    useEffect(() => {
        if (!editing) return;
        const id = window.requestAnimationFrame(() => inputRef.current?.focus());
        return () => window.cancelAnimationFrame(id);
    }, [editing]);

    const dismiss = useCallback(() => {
        if (mode === "view") {
            setEditing(false);
            setBody(comment?.body ?? "");
            setTags(comment?.tags ?? []);
            return;
        }
        onCancel();
    }, [mode, comment, onCancel]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (pickerOpen) return;
            e.preventDefault();
            e.stopPropagation();
            dismiss();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [pickerOpen, dismiss]);

    useLayoutEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const report = () => {
            const { width, height } = el.getBoundingClientRect();
            if (width < 80) return;
            const next = Math.max(32, Math.ceil(height));
            onHeight(next);
        };
        report();
        const ro = new ResizeObserver(report);
        ro.observe(el);
        return () => ro.disconnect();
    }, [onHeight, editing, body, tags, pickerOpen, aiLoading]);

    useLayoutEffect(() => {
        const el = inputRef.current;
        if (!el || !editing) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(240, Math.max(28, el.scrollHeight))}px`;
    }, [tail, editing, aiLoading]);

    useLayoutEffect(() => {
        const el = clampRef.current;
        if (!el || editing) return;
        setOverflowing(el.scrollHeight > el.clientHeight + 1);
    }, [editing, body]);

    const closePicker = useCallback(() => {
        setPickerOpen(false);
        setPickerQuery("");
    }, []);

    const insertTag = useCallback((tag: CommentTag) => {
        setTags((prev) => {
            const dup = prev.some((t) => {
                if (t.kind !== tag.kind) return false;
                if (t.kind === "file" && tag.kind === "file") return t.path === tag.path;
                if (t.kind === "url" && tag.kind === "url") return t.href === tag.href;
                if (t.kind === "person" && tag.kind === "person") {
                    return (t.login || t.name) === (tag.login || tag.name);
                }
                return false;
            });
            return dup ? prev : [...prev, tag];
        });
        const token = commentTagToken(tag);
        const el = inputRef.current;
        const start = el?.selectionStart ?? tail.length;
        const from = tail.lastIndexOf("@", start - 1);
        const nextTail = from >= 0 ? `${tail.slice(0, from)}${token} ${tail.slice(start)}` : `${tail}${token} `;
        setBody(headText + nextTail);
        closePicker();
        requestAnimationFrame(() => {
            const field = inputRef.current;
            if (!field) return;
            field.focus();
            const pos = field.value.length;
            field.setSelectionRange(pos, pos);
        });
    }, [tail, headText, closePicker]);

    const commit = useCallback(() => {
        const next = body.trim();
        if (!next && tags.length === 0) {
            if (comment && onDelete) onDelete();
            else onCancel();
            return;
        }
        onSave(next, tags);
        if (mode === "view") setEditing(false);
    }, [body, tags, comment, onDelete, onCancel, onSave, mode]);

    const askAi = useCallback(async () => {
        if (!signedIn || !onAskAi || aiLoading) return;
        const instruction = body.trim();
        if (!instruction) {
            notify.warn("Describe the comment you want AI to write");
            inputRef.current?.focus();
            return;
        }
        const token = getShapeAccessToken();
        if (!token) return;
        setAiLoading(true);
        try {
            const written = await onAskAi(instruction);
            if (written.trim()) {
                const next = written.trim();
                setTextSwapPhase("out");
                await new Promise((resolve) => window.setTimeout(resolve, 160));
                setTags((prev) => {
                    const extra = tagsFromCommentBody(next, people);
                    const merged = [...prev];
                    for (const tag of extra) {
                        if (merged.some((item) => commentTagToken(item) === commentTagToken(tag))) continue;
                        merged.push(tag);
                    }
                    return merged;
                });
                setBody(next);
                closePicker();
                setTextSwapPhase("in");
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => setTextSwapPhase("idle"));
                });
            }
        } catch (err) {
            notify.error("Couldn't write comment", err instanceof Error ? err.message : String(err));
        } finally {
            setAiLoading(false);
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [signedIn, onAskAi, aiLoading, body, closePicker, people]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        e.stopPropagation();
        if (
            e.key === "Backspace" &&
            e.currentTarget.selectionStart === 0 &&
            e.currentTarget.selectionEnd === 0 &&
            head.length > 0
        ) {
            e.preventDefault();
            const last = head[head.length - 1];
            const nextHead = head.slice(0, -1);
            if (typeof last !== "string") {
                setTags((prev) => prev.filter((t) => commentTagToken(t) !== commentTagToken(last)));
            }
            setBody(serializeComposer(nextHead) + tail);
            return;
        }
        if (pickerOpen) return;
        if (e.key === "Escape") {
            e.preventDefault();
            dismiss();
            return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
        }
    };

    const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setBody(headText + value);
        const caret = e.target.selectionStart ?? value.length;
        const before = value.slice(0, caret);
        const at = before.search(/@([^\s@]*)$/);
        if (at >= 0) {
            setAtIndex(at);
            setPickerQuery(before.slice(at + 1));
            setPickerOpen(true);
        } else {
            closePicker();
        }
    };

    if (!editing) {
        const preview = (
            <div
                ref={wrapRef}
                className="shape-comment-zone-inner py-1 pr-3"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div
                    className="flex cursor-text items-start gap-2 rounded-lg border border-border-subtle bg-surface-3 px-3 py-1.5"
                    onClick={() => setEditing(true)}
                >
                    <div
                        ref={clampRef}
                        className={cn(
                            "shape-comment-clamp min-w-0 flex-1 text-sm leading-[1.35] text-text-primary",
                            overflowing && "shape-comment-clamp-fade",
                        )}
                    >
                        <CommentInlineBody body={body} tags={tags} />
                    </div>
                    {comment ? (
                        <span
                            className="shrink-0 pt-px text-2xs tabular-nums text-text-muted"
                        >
                            {formatCommentTime(comment.createdAt)}
                        </span>
                    ) : null}
                </div>
            </div>
        );
        return comment ? (
            <Tooltip content={new Date(comment.createdAt).toLocaleString()} side="top">
                {preview}
            </Tooltip>
        ) : preview;
    }

    return (
        <div
            ref={wrapRef}
            className="shape-comment-zone-inner py-1 pr-3"
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
        >
            <div className="flex items-start gap-1 rounded-md bg-surface-3 px-1">
                <Tooltip
                    content={
                        signedIn
                            ? "Write this comment with AI"
                            : "Sign in to use AI comments"
                    }
                >
                    <Button
                        variant="ghost"
                        size="xs"
                        className={cn("mt-0.5 px-1", !signedIn && "opacity-40", aiLoading && "text-accent")}
                        disabled={!signedIn || aiLoading || !onAskAi}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void askAi();
                        }}
                    >
                        <ThinkingPixels active={aiLoading} size={3} />
                    </Button>
                </Tooltip>
                <div
                    className={cn(
                        "flex min-h-7 min-w-0 flex-1 flex-wrap items-start content-start gap-x-0.5 gap-y-0.5 py-0.5",
                        "transition-[opacity,transform,filter] duration-160 ease-out",
                        textSwapPhase === "out" && "translate-y-1 scale-[0.99] opacity-0 blur-[2px]",
                        textSwapPhase === "in" && "-translate-y-1 scale-[0.99] opacity-0 blur-[2px]",
                    )}
                >
                    {head.map((part, i) =>
                        typeof part === "string" ? (
                            <span key={`t-${i}`} className="whitespace-pre-wrap text-sm leading-7 text-text-primary">
                                {part}
                            </span>
                        ) : (
                            <CommentChip key={`c-${i}`} tag={part} />
                        ),
                    )}
                    <textarea
                        ref={inputRef}
                        value={tail}
                        onChange={onChange}
                        onKeyDown={onKeyDown}
                        placeholder={head.length === 0 ? (aiLoading ? "Writing…" : "Add a comment… @ to mention someone") : undefined}
                        rows={1}
                        disabled={aiLoading}
                        className="min-h-7 min-w-0 flex-1 basis-32 resize-none overflow-hidden border-0 bg-transparent p-0 text-sm leading-7 text-text-primary outline-none"
                    />
                </div>
                <Button variant="ghost" size="xs" className="mt-0.5" aria-label="Exit" onClick={dismiss}>
                    <kbd>
                        Close
                    </kbd>
                </Button>
                {hasText ? (
                    <Button
                        size="xs"
                        disabled={aiLoading}
                        aria-label="Save comment"
                        className="mt-0.5 size-7 rounded-full px-0 bg-text-primary text-panel hover:bg-text-primary/90"
                        onClick={() => commit()}
                    >
                        <Icon name="arrow_upward" size={16} />
                    </Button>
                ) : null}
            </div>
            <CommentTagPicker
                open={pickerOpen}
                query={pickerQuery}
                onPick={insertTag}
                onClose={closePicker}
                anchorRef={inputRef}
                lineAnchorRef={wrapRef}
                caretIndex={atIndex}
                people={people}
                remoteUrl={remoteUrl}
            />
        </div>
    );
}

function splitComposer(body: string, tags: CommentTag[]): { head: Array<string | CommentTag>; tail: string } {
    const byToken = new Map(tags.map((t) => [commentTagToken(t), t]));
    const parts: Array<string | CommentTag> = body
        .split(/(@[^\s]+|https?:\/\/[^\s]+)/g)
        .filter((p) => p.length > 0)
        .map((part) => {
            const tag = byToken.get(part);
            if (tag) return tag;
            if (/^https?:\/\//.test(part)) return { kind: "url" as const, href: part, label: part };
            return part;
        });
    if (parts.length === 0) return { head: [], tail: "" };
    const last = parts[parts.length - 1];
    if (typeof last === "string") return { head: parts.slice(0, -1), tail: last };
    return { head: parts, tail: "" };
}

function serializeComposer(parts: Array<string | CommentTag>): string {
    return parts
        .map((part) => {
            if (typeof part === "string") return part;
            if (part.kind === "url") return part.href;
            return commentTagToken(part);
        })
        .join("");
}

function CommentInlineBody({ body, tags }: { body: string; tags: CommentTag[] }) {
    if (!body.trim()) {
        return <span className="text-text-muted">Comment</span>;
    }
    const byToken = new Map(tags.map((t) => [commentTagToken(t), t]));
    const parts = body.split(/(@[^\s]+|https?:\/\/[^\s]+)/g).filter((p) => p.length > 0);
    return (
        <span className="whitespace-pre-wrap wrap-break-word">
            {parts.map((part, i) => {
                const tag = byToken.get(part);
                if (tag) return <CommentChip key={`${part}-${i}`} tag={tag} />;
                if (part.startsWith("http")) {
                    return <CommentChip key={`${part}-${i}`} tag={{ kind: "url", href: part, label: part }} />;
                }
                return <span key={`${part}-${i}`}>{part}</span>;
            })}
        </span>
    );
}
