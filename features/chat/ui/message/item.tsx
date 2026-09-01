import React from "react";
import { cn } from "@/lib/utils";
import { MessageRenderer, parseMessageContent, extractWebSearchResults } from "../md/renderer";
import { Icon } from "@/components/ui/icon";
import { FileIcon } from "@/components/ui/file-icon";
import {
    DropdownMenu,
    DropdownMenuContent,
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
    formatMessageUsageRows,
    formatMessageModelLabel,
    type MessageUsageStats,
} from "@/lib/usage-display";
import { parseShapeContinueAction } from "@/lib/shape-continue-action";
import { mentionRanges, mentionDisplayLabel } from "@/lib/chat-mentions";
import { openProjectFile } from "@/lib/open-project-file";
import { Favicon } from "@/components/ui/favicon";
import { WebSourcesMenu } from "../blocks/search";
import { Button } from "@/components/ui/button";
import { useGitHubAuth } from "@/lib/github-auth/store";
import { useShapeAuth } from "@/lib/shape-auth/store";
import { SHAPE_API_BASE } from "@/lib/shape-auth/api";
import { providerIcon } from "@/lib/ui/provider-icon";
import { TypingDots, UserMessageCard, AUTO_DISPLAY_MODEL } from "./bubble";
import { isAutoModelId } from "@/lib/usage-display";

function UserMessageAvatar() {
    const github = useGitHubAuth();
    const auth = useShapeAuth();
    const [failed, setFailed] = React.useState(false);

    const src =
        (github.loggedIn && github.avatarUrl ? github.avatarUrl : null)
        ?? (auth.userId && !auth.offline ? `${SHAPE_API_BASE}/api/avatar/${auth.userId}` : null);

    if (!src || failed) return null;

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt=""
            width={28}
            height={28}
            className="mt-0.5 size-7 shrink-0 rounded-full object-cover"
            onError={() => setFailed(true)}
        />
    );
}

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
    isFileEditResolved?: (file: string, replacement?: string) => boolean;
};

const ATTACHMENT_BLOCK_RE = /<attached_(?:image|file)\b[^>]*>[\s\S]*?<\/attached_(?:image|file)>\n*/g;
const ATTACHMENT_NAME_RE = /<attached_(?:image|file)\b[^>]*?name="([^"]*)"/g;

/** Split a user message into display text and attachment file names (raw tag payloads are never shown). */
function splitUserAttachments(content: string): { text: string; attachments: string[] } {
    if (!content.includes("<attached_")) return { text: content, attachments: [] };
    const attachments: string[] = [];
    for (const match of content.matchAll(ATTACHMENT_NAME_RE)) {
        if (match[1]) attachments.push(match[1]);
    }
    return { text: content.replace(ATTACHMENT_BLOCK_RE, "").trim(), attachments: attachments };
}

