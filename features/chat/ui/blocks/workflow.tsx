"use client";

import { RiArrowDownSLine, RiArrowRightSLine, RiArrowUpSLine, RiGitBranchLine, RiPencilLine, RiRefreshLine, RiSearchLine, RiSparkling2Line, RiTerminalBoxLine } from "@remixicon/react";
import React, { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { FileIcon } from "@/components/ui/file-icon";
import { Favicon } from "@/components/ui/favicon";
import { cn } from "@/lib/utils";
import { commands, getProjectPath } from "@/lib/backend";
import { diffLines } from "diff";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Chunk } from "../md/renderer";
import { ChatMarkdown } from "../md/view";
import { looksLikeProseMarkdown } from "../md/stream";
import { openProjectFile } from "@/lib/window/open-project-file";
import { resolveProjectFilePath } from "@/lib/path-utils";
import { TerminalCommandStep } from "./terminal-live";
import { parseWebSearchHits, WebSearchBlock } from "./search";
import { ActionLine } from "./action-line";
import { providerIcon } from "@/lib/ui/provider-icon";

export const WORKFLOW_CHUNK_TYPES = new Set<Chunk["type"]>([
    "search", "grep", "status", "web_search", "web_result", "web_visit", "search_result",
    "ls", "cat", "create_file", "mkdir", "delete_file", "rename_file", "rename_chat",
    "think", "thought", "run", "tool_result", "edit", "edit_pending", "terminal_command", "git_operation",
    "plugin_call",
    "subagent",
    "subagent_ref",
]);

function resolvePath(filePath: string): string {
    return resolveProjectFilePath(filePath, getProjectPath());
}

