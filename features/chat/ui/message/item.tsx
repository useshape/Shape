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
    formatMessageUsageLine,
    formatModelLabel,
    type MessageUsageStats,
} from "@/lib/usage-display";
import { parseShapeContinueAction } from "@/lib/shape-continue-action";
import { mentionRanges, mentionDisplayLabel } from "@/lib/chat-mentions";
import { openProjectFile } from "@/lib/open-project-file";
import { Favicon } from "@/components/ui/favicon";
import { WebSourcesMenu } from "../blocks/search";
import { Button } from "@/components/ui/button";

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
    if (ranges.length === 0) {
        return <span className="whitespace-pre-wrap select-text">{text}</span>;
    }
    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    ranges.forEach((range, i) => {
        if (range.start > cursor) {
            nodes.push(
                <span key={`t-${i}`} className="whitespace-pre-wrap">
                    {text.slice(cursor, range.start)}
                </span>,
            );
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
                    "mx-0.5 inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/15 px-1.5 py-0.5 text-sm font-medium text-accent align-middle",
                    openable && "cursor-pointer hover:bg-accent/25 transition-colors",
                )}
            >
                {mention.kind === "file" || mention.kind === "folder" || mention.kind === "docs" ? (
                    <FileIcon name={label} className="h-3 w-3 shrink-0" />
                ) : mention.kind === "browser" ? (
                    <Favicon url={mention.path || label} size={12} />
                ) : null}
                <span>@{label}</span>
            </span>,
        );
        cursor = range.end;
    });
    if (cursor < text.length) {
        nodes.push(
            <span key="t-end" className="whitespace-pre-wrap">
                {text.slice(cursor)}
            </span>,
        );
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

function ContinueActionBar({
    action,
}: {
    action: NonNullable<ReturnType<typeof parseShapeContinueAction>["action"]>;
}) {
    return (
        <div className="relative z-0 -mt-4 mx-2 pt-5 flex items-center gap-2 rounded-b-xl border border-border-subtle bg-surface-3/50 px-2.5 py-1.5 text-sm text-text-secondary">
            <Icon name="list_alt" size={14} className="shrink-0 text-text-muted" />
            <span className="min-w-0 truncate">
                Building plan · <span className="text-text-primary">{action.title}</span>
            </span>
        </div>
    );
}

function ChatMessageItemInner({ role, content, isGenerating, activityLabel, roleLabel, stats, model, index = -1, onRedo, onRestore, isFileEditResolved }: ChatMessageItemProps) {
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
                className="flex flex-col w-full mb-4 relative select-text"
                tabIndex={0}
                onKeyDown={handleKeyDown}
            >
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
                    className={cn(
                        "relative z-10 w-full rounded-[11px] bg-surface-3 px-2.5 py-2",
                        "text-sm text-text-primary group select-text",
                        isLong && "cursor-pointer",
                    )}
                >
                    <div className="flex items-start gap-2 w-full min-w-0">
                        <div ref={bodyRef} className="flex-1 min-w-0 wrap-break-word select-text">
                            {userParts.attachments.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                    {userParts.attachments.map((name, i) => (
                                        <span
                                            key={`${name}-${i}`}
                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-sm border border-border-subtle bg-panel text-text-secondary"
                                        >
                                            <FileIcon name={name} className="w-3.5 h-3.5 shrink-0" />
                                            <span className="truncate max-w-[160px]">{name}</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div
                                className={cn(
                                    isLong && !expanded && "chat-message-fade-clamp",
                                )}
                            >
                                <MentionRichText text={displayText} />
                            </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0 select-none" onClick={(e) => e.stopPropagation()}>
                            <Tooltip content="Copy Message" side="top">
                                <button
                                    onClick={handleCopy}
                                    className="text-text-muted hover:text-text-primary p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Icon name="content_copy" size={14} />
                                </button>
                            </Tooltip>
                            <Tooltip content="Restore to this checkpoint" side="top">
                                <button
                                    onClick={() => onRestore?.(index)}
                                    className="text-text-muted hover:text-text-primary p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Icon name="undo" size={14} />
                                </button>
                            </Tooltip>
                        </div>
                    </div>
                </div>
                {continueAction?.action ? <ContinueActionBar action={continueAction.action} /> : null}
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

    return (
        <ContextMenu>
        <ContextMenuTrigger asChild>
        <div
            className="flex flex-col w-full mb-4 last:border-0 relative z-10 group select-text"
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            <div ref={bodyRef} className="w-full min-w-0 select-text overflow-hidden">
                <div className="w-full min-w-0 wrap-break-word chat-markdown max-w-none prose-compact select-text">
                    <MessageRenderer
                        content={content}
                        isGenerating={isGenerating}
                        activityLabel={activityLabel}
                        isFileEditResolved={isFileEditResolved}
                        durationMs={stats?.timeMs}
                    />
                </div>
            </div>
            {!isGenerating && (
                <div className="flex items-center gap-0.5 mt-1.5 select-none">
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
                            <DropdownMenuContent align="start" className="w-52">
                                <div className="flex flex-col gap-1.5 text-sm">
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-text-muted">Model</span>
                                        <span className="font-medium text-text-primary truncate">
                                            {formatModelLabel(model)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-text-muted">Usage</span>
                                        <span className="font-medium text-text-primary tabular-nums">
                                            {formatMessageUsageLine(stats, model)}
                                        </span>
                                    </div>
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

/**
 * Memoized: during streaming only the last message's `content` changes, so
 * earlier messages skip re-parsing/re-rendering on every token. Callers must
 * keep handler props referentially stable for this to pay off.
 */
export const ChatMessageItem = React.memo(ChatMessageItemInner);
