import { ArrowShuffle24Regular } from "@fluentui/react-icons/headless/svg/arrow-shuffle";
import { BranchFork20Regular } from "@fluentui/react-icons/headless/svg/branch-fork";
import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";
import { Clipboard20Regular } from "@fluentui/react-icons/headless/svg/clipboard";
import { SelectAllOn20Regular } from "@fluentui/react-icons/headless/svg/select-all-on";
import { Document20Regular } from "@fluentui/react-icons/headless/svg/document";
import { Edit20Regular } from "@fluentui/react-icons/headless/svg/edit";
import { Folder20Filled } from "@fluentui/react-icons/headless/svg/folder";
import { MoreHorizontal20Regular } from "@fluentui/react-icons/headless/svg/more-horizontal";

import React from "react";
import { cn } from "@/lib/utils";
import { toTimestampMs } from "@/lib/ui/timestamp";
import { MessageRenderer, parseMessageContent, extractWebSearchResults } from "../md/renderer";
import { Icon } from "@/components/ui/icon";


import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { Tooltip } from "@/components/ui/tooltip";
import {
    formatMessageModelLabel,
    type MessageUsageStats,
} from "@/lib/chat/usage-display";
import { parseShapeContinueAction } from "@/lib/chat/continue-action";
import { mentionRanges, mentionDisplayLabel } from "@/lib/chat/mentions";
import { slashCommandRanges } from "@/lib/chat/workflows";
import { useSettings } from "@/lib/settings";
import { openProjectFile } from "@/lib/window/open-project-file";
import { WebSourcesMenu } from "../blocks/search";
import { Button } from "@/components/ui/button";
import { UserMessageCard } from "./bubble";
import { ContextChip, MentionChipIcon, WorkflowChipIcon } from "./context-chip";
import { AgentStatus, GeneratingIndicator } from "../blocks/generating";
import { ShapeAutoIcon } from "@/lib/ui/provider-icon";
import { WorkerMark } from "@/features/agent/sidebar/worker-mark";
import { CitedSources } from "../blocks/citations";
import { isAutoModelId } from "@/lib/chat/usage-display";
import { commands } from "@/lib/backend/commands";
import { parseUserAttachments } from "../../lib/user-attachments";
import type { ParsedUserAttachment } from "../../lib/user-attachments";
import { MessageAttachmentPill } from "../composer/attachments";
import { PhotoStack } from "../blocks/photo-stack";
import { isLooseTalkBubble, talkSegments } from "../../lib/talk-segments";
import { ContextWindowMenu, hasContextWindowData } from "./context-window";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ChatMessageItemProps = {
    role: string;
    content: string;
    timestamp: number;
    isGenerating?: boolean;
    activityLabel?: string | null;
    /** Override the role label shown in the header (e.g. "Task" for delegated subagent prompts). */
    roleLabel?: string;
    stats?: MessageUsageStats;
    model?: string;
    /** Index of this message in the full message list (for redo/restore). */
    index?: number;
    onRedo?: (index: number) => void;
    onRestore?: (index: number) => void;
    onFork?: (index: number) => void;
    isFileEditResolved?: (file: string, replacement?: string) => boolean;
    fullWidthBubbles?: boolean;
    surface?: "code" | "talk";
    talkMark?: { shape: "circle" | "square" | "triangle" | "cloud"; color: string } | null;
    talkName?: string;
};

function SentAttachment({ att }: { att: ParsedUserAttachment }) {
    return <MessageAttachmentPill name={att.name} />;
}

