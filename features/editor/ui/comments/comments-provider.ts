"use client";

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { commands } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { getShapeAccessToken } from "@/lib/shape-auth/store";
import {
    newCommentId,
    parseGithubRepo,
    reanchorLine,
    remoteUrlToHttps,
    snippetOfLine,
    toProjectRelative,
    type CommentTag,
    type FileComment,
} from "@/lib/editor-comments";
import { CommentZone } from "./comment-zone";
import { type GitPerson } from "./comment-picker";
import {
    deleteFileComment,
    listCommentsForFile,
    persistCommentLines,
    saveFileComment,
} from "./comments-store";

const STYLE_ID = "shape-comment-style-v3";

function ensureCommentStyles() {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        document.head.appendChild(style);
    }
    style.textContent = `
        .shape-comment-plus {
            cursor: pointer;
        }
        .shape-comment-plus::before {
            content: "+";
            display: block;
            font-family: var(--font-ui);
            font-size: 14px;
            font-weight: 400;
            line-height: 18px;
            text-align: center;
            color: var(--text-muted);
            user-select: none;
        }
        .shape-comment-plus:hover::before {
            color: var(--text-primary);
        }
        .shape-comment-zone-spacer {
            width: 100%;
            height: 100%;
        }
        .shape-comment-overlay {
            position: fixed;
            z-index: 40;
            pointer-events: auto;
            overflow: visible;
        }
        .shape-comment-clamp {
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 3;
            overflow: hidden;
            line-height: 1.35;
            max-height: calc(1.35em * 3);
        }
        .shape-comment-clamp-fade {
            mask-image: linear-gradient(to bottom, black 0%, black 62%, transparent 100%);
            -webkit-mask-image: linear-gradient(to bottom, black 0%, black 62%, transparent 100%);
        }
    `;
}

if (typeof document !== "undefined") ensureCommentStyles();

type ZoneKind = { type: "compose"; line: number } | { type: "view"; commentId: string };

type ZoneRec = {
    id: string;
    kind: ZoneKind;
    line: number;
    lastTop: number;
    zone: { afterLineNumber: number; heightInPx: number; domNode: HTMLElement };
    overlay: HTMLElement;
    root: Root;
};

function stripGeneratedComment(raw: string): string {
    const trimmed = raw.trim().replace(/<\/?redacted_thinking[^>]*>\s*/gi, "").replace(/<\/?thinking[^>]*>\s*/gi, "");
    const match = trimmed.match(/^```[\w-]*\n?([\s\S]*?)\n?```$/);
    return (match ? match[1] : trimmed).trim();
}

