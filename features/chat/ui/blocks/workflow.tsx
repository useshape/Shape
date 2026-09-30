"use client";

import { Branch20Regular } from "@fluentui/react-icons/headless/svg/branch";
import { ChevronRight20Regular } from "@fluentui/react-icons/headless/svg/chevron-right";
import { Edit20Regular } from "@fluentui/react-icons/headless/svg/edit";
import { Globe20Filled } from "@fluentui/react-icons/headless/svg/globe";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";
import { Sparkle20Filled } from "@fluentui/react-icons/headless/svg/sparkle";
import { WindowConsole20Regular } from "@fluentui/react-icons/headless/svg/window-console";



import React, { useState } from "react";
import { type IconGlyph, Icon } from "@/components/ui/icon";


import { FileIcon } from "@/components/ui/file-icon";
import { cn } from "@/lib/utils";
import { commands, getProjectPath } from "@/lib/backend";
import { countChangedLines } from "@/lib/ui/diff-count";
import { ChatPatchDiff } from "./chat-diff";
import { ActionLine, splitActionLabel } from "./action-line";
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
import { resolveProjectFilePath } from "@/lib/path/utils";
import { TerminalCommandStep } from "./terminal-live";
import { parseWebSearchHits, WebSearchBlock } from "./search";
import { providerIcon } from "@/lib/ui/provider-icon";