function openFileEdit(file: string, original: string, replacement: string, isResolved?: boolean) {
    // Open a real editor tab (not the lightweight preview-only pane).
    const fileName = file.split(/[\\/]/).pop() || file;
    const resolved = resolvePath(file);
    void openProjectFile(file, fileName).then((ok) => {
        if (!ok) return;
        window.dispatchEvent(
            new CustomEvent("shape-layout-toggle", {
                detail: { id: "agent-workspace", value: true },
            }),
        );
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
        }, 100);
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
    | { kind: "git_stage_group"; paths: string[] }
    | { kind: "read_group"; files: { path: string; start?: number; end?: number }[] }
    | { kind: "search_group"; queries: string[]; count: number }
    | { kind: "web_trail"; blocks: Chunk[] }
    | { kind: "write_group"; paths: string[]; count: number }
    | { kind: "list_group"; count: number };

export function groupWorkflowRows(blocks: Chunk[]): WorkflowRow[] {
    const rows: WorkflowRow[] = [];
    let stagePaths: string[] = [];
    let readFiles: { path: string; start?: number; end?: number }[] = [];
    let searchQueries: string[] = [];
    let webBlocks: Chunk[] = [];
    let writePaths: string[] = [];
    let writeCount = 0;
    let listCount = 0;

    const flushStages = () => {
        if (stagePaths.length === 0) return;
        rows.push({ kind: "git_stage_group", paths: [...stagePaths] });
        stagePaths = [];
    };
    const flushReads = () => {
        if (readFiles.length === 0) return;
        rows.push({ kind: "read_group", files: [...readFiles] });
        readFiles = [];
    };
    const flushSearches = () => {
        if (searchQueries.length === 0) return;
        rows.push({
            kind: "search_group",
            queries: [...searchQueries],
            count: searchQueries.length,
        });
        searchQueries = [];
    };
    const flushWeb = () => {
        if (webBlocks.length === 0) return;
        rows.push({ kind: "web_trail", blocks: [...webBlocks] });
        webBlocks = [];
    };
    const flushWrites = () => {
        if (writeCount === 0) return;
        rows.push({ kind: "write_group", paths: [...writePaths], count: writeCount });
        writePaths = [];
        writeCount = 0;
    };
    const flushLists = () => {
        if (listCount === 0) return;
        rows.push({ kind: "list_group", count: listCount });
        listCount = 0;
    };
    const flushAll = () => {
        flushStages();
        flushReads();
        flushSearches();
        flushWeb();
        flushWrites();
        flushLists();
    };

    for (const block of blocks) {
        if (block.type === "git_operation" && block.gitOp === "stage") {
            flushReads();
            flushSearches();
            flushWeb();
            flushWrites();
            flushLists();
            const path = parseGitStagePath(block.content);
            if (path) {
                stagePaths.push(path);
                continue;
            }
        }
        if (block.type === "cat" && block.content) {
            flushStages();
            flushSearches();
            flushWeb();
            flushWrites();
            flushLists();
            readFiles.push({
                path: block.content,
                start: block.catStartLine,
                end: block.catEndLine,
            });
            continue;
        }
        if (block.type === "web_search" || block.type === "web_result" || block.type === "web_visit") {
            flushStages();
            flushReads();
            flushSearches();
            flushWrites();
            flushLists();
            webBlocks.push(block);
            continue;
        }
        if (
            (block.type === "search" || block.type === "grep" || block.type === "search_result")
            && !block.isGenerating
        ) {
            flushStages();
            flushReads();
            flushWeb();
            flushWrites();
            flushLists();
            const q = (block.query || block.content || "").trim();
            if (q) searchQueries.push(q);
            continue;
        }
        const pendingApproval =
            (block.type === "edit_pending" || block.type === "terminal_command")
            && (block.commandStatus || "pending") === "pending";
        if (pendingApproval) {
            flushAll();
            rows.push({ kind: "block", block });
            continue;
        }

        if (
            block.type === "create_file"
            || block.type === "mkdir"
            || block.type === "delete_file"
            || block.type === "rename_file"
            || block.type === "edit"
            || block.type === "edit_pending"
        ) {
            flushStages();
            flushReads();
            flushSearches();
            flushWeb();
            flushLists();
            const path =
                block.type === "edit" || block.type === "edit_pending"
                    ? (block.file || "")
                    : (block.content || "");
            if (path) writePaths.push(path);
            writeCount += 1;
            continue;
        }
        if (block.type === "ls") {
            flushStages();
            flushReads();
            flushSearches();
            flushWeb();
            flushWrites();
            listCount += 1;
            continue;
        }
        flushAll();
        rows.push({ kind: "block", block });
    }
    flushAll();
    return rows;
}

function GitStatusBadge({ status }: { status: string }) {
    const letter = status.trim().charAt(0).toUpperCase() || "?";
    const label =
        letter === "A"
            ? "Added"
            : letter === "D"
              ? "Deleted"
              : letter === "M"
                ? "Modified"
                : letter === "R"
                  ? "Renamed"
                  : letter === "?" || letter === "U"
                    ? "Untracked"
                    : letter === "C"
                      ? "Copied"
                      : status.trim() || "Changed";
    const color =
        letter === "A"
            ? "text-success"
            : letter === "D"
              ? "text-error"
              : letter === "M" || letter === "R"
                ? "text-warning"
                : "text-text-muted";
    return (
        <span className={cn("ml-auto shrink-0 text-xs font-medium tabular-nums", color)}>
            {label}
        </span>
    );
}

function countDiffLines(body: string): { add: number; del: number } {
    let add = 0;
    let del = 0;
    for (const line of body.split("\n")) {
        if (line.startsWith("+") && !line.startsWith("+++")) add += 1;
        else if (line.startsWith("-") && !line.startsWith("---")) del += 1;
    }
    return { add, del };
}

/** Git summary row — same text style as Visited / Edited, details in a quiet dropdown. */
function GitActionChip({
    label,
    detail,
    add,
    del,
    children,
}: {
    label: string;
    detail?: string;
    add?: number;
    del?: number;
    children?: React.ReactNode;
}) {
    const hasDelta = (add ?? 0) > 0 || (del ?? 0) > 0;
    const trigger = (
        <button
            type="button"
            className={cn(
                "flex items-center gap-1.5 py-0.5 chat-text font-regular text-text-primary/80 hover:text-text-primary transition-colors w-fit max-w-full text-left",
                children ? "cursor-pointer" : "cursor-default",
            )}
        >
            <span>
                {label}
                {detail ? (
                    <>
                        {" "}
                        <span className="text-text-secondary">{detail}</span>
                    </>
                ) : null}
            </span>
            {hasDelta ? (
                <span className="inline-flex items-center gap-1.5 shrink-0 tabular-nums">
                    {(add ?? 0) > 0 ? <span className="text-success">+{add}</span> : null}
                    {(del ?? 0) > 0 ? <span className="text-error">-{del}</span> : null}
                </span>
            ) : null}
            {children ? (
                <Icon icon={RiArrowDownSLine} className="shrink-0 opacity-50" />
            ) : null}
        </button>
    );

    if (!children) {
        return <div className="w-fit max-w-full py-0.5">{trigger}</div>;
    }

    return (
        <div className="w-fit max-w-full py-0.5">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72 max-h-72 overflow-y-auto">
                    {children}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

export function GitStageGroup({ paths }: { paths: string[] }) {
    const unique = [...new Set(paths.filter(Boolean))];

    return (
        <GitActionChip
            label="Staged"
            detail={`${unique.length} file${unique.length === 1 ? "" : "s"}`}
        >
            <div className="flex flex-col py-0.5">
                {unique.map((path) => (
                    <DropdownMenuItem
                        key={path}
                        className="gap-2"
                        onClick={() => {
                            const name = path.split(/[\\/]/).pop() || path;
                            void openProjectFile(path, name);
                        }}
                    >
                        <FileIcon name={path.split(/[\\/]/).pop() || path} className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">
                            {path.split(/[\\/]/).pop() || path}
                        </span>
                        <GitStatusBadge status="A" />
                    </DropdownMenuItem>
                ))}
            </div>
        </GitActionChip>
    );
}

function GitStatusGroup({ lines }: { lines: GitStatusLine[] }) {
    const staged = lines.filter((l) => l.area === "staged");
    const unstaged = lines.filter((l) => l.area === "unstaged");
    const total = lines.length;

    return (
        <GitActionChip
            label="Checked status"
            detail={
                total === 0
                    ? "clean"
                    : `${total} change${total === 1 ? "" : "s"}`
            }
        >
            <div className="flex flex-col gap-2">
                {staged.length > 0 ? (
                    <div className="flex flex-col py-0.5">
                        <span className="px-2 py-1 text-xs text-text-disabled">Staged</span>
                        {staged.map((line) => (
                            <DropdownMenuItem
                                key={`staged-${line.path}`}
                                className="gap-2"
                                onClick={() => {
                                    const name = line.path.split(/[\\/]/).pop() || line.path;
                                    void openProjectFile(line.path, name);
                                }}
                            >
                                <FileIcon
                                    name={line.path.split(/[\\/]/).pop() || line.path}
                                    className="size-4 shrink-0"
                                />
                                <span className="min-w-0 flex-1 truncate">
                                    {line.path.split(/[\\/]/).pop() || line.path}
                                </span>
                                <GitStatusBadge status={line.status} />
                            </DropdownMenuItem>
                        ))}
                    </div>
                ) : null}
                {unstaged.length > 0 ? (
                    <div className="flex flex-col py-0.5">
                        <span className="px-2 py-1 text-xs text-text-disabled">Unstaged</span>
                        {unstaged.map((line) => (
                            <DropdownMenuItem
                                key={`unstaged-${line.path}`}
                                className="gap-2"
                                onClick={() => {
                                    const name = line.path.split(/[\\/]/).pop() || line.path;
                                    void openProjectFile(line.path, name);
                                }}
                            >
                                <FileIcon
                                    name={line.path.split(/[\\/]/).pop() || line.path}
                                    className="size-4 shrink-0"
                                />
                                <span className="min-w-0 flex-1 truncate">
                                    {line.path.split(/[\\/]/).pop() || line.path}
                                </span>
                                <GitStatusBadge status={line.status} />
                            </DropdownMenuItem>
                        ))}
                    </div>
                ) : null}
                {lines.length === 0 ? (
                    <span className="px-2 py-1.5 text-sm text-text-muted">Clean working tree</span>
                ) : null}
            </div>
        </GitActionChip>
    );
}

function GitLogGroup({ lines }: { lines: GitLogLine[] }) {
    return (
        <GitActionChip label="Viewed log" detail={`${lines.length} commit${lines.length === 1 ? "" : "s"}`}>
            <div className="flex flex-col gap-0.5">
                {lines.map((line) => (
                    <div
                        key={`${line.hash}-${line.subject}`}
                        className="flex flex-col gap-0.5 rounded-lg px-2 py-1.5 hover:bg-panel-hover/60"
                    >
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 font-mono text-xs text-text-secondary">{line.hash}</span>
                            {line.author ? (
                                <span className="shrink-0 text-xs text-text-disabled">{line.author}</span>
                            ) : null}
                            {line.date ? (
                                <span className="ml-auto shrink-0 text-xs text-text-disabled">{line.date}</span>
                            ) : null}
                        </div>
                        <span className="text-sm text-text-primary leading-snug">{line.subject}</span>
                    </div>
                ))}
            </div>
        </GitActionChip>
    );
}

function GitBranchesGroup({ lines }: { lines: GitBranchLine[] }) {
    const current = lines.find((l) => l.current);

    return (
        <GitActionChip label="Branches" detail={current?.name}>
            <div className="flex flex-col gap-0.5">
                {lines.map((line) => (
                    <div
                        key={line.name}
                        className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-panel-hover/60"
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
                            <span className="ml-auto shrink-0 text-xs text-text-disabled">current</span>
                        ) : null}
                    </div>
                ))}
            </div>
        </GitActionChip>
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
    const { add, del } = countDiffLines(body);
    const fileName = file?.split(/[\\/]/).pop();
    const label = file
        ? "Diff"
        : scope === "staged"
          ? "Staged diff"
          : "Diff";

    return (
        <GitActionChip label={label} detail={fileName} add={add} del={del}>
            <div className="flex flex-col gap-2 p-1">
                {file ? <FilePill path={file} /> : null}
                {body.trim() ? (
                    <pre className="max-h-56 overflow-auto rounded-lg bg-surface-1/80 px-2.5 py-2 font-mono text-xs leading-relaxed text-text-secondary whitespace-pre-wrap break-all custom-scrollbar">
                        {body}
                    </pre>
                ) : (
                    <span className="px-1 text-sm text-text-muted">No diff output</span>
                )}
            </div>
        </GitActionChip>
    );
}

export function formatReadTarget(file: {
    path: string;
    start?: number;
    end?: number;
}): string {
    const range =
        file.start && file.end
            ? `:${file.start}-${file.end}`
            : file.start
              ? `:${file.start}`
              : "";
    return `${file.path}${range}:raw`;
}

export function estimateReadTokens(files: { path: string; start?: number; end?: number }[]): number {
    return files.reduce((sum, file) => {
        if (file.start && file.end && file.end >= file.start) {
            return sum + Math.max(400, (file.end - file.start + 1) * 40);
        }
        return sum + 2400;
    }, 0);
}

export function formatTokenCount(tokens: number): string {
    if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`;
    return String(tokens);
}

export function ReadGroup({
    files,
    tokens,
}: {
    files: { path: string; start?: number; end?: number }[];
    tokens?: number;
}) {
    const unique = files.filter((f) => f.path);
    const tokenCount = tokens ?? estimateReadTokens(unique);
    return (
        <div className="flex flex-col gap-0.5 py-0.5">
            {unique.map((file, i) => (
                <ActionLine
                    key={`${file.path}-${i}`}
                    action="read"
                    detail={formatReadTarget(file)}
                    title={file.path}
                    onClick={() => void openProjectFile(file.path)}
                />
            ))}
            {unique.length > 0 ? (
                <div className="py-0.5 chat-text text-text-muted">
                    {unique.length} file{unique.length === 1 ? "" : "s"} read
                    {" · "}
                    {formatTokenCount(tokenCount)} tokens
                </div>
            ) : null}
        </div>
    );
}
function computeGroupHeader(visible: Chunk[]) {
    const hasThink = visible.some((b) => b.type === "think" || b.type === "thought");
    const hasExplore = visible.some((b) =>
        ["search", "grep", "cat", "ls", "search_result", "web_search", "web_result", "web_visit"].includes(b.type),
    );
    const hasEdit = visible.some((b) =>
        ["edit", "create_file", "mkdir", "delete_file", "rename_file"].includes(b.type),
    );
    const hasCommand = visible.some((b) => b.type === "terminal_command" || b.type === "run");

    if (hasEdit && hasExplore) return { icon: RiPencilLine, label: "Explored and edited" };
    if (hasEdit) return { icon: RiPencilLine, label: "Edited files" };
    if (hasCommand && !hasExplore) return { icon: RiTerminalBoxLine, label: "Ran commands" };
    if (hasExplore) return { icon: RiSearchLine, label: "Explored codebase" };
    if (hasThink) return { icon: RiSparkling2Line, label: "Thought" };
    return { icon: RiSparkling2Line, label: "Worked" };
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
        case "plugin_call":
            return {
                label: block.pluginLabel || "Plugin",
                query: block.pluginToolkit,
                expandable: false,
                content: block.content,
            };
        case "subagent":
        case "subagent_ref":
            return {
                label: "Spawned",
                query: block.query || "agent",
                expandable: false,
                content: block.content,
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
                icon: status === "running" ? RiRefreshLine : RiGitBranchLine,
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
    if (block.type === "status") return false;
    if (block.type === "tool_result") return true;
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
                if (row.kind === "read_group") {
                    const names = [
                        ...new Set(
                            row.files
                                .map((f) => f.path.split(/[\\/]/).pop() || f.path)
                                .filter(Boolean),
                        ),
                    ];
                    const detail =
                        names.length === 0
                            ? null
                            : names.length === 1
                              ? names[0]
                              : `${names[0]} and more`;
                    return (
                        <ActionLine
                            key={`reads-${i}`}
                            action="Explored"
                            detail={detail}
                        />
                    );
                }
                if (row.kind === "search_group") {
                    return (
                        <ActionLine
                            key={`searches-${i}`}
                            action="Searched"
                            detail={row.count > 1 ? `${row.count} times` : undefined}
                        />
                    );
                }
                if (row.kind === "web_trail") {
                    const queries = row.blocks
                        .map((b) => (b.query || "").trim())
                        .filter(Boolean);
                    const results = row.blocks.flatMap((b) => {
                        if (b.type === "web_visit") {
                            return [{
                                title: b.visitTitle || b.visitHost || "Visited",
                                url: b.visitUrl || "",
                                snippet: b.visitHost ? `Visited ${b.visitHost}` : "",
                            }];
                        }
                        return parseWebSearchHits(b.content || "");
                    });
                    const seen = new Set<string>();
                    const unique = results.filter((hit) => {
                        const key = hit.url || hit.title;
                        if (!key || seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                    return (
                        <WebSearchBlock
                            key={`web-${i}`}
                            query={queries[queries.length - 1]}
                            searches={queries.length}
                            results={unique}
                            isActive={row.blocks.some((b) => b.isGenerating)}
                        />
                    );
                }
                if (row.kind === "write_group") {
                    const names = [...new Set(row.paths.map((p) => p.split(/[\\/]/).pop() || p).filter(Boolean))];
                    const detail =
                        names.length === 0
                            ? null
                            : names.length === 1
                              ? names[0]
                              : `${names[0]} and more`;
                    return (
                        <ActionLine
                            key={`writes-${i}`}
                            action="Edited"
                            detail={detail}
                        />
                    );
                }
                if (row.kind === "list_group") {
                    return (
                        <ActionLine
                            key={`lists-${i}`}
                            action="Listed"
                            detail={row.count > 1 ? `${row.count} folders` : "folders"}
                        />
                    );
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
                <Icon icon={header.icon} className="text-text-muted shrink-0" />
                <span className="chat-text text-text-secondary group-hover:text-text-primary transition-colors">
                    {header.label}
                </span>
                <Icon
                    icon={showRows ? RiArrowUpSLine : RiArrowDownSLine}
                    className="text-text-muted shrink-0"
                />
            </button>

            {showRows && (
                <div className="flex flex-col gap-0.5 mt-0.5 ml-0">
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
                "inline-flex min-w-0 max-w-[200px] items-center truncate chat-text font-medium text-text-secondary",
                "cursor-pointer hover:text-text-primary",
            )}
        >
            {fileName}
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
            <div className="py-0.5 chat-text text-text-muted">
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
            <GitActionChip label="Staged" detail={config.file.split(/[\\/]/).pop()}>
                <div className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5">
                    <FilePill path={config.file} />
                    <GitStatusBadge status="A" />
                </div>
            </GitActionChip>
        );
    }

    if (block.type === "git_operation") {
        const content = (config.content || "").trim();
        const shortLabel =
            config.label.length > 24 ? config.label.slice(0, 22) + "…" : config.label;
        if (content) {
            return (
                <GitActionChip label={shortLabel}>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all px-2 py-1.5 text-sm text-text-secondary custom-scrollbar">
                        {content}
                    </pre>
                </GitActionChip>
            );
        }
        return <GitActionChip label={shortLabel} />;
    }

    if (block.type === "subagent" || block.type === "subagent_ref") {
        return (
            <div className="flex items-center gap-1.5 py-0.5 chat-text font-medium text-text-primary/80">
                {providerIcon(block.command || "auto", 14)}
                <span>
                    Spawned <span className="text-text-secondary">{block.query || "agent"}</span>
                </span>
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
                <span className="chat-text font-medium text-text-primary/80">
                    {isEdit && editResolved ? "Applied" : config.label}
                    {config.query ? (
                        <>
                            {" "}
                            <span className="font-medium text-text-secondary">
                                {typeof config.query === "string" && config.query.length > 60
                                    ? `"${config.query.slice(0, 60)}…"`
                                    : block.type === "web_visit"
                                      ? String(config.query)
                                      : `"${config.query}"`}
                            </span>
                        </>
                    ) : null}
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

                {config.file && <FilePill path={config.file} />}

                {editStats && !editResolved && (
                    <span className="flex items-center gap-1 chat-text ml-0.5">
                        <span className="text-success">+{editStats.add}</span>
                        <span className="text-error">-{editStats.del}</span>
                    </span>
                )}

                {config.expandable && (
                    <Icon
                        icon={RiArrowRightSLine}
                        className={cn(
                            "text-text-disabled transition-transform duration-200 shrink-0",
                            expanded && "rotate-90",
                        )}
                    />
                )}
            </button>

            {expanded && config.expandable && config.content && (
                <div className={cn(
                    "chat-text mt-1 mb-1",
                    isThink
                        ? "text-text-muted leading-relaxed"
                        : useMarkdown
                            ? "font-sans"
                            : "overflow-x-auto whitespace-pre-wrap p-2 rounded-md border border-border-subtle bg-panel text-text-secondary chat-text font-mono",
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