function MentionRichText({ text }: { text: string }) {
    const ranges = mentionRanges(text);

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

    if (ranges.length === 0) {
        return <span className="select-text">{paintPlain(text, "root")}</span>;
    }
    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    ranges.forEach((range, i) => {
        if (range.start > cursor) {
            nodes.push(...paintPlain(text.slice(cursor, range.start), `pre-${i}`));
        }
        const { mention } = range;
        const openable =
            (mention.kind === "file" || mention.kind === "folder") && !!mention.path;
        const label = mentionDisplayLabel(mention);
        nodes.push(
            <span
                key={`m-${i}`}
                role={openable ? "button" : undefined}
                tabIndex={openable ? 0 : undefined}
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
                className={cn(
                    "mx-0.5 inline-flex items-center gap-1 rounded-lg bg-accent-text-bg px-1.5 py-0.5 chat-text font-medium text-accent-text align-middle",
                    openable && "cursor-pointer hover:bg-accent-text/20 transition-colors",
                )}
            >
                {mention.kind === "file" || mention.kind === "folder" || mention.kind === "docs" ? (
                    <span className="chat-link-favicon">
                        <FileIcon name={label} className="h-3 w-3 shrink-0" />
                    </span>
                ) : mention.kind === "browser" ? (
                    <span className="chat-link-favicon">
                        <Favicon url={mention.path || label} size={12} />
                    </span>
                ) : null}
                <span>@{label}</span>
            </span>,
        );
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

function ChatMessageItemInner({
    role,
    content,
    isGenerating,
    activityLabel,
    roleLabel,
    stats,
    model,
    index = -1,
    onRedo,
    onRestore,
    isFileEditResolved,
}: ChatMessageItemProps) {
    const [expanded, setExpanded] = React.useState(false);
    const bodyRef = React.useRef<HTMLDivElement>(null);

    const getCopyText = () => {
        if (role === "user") {
            return content;
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
        () => (isUser ? splitUserAttachments(content) : null),
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
                className="relative mb-2 flex w-full select-text justify-end pl-10"
                tabIndex={0}
                onKeyDown={handleKeyDown}
            >
                <div className="group inline-flex max-w-[min(100%,36rem)] items-start gap-2">
                    <div className="flex min-w-0 flex-col items-end gap-1">
                        <UserMessageCard>
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
                                    {userParts.attachments.length > 0 && (
                                        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                                            {userParts.attachments.map((name, i) => (
                                                <span
                                                    key={`${name}-${i}`}
                                                    className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-panel px-1.5 py-0.5 chat-text text-text-secondary"
                                                >
                                                    <FileIcon name={name} className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="max-w-[160px] truncate">{name}</span>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <div className={cn(isLong && !expanded && "chat-message-fade-clamp")}>
                                        <MentionRichText text={displayText} />
                                    </div>
                                </div>
                            </div>
                        </UserMessageCard>
                        <div className="flex items-center gap-0.5 select-none opacity-0 transition-opacity group-hover:opacity-100">
                            <Tooltip content="Copy Message" side="top">
                                <button onClick={handleCopy} className="rounded-md p-1 text-text-muted hover:text-text-primary">
                                    <Icon name="content_copy" size={14} />
                                </button>
                            </Tooltip>
                            <Tooltip content="Restore to this checkpoint" side="top">
                                <button onClick={() => onRestore?.(index)} className="rounded-md p-1 text-text-muted hover:text-text-primary">
                                    <Icon name="undo" size={14} />
                                </button>
                            </Tooltip>
                        </div>
                    </div>
                    <UserMessageAvatar />
                </div>
            </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={handleCopy}>
                    Copy
                    <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleSelectAll}>
                    Select All
                    <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
                </ContextMenuItem>
            </ContextMenuContent>
            </ContextMenu>
        );
    }

    const modelLabel = roleLabel || formatMessageModelLabel(model, stats) || "Shape";
    const showTypingOnly = Boolean(isGenerating && !content.trim());
    const auto = isAutoModelId(model) || Boolean(stats?.usedAuto);

    return (
        <ContextMenu>
        <ContextMenuTrigger asChild>
        <div
            className="group relative z-10 mb-2 flex w-full select-text flex-col gap-1"
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            <div className="flex items-start gap-2.5 pr-6">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center overflow-visible rounded-full bg-surface-3 ring-2 ring-panel">
                    {providerIcon(auto ? AUTO_DISPLAY_MODEL : (model || AUTO_DISPLAY_MODEL), 16)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="chat-text text-text-muted">{modelLabel}</span>
                    <div ref={bodyRef} className="min-w-0 select-text overflow-visible chat-text text-text-primary">
                        {showTypingOnly ? (
                            <TypingDots />
                        ) : (
                            <div className="chat-markdown prose-compact max-w-none min-w-0 wrap-break-word select-text">
                                <MessageRenderer
                                    content={content}
                                    isGenerating={isGenerating}
                                    activityLabel={activityLabel}
                                    isFileEditResolved={isFileEditResolved}
                                    durationMs={stats?.timeMs}
                                />
                                {isGenerating ? (
                                    <span className="ml-1 inline-flex align-middle">
                                        <TypingDots />
                                    </span>
                                ) : null}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {!isGenerating && (
                <div className="ml-9 flex items-center gap-0.5 select-none">
                    <Tooltip content="Redo" side="bottom">
                        <Button variant="ghost" size="icon" onClick={() => onRedo?.(index)}>
                            <Icon name="refresh" size={16} />
                        </Button>
                    </Tooltip>
                    <Tooltip content="Copy Message" side="bottom">
                        <Button variant="ghost" size="icon" onClick={handleCopy}>
                            <Icon name="content_copy" size={16} />
                        </Button>
                    </Tooltip>
                    {role === "assistant" ? <WebSourcesMenu results={webSources} /> : null}
                    {role === "assistant" && (stats || model) && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <Icon name="more_horiz" size={16} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64">
                            <div className="flex flex-col gap-2 p-1 chat-text">
                                {formatMessageModelLabel(model, stats) ? (
                                    <DetailRow label="Model" value={formatMessageModelLabel(model, stats)} />
                                ) : null}
                                {stats || model ? (
                                    <DetailRow
                                        label="Routing"
                                        value={
                                            stats?.usedAuto || isAutoModelId(model)
                                                ? "Auto"
                                                : "Explicit"
                                        }
                                    />
                                ) : null}
                                {stats?.mode ? <DetailRow label="Mode" value={stats.mode} /> : null}
                                {stats?.reasoningEffort ? (
                                    <DetailRow
                                        label="Reasoning"
                                        value={
                                            stats.reasoningEffort.charAt(0).toUpperCase()
                                            + stats.reasoningEffort.slice(1)
                                        }
                                    />
                                ) : null}
                                {formatMessageUsageRows(stats, model).map((row) => (
                                    <DetailRow key={row.label} label={row.label} value={row.value} />
                                ))}
                                {stats?.timeMs != null ? (
                                    <DetailRow
                                        label="Elapsed"
                                        value={
                                            stats.timeMs < 1000
                                                ? `${Math.round(stats.timeMs)}ms`
                                                : `${(stats.timeMs / 1000).toFixed(1)}s`
                                        }
                                    />
                                ) : null}
                                {stats?.latencyMs != null ? (
                                    <DetailRow
                                        label="Latency"
                                        value={`${Math.round(stats.latencyMs)}ms`}
                                    />
                                ) : null}
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    )}
                </div>
            )}
        </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
            <ContextMenuItem onClick={handleCopy}>
                Copy
                <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handleSelectAll}>
                Select All
                <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
            </ContextMenuItem>
        </ContextMenuContent>
        </ContextMenu>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-4 px-1">
            <span className="shrink-0 text-text-muted">{label}</span>
            <span className="min-w-0 truncate text-right font-medium text-text-primary">{value}</span>
        </div>
    );
}

/**
 * Memoized: during streaming only the last message's `content` changes, so
 * earlier messages skip re-parsing/re-rendering on every token. Callers must
 * keep handler props referentially stable for this to pay off.
 */
export const ChatMessageItem = React.memo(ChatMessageItemInner);
