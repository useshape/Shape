"use client";

import React, { useState } from "react";
import { Icon } from "@/components/ui/icon";
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
import { ActionPhrase } from "./chat-card";
import { ServiceChip } from "./service-chip";
import { Collapse } from "./collapse";
import { McpAuthCard, McpCallCard } from "./mcp-card";
import { WebSearchCard, WebVisitCard } from "./web-cards";

export const WORKFLOW_CHUNK_TYPES = new Set<Chunk["type"]>([
    "search", "grep", "web_search", "web_result", "web_visit", "search_result",
    "ls", "cat", "create_file", "mkdir", "delete_file", "rename_file", "rename_chat",
    "think", "thought", "run", "tool_result", "edit", "edit_pending", "terminal_command", "git_operation",
    "mcp_call", "mcp_auth",
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
        <span className={cn("shrink-0 font-mono text-xs tabular-nums", color)}>
            {letter}
        </span>
    );
}

function GitCardShell({
    title,
    meta,
    children,
}: {
    title: string;
    meta?: string;
    children: React.ReactNode;
}) {
    return (
        <ServiceChip
            leading={<Icon name="account_tree" size={14} className="text-text-muted" />}
            title={title}
            detail={meta}
            expandable
        >
            <div className="flex flex-col gap-1">{children}</div>
        </ServiceChip>
    );
}

export function GitStageGroup({ paths }: { paths: string[] }) {
    const unique = [...new Set(paths.filter(Boolean))];

    return (
        <GitCardShell title="Staged" meta={`${unique.length}`}>
            {unique.map((path) => (
                <div key={path} className="flex min-w-0 items-center gap-2">
                    <GitStatusBadge status="A" />
                    <GitFileLink path={path} />
                </div>
            ))}
        </GitCardShell>
    );
}

function GitStatusGroup({ lines }: { lines: GitStatusLine[] }) {
    const staged = lines.filter((l) => l.area === "staged");
    const unstaged = lines.filter((l) => l.area === "unstaged");

    return (
        <GitCardShell
            title="Git status"
            meta={`${lines.length}`}
        >
            {staged.map((line) => (
                <div key={`staged-${line.path}`} className="flex min-w-0 items-center gap-2">
                    <GitStatusBadge status={line.status} />
                    <GitFileLink path={line.path} />
                </div>
            ))}
            {unstaged.map((line) => (
                <div key={`unstaged-${line.path}`} className="flex min-w-0 items-center gap-2">
                    <GitStatusBadge status={line.status} />
                    <GitFileLink path={line.path} />
                </div>
            ))}
            {lines.length === 0 ? (
                <span className="text-sm text-text-muted">Clean working tree</span>
            ) : null}
        </GitCardShell>
    );
}

function GitLogGroup({ lines }: { lines: GitLogLine[] }) {
    return (
        <GitCardShell title="Git log" meta={`${lines.length}`}>
            {lines.map((line) => (
                <div key={`${line.hash}-${line.subject}`} className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                        <span className="shrink-0 font-mono text-text-muted">{line.hash}</span>
                        <span className="min-w-0 truncate text-text-primary">{line.subject}</span>
                    </div>
                    {line.author || line.date ? (
                        <div className="text-xs text-text-muted">
                            {[line.author, line.date].filter(Boolean).join(" · ")}
                        </div>
                    ) : null}
                </div>
            ))}
        </GitCardShell>
    );
}

function GitBranchesGroup({ lines }: { lines: GitBranchLine[] }) {
    const current = lines.find((l) => l.current);

    return (
        <GitCardShell title="Branches" meta={current ? current.name : `${lines.length}`}>
            {lines.map((line) => (
                <div key={line.name} className="flex min-w-0 items-center gap-2 text-sm">
                    <span
                        className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            line.current ? "bg-success" : "bg-text-disabled/40",
                        )}
                    />
                    <span
                        className={cn(
                            "min-w-0 truncate",
                            line.current ? "text-text-primary" : "text-text-muted",
                        )}
                    >
                        {line.name}
                    </span>
                </div>
            ))}
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
    const lineCount = body ? body.split("\n").filter(Boolean).length : 0;
    const title = scope === "staged" ? "Staged diff" : "Git diff";
    const fileName = file?.split(/[/\\]/).pop();
    const meta = [fileName, lineCount ? `${lineCount} lines` : null].filter(Boolean).join(" · ");

    return (
        <GitCardShell title={title} meta={meta || undefined}>
            {body.trim() ? (
                <pre className="max-h-48 overflow-auto text-xs leading-relaxed text-text-muted whitespace-pre-wrap break-all custom-scrollbar">
                    {body}
                </pre>
            ) : (
                <span className="text-sm text-text-muted">No diff output</span>
            )}
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
                gitDiffMeta: op === "diff" ? (diffMeta ?? { body: "" }) : undefined,
            };
        }
        case "mcp_call":
            return {
                label: block.mcpTitle || block.mcpTool || "MCP",
                expandable: Boolean(block.content?.trim()),
                content: block.content,
            };
        case "mcp_auth":
            return {
                label: block.mcpServerName ? `Connect ${block.mcpServerName}` : "Connect",
                expandable: false,
            };
        default:
            return null;
    }
}

