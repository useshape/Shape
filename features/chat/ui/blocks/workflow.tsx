"use client";

import React, { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { FileIcon } from "@/components/ui/file-icon";
import { Favicon } from "@/components/ui/favicon";
import { cn } from "@/lib/utils";
import { commands, getProjectPath } from "@/lib/backend";
import { diffLines } from "diff";
import { Chunk } from "../md/renderer";
import { ChatMarkdown } from "../md/view";
import { looksLikeProseMarkdown } from "../md/stream";
import { openProjectFile } from "@/lib/open-project-file";
import { resolveProjectFilePath } from "@/lib/path-utils";
import { TerminalCommandStep } from "./terminal-live";

export const WORKFLOW_CHUNK_TYPES = new Set<Chunk["type"]>([
    "search", "grep", "status", "web_search", "web_result", "web_visit", "search_result",
    "ls", "cat", "create_file", "mkdir", "delete_file", "rename_file", "rename_chat",
    "think", "thought", "run", "tool_result", "edit", "edit_pending", "terminal_command", "git_operation",
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

type GitLogLine = { hash: string; date: string; author: string; subject: string };

export function parseGitLogLines(content?: string): GitLogLine[] {
    if (!content?.trim()) return [];
    return content.split("\n").flatMap((line) => {
        const trimmed = line.trim();
        // New structured form
        const structured = trimmed.match(/^\[commit\]\s+([^|]+)\|([^|]*)\|([^|]*)\|(.*)$/);
        if (structured) {
            return [{
                hash: structured[1].trim(),
                date: structured[2].trim(),
                author: structured[3].trim(),
                subject: structured[4].trim(),
            }];
        }
        // Legacy: `abc1234 2024-01-01 — subject (author)`
        const legacy = trimmed.match(/^([0-9a-f]{7,40})\s+(\S+)\s+—\s+(.+?)\s+\(([^)]+)\)\s*$/i);
        if (legacy) {
            return [{
                hash: legacy[1],
                date: legacy[2],
                subject: legacy[3].trim(),
                author: legacy[4].trim(),
            }];
        }
        return [];
    });
}

type GitBranchLine = { name: string; current: boolean; remote: boolean };

export function parseGitBranchLines(content?: string): GitBranchLine[] {
    if (!content?.trim()) return [];
    return content.split("\n").flatMap((line) => {
        const trimmed = line.trim();
        const match = trimmed.match(/^\[([* r!])\]\s+(.+)$/);
        if (!match) return [];
        const mark = match[1];
        if (mark === "!") return [];
        return [{
            name: match[2].trim(),
            current: mark === "*",
            remote: mark === "r",
        }];
    });
}

export function parseGitDiffMeta(content?: string): { file?: string; scope?: string; body: string } {
    if (!content?.trim()) return { body: "" };
    const lines = content.split("\n");
    const first = lines[0]?.trim() ?? "";
    const fileMatch = first.match(/^\[file\]\s+(.+)$/);
    if (fileMatch) {
        return { file: fileMatch[1].trim(), body: lines.slice(1).join("\n") };
    }
    const scopeMatch = first.match(/^\[scope\]\s+(\w+)$/);
    if (scopeMatch) {
        return { scope: scopeMatch[1], body: lines.slice(1).join("\n") };
    }
    return { body: content };
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
    const letter = status.trim().charAt(0).toUpperCase() || "?";
    const color =
        letter === "A"
            ? "text-success"
            : letter === "D"
              ? "text-error"
              : letter === "M" || letter === "R"
                ? "text-warning"
                : "text-text-muted";
    return (
        <span
            className={cn(
                "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border font-mono text-[10px]",
                color,
            )}
        >
            {letter}
        </span>
    );
}

function GitCardShell({
    icon,
    title,
    meta,
    open,
    onToggle,
    children,
}: {
    icon: string;
    title: string;
    meta?: string;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className="my-1 w-full overflow-hidden rounded-2xl border border-border bg-transparent">
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
            >
                <Icon name={icon} size={13} className="shrink-0 text-text-muted" />
                <span className="truncate text-sm text-text-muted">{title}</span>
                {meta ? (
                    <span className="min-w-0 truncate text-sm text-text-disabled">{meta}</span>
                ) : null}
                <Icon
                    name={open ? "expand_less" : "expand_more"}
                    size={14}
                    className="ml-auto shrink-0 text-text-muted"
                />
            </button>
            {open ? (
                <div className="px-3 py-2.5">
                    {children}
                </div>
            ) : null}
        </div>
    );
}

export function GitStageGroup({ paths }: { paths: string[] }) {
    const [open, setOpen] = useState(true);
    const unique = [...new Set(paths.filter(Boolean))];

    return (
        <GitCardShell
            icon="account_tree"
            title="Staged files"
            meta={`${unique.length} file${unique.length === 1 ? "" : "s"}`}
            open={open}
            onToggle={() => setOpen((v) => !v)}
        >
            <div className="flex flex-col gap-1.5">
                {unique.map((path) => (
                    <div key={path} className="flex min-w-0 items-center gap-2">
                        <GitStatusBadge status="A" />
                        <FilePill path={path} />
                    </div>
                ))}
            </div>
        </GitCardShell>
    );
}

function GitStatusGroup({ lines }: { lines: GitStatusLine[] }) {
    const [open, setOpen] = useState(true);
    const staged = lines.filter((l) => l.area === "staged");
    const unstaged = lines.filter((l) => l.area === "unstaged");

    return (
        <GitCardShell
            icon="account_tree"
            title="Git status"
            meta={`${staged.length} staged · ${unstaged.length} unstaged`}
            open={open}
            onToggle={() => setOpen((v) => !v)}
        >
            <div className="flex flex-col gap-3">
                {staged.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                        <span className="text-sm text-text-disabled">Staged</span>
                        {staged.map((line) => (
                            <div key={`staged-${line.path}`} className="flex min-w-0 items-center gap-2">
                                <GitStatusBadge status={line.status} />
                                <FilePill path={line.path} />
                            </div>
                        ))}
                    </div>
                ) : null}
                {unstaged.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                        <span className="text-sm text-text-disabled">Unstaged</span>
                        {unstaged.map((line) => (
                            <div key={`unstaged-${line.path}`} className="flex min-w-0 items-center gap-2">
                                <GitStatusBadge status={line.status} />
                                <FilePill path={line.path} />
                            </div>
                        ))}
                    </div>
                ) : null}
                {lines.length === 0 ? (
                    <span className="text-sm text-text-muted">Clean working tree</span>
                ) : null}
            </div>
        </GitCardShell>
    );
}

