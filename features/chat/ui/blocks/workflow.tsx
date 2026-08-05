"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { FileIcon } from "@/components/ui/file-icon";
import { Favicon } from "@/components/ui/favicon";
import { ApprovalBar } from "./approval";
import { cn } from "@/lib/utils";
import { commands, getProjectPath } from "@/lib/backend";
import { diffLines } from "diff";
import { Chunk } from "../md/renderer";
import { ChatMarkdown } from "../md/view";
import { looksLikeProseMarkdown } from "../md/stream";
import { openProjectFile } from "@/lib/open-project-file";
import { resolveProjectFilePath } from "@/lib/path-utils";

export const WORKFLOW_CHUNK_TYPES = new Set<Chunk["type"]>([
    "search", "grep", "status", "web_search", "web_result", "web_visit", "search_result",
    "ls", "cat", "create_file", "mkdir", "delete_file", "rename_file", "rename_chat",
    "think", "thought", "run", "tool_result", "edit", "terminal_command", "git_operation",
]);

function resolvePath(filePath: string): string {
    return resolveProjectFilePath(filePath, getProjectPath());
}

function openFileEdit(file: string, original: string, replacement: string, isResolved?: boolean) {
    const fileName = file.split(/[\\/]/).pop() || file;
    const resolved = resolvePath(file);
    void openProjectFile(file, fileName).then((ok) => {
        if (!ok) return;
        if (isResolved) {
            window.dispatchEvent(new CustomEvent("shape-dismiss-diff", {
                detail: { path: resolved, rawPath: file },
            }));
            return;
        }
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent("shape-editor-preview-diff", {
                detail: { path: resolved, original, replacement },
            }));
        }, 150);
    });
}

export function parseGitStagePath(content?: string): string | null {
    if (!content?.trim()) return null;
    const trimmed = content.trim();
    const match = trimmed.match(/^Staged\s+(.+)$/i);
    return (match?.[1] ?? trimmed).trim() || null;
}

type GitStatusLine = { area: "staged" | "unstaged"; status: string; path: string };

export function parseGitStatusLines(content?: string): GitStatusLine[] {
    if (!content?.trim()) return [];
    return content.split("\n").flatMap((line) => {
        const match = line.trim().match(/^\[(\w+)\]\s+(\S+)\s+(.+)$/);
        if (!match) return [];
        const area = match[1].toLowerCase() === "staged" ? "staged" : "unstaged";
        return [{ area, status: match[2], path: match[3] }];
    });
}

type WorkflowRow =
    | { kind: "block"; block: Chunk }
    | { kind: "git_stage_group"; paths: string[] };

export function groupWorkflowRows(blocks: Chunk[]): WorkflowRow[] {
    const rows: WorkflowRow[] = [];
    let stagePaths: string[] = [];

    const flushStages = () => {
        if (stagePaths.length === 0) return;
        rows.push({ kind: "git_stage_group", paths: [...stagePaths] });
        stagePaths = [];
    };

    for (const block of blocks) {
        if (block.type === "git_operation" && block.gitOp === "stage") {
            const path = parseGitStagePath(block.content);
            if (path) {
                stagePaths.push(path);
                continue;
            }
        }
        flushStages();
        rows.push({ kind: "block", block });
    }
    flushStages();
    return rows;
}

function GitStatusBadge({ status }: { status: string }) {
    const letter = status.trim().charAt(0).toUpperCase();
    const color =
        letter === "A"
            ? "text-success"
            : letter === "D"
              ? "text-error"
              : letter === "M" || letter === "R"
                ? "text-warning"
                : "text-text-muted";
    return (
        <span className={cn("w-3 text-center text-2xs font-mono shrink-0", color)}>{letter}</span>
    );
}