export const WORKFLOW_CHUNK_TYPES = new Set<Chunk["type"]>([
    "search", "grep", "status", "web_search", "web_result", "web_visit", "search_result",
    "inspect_runtime",
    "ls", "cat", "create_file", "mkdir", "delete_file", "rename_file", "rename_chat",
    "think", "thought", "run", "tool_result", "edit", "edit_pending", "terminal_command", "git_operation",
    "plugin_call",
    "subagent",
    "subagent_ref",
    "browse_session",
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
    | { kind: "list_group"; count: number }
    | { kind: "subagent_group"; blocks: Chunk[] };

function sameFilePath(a?: string, b?: string): boolean {
    if (!a || !b) return false;
    return a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();
}

function isCoalescableFileEdit(block: Chunk): boolean {
    if (!block.file) return false;
    if (block.type === "edit") return true;
    return block.type === "edit_pending" && block.commandStatus === "applied";
}

function mutationPath(block: Chunk): string | undefined {
    if (isCoalescableFileEdit(block)) return block.file;
    if (
        block.type === "create_file"
        || block.type === "mkdir"
        || block.type === "delete_file"
        || block.type === "rename_file"
    ) {
        return block.file || block.content;
    }
    return undefined;
}

/** Consecutive edits to the same file become one row; later patch updates original→latest (the +/-). */
function isThinkChunk(block: Chunk): boolean {
    return block.type === "think" || block.type === "thought";
}

function taskText(value?: string): string {
    return (value || "").replace(/\s+/g, " ").trim();
}

/** Same kind of step, back to back. A different step in between keeps both. */
function sameRepeatedTask(a: Chunk, b: Chunk): boolean {
    if (isThinkChunk(a) && isThinkChunk(b)) return true;
    if (a.type !== b.type) return false;
    switch (a.type) {
        case "grep":
        case "search":
        case "search_result":
            return taskText(a.query || a.content) === taskText(b.query || b.content);
        case "run":
        case "terminal_command":
            return taskText(a.command) !== "" && taskText(a.command) === taskText(b.command);
        case "tool_result":
            return taskText(a.content) !== "" && taskText(a.content).slice(0, 80) === taskText(b.content).slice(0, 80);
        case "ls":
        case "status":
            return taskText(a.content) === taskText(b.content);
        default:
            return false;
    }
}

function mergeRepeatedTask(a: Chunk, b: Chunk): Chunk {
    if (isThinkChunk(a) || isThinkChunk(b)) {
        const parts = [a.content, b.content].map((part) => (part || "").trim()).filter(Boolean);
        return {
            ...a,
            type: "thought",
            content: parts.join("\n\n"),
            isGenerating: Boolean(a.isGenerating || b.isGenerating),
        };
    }
    return { ...b, isGenerating: Boolean(a.isGenerating || b.isGenerating) };
}

/** think, think, think becomes one thought. think, edit, think stays three steps. */
export function coalesceConsecutiveSameTasks(blocks: Chunk[]): Chunk[] {
    const out: Chunk[] = [];
    for (const block of blocks) {
        const prev = out[out.length - 1];
        if (prev && sameRepeatedTask(prev, block)) {
            out[out.length - 1] = mergeRepeatedTask(prev, block);
            continue;
        }
        out.push(block);
    }
    return out;
}

export function coalesceConsecutiveSameFileEdits(blocks: Chunk[]): Chunk[] {
    const out: Chunk[] = [];
    for (const block of blocks) {
        const prev = out[out.length - 1];
        const prevPath = prev ? mutationPath(prev) : undefined;
        const nextPath = mutationPath(block);
        if (prev && prevPath && nextPath && sameFilePath(prevPath, nextPath)) {
            if (isCoalescableFileEdit(prev) && isCoalescableFileEdit(block)) {
                out[out.length - 1] = {
                    ...prev,
                    type: "edit",
                    replacement: block.replacement,
                    isGenerating: block.isGenerating,
                    commandStatus: block.commandStatus,
                };
            } else {
                out[out.length - 1] = block;
            }
            continue;
        }
        out.push(block);
    }
    return out;
}

export function groupWorkflowRows(blocks: Chunk[]): WorkflowRow[] {
    const rows: WorkflowRow[] = [];
    let stagePaths: string[] = [];
    let readFiles: { path: string; start?: number; end?: number }[] = [];
    let searchQueries: string[] = [];
    let webBlocks: Chunk[] = [];
    let writePaths: string[] = [];
    let writeCount = 0;
    let listCount = 0;
    let subagents: Chunk[] = [];

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
    const flushSubs = () => {
        if (subagents.length === 0) return;
        if (subagents.length === 1) rows.push({ kind: "block", block: subagents[0] });
        else rows.push({ kind: "subagent_group", blocks: [...subagents] });
        subagents = [];
    };
    const flushAll = () => {
        flushStages();
        flushReads();
        flushSearches();
        flushWeb();
        flushWrites();
        flushLists();
        flushSubs();
    };

    for (const block of coalesceConsecutiveSameTasks(coalesceConsecutiveSameFileEdits(blocks))) {
        if (block.type === "subagent" || block.type === "subagent_ref") {
            flushStages();
            flushReads();
            flushSearches();
            flushWeb();
            flushWrites();
            flushLists();
            subagents.push(block);
            continue;
        }
        flushSubs();
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

        if (isCoalescableFileEdit(block)) {
            flushAll();
            rows.push({ kind: "block", block });
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
        <span className={cn("ml-auto shrink-0 text-xs", color)}>{label}</span>
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
    const sentence = detail ? `${label} ${detail}` : label;
    const parts = splitActionLabel(sentence);
    const trigger = (
        <button
            type="button"
            className={cn(
                "group/line flex w-fit max-w-full items-center gap-1.5 py-0.5 text-left chat-text font-normal text-text-muted",
                children ? "cursor-pointer" : "cursor-default",
            )}
        >
            <span className="min-w-0 truncate">
                <span className="text-text-secondary group-hover/line:text-text-primary">{parts.action}</span>
                {parts.detail ? <span className="text-text-muted"> {parts.detail}</span> : null}
            </span>
            {hasDelta ? (
                <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                    {(add ?? 0) > 0 ? <span className="text-success">+{add}</span> : null}
                    {(del ?? 0) > 0 ? <span className="text-error">-{del}</span> : null}
                </span>
            ) : null}
            {children ? (
                <Icon
                    icon={ChevronRight20Regular}
                    className="shrink-0 text-text-muted opacity-50 transition-transform duration-[var(--transition-fast)] ease-[var(--ease-out)] group-data-[state=open]/line:rotate-90"
                />
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
                <DropdownMenuContent align="start" className="w-80 max-h-96 overflow-y-auto">
                    {children}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

export function GeneratedMediaStep({ block }: { block: Chunk }) {
    const src = (block.content || "").trim();
    const labelNoun =
        block.type === "generated_svg" ? "SVG" : block.type === "generated_audio" ? "audio" : "image";
    if (!src && !block.isGenerating) return null;
    if (block.isGenerating && !src) {
        return <GitActionChip label={`Generating ${labelNoun}`} />;
    }
    return (
        <GitActionChip label={`Generated ${labelNoun}`}>
            <div className="flex flex-col gap-2 p-2">
                {block.type === "generated_audio" ? (
                    <div className="relative overflow-hidden rounded-lg bg-linear-to-br from-accent/20 via-surface-2 to-surface-3 p-2">
                        <div className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full bg-accent/25 blur-2xl" aria-hidden />
                        <audio controls src={src} className="relative z-10 w-full" preload="metadata" />
                    </div>
                ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={src}
                        alt={labelNoun}
                        className={cn(
                            "w-full rounded-lg bg-surface-2",
                            block.type === "generated_svg" ? "max-h-72 object-contain p-2" : "max-h-56 object-cover",
                        )}
                    />
                )}
            </div>
        </GitActionChip>
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
                <ChatPatchDiff body={body} />
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
    return `${file.path}${range}`;
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
                    action="Read"
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
function computeGroupHeader(visible: Chunk[]): { icon: IconGlyph; label: string } {
    const hasThink = visible.some((b) => b.type === "think" || b.type === "thought");
    const hasExplore = visible.some((b) =>
        ["search", "grep", "cat", "ls", "search_result", "web_search", "web_result", "web_visit", "inspect_runtime"].includes(b.type),
    );
    const hasEdit = visible.some((b) =>
        ["edit", "create_file", "mkdir", "delete_file", "rename_file"].includes(b.type),
    );
    const hasCommand = visible.some((b) => b.type === "terminal_command" || b.type === "run");

    if (hasEdit && hasExplore) return { icon: Edit20Regular, label: "Explored and edited" };
    if (hasEdit) return { icon: Edit20Regular, label: "Edited files" };
    if (hasCommand && !hasExplore) return { icon: WindowConsole20Regular, label: "Ran commands" };
    if (hasExplore) return { icon: Search20Regular, label: "Explored codebase" };
    if (hasThink) return { icon: Sparkle20Filled, label: "Thought" };
    return { icon: Sparkle20Filled, label: "Worked" };
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
        case "browse_session":
            return {
                label: inFlight ? "Opening" : "Opened",
                query: block.visitTitle || block.visitUrl || "page",
                expandable: false,
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
        case "inspect_runtime": {
            const url = (block.query || "").trim();
            let detail = url;
            try {
                if (url) {
                    const parsed = new URL(url);
                    detail = `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
                }
            } catch {
                /* keep raw url */
            }
            const kind = (block.inspectKind || "").trim();
            return {
                label: inFlight ? "Inspecting" : "Inspected",
                query: detail || kind || "runtime",
                expandable: !!block.content?.trim(),
                content: block.content,
                chromiumIcon: true,
            };
        }
        case "plugin_call":
            return {
                label: block.pluginLabel || "Plugin",
                query: block.pluginToolkit,
                expandable: false,
                content: block.content,
            };
        case "generated_svg":
        case "generated_image":
        case "generated_audio":
            return {
                label: block.isGenerating
                    ? `Generating ${block.type === "generated_svg" ? "SVG" : block.type === "generated_audio" ? "audio" : "image"}`
                    : `Generated ${block.type === "generated_svg" ? "SVG" : block.type === "generated_audio" ? "audio" : "image"}`,
                expandable: true,
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
                icon: status === "running" ? "refresh" : "git-branch",
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
    if (block.type === "browse_session") return true;
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
                if (row.kind === "subagent_group") {
                    return (
                        <div key={`subs-${i}`} className="flex flex-col">
                            <ActionLine action="Spawning" detail="subagents" />
                            {row.blocks.map((block, index) => (
                                <ActionItem key={block.file || index} block={block} isFileEditResolved={isFileEditResolved} />
                            ))}
                        </div>
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

    const header = splitActionLabel(computeGroupHeader(visibleBlocks).label);

    return (
        <div className="my-1 flex w-full select-none flex-col">
            <ActionLine
                action={header.action}
                detail={header.detail}
                open={isOpen}
                onOpenChange={setIsOpen}
            >
                {rows}
            </ActionLine>
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
    const config = getWorkflowActionConfig(block);

    const isThink = block.type === "think" || block.type === "thought";
    const isEdit = block.type === "edit";

    const editStats = React.useMemo(() => {
        if (!isEdit || block.isGenerating) return null;
        return countChangedLines(block.original || "", block.replacement || "");
    }, [isEdit, block.original, block.replacement, block.isGenerating]);

    if (!config) return null;

    if (block.type === "terminal_command") {
        return <TerminalCommandStep block={block} />;
    }

    if (block.type === "edit_pending" && (block.commandStatus || "pending") === "pending") {
        // Edit approval cards live in TurnWorkflowSummary; keep a compact
        // fallback if this legacy AgentWorkflow path still renders one.
        return (
            <ActionLine
                action="Pending"
                detail={(block.file || "").split(/[\\/]/).pop() || "file"}
            />
        );
    }

    if (block.type === "generated_svg" || block.type === "generated_image" || block.type === "generated_audio") {
        return <GeneratedMediaStep block={block} />;
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
        const running = block.gitStatus === "running";
        const failed = block.gitStatus === "error";
        const content = (config.content || "").trim();
        const fileLabel = config.file?.split(/[\\/]/).pop();
        return (
            <div className="flex w-fit max-w-full items-center gap-2 py-0.5 text-sm">
                <Icon
                    icon={Branch20Regular}
                    className={cn("icon-sm shrink-0", running && "animate-spin", failed ? "text-error" : "text-text-muted")}
                />
                <span className={cn("text-text-secondary", failed && "text-error")}>{config.label}</span>
                {fileLabel ? (
                    <span className="inline-flex min-w-0 items-center gap-1 text-text-muted">
                        <FileIcon name={fileLabel} className="size-4" />
                        <span className="truncate">{fileLabel}</span>
                    </span>
                ) : null}
                {content && content.length < 180 && !fileLabel ? (
                    <span className="truncate text-text-muted">{content}</span>
                ) : null}
            </div>
        );
    }

    if (block.type === "subagent" || block.type === "subagent_ref") {
        const name = block.query || "agent";
        const id = block.file || name;
        return (
            <ActionLine
                action="Spawned"
                detail={name}
                icon={providerIcon(block.command || "auto", 14)}
                onClick={() => {
                    void import("@/features/agent/subagents/store").then(({ openSubagent, upsertSubagent }) => {
                        upsertSubagent({
                            id,
                            title: name,
                            agent: name,
                            model: block.command,
                            activity: "Working…",
                            task: block.type === "subagent_ref" ? block.content : undefined,
                            transcript: block.type === "subagent" ? block.content : undefined,
                            status: (block.commandStatus as "running" | "done" | "error" | "pending") || "running",
                        });
                        openSubagent(id);
                    });
                }}
            />
        );
    }

        const useMarkdown =
        isThink
        || block.type === "search_result"
        || block.type === "web_result"
        || block.type === "inspect_runtime"
        || (block.type === "search" && !!config.content && looksLikeProseMarkdown(config.content));

    const editResolved = isEdit && block.file
        ? (isFileEditResolved?.(block.file, block.replacement) ?? false)
        : false;

    const lead = splitActionLabel(isEdit && editResolved ? "Applied" : config.label);
    const queryText = config.query
        ? String(config.query).length > 60
            ? `${String(config.query).slice(0, 60)}…`
            : String(config.query)
        : "";
    const fileLabel = config.file?.split(/[\\/]/).pop() || "";
    const detail = [lead.detail, queryText, fileLabel].filter(Boolean).join(" ");
    const favicons = [
        ...("faviconUrl" in config && config.faviconUrl ? [String(config.faviconUrl)] : []),
        ...("resultUrls" in config && Array.isArray(config.resultUrls) ? config.resultUrls : []),
    ];

    return (
        <ActionLine
            action={lead.action}
            detail={detail || undefined}
            add={!editResolved ? editStats?.add ?? 0 : 0}
            del={!editResolved ? editStats?.del ?? 0 : 0}
            favicons={favicons}
            icon={
                "chromiumIcon" in config && config.chromiumIcon ? (
                    <Icon icon={Globe20Filled} className="text-text-muted" />
                ) : undefined
            }
            onClick={
                !config.expandable && (isEdit || config.onClick)
                    ? () => {
                          if (isEdit && block.file) {
                              openFileEdit(block.file, block.original || "", block.replacement || "", editResolved);
                              return;
                          }
                          config.onClick?.();
                      }
                    : undefined
            }
        >
            {config.expandable && config.content ? (
                <div
                    className={cn(
                        "mb-1 mt-1 chat-text",
                        isThink
                            ? "leading-relaxed text-text-muted"
                            : useMarkdown
                              ? "font-sans"
                              : "overflow-x-auto whitespace-pre-wrap rounded-md border border-border-subtle bg-panel p-2 font-mono chat-text text-text-secondary",
                    )}
                >
                    {useMarkdown ? <ChatMarkdown content={config.content || ""} /> : config.content}
                </div>
            ) : null}
        </ActionLine>
    );
}