export function isRenderableWorkflowBlock(block: Chunk, isActive?: boolean) {
    if (block.type === "tool_result" || block.type === "status") return false;
    if ((block.type === "think" || block.type === "thought") && !block.content?.trim() && !isActive) return false;
    return getWorkflowActionConfig(block, isActive) !== null;
}

export function visibleWorkflowBlocks(blocks: Chunk[], isActive?: boolean): Chunk[] {
    const filtered = blocks.filter((b) => isRenderableWorkflowBlock(b, isActive));
    const resultQueries = new Set(
        filtered
            .filter((b) => b.type === "web_result")
            .map((b) => (b.query || "").trim())
            .filter(Boolean),
    );
    return filtered.filter((b) => {
        if (b.type !== "web_search") return true;
        const q = (b.query || "").trim();
        return !q || !resultQueries.has(q);
    });
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
    const visibleBlocks = visibleWorkflowBlocks(blocks, isActive);
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
    const showRows = isOpen;

    return (
        <div className="flex flex-col w-full my-1 select-none">
            <button
                type="button"
                onClick={() => setIsOpen((open) => !open)}
                className="flex items-center gap-2 py-1 w-fit text-left group"
            >
                <Icon name={header.icon} size={14} className="text-text-muted shrink-0" />
                <span className="text-sm text-text-primary group-hover:text-text-primary transition-colors">
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
                <div className="flex flex-col gap-0.5 mt-0.5">
                    {rows}
                </div>
            )}
        </div>
    );
}

function GitFileLink({ path }: { path: string }) {
    const fileName = path.split(/[\\/]/).pop() || path;
    return (
        <button
            type="button"
            onClick={() => { void openProjectFile(path, fileName); }}
            className="min-w-0 truncate text-sm text-text-muted hover:text-text-primary"
        >
            {fileName}
        </button>
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

    if (block.type === "mcp_call") {
        return (
            <McpCallCard
                serverId={block.mcpServerId}
                serverName={block.mcpServerName}
                title={block.mcpTitle || block.mcpTool || "MCP"}
                content={block.content}
            />
        );
    }

    if (block.type === "mcp_auth") {
        return (
            <McpAuthCard
                serverId={block.mcpServerId}
                serverName={block.mcpServerName}
            />
        );
    }

    if (block.type === "web_search" || block.type === "web_result") {
        return (
            <WebSearchCard
                query={block.query}
                content={block.content}
                isGenerating={block.isGenerating}
            />
        );
    }

    if (block.type === "web_visit") {
        const host = block.visitHost || block.visitTitle || block.content || "";
        const url = block.visitUrl || block.visitHost || "";
        return (
            <WebVisitCard
                host={host}
                url={url}
                isGenerating={block.isGenerating}
            />
        );
    }

    if (block.type === "terminal_command") {
        return <TerminalCommandStep block={block} />;
    }

    if (block.type === "edit_pending" && (block.commandStatus || "pending") === "pending") {
        // Edit approval cards live in TurnWorkflowSummary; keep a compact
        // fallback if this legacy AgentWorkflow path still renders one.
        return (
            <div className="py-0.5 text-xs">
                <ActionPhrase
                    verb="Pending edit approval for"
                    detail={(block.file || "").split(/[\\/]/).pop() || "file"}
                />
            </div>
        );
    }

    if (block.type === "git_operation" && block.gitOp === "status") {
        return <GitStatusGroup lines={config.gitStatusLines ?? parseGitStatusLines(block.content)} />;
    }

    if (block.type === "git_operation" && block.gitOp === "log") {
        return <GitLogGroup lines={config.gitLogLines ?? parseGitLogLines(block.content)} />;
    }

    if (block.type === "git_operation" && block.gitOp === "branches") {
        return <GitBranchesGroup lines={config.gitBranchLines ?? parseGitBranchLines(block.content)} />;
    }

    if (block.type === "git_operation" && block.gitOp === "diff") {
        const meta = config.gitDiffMeta ?? parseGitDiffMeta(block.content);
        return (
            <GitDiffGroup
                file={meta.file}
                scope={meta.scope}
                body={meta.body}
            />
        );
    }

    if (block.type === "git_operation" && block.gitOp === "stage" && config.file) {
        return <GitStageGroup paths={[config.file]} />;
    }

    if (block.type === "git_operation") {
        return (
            <ServiceChip
                leading={<Icon name="account_tree" size={14} className="text-text-muted" />}
                title={config.label}
                expandable={Boolean(block.content?.trim())}
            >
                <pre className="max-h-48 overflow-auto text-xs leading-relaxed text-text-muted whitespace-pre-wrap break-all custom-scrollbar">
                    {block.content}
                </pre>
            </ServiceChip>
        );
    }

    const useMarkdown =
        isThink
        || block.type === "search_result"
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
                <span className="text-sm text-text-primary">
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
                            : `"${config.query}"`}
                    </span>
                )}

                {config.file && <GitFileLink path={config.file} />}

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

            <Collapse open={expanded && !!config.expandable && !!config.content}>
                <div className={cn(
                    "text-sm mt-1 mb-1",
                    isThink
                        ? "text-text-muted leading-relaxed"
                        : useMarkdown
                            ? "font-sans"
                            : "overflow-x-auto whitespace-pre-wrap text-text-secondary text-xs font-mono",
                )}>
                    {useMarkdown ? (
                        <ChatMarkdown content={config.content || ""} />
                    ) : (
                        config.content
                    )}
                </div>
            </Collapse>
        </div>
    );
}
