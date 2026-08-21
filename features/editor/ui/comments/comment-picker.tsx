"use client";

import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { commands } from "@/lib/backend";
import { resolveGithubAvatarUrl } from "@/lib/git/github-avatar";
import { getTextareaCaretViewportRect } from "@/lib/textarea-caret";
import {
    hostnameLabel,
    looksLikeUrl,
    normalizeHref,
    remoteUrlToHttps,
    type CommentTag,
} from "@/lib/editor-comments";

type CategoryId = "files" | "people" | "websites" | null;

const CATEGORIES: { id: Exclude<CategoryId, null>; label: string }[] = [
    { id: "files", label: "Files" },
    { id: "people", label: "People" },
    { id: "websites", label: "Websites" },
];

export type GitPerson = { name: string; email: string; login?: string; avatarUrl?: string };

function personAvatar(person: { name: string; email?: string; login?: string; avatarUrl?: string }): string | null {
    return person.avatarUrl || resolveGithubAvatarUrl(person.email, person.login || person.name, 32);
}

function pathDir(path: string): string {
    const parts = path.replace(/\\/g, "/").split("/");
    if (parts.length <= 1) return "";
    const dir = parts.slice(0, -1).join("/");
    if (dir.length <= 28) return dir;
    return `…${dir.slice(-26)}`;
}