function MentionRichText({ text }: { text: string }) {
    const workflows = useSettings().ai.workflows ?? [];
    const mentionRs = mentionRanges(text);
    const slashRs = slashCommandRanges(text, workflows);
    const ranges: (
        | { kind: "mention"; start: number; end: number; mention: (typeof mentionRs)[number]["mention"] }
        | { kind: "slash"; start: number; end: number; workflow: (typeof slashRs)[number]["workflow"]; token: string }
    )[] = [
        ...mentionRs.map((r) => ({ kind: "mention" as const, ...r })),
        ...slashRs.map((r) => ({ kind: "slash" as const, ...r })),
    ].sort((a, b) => a.start - b.start);

    const merged: typeof ranges = [];
    for (const r of ranges) {
        const prev = merged[merged.length - 1];
        if (prev && r.start < prev.end) continue;
        merged.push(r);
    }

    /** Color backtick spans and bare paths even when there are no @mentions. */
    const paintPlain = (chunk: string, keyPrefix: string): React.ReactNode[] => {
        const out: React.ReactNode[] = [];
        const re = /(`[^`\n]+`)|((?:[A-Za-z]:)?(?:[\w.-]+[\\/])+[\w.-]+\.\w+)/g;
        let last = 0;
        let m: RegExpExecArray | null;
        let i = 0;
        while ((m = re.exec(chunk)) !== null) {
            if (m.index > last) {
                out.push(
                    <span key={`${keyPrefix}-t-${i}`} className="whitespace-pre-wrap">
                        {chunk.slice(last, m.index)}
                    </span>,
                );
            }
            if (m[1]) {
                const inner = m[1].slice(1, -1);
                out.push(
                    <code
                        key={`${keyPrefix}-c-${i}`}
                        className="rounded bg-panel px-1 py-0.5 font-mono text-[0.9em] text-accent-text"
                    >
                        {inner}
                    </code>,
                );
            } else if (m[2]) {
                const path = m[2];
                const name = path.split(/[\\/]/).pop() || path;
                out.push(
                    <span
                        key={`${keyPrefix}-p-${i}`}
                        role="button"
                        tabIndex={0}
                        title={path}
                        onClick={() => void openProjectFile(path, name)}
                        className="inline cursor-pointer font-mono text-[0.9em] text-accent-text underline-offset-2 hover:underline"
                    >
                        {path}
                    </span>,
                );
            }
            last = m.index + m[0].length;
            i += 1;
        }
        if (last < chunk.length) {
            out.push(
                <span key={`${keyPrefix}-t-end`} className="whitespace-pre-wrap">
                    {chunk.slice(last)}
                </span>,
            );
        }
        return out.length > 0 ? out : [<span key={`${keyPrefix}-all`} className="whitespace-pre-wrap">{chunk}</span>];
    };

    if (merged.length === 0) {
        return <span className="select-text">{paintPlain(text, "root")}</span>;
    }
    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    merged.forEach((range, i) => {
        if (range.start > cursor) {
            nodes.push(...paintPlain(text.slice(cursor, range.start), `pre-${i}`));
        }
        if (range.kind === "slash") {
            nodes.push(
                <ContextChip key={`s-${i}`} icon={<WorkflowChipIcon workflow={range.workflow} />}>
                    {range.token}
                </ContextChip>,
            );
        } else {
            const { mention } = range;
            const openable =
                (mention.kind === "file" || mention.kind === "folder") && !!mention.path;
            const label = mentionDisplayLabel(mention);
            nodes.push(
                <ContextChip
                    key={`m-${i}`}
                    icon={<MentionChipIcon mention={mention} />}
                    onClick={
                        openable
                            ? () => {
                                  const path =
                                      mention.kind === "folder" && !mention.path!.endsWith("/")
                                          ? `${mention.path}/`
                                          : mention.path!;
                                  void openProjectFile(path, label);
                              }
                            : undefined
                    }
                >
                    @{label}
                </ContextChip>,
            );
        }
        cursor = range.end;
    });
    if (cursor < text.length) {
        nodes.push(...paintPlain(text.slice(cursor), "end"));
    }
    return <span className="select-text">{nodes}</span>;
}

function selectNodeContents(el: HTMLElement | null) {
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
}

function decodeXmlAttr(value: string): string {
    return value
        .replace(/&quot;/g, "\"")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");
}

function parseChatRenamed(content: string): { from: string; rest: string } | null {
    const match = content.match(/^<chat_renamed\b([^>]*)\/>\s*/);
    if (!match) return null;
    const from = decodeXmlAttr(match[1]?.match(/\bfrom="([^"]*)"/)?.[1] ?? "the previous name");
    return { from, rest: content.slice(match[0].length) };
}

function formatSentClock(timestamp: number): string {
    return new Date(toTimestampMs(timestamp)).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
    });
}

function formatSentExact(timestamp: number): string {
    return new Date(toTimestampMs(timestamp)).toLocaleString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
    });
}

function MessageSentTime({ timestamp }: { timestamp: number }) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
    return (
        <Tooltip content={formatSentExact(timestamp)} side="top" delayDuration={200}>
            <time
                dateTime={new Date(toTimestampMs(timestamp)).toISOString()}
                className="pointer-events-none cursor-default px-1 text-sm text-text-muted opacity-0 transition-opacity group-hover/msg:pointer-events-auto group-hover/msg:opacity-100"
            >
                {formatSentClock(timestamp)}
            </time>
        </Tooltip>
    );
}

function parseForkedFrom(content: string): { id: string; title: string; rest: string } | null {
    const match = content.match(/^<forked_from\b([^>]*)\/>\s*/);
    if (!match) return null;
    const attrs = match[1] ?? "";
    const id = attrs.match(/\bid="([^"]*)"/)?.[1] ?? "";
    const title = attrs.match(/\btitle="([^"]*)"/)?.[1] ?? "previous chat";
    return { id, title, rest: content.slice(match[0].length) };
}

function recvTalkRadius(prevText: boolean, nextText: boolean): string {
    if (!prevText && !nextText) return "rounded-[1.15rem]";
    if (!prevText && nextText) return "rounded-[1.15rem] rounded-bl-[0.35rem]";
    if (prevText && nextText) return "rounded-[1.15rem] rounded-tl-[0.35rem] rounded-bl-[0.35rem]";
    return "rounded-[1.15rem] rounded-tl-[0.35rem]";
}

function talkProseVisible(raw: string): boolean {
    const text = raw
        .replace(/<([a-z][\w:-]*)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return text.length > 0;
}

function ChatMessageItemInner({
    role,
    content,
    timestamp,
    isGenerating,
    activityLabel,
    roleLabel: _roleLabel,
    stats,
    model,
    index = -1,
    onRedo,
    onRestore,
    onFork,
    isFileEditResolved,
    surface = "code",
    talkMark = null,
    talkName = "Shape",
}: ChatMessageItemProps) {
    const talk = surface === "talk";
    const [expanded, setExpanded] = React.useState(false);
    const [forkOpen, setForkOpen] = React.useState(false);
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [menuStats, setMenuStats] = React.useState(stats);
    const [menuModel, setMenuModel] = React.useState(model);
    const [advanced, setAdvanced] = React.useState(false);
    const [contextVeil, setContextVeil] = React.useState(true);
    const bodyRef = React.useRef<HTMLDivElement>(null);
    const shownStats = menuStats ?? stats;
    const shownModel = menuModel ?? model;

    React.useEffect(() => {
        setMenuStats(stats);
        setMenuModel(model);
    }, [stats, model]);

    const getCopyText = () => {
        if (role === "user") {
            const parts = parseUserAttachments(content);
            const names = parts.attachments.map((a) => a.name).join(", ");
            if (names && parts.text) return `${parts.text}\n\n[${names}]`;
            if (names) return `[${names}]`;
            return parts.text || content;
        }
        return parseMessageContent(content)
            .filter(c => c.type === "text" && c.content?.trim())
            .map(c => c.content!.trim())
            .join("\n\n");
    };

    const handleCopy = () => {
        const sel = window.getSelection();
        const selected = sel?.toString() ?? "";
        if (selected && bodyRef.current?.contains(sel?.anchorNode ?? null)) {
            void navigator.clipboard.writeText(selected);
            return;
        }
        void navigator.clipboard.writeText(getCopyText());
    };

    const handleSelectAll = () => {
        selectNodeContents(bodyRef.current);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!(e.metaKey || e.ctrlKey)) return;
        const key = e.key.toLowerCase();
        if (key === "a") {
            e.preventDefault();
            e.stopPropagation();
            handleSelectAll();
        } else if (key === "c") {
            // Let the browser copy the selection when present; otherwise copy full message.
            const sel = window.getSelection();
            const selected = sel?.toString() ?? "";
            if (!selected || !bodyRef.current?.contains(sel?.anchorNode ?? null)) {
                e.preventDefault();
                e.stopPropagation();
                void navigator.clipboard.writeText(getCopyText());
            }
        }
    };

    const isEditResolved = (filePath: string) => {
        if (isFileEditResolved?.(filePath)) return true;
        return false;
    };

    const isUser = role === "user";

    const userParts = React.useMemo(
        () => (isUser ? parseUserAttachments(content) : null),
        [isUser, content],
    );

    const continueAction = React.useMemo(
        () => (isUser ? parseShapeContinueAction(userParts?.text ?? content) : null),
        [isUser, userParts?.text, content],
    );

    const webSources = React.useMemo(
        () => (!isUser ? extractWebSearchResults(content) : []),
        [isUser, content],
    );


    if (role === "user" && content.trim().startsWith("<scheduled_followup")) {
        return null;
    }

    if (role === "user" && userParts) {
        const displayText = continueAction?.action
            ? continueAction.displayText
            : userParts.text;
        const LONG_CHARS = 280;
        const isLong = displayText.length > LONG_CHARS || displayText.split("\n").length > 5;
        return (
            <ContextMenu>
            <ContextMenuTrigger asChild>
            <div
                className="group/msg relative mb-2 flex w-full select-text"
                tabIndex={0}
                onKeyDown={handleKeyDown}
            >
                <div className="group flex w-full min-w-0 items-end justify-end gap-1">
                    <div className="flex shrink-0 items-center gap-0.5 select-none opacity-0 transition-opacity group-hover:opacity-100">
                            <MessageSentTime timestamp={timestamp} />
                            <Tooltip content="Copy Message" side="top">
                                <Button variant="ghost" size="icon" onClick={handleCopy}>
                                    <Icon icon={Clipboard20Regular} className="icon-md" />
                                </Button>
                            </Tooltip>
                            <Tooltip content="Restore to this checkpoint" side="top">
                                <Button variant="ghost" size="icon" onClick={() => onRestore?.(index)}>
                                    <Icon icon={ArrowShuffle24Regular} className="icon-md" />
                                </Button>
                            </Tooltip>
                    </div>
                    <div className="flex w-fit max-w-[min(100%,32rem)] min-w-0 flex-col items-end gap-1.5">
                        {userParts.attachments.some((att) => att.kind === "image" && att.dataUrl) ? (
                            <PhotoStack
                                align="end"
                                photos={userParts.attachments
                                    .filter((att) => att.kind === "image" && att.dataUrl)
                                    .map((att) => ({ src: att.dataUrl!, alt: att.name }))}
                            />
                        ) : null}
                        {userParts.attachments.some((att) => att.kind !== "image") ? (
                            <div className="flex flex-wrap justify-end gap-1.5">
                                {userParts.attachments.filter((att) => att.kind !== "image").map((att, i) => (
                                    <SentAttachment key={`${att.name}-file-${i}`} att={att} />
                                ))}
                            </div>
                        ) : null}
                        {displayText.trim() ? (
                        <UserMessageCard className="w-full">
                            <div
                                role={isLong ? "button" : undefined}
                                tabIndex={isLong ? 0 : undefined}
                                onClick={isLong ? () => setExpanded((v) => !v) : undefined}
                                onKeyDown={isLong ? (e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setExpanded((v) => !v);
                                    }
                                } : undefined}
                                className={cn(isLong && "cursor-pointer")}
                            >
                                <div ref={bodyRef} className="min-w-0 wrap-break-word select-text">
                                    <div className={cn(isLong && !expanded && "chat-message-fade-clamp")}>
                                        <MentionRichText text={displayText} />
                                    </div>
                                </div>
                            </div>
                        </UserMessageCard>
                        ) : null}
                    </div>
                </div>
            </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={handleCopy}>
                    <Icon icon={Clipboard20Regular} />
                    Copy
                    <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleSelectAll}>
                    <Icon icon={SelectAllOn20Regular} />
                    Select All
                    <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
                </ContextMenuItem>
            </ContextMenuContent>
            </ContextMenu>
        );
    }

    const showTypingOnly = Boolean(isGenerating && !content.trim());
    let renderContent = content;
    let forked: ReturnType<typeof parseForkedFrom> = null;
    let renamed: ReturnType<typeof parseChatRenamed> = null;
    if (role === "assistant") {
        for (let i = 0; i < 2; i++) {
            const nextFork = parseForkedFrom(renderContent);
            if (nextFork) {
                forked = nextFork;
                renderContent = nextFork.rest;
                continue;
            }
            const nextRenamed = parseChatRenamed(renderContent);
            if (nextRenamed) {
                renamed = nextRenamed;
                renderContent = nextRenamed.rest;
                continue;
            }
            break;
        }
    }

    return (
        <>
        <ContextMenu>
        <ContextMenuTrigger asChild>
        <div
            className={cn(
                "group/msg group relative z-10 mb-2 flex min-w-0 select-text flex-col items-start gap-1 overflow-visible",
                talk ? "w-fit max-w-[min(100%,38rem)]" : "w-full",
            )}
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            <div className="flex min-w-0 w-full flex-col items-start gap-1 overflow-visible">
                <div ref={bodyRef} className="min-w-0 w-full select-text overflow-visible chat-text text-text-primary">
                    {talk ? (
                        <div className="flex max-w-[min(100%,38rem)] items-end gap-2">
                            <span className="mb-1">
                            {talkMark ? (
                                <WorkerMark
                                    shape={talkMark.shape}
                                    color={talkMark.color}
                                    size={32}
                                    live={!!isGenerating}
                                    mood={isGenerating ? (activityLabel ? "working" : "typing") : "idle"}
                                />
                            ) : (
                                <ShapeAutoIcon size={28} className="text-text-muted" />
                            )}
                            </span>
                            <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                                {showTypingOnly || (isGenerating && !talkProseVisible(renderContent)) ? (
                                    <AgentStatus />
                                ) : (
                                    talkSegments(renderContent).map((bubble, i, all) => {
                                        const loose = isLooseTalkBubble(bubble);
                                        const prevText = i > 0 && !isLooseTalkBubble(all[i - 1]!);
                                        const nextText = i < all.length - 1 && !isLooseTalkBubble(all[i + 1]!);
                                        return (
                                        <div
                                            key={`talk-${i}`}
                                            className={cn(
                                                "w-fit max-w-full",
                                                loose
                                                    ? ""
                                                    : cn(
                                                        "bg-surface-4 px-3.5 py-2",
                                                        recvTalkRadius(prevText, nextText),
                                                        prevText || nextText ? "mb-0.5" : "",
                                                    ),
                                            )}
                                        >
                                            <MessageRenderer
                                                content={bubble}
                                                isGenerating={isGenerating && i === all.length - 1}
                                                activityLabel={i === all.length - 1 ? activityLabel : null}
                                                isFileEditResolved={isFileEditResolved}
                                                durationMs={stats?.timeMs}
                                                surface="talk"
                                                talkName={talkName}
                                            />
                                        </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    ) : showTypingOnly ? (
                        <GeneratingIndicator
                            label="Thinking"
                            model={shownStats?.usedAuto || isAutoModelId(shownModel) ? undefined : shownModel}
                        />
                    ) : (
                        <div className="chat-markdown prose-compact w-fit max-w-full min-w-0 wrap-break-word select-text overflow-visible">
                            {renamed ? (
                                <div className="mb-2 inline-flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-xs text-text-muted">
                                    <Icon icon={Edit20Regular} className="size-3.5 shrink-0" />
                                    <span>Renamed from</span>
                                    <span className="min-w-0 truncate font-medium text-text-secondary">{renamed.from}</span>
                                </div>
                            ) : null}
                            {forked ? (
                                <button
                                    type="button"
                                    className="mb-2 inline-flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-xs text-text-muted hover:bg-panel-hover hover:text-text-primary"
                                    onClick={() => {
                                        if (!forked.id) return;
                                        window.dispatchEvent(
                                            new CustomEvent("shape-chat-load", { detail: { id: forked.id } }),
                                        );
                                    }}
                                >
                                    <Icon icon={BranchFork20Regular} className="size-3.5 shrink-0" />
                                    <span>Forked from</span>
                                    <Icon icon={Folder20Filled} className="size-3.5 shrink-0 text-text-muted" />
                                    <span className="min-w-0 truncate font-medium text-text-secondary">{forked.title}</span>
                                </button>
                            ) : null}
                            <MessageRenderer
                                content={renderContent}
                                isGenerating={isGenerating}
                                activityLabel={activityLabel}
                                isFileEditResolved={isFileEditResolved}
                                durationMs={stats?.timeMs}
                            />
                            {!isGenerating && webSources.length > 0 ? <CitedSources results={webSources} /> : null}
                        </div>
                    )}
                </div>
            </div>
            {!isGenerating && (
                <div className="flex w-fit items-center gap-0.5 select-none opacity-0 transition-opacity group-hover/msg:opacity-100">
                    <Tooltip content="Copy Message" side="bottom">
                        <Button variant="ghost" size="icon" onClick={handleCopy}>
                            <Icon icon={Clipboard20Regular} />
                        </Button>
                    </Tooltip>
                    {role === "assistant" ? <WebSourcesMenu results={webSources} /> : null}
                    {role === "assistant" ? (
                    <DropdownMenu
                    open={menuOpen}
                    onOpenChange={(open) => {
                        setMenuOpen(open);
                        if (!open) {
                            setAdvanced(false);
                            setContextVeil(true);
                            return;
                        }
                        if (typeof index !== "number" || index < 0) return;
                        void commands.getChatHistory().then((history) => {
                            const msg = history[index];
                            if (!msg || msg.role !== "assistant") return;
                            if (msg.stats) setMenuStats(msg.stats);
                            if (msg.model) setMenuModel(msg.model);
                        }).catch(() => {});
                    }}
                    >
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <Icon icon={MoreHorizontal20Regular} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-72 overflow-hidden p-0">
                            {typeof index === "number" ? (
                                <>
                                    <DropdownMenuItem
                                        className="text-md font-medium"
                                        onClick={() => onRedo?.(index)}
                                    >
                                        Regenerate
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-md font-medium" onClick={() => setForkOpen(true)}>
                                        Fork chat
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                </>
                            ) : null}
                            <div className="relative overflow-hidden">
                                <div className="flex flex-col gap-2 p-1 chat-text">
                                {formatMessageModelLabel(shownModel, shownStats) ? (
                                    <DetailRow label="Model" value={formatMessageModelLabel(shownModel, shownStats)} />
                                ) : null}
                                {shownStats || shownModel ? (
                                    <DetailRow
                                        label="Routing"
                                        value={
                                            shownStats?.usedAuto || isAutoModelId(shownModel)
                                                ? "Auto"
                                                : "Explicit"
                                        }
                                    />
                                ) : null}
                                {shownStats?.mode ? <DetailRow label="Mode" value={shownStats.mode} /> : null}
                                {shownStats?.reasoningEffort ? (
                                    <DetailRow
                                        label="Reasoning"
                                        value={
                                            shownStats.reasoningEffort.charAt(0).toUpperCase()
                                            + shownStats.reasoningEffort.slice(1)
                                        }
                                    />
                                ) : null}
                                {shownStats?.timeMs != null ? (
                                    <DetailRow
                                        label="Elapsed"
                                        value={
                                            shownStats.timeMs < 1000
                                                ? `${Math.round(shownStats.timeMs)}ms`
                                                : `${(shownStats.timeMs / 1000).toFixed(1)}s`
                                        }
                                    />
                                ) : null}
                                </div>
                                {hasContextWindowData(shownStats?.contextBreakdown, shownStats?.inputTokens, shownStats?.outputTokens) ? (
                                    <>
                                        <div
                                            className="grid transition-[grid-template-rows] duration-500 ease-out"
                                            style={{ gridTemplateRows: advanced ? "1fr" : "0fr" }}
                                            onTransitionEnd={(e) => {
                                                if (e.propertyName !== "grid-template-rows") return;
                                                if (advanced) setContextVeil(false);
                                            }}
                                        >
                                            <div className="min-h-0 px-2 pt-1 pb-1">
                                                <ContextWindowMenu
                                                    breakdown={shownStats?.contextBreakdown}
                                                    inputTokens={shownStats?.inputTokens}
                                                    outputTokens={shownStats?.outputTokens}
                                                />
                                            </div>
                                        </div>
                                        <div
                                            className={cn(
                                                "pointer-events-none absolute inset-x-0 z-[1] h-30 bg-linear-to-t from-surface-4 to-transparent transition-opacity delay-200",
                                                advanced ? "bottom-0" : "bottom-0",
                                                contextVeil ? "opacity-100" : "opacity-0",
                                            )}
                                            aria-hidden
                                        />
                                        {!advanced ? (
                                            <button
                                                type="button"
                                                className="relative z-10 flex w-35 mx-auto bg-panel-hover backdrop-blur-2xl squircle-2xl px-1.5 py-1 items-center justify-center gap-1 text-md font-medium text-text-secondary hover:text-text-primary"
                                                onClick={() => setAdvanced(true)}
                                            >
                                                Advanced
                                                <Icon icon={ChevronDown20Regular} />
                                            </button>
                                        ) : null}
                                    </>
                                ) : null}
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    ) : null}
                    <MessageSentTime timestamp={timestamp} />
                </div>
            )}
        </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
            <ContextMenuItem onClick={handleCopy}>
                <Icon icon={Clipboard20Regular} />
                Copy
                <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handleSelectAll}>
                <Icon icon={SelectAllOn20Regular} />
                Select All
                <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
            </ContextMenuItem>
        </ContextMenuContent>
        </ContextMenu>
        <AlertDialog open={forkOpen} onOpenChange={setForkOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Fork this chat?</AlertDialogTitle>
                    <AlertDialogDescription>
                        A new chat starts from this message. Earlier turns stay as context for the AI but are not shown in the thread. The original chat is unchanged.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => {
                            setForkOpen(false);
                            onFork?.(index);
                        }}
                    >
                        Fork chat
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-4 px-1">
            <span className="shrink-0 text-text-primary">{label}</span>
            <span className="min-w-0 truncate text-right font-medium text-text-muted">{value}</span>
        </div>
    );
}

/**
 * Memoized: during streaming only the last message's `content` changes, so
 * earlier messages skip re-parsing/re-rendering on every token. Callers must
 * keep handler props referentially stable for this to pay off.
 */
export const ChatMessageItem = React.memo(ChatMessageItemInner);