function GitStageGroup({ paths }: { paths: string[] }) {
    const [open, setOpen] = useState(false);
    const preview = paths.slice(0, 4);
    const rest = paths.length - preview.length;

    return (
        <div className="flex flex-col gap-1 py-0.5">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1.5 w-fit text-left group"
            >
                <Icon name="account_tree" size={14} className="text-text-muted shrink-0" />
                <span className="text-sm text-text-muted group-hover:text-text-secondary transition-colors">
                    Staged {paths.length} file{paths.length === 1 ? "" : "s"}
                </span>
                <Icon
                    name={open ? "expand_less" : "expand_more"}
                    size={12}
                    className="text-text-disabled shrink-0"
                />
            </button>
            <div className="flex flex-wrap items-center gap-1 pl-5">
                {(open ? paths : preview).map((path) => (
                    <FilePill key={path} path={path} />
                ))}
                {!open && rest > 0 ? (
                    <span className="text-xs text-text-disabled">+{rest} more</span>
                ) : null}
            </div>
        </div>
    );
}

function GitStatusGroup({ lines }: { lines: GitStatusLine[] }) {
    const [open, setOpen] = useState(false);
    const staged = lines.filter((l) => l.area === "staged");
    const unstaged = lines.filter((l) => l.area === "unstaged");
    const preview = lines.slice(0, 5);
    const shown = open ? lines : preview;

    return (
        <div className="flex flex-col gap-1 py-0.5">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1.5 w-fit text-left group"
            >
                <Icon name="account_tree" size={14} className="text-text-muted shrink-0" />
                <span className="text-sm text-text-muted group-hover:text-text-secondary transition-colors">
                    Git status
                </span>
                <span className="text-xs text-text-disabled">
                    {staged.length} staged · {unstaged.length} unstaged
                </span>
                <Icon
                    name={open ? "expand_less" : "expand_more"}
                    size={12}
                    className="text-text-disabled shrink-0"
                />
            </button>
            <div className="flex flex-col gap-0.5 pl-5">
                {shown.map((line) => (
                    <div key={`${line.area}-${line.path}`} className="flex items-center gap-1.5 min-w-0">
                        <GitStatusBadge status={line.status} />
                        <FilePill path={line.path} />
                    </div>
                ))}
                {!open && lines.length > preview.length ? (
                    <span className="text-xs text-text-disabled pl-4">
                        +{lines.length - preview.length} more
                    </span>
                ) : null}
            </div>
        </div>
    );
}

/** Summary label for a collapsed run of consecutive tool actions. */
function computeGroupHeader(visible: Chunk[]) {
    const hasThink = visible.some((b) => b.type === "think" || b.type === "thought");
    const hasExplore = visible.some((b) =>
        ["search", "grep", "cat", "ls", "search_result", "web_search", "web_result", "web_visit"].includes(b.type),
    );
    const hasEdit = visible.some((b) =>
        ["edit", "create_file", "mkdir", "delete_file", "rename_file"].includes(b.type),
    );
    const hasCommand = visible.some((b) => b.type === "terminal_command" || b.type === "run");

    if (hasEdit && hasExplore) return { icon: "edit", label: "Explored and edited" };
    if (hasEdit) return { icon: "edit", label: "Edited files" };
    if (hasCommand && !hasExplore) return { icon: "terminal", label: "Ran commands" };
    if (hasExplore) return { icon: "search", label: "Explored codebase" };
    if (hasThink) return { icon: "brain", label: "Thought" };
    return { icon: "auto_awesome", label: "Worked" };
}