function GitLogGroup({ lines }: { lines: GitLogLine[] }) {
    const [open, setOpen] = useState(true);

    return (
        <GitCardShell
            icon="history"
            title="Git log"
            meta={`${lines.length} commit${lines.length === 1 ? "" : "s"}`}
            open={open}
            onToggle={() => setOpen((v) => !v)}
        >
            <div className="flex flex-col gap-2">
                {lines.map((line) => (
                    <div
                        key={`${line.hash}-${line.subject}`}
                        className="flex flex-col gap-0.5 rounded-lg bg-surface-3 px-2.5 py-2"
                    >
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 text-sm text-text-primary">{line.hash}</span>
                            {line.author ? (
                                <span className="shrink-0 text-sm text-text-disabled">{line.author}</span>
                            ) : null}
                            {line.date ? (
                                <span className="ml-auto shrink-0 text-sm text-text-disabled">{line.date}</span>
                            ) : null}
                        </div>
                        <span className="text-sm text-text-primary leading-snug">{line.subject}</span>
                    </div>
                ))}
            </div>
        </GitCardShell>
    );
}

function GitBranchesGroup({ lines }: { lines: GitBranchLine[] }) {
    const [open, setOpen] = useState(true);
    const current = lines.find((l) => l.current);

    return (
        <GitCardShell
            icon="account_tree"
            title="Branches"
            meta={current ? `on ${current.name}` : `${lines.length}`}
            open={open}
            onToggle={() => setOpen((v) => !v)}
        >
            <div className="flex flex-col gap-1.5">
                {lines.map((line) => (
                    <div
                        key={line.name}
                        className={cn(
                            "flex min-w-0 items-center gap-2 rounded-lg bg-surface-3 px-2 py-1.5",
                            line.current && "border border-border-subtle bg-transparent",
                        )}
                    >
                        <span
                            className={cn(
                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                line.current ? "bg-success" : "bg-text-disabled/40",
                            )}
                        />
                        <span
                            className={cn(
                                "min-w-0 truncate text-sm",
                                line.current ? "text-text-primary" : "text-text-secondary",
                                line.remote && "text-text-muted",
                            )}
                        >
                            {line.name}
                        </span>
                        {line.current ? (
                            <span className="ml-auto shrink-0 text-sm text-text-disabled">current</span>
                        ) : null}
                    </div>
                ))}
            </div>
        </GitCardShell>
    );
}