export function CommentTagPicker({
    open,
    query,
    onPick,
    onClose,
    anchorRef,
    lineAnchorRef,
    caretIndex,
    people,
    remoteUrl,
}: {
    open: boolean;
    query: string;
    onPick: (tag: CommentTag) => void;
    onClose: () => void;
    anchorRef?: RefObject<HTMLTextAreaElement | null>;
    lineAnchorRef?: RefObject<HTMLElement | null>;
    caretIndex?: number;
    people: GitPerson[];
    remoteUrl?: string | null;
}) {
    const [files, setFiles] = useState<string[]>([]);
    const [activeCategory, setActiveCategory] = useState<CategoryId>(null);
    const [highlight, setHighlight] = useState(0);
    const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
    const [menuEl, setMenuEl] = useState<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        if (!open) return;
        const el = anchorRef?.current;
        const update = () => {
            if (!el) return;
            const atIndex = typeof caretIndex === "number" ? caretIndex : el.selectionStart ?? 0;
            const caretRect = getTextareaCaretViewportRect(el, atIndex);
            const lineRect = lineAnchorRef?.current?.getBoundingClientRect();
            const width = 280;
            const measured = menuEl?.offsetHeight;
            const menuHeight = measured && measured > 0 ? measured : 220;
            const snapTop = lineRect ? Math.round(lineRect.top) : Math.round(caretRect.top);
            const snapHeight = lineRect ? lineRect.height : caretRect.height;
            let left = lineRect ? Math.round(lineRect.left) : Math.round(caretRect.left);
            let top = snapTop - menuHeight - 6;
            if (top < 8) top = snapTop + snapHeight + 6;
            left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
            setPos({ left, top, width });
        };
        update();
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        el?.addEventListener("scroll", update);
        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
            el?.removeEventListener("scroll", update);
        };
    }, [open, anchorRef, lineAnchorRef, caretIndex, query, activeCategory, menuEl, files.length, people.length]);

    useEffect(() => {
        if (open) return;
        const id = requestAnimationFrame(() => {
            setPos(null);
            setActiveCategory(null);
            setHighlight(0);
        });
        return () => cancelAnimationFrame(id);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        void (async () => {
            try {
                const results = await commands.searchProjectFiles(query || "", 40);
                if (!cancelled) {
                    setFiles(results.map((r) => (r.relative_path || r.path).replace(/\\/g, "/")));
                }
            } catch {
                if (!cancelled) setFiles([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, query]);

    const fileTags: CommentTag[] = useMemo(() => {
        const q = query.trim().toLowerCase();
        return files
            .filter((path) => !q || path.toLowerCase().includes(q))
            .slice(0, 10)
            .map((path) => ({
                kind: "file" as const,
                path,
                label: path.split("/").pop() || path,
            }));
    }, [files, query]);

    const peopleTags: CommentTag[] = useMemo(() => {
        const q = query.trim().toLowerCase();
        return people
            .filter(
                (p) =>
                    !q ||
                    p.name.toLowerCase().includes(q) ||
                    p.email.toLowerCase().includes(q) ||
                    (p.login || "").toLowerCase().includes(q),
            )
            .slice(0, 10)
            .map((p) => ({
                kind: "person" as const,
                name: p.name,
                email: p.email || undefined,
                login: p.login,
                avatarUrl: p.avatarUrl,
            }));
    }, [people, query]);

    const websiteTags: CommentTag[] = useMemo(() => {
        const items: CommentTag[] = [];
        const q = query.trim();
        if (looksLikeUrl(q)) {
            const href = normalizeHref(q);
            items.push({ kind: "url", href, label: hostnameLabel(href) });
        }
        if (remoteUrl) {
            const href = remoteUrlToHttps(remoteUrl);
            if (href) {
                const label = hostnameLabel(href);
                if (!q || href.toLowerCase().includes(q.toLowerCase()) || label.includes(q.toLowerCase())) {
                    items.push({ kind: "url", href, label });
                }
            }
        }
        const seen = new Set<string>();
        return items.filter((item) => {
            if (item.kind !== "url" || seen.has(item.href)) return false;
            seen.add(item.href);
            return true;
        });
    }, [query, remoteUrl]);

    const categoryItems = useMemo(() => {
        if (activeCategory === "files") return fileTags;
        if (activeCategory === "people") return peopleTags;
        if (activeCategory === "websites") return websiteTags;
        return [];
    }, [activeCategory, fileTags, peopleTags, websiteTags]);

    const rootItems = useMemo(() => {
        if (activeCategory) return categoryItems;
        const q = query.trim();
        if (looksLikeUrl(q)) return websiteTags;
        if (q) {
            return [...fileTags.slice(0, 6), ...peopleTags.slice(0, 4), ...websiteTags];
        }
        return [...fileTags.slice(0, 6), ...peopleTags.slice(0, 3)];
    }, [activeCategory, categoryItems, query, fileTags, peopleTags, websiteTags]);

    const visibleCategories = CATEGORIES.filter((c) => c.id !== "people" || people.length > 0);
    const showCategories = !activeCategory && !query.trim();

    useEffect(() => {
        const id = requestAnimationFrame(() => setHighlight(0));
        return () => cancelAnimationFrame(id);
    }, [activeCategory, query, rootItems.length]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                if (activeCategory) setActiveCategory(null);
                else onClose();
                return;
            }
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, Math.max(rootItems.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && rootItems[highlight]) {
                e.preventDefault();
                e.stopPropagation();
                onPick(rootItems[highlight]);
                onClose();
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open, activeCategory, rootItems, highlight, onPick, onClose]);

    if (!open || !pos) return null;

    return createPortal(
        <div
            ref={setMenuEl}
            className="fixed z-[200] max-h-72 overflow-hidden rounded-xl border border-border-subtle bg-surface-4 shadow-md/20"
            style={{ left: pos.left, top: pos.top, width: pos.width }}
        >
            {activeCategory ? (
                <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-muted hover:text-text-primary"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setActiveCategory(null)}
                >
                    <Icon name="arrow_back" size={12} />
                    {CATEGORIES.find((c) => c.id === activeCategory)?.label ?? "Back"}
                </button>
            ) : null}

            <div className="max-h-64 overflow-y-auto px-1 py-1">
                {showCategories ? (
                    visibleCategories.map((cat) => (
                        <button
                            key={cat.id}
                            type="button"
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setActiveCategory(cat.id)}
                        >
                            {cat.id === "people" ? (
                                <div className="flex h-4 w-9 shrink-0 items-center -space-x-1.5">
                                    {people.slice(0, 3).map((person) => {
                                        const src = personAvatar(person);
                                        return src ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                key={person.login || person.email || person.name}
                                                src={src}
                                                alt=""
                                                className="size-4 rounded-full object-cover ring-1 ring-surface-4"
                                            />
                                        ) : (
                                            <span
                                                key={person.login || person.email || person.name}
                                                className="flex size-4 items-center justify-center rounded-full bg-panel ring-1 ring-surface-4"
                                            >
                                                <Icon name="person" size={10} className="text-text-muted" />
                                            </span>
                                        );
                                    })}
                                </div>
                            ) : null}
                            {cat.label}
                        </button>
                    ))
                ) : rootItems.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-text-muted">No matches</div>
                ) : (
                    rootItems.map((item, idx) => (
                        <button
                            key={`${item.kind}-${idx}-${item.kind === "file" ? item.path : item.kind === "url" ? item.href : item.name}`}
                            type="button"
                            className={cn(
                                "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs",
                                idx === highlight
                                    ? "bg-panel-hover text-text-primary"
                                    : "text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                            )}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                onPick(item);
                                onClose();
                            }}
                        >
                            {item.kind === "person" ? <PickerIcon tag={item} /> : null}
                            <span className="min-w-0 flex-1 truncate">{item.kind === "file" ? item.label : item.kind === "url" ? item.label : item.name}</span>
                            {item.kind === "file" ? (
                                <span className="shrink-0 text-2xs text-text-muted">{pathDir(item.path)}</span>
                            ) : null}
                        </button>
                    ))
                )}
            </div>
        </div>,
        document.body,
    );
}

function PickerIcon({ tag }: { tag: CommentTag }) {
    if (tag.kind !== "person") return null;
    const avatar = tag.avatarUrl || resolveGithubAvatarUrl(tag.email, tag.login || tag.name, 32);
    if (avatar) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" width={14} height={14} className="h-3.5 w-3.5 shrink-0 rounded-full object-cover" />
        );
    }
    return <Icon name="person" size={14} className="shrink-0 text-text-muted" />;
}