export function attachCommentsProvider(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    monaco: any,
    getFilePath: () => string,
    getProjectPath: () => string | null,
) {
    ensureCommentStyles();
    document.querySelectorAll(".shape-comment-overlay").forEach((el) => el.remove());

    const plusDecos = editor.createDecorationsCollection();
    const markDecos = editor.createDecorationsCollection();
    const zones = new Map<string, ZoneRec>();
    let comments: FileComment[] = [];
    let hoverLine = 0;
    let cursorLine = editor.getPosition?.()?.lineNumber ?? 1;
    let people: GitPerson[] = [];
    let remoteUrl: string | null = null;
    let persistTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let metrics = { contentLeft: 0, contentWidth: 480, contentTop: 0 };
    let hostOrigin = { top: 0, left: 0 };

    const zoneKey = (kind: ZoneKind) =>
        kind.type === "compose" ? `compose:${kind.line}` : `view:${kind.commentId}`;

    const cacheHostOrigin = () => {
        const host = editor.getDomNode?.() as HTMLElement | null;
        if (!host) return;
        const rect = host.getBoundingClientRect();
        hostOrigin = { top: rect.top, left: rect.left };
    };

    const readLayout = () => {
        try {
            const info = editor.getLayoutInfo?.();
            if (!info) return;
            metrics = {
                contentLeft: info.contentLeft ?? 0,
                contentWidth: info.contentWidth ?? 480,
                contentTop: info.contentTop ?? 0,
            };
        } catch {
            /* ignored */
        }
        cacheHostOrigin();
    };

    const applyOverlay = (rec: ZoneRec) => {
        const { overlay, lastTop } = rec;
        if (lastTop < -1000) {
            overlay.style.visibility = "hidden";
            return;
        }
        overlay.style.visibility = "visible";
        overlay.style.top = `${Math.round(hostOrigin.top + metrics.contentTop + lastTop)}px`;
        overlay.style.left = `${Math.round(hostOrigin.left + metrics.contentLeft)}px`;
        overlay.style.width = `${Math.max(160, metrics.contentWidth - 8)}px`;
        overlay.style.height = "auto";
    };

    const closeZone = (key: string) => {
        const rec = zones.get(key);
        if (!rec) return;
        try {
            editor.changeViewZones((accessor: { removeZone: (id: string) => void }) => {
                accessor.removeZone(rec.id);
            });
        } catch {
            /* disposed */
        }
        rec.overlay.remove();
        setTimeout(() => rec.root.unmount(), 0);
        zones.delete(key);
        refreshPlus();
    };

    const closeAllZones = () => {
        for (const key of [...zones.keys()]) closeZone(key);
    };

    const setZoneHeight = (key: string, height: number) => {
        const rec = zones.get(key);
        if (!rec) return;
        const next = Math.max(8, Math.ceil(height));
        if (rec.zone.heightInPx === next) return;
        rec.zone.heightInPx = next;
        try {
            editor.changeViewZones((accessor: { layoutZone: (id: string) => void }) => {
                accessor.layoutZone(rec.id);
            });
        } catch {
            /* noop */
        }
    };

    const openZone = (kind: ZoneKind, line: number, comment?: FileComment) => {
        const key = zoneKey(kind);
        if (zones.has(key)) return;
        if (kind.type === "compose") {
            for (const existing of [...zones.keys()]) {
                if (zones.get(existing)?.kind.type === "compose") closeZone(existing);
            }
        }
        const domNode = document.createElement("div");
        domNode.className = "shape-comment-zone-spacer";

        const overlay = document.createElement("div");
        overlay.className = "shape-comment-overlay";
        readLayout();
        const overlayWidth = Math.max(160, metrics.contentWidth - 8);
        overlay.style.cssText = `position:fixed;inset:auto;top:0;left:0;width:${overlayWidth}px;height:auto;overflow:visible;visibility:hidden;z-index:40;pointer-events:auto;`;
        document.body.appendChild(overlay);

        const initialHeight = kind.type === "compose" ? 40 : Math.min(64, Math.max(28, Math.ceil((comment?.body.length ?? 40) / 52) * 18 + 16));
        const rec: ZoneRec = {
            id: "",
            kind,
            line,
            lastTop: -1_000_000,
            zone: {
                afterLineNumber: line,
                heightInPx: initialHeight,
                domNode,
            },
            overlay,
            root: null as unknown as Root,
        };
        const zone = rec.zone as typeof rec.zone & {
            suppressMouseDown: boolean;
            onDomNodeTop: (top: number) => void;
        };
        zone.suppressMouseDown = true;
        zone.onDomNodeTop = (top: number) => {
            rec.lastTop = top;
            applyOverlay(rec);
        };

        editor.changeViewZones((accessor: { addZone: (z: unknown) => string }) => {
            rec.id = accessor.addZone(zone);
        });

        rec.root = createRoot(overlay);
        zones.set(key, rec);

        const onHeight = (h: number) => {
            requestAnimationFrame(() => setZoneHeight(key, h));
        };

        const save = async (body: string, tags: CommentTag[]) => {
            const project = getProjectPath();
            const file = getFilePath();
            if (!project || !file) return;
            const model = editor.getModel();
            const snippet = model ? snippetOfLine(model.getLineContent(line) ?? "") : "";
            const now = Date.now();
            const next: FileComment = comment
                ? { ...comment, body, tags, line, snippet, updatedAt: now }
                : {
                      id: newCommentId(),
                      file: toProjectRelative(file, project),
                      line,
                      snippet,
                      body,
                      tags,
                      createdAt: now,
                      updatedAt: now,
                  };
            try {
                comments = await saveFileComment(project, next);
            } catch (err) {
                notify.error("Couldn't save comment", err instanceof Error ? err.message : String(err));
                return;
            }
            refreshMarks();
            if (kind.type === "compose") {
                closeZone(key);
                const saved = comments.find((c) => c.id === next.id);
                if (saved) openZone({ type: "view", commentId: saved.id }, saved.line, saved);
            }
        };

        const cancel = () => closeZone(key);
        const onDelete = comment
            ? async () => {
                  const project = getProjectPath();
                  const file = getFilePath();
                  if (!project || !file) return;
                  comments = await deleteFileComment(project, file, comment.id);
                  closeZone(key);
                  refreshMarks();
              }
            : undefined;

        const askAi = async (instruction: string) => {
            if (!instruction.trim()) {
                notify.warn("Describe the comment you want AI to write");
                return "";
            }
            const token = getShapeAccessToken();
            if (!token) {
                notify.warn("Sign in to use AI comments");
                return "";
            }
            const model = editor.getModel();
            const file = getFilePath();
            const project = getProjectPath();
            const rel = project ? toProjectRelative(file, project) : file;
            const start = Math.max(1, line - 8);
            const end = model ? Math.min(model.getLineCount(), line + 8) : line;
            const ctx: string[] = [];
            if (model) {
                for (let i = start; i <= end; i++) {
                    ctx.push(`${i === line ? ">>>" : "   "} ${i}| ${model.getLineContent(i)}`);
                }
            }
            const mentionHints = people
                .slice(0, 12)
                .map((person) => `@${(person.login || person.name).replace(/\s+/g, "")}`)
                .join(" ");
            const raw = await commands.generateEditorComment(
                instruction.trim(),
                rel,
                line,
                ctx.join("\n"),
                token,
                mentionHints || undefined,
            );
            return stripGeneratedComment(raw);
        };

        rec.root.render(
            React.createElement(CommentZone, {
                mode: kind.type === "compose" ? "compose" : "view",
                comment,
                people,
                remoteUrl,
                onSave: save,
                onCancel: cancel,
                onDelete,
                onHeight,
                onAskAi: askAi,
            }),
        );
        refreshPlus();
    };

    const commentsOnLine = (line: number) => comments.filter((c) => c.line === line);

    const toggleLine = (line: number) => {
        const onLine = commentsOnLine(line);
        if (onLine.length === 0) {
            const composeKey = zoneKey({ type: "compose", line });
            if (zones.has(composeKey)) closeZone(composeKey);
            else openZone({ type: "compose", line }, line);
            return;
        }
        const anyOpen = onLine.some((c) => zones.has(zoneKey({ type: "view", commentId: c.id })));
        if (anyOpen) {
            for (const c of onLine) closeZone(zoneKey({ type: "view", commentId: c.id }));
        } else {
            for (const c of onLine) openZone({ type: "view", commentId: c.id }, c.line, c);
        }
    };

    const refreshMarks = () => {
        markDecos.set(
            comments.map((c) => ({
                range: new monaco.Range(c.line, 1, c.line, 1),
                options: {
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                },
            })),
        );
        refreshPlus();
    };

    const refreshPlus = () => {
        const line = hoverLine || cursorLine;
        if (!line || commentsOnLine(line).length > 0) {
            plusDecos.set([]);
            return;
        }
        if (zones.has(zoneKey({ type: "compose", line }))) {
            plusDecos.set([]);
            return;
        }
        plusDecos.set([
            {
                range: new monaco.Range(line, 1, line, 1),
                options: {
                    glyphMarginClassName: "shape-comment-plus",
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                },
            },
        ]);
    };

    const reload = async () => {
        const project = getProjectPath();
        const file = getFilePath();
        if (!project || !file) {
            comments = [];
            refreshMarks();
            return;
        }
        comments = await listCommentsForFile(project, file);
        const model = editor.getModel();
        if (model && comments.length > 0) {
            const lines: string[] = model.getLinesContent();
            const moved: Array<{ id: string; line: number; snippet: string }> = [];
            comments = comments.map((c) => {
                const line = reanchorLine(c, lines);
                if (line === c.line) return c;
                moved.push({ id: c.id, line, snippet: snippetOfLine(lines[line - 1] ?? "") });
                return { ...c, line };
            });
            if (moved.length) void persistCommentLines(project, file, moved);
        }
        if (!disposed) {
            refreshMarks();
            for (const c of comments) {
                openZone({ type: "view", commentId: c.id }, c.line, c);
            }
        }
    };

    const loadMeta = async () => {
        const project = getProjectPath();
        if (!project) return;
        try {
            remoteUrl = remoteUrlToHttps(await commands.gitRemoteUrl(project));
        } catch {
            remoteUrl = null;
        }
        people = [];
        const parsed = remoteUrl ? parseGithubRepo(remoteUrl) : null;
        if (parsed) {
            try {
                const raw = await commands.githubApiGet(
                    `/repos/${parsed.owner}/${parsed.repo}/commits?per_page=30`,
                );
                const commits = JSON.parse(raw) as Array<{
                    author?: { login?: string; avatar_url?: string };
                    commit?: { author?: { name?: string; email?: string } };
                }>;
                const seen = new Map<string, GitPerson>();
                for (const entry of commits) {
                    const login = entry.author?.login;
                    const name = login || entry.commit?.author?.name?.trim();
                    if (!name) continue;
                    const key = (login || name).toLowerCase();
                    if (seen.has(key)) continue;
                    seen.set(key, {
                        name,
                        email: entry.commit?.author?.email || "",
                        login: login || undefined,
                        avatarUrl: entry.author?.avatar_url,
                    });
                }
                people = [...seen.values()];
            } catch {
                people = [];
            }
            if (people.length === 0) {
                try {
                    const raw = await commands.githubApiGet(
                        `/repos/${parsed.owner}/${parsed.repo}/contributors?per_page=10`,
                    );
                    const list = JSON.parse(raw) as Array<{ login?: string; avatar_url?: string }>;
                    people = list
                        .filter((c) => c.login)
                        .map((c) => ({
                            name: c.login as string,
                            email: "",
                            login: c.login,
                            avatarUrl: c.avatar_url,
                        }));
                } catch {
                    people = [];
                }
            }
        }
    };

    const persistTrackedLines = () => {
        const project = getProjectPath();
        const file = getFilePath();
        if (!project || !file) return;
        const ranges = markDecos.getRanges?.() as Array<{ startLineNumber: number }> | undefined;
        if (!ranges || ranges.length !== comments.length) return;
        const model = editor.getModel();
        const updates: Array<{ id: string; line: number; snippet: string }> = [];
        comments = comments.map((c, i) => {
            const line = ranges[i]?.startLineNumber ?? c.line;
            const snippet = model ? snippetOfLine(model.getLineContent(line) ?? "") : c.snippet;
            if (line !== c.line || snippet !== c.snippet) {
                updates.push({ id: c.id, line, snippet });
                return { ...c, line, snippet };
            }
            return c;
        });
        if (updates.length) void persistCommentLines(project, file, updates);
    };

    const onMouseMove = (e: { target: { type: number; position?: { lineNumber: number } } }) => {
        const type = e.target.type;
        const line = e.target.position?.lineNumber ?? 0;
        const gutter =
            type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
            type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
            type === monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS;
        const next = gutter && line ? line : 0;
        if (next === hoverLine) return;
        hoverLine = next;
        refreshPlus();
    };

    const onMouseDown = (e: {
        target: { type: number; position?: { lineNumber: number } };
        event: { preventDefault: () => void; stopPropagation: () => void };
    }) => {
        if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
        const line = e.target.position?.lineNumber;
        if (!line) return;
        e.event.preventDefault();
        e.event.stopPropagation();
        toggleLine(line);
    };

    const onMouseLeave = () => {
        hoverLine = 0;
        refreshPlus();
    };

    void (async () => {
        await loadMeta();
        if (!disposed) await reload();
    })();

    readLayout();
    const mouseMove = editor.onMouseMove(onMouseMove);
    const mouseDown = editor.onMouseDown(onMouseDown);
    const mouseLeave = editor.onMouseLeave(onMouseLeave);
    const cursor = editor.onDidChangeCursorPosition(() => {
        cursorLine = editor.getPosition()?.lineNumber ?? cursorLine;
        refreshPlus();
    });
    const layoutChange = editor.onDidLayoutChange?.(() => {
        readLayout();
        for (const rec of zones.values()) applyOverlay(rec);
    });
    const modelChange = editor.onDidChangeModel(() => {
        closeAllZones();
        window.setTimeout(() => {
            if (disposed) return;
            void (async () => {
                await loadMeta();
                if (!disposed) await reload();
            })();
        }, 0);
    });
    const contentChange = editor.onDidChangeModelContent(() => {
        if (persistTimer) clearTimeout(persistTimer);
        persistTimer = setTimeout(() => {
            persistTrackedLines();
            refreshMarks();
        }, 400);
    });

    return () => {
        disposed = true;
        if (persistTimer) clearTimeout(persistTimer);
        mouseMove.dispose();
        mouseDown.dispose();
        mouseLeave.dispose();
        cursor.dispose();
        layoutChange?.dispose?.();
        modelChange.dispose();
        contentChange.dispose();
        closeAllZones();
        plusDecos.clear();
        markDecos.clear();
    };
}