function GitDiffGroup({
    file,
    scope,
    body,
}: {
    file?: string;
    scope?: string;
    body: string;
}) {
    const [open, setOpen] = useState(true);
    const lineCount = body ? body.split("\n").filter(Boolean).length : 0;
    const title = file
        ? "Git diff"
        : scope === "staged"
          ? "Staged diff"
          : "Git diff";
    const meta = file
        ? `${file.split(/[/\\]/).pop()} · ${lineCount} lines`
        : `${lineCount} lines`;

    return (
        <GitCardShell
            icon="code"
            title={title}
            meta={meta}
            open={open}
            onToggle={() => setOpen((v) => !v)}
        >
            <div className="flex flex-col gap-2">
                {file ? <FilePill path={file} /> : null}
                {body.trim() ? (
                    <pre className="max-h-64 overflow-auto rounded-lg bg-surface-3 px-2.5 py-2 text-sm leading-relaxed text-text-secondary whitespace-pre-wrap break-all custom-scrollbar">
                        {body}
                    </pre>
                ) : (
                    <span className="text-sm text-text-muted">No diff output</span>
                )}
            </div>
        </GitCardShell>
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
        case "web_result": {
            const hits = (block.content || "")
                .split("---")
                .map((part) => {
                    const urlMatch = part.match(/URL:\s*(.+)/);
                    return urlMatch?.[1]?.trim() || "";
                })
                .filter(Boolean);
            return {
                label: block.type === "web_result" || !block.isGenerating ? "Searched web" : "Searching web",
                query: block.query,
                expandable: !!block.content,
                content: block.content,
                resultUrls: hits.slice(0, 5),
            };
        }
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
        case "edit_pending": {
            const file = block.file || "";
            const label =
                block.commandStatus === "applied"
                    ? "Edited"
                    : block.commandStatus === "rejected"
                        ? "Rejected edit"
                        : block.commandStatus === "cancelled"
                            ? "Cancelled edit"
                            : "Proposed edit";
            return {
                label,
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
            const logLines = op === "log" ? parseGitLogLines(block.content) : [];
            const branchLines = op === "branches" ? parseGitBranchLines(block.content) : [];
            const diffMeta = op === "diff" ? parseGitDiffMeta(block.content) : null;
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
                                        : op === "diff"
                                            ? "Git diff"
                                            : op === "branches"
                                                ? "Branches"
                                                : op === "stage"
                                                    ? "Staged"
                                                    : op === "commit"
                                                        ? "Committed"
                                                        : `Git ${op}`;
            return {
                label,
                file: stagePath ?? diffMeta?.file ?? undefined,
                query:
                    op === "stage" ||
                    op === "status" ||
                    op === "log" ||
                    op === "branches" ||
                    op === "diff"
                        ? undefined
                        : block.content?.trim() || undefined,
                expandable:
                    op !== "stage" &&
                    op !== "status" &&
                    op !== "log" &&
                    op !== "branches" &&
                    op !== "diff" &&
                    Boolean(block.content && block.content.length > 80),
                content: block.content,
                icon: status === "running" ? "sync" : "account_tree",
                gitStatusLines: statusLines.length > 0 ? statusLines : undefined,
                gitLogLines: logLines.length > 0 ? logLines : undefined,
                gitBranchLines: branchLines.length > 0 ? branchLines : undefined,
                gitDiffMeta: diffMeta?.body ? diffMeta : undefined,
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
            onAuxClick={(e) => {
                if (e.button === 1) handleOpen();
            }}
            onKeyDown={(e) => { if (e.key === "Enter") handleOpen(); }}
            className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-sm",
                "bg-surface-3 text-text-primary",
                "cursor-pointer hover:bg-panel-hover",
            )}
        >
            <FileIcon name={fileName} className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[180px]">{fileName}</span>
        </span>
    );
}

export function ActionItem({
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

    if (block.type === "terminal_command") {
        return <TerminalCommandStep block={block} />;
    }

    if (block.type === "edit_pending" && (block.commandStatus || "pending") === "pending") {
        // Edit approval cards live in TurnWorkflowSummary; keep a compact
        // fallback if this legacy AgentWorkflow path still renders one.
        return (
            <div className="py-0.5 text-xs text-text-muted">
                Pending edit approval for{" "}
                <span className="text-text-secondary">
                    {(block.file || "").split(/[\\/]/).pop() || "file"}
                </span>
            </div>
        );
    }

    if (block.type === "git_operation" && block.gitOp === "status" && config.gitStatusLines?.length) {
        return <GitStatusGroup lines={config.gitStatusLines} />;
    }

    if (block.type === "git_operation" && block.gitOp === "log" && config.gitLogLines?.length) {
        return <GitLogGroup lines={config.gitLogLines} />;
    }

    if (block.type === "git_operation" && block.gitOp === "branches" && config.gitBranchLines?.length) {
        return <GitBranchesGroup lines={config.gitBranchLines} />;
    }

    if (block.type === "git_operation" && block.gitOp === "diff" && config.gitDiffMeta) {
        return (
            <GitDiffGroup
                file={config.gitDiffMeta.file}
                scope={config.gitDiffMeta.scope}
                body={config.gitDiffMeta.body}
            />
        );
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

                {"resultUrls" in config && Array.isArray(config.resultUrls) && config.resultUrls.length > 0 ? (
                    <span className="inline-flex items-center -space-x-1 shrink-0">
                        {config.resultUrls.map((url: string) => (
                            <span
                                key={url}
                                className="inline-flex size-4 items-center justify-center rounded-md border border-border-subtle bg-panel overflow-hidden"
                            >
                                <Favicon url={url} size={12} />
                            </span>
                        ))}
                    </span>
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