export function getWorkflowActionConfig(block: Chunk, isActive?: boolean) {
    const inFlight = isActive ?? block.isGenerating;
    switch (block.type) {
        case "think":
        case "thought":
            return {
                label: inFlight ? "Thinking" : "Thought",
                expandable: true,
                content: block.content,
            };
        case "search":
            return {
                label: inFlight ? "Searching" : "Searched",
                query: block.query || block.content,
                expandable: !!block.content && block.content !== block.query,
                content: block.content,
            };
        case "search_result":
            return {
                label: "Searched",
                query: block.query,
                expandable: !!block.content,
                content: block.content,
            };
        case "web_search":
        case "web_result":
            return {
                label: block.type === "web_result" ? "Searched web" : "Searching web",
                query: block.query || block.content,
                expandable: !!block.content,
                content: block.content,
            };
        case "web_visit":
            return {
                label: block.isGenerating ? "Visiting" : "Visited",
                query: block.visitHost || block.visitTitle || block.content,
                file: undefined,
                expandable: false,
                faviconUrl: block.visitUrl || block.visitHost,
                onClick: () => {
                    const href = block.visitUrl;
                    if (href) void commands.openUrlExternal(href);
                },
            };
        case "grep":
            return {
                label: inFlight ? "Grepping" : "Grepped",
                query: block.query || block.content,
                expandable: !!block.content,
                content: block.content,
            };
        case "cat":
            return {
                label: "Read",
                file: block.content,
                expandable: false,
                onClick: () => {
                    if (block.content) {
                        void openProjectFile(block.content);
                    }
                },
            };
        case "ls":
            return {
                label: "Listed",
                query: (block.content || "").trim() === "." ? "project" : (block.content || "").split(/[\\/]/).pop(),
                expandable: false,
            };
        case "create_file":
            return {
                label: "Created",
                file: block.content,
                expandable: false,
            };
        case "mkdir":
            return {
                label: "Created directory",
                file: block.content,
                expandable: false,
            };
        case "delete_file":
            return {
                label: "Deleted",
                file: block.content,
                expandable: false,
            };
        case "rename_file":
            return {
                label: "Renamed",
                query: block.content,
                expandable: false,
            };
        case "rename_chat":
            return {
                label: "Renamed chat",
                query: block.content,
                expandable: false,
            };
        case "edit": {
            const file = block.file || "";
            return {
                label: block.isGenerating ? "Editing" : "Edited",
                file,
                expandable: false,
                original: block.original,
                replacement: block.replacement,
            };
        }
        case "terminal_command":
        case "run":
            return {
                label:
                    block.commandStatus === "pending"
                        ? "Awaiting approval"
                        : block.commandStatus === "background"
                          ? "Running in background"
                          : "Ran",
                query: block.command || block.content,
                expandable: !!block.content && block.content.trim() !== block.command?.trim(),
                content: block.content ? block.content.replace(block.command || "", "").trim() : "",
                commandId: block.commandId,
                commandStatus: block.commandStatus,
                commandReason: block.commandReason,
            };
        case "git_operation": {
            const op = block.gitOp ?? "git";
            const status = block.gitStatus ?? "completed";
            const stagePath = op === "stage" ? parseGitStagePath(block.content) : null;
            const statusLines = op === "status" ? parseGitStatusLines(block.content) : [];
            const label =
                status === "running"
                    ? `${op}…`
                    : status === "error"
                        ? `${op} failed`
                        : status === "pending"
                            ? `Awaiting approval`
                            : op === "fetch"
                                ? "Fetched"
                                : op === "status"
                                    ? "Git status"
                                    : op === "log"
                                        ? "Git log"
                                        : op === "stage"
                                            ? "Staged"
                                            : op === "commit"
                                                ? "Committed"
                                                : `Git ${op}`;
            return {
                label,
                file: stagePath ?? undefined,
                query:
                    op === "stage" || op === "status"
                        ? undefined
                        : block.content?.trim() || undefined,
                expandable:
                    op !== "stage" &&
                    op !== "status" &&
                    Boolean(block.content && block.content.length > 80),
                content: block.content,
                icon: status === "running" ? "sync" : "account_tree",
                gitStatusLines: statusLines.length > 0 ? statusLines : undefined,
            };
        }
        default:
            return null;
    }
}

export function isRenderableWorkflowBlock(block: Chunk, isActive?: boolean) {
    if (block.type === "tool_result" || block.type === "status") return false;
    if ((block.type === "think" || block.type === "thought") && !block.content?.trim() && !isActive) return false;
    return getWorkflowActionConfig(block, isActive) !== null;
}

/** Runs up to this size render as plain inline rows; larger runs get a collapsible summary. */
const INLINE_GROUP_MAX = 3;

/**
 * One consecutive run of tool actions, rendered in place between prose
 * segments. Small runs show as flat rows; long runs collapse into a summary
 * line ("Explored codebase · 12 steps") once the turn finishes. The message's
 * single bottom status indicator owns the spinner  -  no spinner here.
 */
export function AgentWorkflow({
    blocks,
    isActive,
    isFileEditResolved,
}: {
    blocks: Chunk[];
    isActive?: boolean;
    isFileEditResolved?: (file: string, replacement?: string) => boolean;
}) {
    const visibleBlocks = blocks.filter((b) => isRenderableWorkflowBlock(b, isActive));
    const collapsible = visibleBlocks.length > INLINE_GROUP_MAX;

    // Open while streaming, collapse once the run finishes. Render-time state
    // adjustment (not an effect) per React guidance.
    const [isOpen, setIsOpen] = useState(!!isActive);
    const [prevActive, setPrevActive] = useState(isActive);
    if (isActive !== prevActive) {
        setPrevActive(isActive);
        setIsOpen(!!isActive);
    }

    if (visibleBlocks.length === 0) return null;

    const rows = (
        <div className="flex flex-col gap-0.5">
            {groupWorkflowRows(visibleBlocks).map((row, i) => {
                if (row.kind === "git_stage_group") {
                    return <GitStageGroup key={`stage-${i}`} paths={row.paths} />;
                }
                return (
                    <ActionItem
                        key={i}
                        block={row.block}
                        isFileEditResolved={isFileEditResolved}
                    />
                );
            })}
        </div>
    );

    if (!collapsible) {
        return <div className="flex flex-col w-full my-1 select-none">{rows}</div>;
    }

    const header = computeGroupHeader(visibleBlocks);
    const showRows = isOpen || isActive;

    return (
        <div className="flex flex-col w-full my-1 select-none">
            <button
                type="button"
                onClick={() => setIsOpen((open) => !open)}
                className="flex items-center gap-2 py-1 w-fit text-left group"
            >
                <Icon name={header.icon} size={14} className="text-text-muted shrink-0" />
                <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
                    {header.label}
                </span>
                <span className="text-xs text-text-disabled">
                    {visibleBlocks.length} step{visibleBlocks.length === 1 ? "" : "s"}
                </span>
                <Icon
                    name={showRows ? "expand_less" : "expand_more"}
                    size={12}
                    className="text-text-muted shrink-0"
                />
            </button>

            {showRows && (
                <div className="flex flex-col gap-0.5 mt-0.5 ml-[7px] border-l border-border-subtle pl-3">
                    {rows}
                </div>
            )}
        </div>
    );
}

function FilePill({ path, onClick }: { path: string; onClick?: () => void }) {
    const fileName = path.split(/[\\/]/).pop() || path;
    const handleOpen = onClick ?? (() => { void openProjectFile(path, fileName); });
    return (
        <span
            role="button"
            tabIndex={0}
            onClick={handleOpen}
            onKeyDown={(e) => { if (e.key === "Enter") handleOpen(); }}
            className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs",
                "border border-border-subtle bg-panel text-text-primary",
                "cursor-pointer hover:bg-panel-hover",
            )}
        >
            <FileIcon name={fileName} className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[180px]">{fileName}</span>
        </span>
    );
}

export function TerminalApprovalRow({ block }: { block: Chunk }) {
    const [status, setStatus] = useState(block.commandStatus || "pending");
    const [isProcessing, setIsProcessing] = useState(false);

    // Stay in sync when stream updates the pending → completed XML.
    useEffect(() => {
        if (block.commandStatus) setStatus(block.commandStatus);
    }, [block.commandStatus]);

    const handleApprove = useCallback(async () => {
        if (!block.commandId || isProcessing) return;
        setIsProcessing(true);
        // Demo showcase commands are local-only.
        if (block.commandId.startsWith("demo-")) {
            setStatus("completed");
            setIsProcessing(false);
            return;
        }
        try {
            await commands.approveTerminalCommand(block.commandId);
            // Keep pending UI until the stream replaces this block with a completed one.
        } catch {
            setStatus("error");
            setIsProcessing(false);
        }
    }, [block.commandId, isProcessing]);

    const handleReject = useCallback(async () => {
        if (!block.commandId || isProcessing) return;
        setIsProcessing(true);
        if (block.commandId.startsWith("demo-")) {
            setStatus("rejected");
            setIsProcessing(false);
            return;
        }
        try {
            await commands.rejectTerminalCommand(block.commandId);
            setStatus("rejected");
        } catch {
            setStatus("error");
        } finally {
            setIsProcessing(false);
        }
    }, [block.commandId, isProcessing]);

    if (status !== "pending") return null;

    const command = block.command || block.content || "command";

    return (
        <ApprovalBar
            label="Approve command"
            subject={command}
            acceptLabel="Run"
            isProcessing={isProcessing}
            onAccept={() => { void handleApprove(); }}
            onReject={() => { void handleReject(); }}
        />
    );
}

function ActionItem({
    block,
    isFileEditResolved,
}: {
    block: Chunk;
    isFileEditResolved?: (file: string, replacement?: string) => boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const config = getWorkflowActionConfig(block);

    const isThink = block.type === "think" || block.type === "thought";
    const isEdit = block.type === "edit";

    const editStats = React.useMemo(() => {
        if (!isEdit || block.isGenerating) return null;
        const changes = diffLines(block.original || "", block.replacement || "");
        let add = 0;
        let del = 0;
        changes.forEach((c) => {
            if (c.added) add += c.value.split("\n").length - 1 || 1;
            if (c.removed) del += c.value.split("\n").length - 1 || 1;
        });
        return { add, del };
    }, [isEdit, block.original, block.replacement, block.isGenerating]);

    if (!config) return null;

    if (block.type === "terminal_command" && block.commandStatus === "pending") {
        return <TerminalApprovalRow block={block} />;
    }

    if (block.type === "git_operation" && block.gitOp === "status" && config.gitStatusLines?.length) {
        return <GitStatusGroup lines={config.gitStatusLines} />;
    }

    if (block.type === "git_operation" && block.gitOp === "stage" && config.file) {
        return (
            <div className="flex items-center gap-1.5 py-0.5">
                <span className="text-sm text-text-muted">Staged</span>
                <FilePill path={config.file} />
            </div>
        );
    }

    const useMarkdown =
        isThink
        || block.type === "search_result"
        || block.type === "web_result"
        || (block.type === "search" && !!config.content && looksLikeProseMarkdown(config.content));

    const editResolved = isEdit && block.file
        ? (isFileEditResolved?.(block.file, block.replacement) ?? false)
        : false;

    const handleClick = () => {
        if (config.expandable) {
            setExpanded((e) => !e);
            return;
        }
        if (isEdit && block.file) {
            openFileEdit(block.file, block.original || "", block.replacement || "", editResolved);
            return;
        }
        config.onClick?.();
    };

    return (
        <div className="flex flex-col w-full py-0.5">
            <button
                type="button"
                onClick={handleClick}
                className={cn(
                    "flex items-center gap-1.5 w-fit text-left group",
                    (config.expandable || config.onClick || isEdit) && "cursor-pointer hover:opacity-80",
                )}
            >
                <span className="text-sm text-text-muted">
                    {isEdit && editResolved ? "Applied" : config.label}
                </span>

                {"faviconUrl" in config && config.faviconUrl ? (
                    <Favicon url={String(config.faviconUrl)} size={14} />
                ) : null}

                {config.query && (
                    <span className="text-sm text-text-muted truncate max-w-[260px]">
                        {typeof config.query === "string" && config.query.length > 60
                            ? `"${config.query.slice(0, 60)}…"`
                            : block.type === "web_visit"
                              ? String(config.query)
                              : `"${config.query}"`}
                    </span>
                )}

                {config.file && <FilePill path={config.file} />}

                {editStats && !editResolved && (
                    <span className="flex items-center gap-1 text-xs ml-0.5">
                        <span className="text-success">+{editStats.add}</span>
                        <span className="text-error">-{editStats.del}</span>
                    </span>
                )}

                {config.expandable && (
                    <Icon
                        name="chevron_right"
                        size={10}
                        className={cn(
                            "text-text-disabled transition-transform duration-200 shrink-0",
                            expanded && "rotate-90",
                        )}
                    />
                )}
            </button>

            {expanded && config.expandable && config.content && (
                <div className={cn(
                    "text-sm mt-1 mb-1",
                    isThink
                        ? "text-text-muted leading-relaxed"
                        : useMarkdown
                            ? "font-sans"
                            : "overflow-x-auto whitespace-pre-wrap p-2 rounded-md border border-border-subtle bg-panel text-text-secondary text-xs font-mono",
                )}>
                    {useMarkdown ? (
                        <ChatMarkdown content={config.content || ""} />
                    ) : (
                        config.content
                    )}
                </div>
            )}
        </div>
    );
}
