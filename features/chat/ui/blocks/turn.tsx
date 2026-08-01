"use client";

import React, { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { diffLines } from "diff";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getShapeSyntaxTheme } from "@/lib/ui/syntax-theme";
import type { Chunk } from "../md/renderer";
import {
    groupWorkflowRows,
    isRenderableWorkflowBlock,
    parseGitStagePath,
    TerminalApprovalRow,
} from "./workflow";

function formatDuration(ms?: number): string {
    if (!ms || ms < 1000) return "< 1s";
    const totalSec = Math.round(ms / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

function estimateThoughtSeconds(content: string): number {
    const words = content.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 12));
}

function fileName(path: string): string {
    return path.split(/[\\/]/).pop() || path;
}

function lineRangeLabel(start?: number, end?: number): string | null {
    if (!start || !end) return null;
    return start === end ? `L${start}` : `L${start}-${end}`;
}

function editDelta(block: Chunk): { add: number; del: number } {
    const changes = diffLines(block.original || "", block.replacement || "");
    let add = 0;
    let del = 0;
    changes.forEach((c) => {
        if (c.added) add += Math.max(0, c.value.split("\n").length - 1);
        if (c.removed) del += Math.max(0, c.value.split("\n").length - 1);
    });
    return { add, del };
}

function isLintCommand(cmd: string): boolean {
    const lower = cmd.toLowerCase();
    return (
        lower.includes("eslint")
        || lower.includes("read_lints")
        || lower.includes("npm run lint")
        || lower.includes("cargo clippy")
        || lower.includes("tsc --noemit")
        || lower.includes("tsc -p")
    );
}

function lintStatusFromOutput(output: string): "clean" | "errors" | null {
    const trimmed = output.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (
        lower.includes("no linter errors")
        || lower.includes("0 errors")
        || lower.includes("✓ no problems")
        || /no problems found/i.test(trimmed)
    ) {
        return "clean";
    }
    if (lower.includes("error") || lower.includes("✖")) return "errors";
    return null;
}

function computeTurnStats(blocks: Chunk[]) {
    const readFiles = new Set<string>();
    let searches = 0;
    const editedFiles = new Set<string>();
    let commands = 0;
    let linesAdded = 0;
    let linesRemoved = 0;
    const stagedPaths: string[] = [];
    let lintChecks = 0;
    let lintClean = false;

    for (const block of blocks) {
        switch (block.type) {
            case "cat":
                if (block.content) readFiles.add(block.content);
                break;
            case "search":
            case "grep":
            case "search_result":
            case "web_search":
            case "web_result":
                searches += 1;
                break;
            case "edit":
                if (block.file) {
                    editedFiles.add(block.file);
                    const { add, del } = editDelta(block);
                    linesAdded += add;
                    linesRemoved += del;
                }
                break;
            case "create_file":
            case "mkdir":
            case "delete_file":
            case "rename_file":
                if (block.content) editedFiles.add(block.content);
                break;
            case "terminal_command":
            case "run": {
                commands += 1;
                const cmd = (block.command || block.content || "").trim();
                if (isLintCommand(cmd)) {
                    lintChecks += 1;
                    const status = lintStatusFromOutput(block.content || "");
                    if (status === "clean") lintClean = true;
                }
                break;
            }
            case "git_operation":
                if (block.gitOp === "stage") {
                    const path = parseGitStagePath(block.content);
                    if (path) stagedPaths.push(path);
                }
                break;
            default:
                break;
        }
    }

    return {
        reads: readFiles.size,
        searches,
        editFileCount: editedFiles.size,
        commands,
        linesAdded,
        linesRemoved,
        stagedCount: [...new Set(stagedPaths)].length,
        lintChecks,
        lintClean,
    };
}

function buildSummaryLabel(stats: ReturnType<typeof computeTurnStats>): string | null {
    const parts: string[] = [];
    if (stats.editFileCount > 0) {
        parts.push(`${stats.editFileCount} edit${stats.editFileCount === 1 ? "" : "s"}`);
    }
    if (stats.reads > 0) {
        parts.push(`${stats.reads} explored`);
    }
    if (stats.searches > 0) {
        parts.push(`${stats.searches} search${stats.searches === 1 ? "" : "es"}`);
    }
    if (stats.commands > 0) {
        parts.push(`${stats.commands} cmd${stats.commands === 1 ? "" : "s"}`);
    }
    if (stats.stagedCount > 0) {
        parts.push(`${stats.stagedCount} staged`);
    }
    if (stats.lintChecks > 0) {
        parts.push("lints");
    }
    return parts.length > 0 ? parts.join(" · ") : null;
}

function LineDelta({ add, del }: { add: number; del: number }) {
    if (add === 0 && del === 0) return null;
    return (
        <span className="inline-flex items-center gap-1 font-mono text-[11px] shrink-0 tabular-nums">
            {add > 0 ? <span className="text-success">+{add}</span> : null}
            {del > 0 ? <span className="text-error">-{del}</span> : null}
        </span>
    );
}

function thoughtHeading(content: string, isActive?: boolean): string {
    const trimmed = content.trim();
    if (!trimmed) return isActive ? "Thinking" : "Thought briefly";
    if (trimmed.length < 80 || trimmed.split(/\s+/).length < 15) {
        return isActive ? "Thinking" : "Thought briefly";
    }
    const secs = estimateThoughtSeconds(trimmed);
    return isActive ? "Thinking" : `Thought for ${secs}s`;
}

function ThoughtStep({
    content,
    isActive,
    showBody,
}: {
    content: string;
    isActive?: boolean;
    showBody?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const trimmed = content.trim();
    if (!trimmed) return null;

    const heading = thoughtHeading(trimmed, isActive);
    const expandable = trimmed.length >= 80;

    return (
        <div className="py-0.5">
            <button
                type="button"
                onClick={() => expandable && setOpen((v) => !v)}
                className={cn(
                    "flex items-center gap-1 text-xs transition-colors",
                    expandable ? "text-text-secondary hover:text-text-primary cursor-pointer" : "text-text-secondary cursor-default",
                )}
            >
                <span>{heading}</span>
                {expandable ? (
                    <Icon
                        name="chevron_right"
                        size={12}
                        className={cn("opacity-50 transition-transform", open && "rotate-90")}
                    />
                ) : null}
            </button>
            {(open || showBody) && expandable ? (
                <div className="mt-1 text-xs leading-relaxed text-text-muted max-w-full whitespace-pre-wrap">
                    {trimmed}
                </div>
            ) : null}
        </div>
    );
}

function getLanguage(path: string) {
    const ext = path.split(".").pop()?.toLowerCase();
    switch (ext) {
        case "tsx":
        case "ts":
            return "typescript";
        case "js":
        case "jsx":
            return "javascript";
        case "rs":
            return "rust";
        case "json":
            return "json";
        case "css":
            return "css";
        case "md":
            return "markdown";
        default:
            return "plaintext";
    }
}

function WorkflowEditPreview({
    file,
    original,
    replacement,
}: {
    file: string;
    original: string;
    replacement: string;
}) {
    const language = getLanguage(file);
    const rows = React.useMemo(() => {
        const changes = diffLines(original, replacement);
        const out: { type: "add" | "remove"; line: string; num: number }[] = [];
        let oldNum = 1;
        let newNum = 1;
        for (const part of changes) {
            const lines = part.value.split("\n");
            if (lines[lines.length - 1] === "") lines.pop();
            for (const line of lines) {
                if (part.added) {
                    out.push({ type: "add", line, num: newNum });
                    newNum += 1;
                } else if (part.removed) {
                    out.push({ type: "remove", line, num: oldNum });
                    oldNum += 1;
                } else {
                    oldNum += 1;
                    newNum += 1;
                }
            }
        }
        return out.filter((r) => r.type === "add" || r.type === "remove").slice(0, 24);
    }, [original, replacement]);

    if (rows.length === 0) return null;

    return (
        <div className="my-1.5 rounded-md border border-border-subtle overflow-hidden bg-panel/40 max-w-full">
            <div className="max-h-[220px] overflow-y-auto custom-scrollbar text-[11px] font-mono">
                {rows.map((row, i) => (
                    <div
                        key={`${row.type}-${i}`}
                        className={cn(
                            "flex items-start gap-2 px-2 py-px",
                            row.type === "add" ? "bg-success/10" : "bg-error/10",
                        )}
                    >
                        <span className="w-8 shrink-0 text-right text-text-disabled select-none tabular-nums">
                            {row.num}
                        </span>
                        <SyntaxHighlighter
                            style={getShapeSyntaxTheme() as { [key: string]: React.CSSProperties }}
                            language={language}
                            PreTag="span"
                            CodeTag="span"
                            customStyle={{
                                margin: 0,
                                padding: 0,
                                background: "transparent",
                                display: "block",
                                flex: 1,
                                minWidth: 0,
                            }}
                        >
                            {row.line || " "}
                        </SyntaxHighlighter>
                    </div>
                ))}
            </div>
        </div>
    );
}

function StepRow({ block }: { block: Chunk }) {
    const [diffOpen, setDiffOpen] = useState(false);

    if (block.type === "think" || block.type === "thought") {
        return <ThoughtStep content={block.content || ""} isActive={block.isGenerating} />;
    }

    if (block.type === "cat") {
        const path = block.content || "";
        const range = lineRangeLabel(block.catStartLine, block.catEndLine);
        return (
            <div className="py-0.5 text-xs text-text-disabled">
                Read {fileName(path)}
                {range ? <span className="text-text-muted"> {range}</span> : null}
            </div>
        );
    }

    if (block.type === "grep") {
        const q = (block.query || block.content || "").trim();
        return (
            <div className="py-0.5 text-xs text-text-disabled truncate">
                Grepped <span className="text-text-muted">{q}</span>
            </div>
        );
    }

    if (block.type === "search" || block.type === "search_result" || block.type === "web_search") {
        const q = (block.query || block.content || "").trim();
        return (
            <div className="py-0.5 text-xs text-text-disabled truncate">
                Searched <span className="text-text-muted">{q}</span>
            </div>
        );
    }

    if (block.type === "edit" && block.file) {
        const { add, del } = editDelta(block);
        const hasDiff = add > 0 || del > 0;
        return (
            <div className="py-0.5">
                <button
                    type="button"
                    onClick={() => hasDiff && setDiffOpen((v) => !v)}
                    className={cn(
                        "flex items-center gap-1.5 text-xs text-text-disabled w-fit max-w-full text-left",
                        hasDiff && "hover:text-text-secondary transition-colors",
                    )}
                >
                    <span>
                        Edited {fileName(block.file)}
                    </span>
                    <LineDelta add={add} del={del} />
                    {hasDiff ? (
                        <Icon
                            name="chevron_right"
                            size={12}
                            className={cn("opacity-50 transition-transform shrink-0", diffOpen && "rotate-90")}
                        />
                    ) : null}
                </button>
                {diffOpen && hasDiff ? (
                    <WorkflowEditPreview
                        file={block.file}
                        original={block.original || ""}
                        replacement={block.replacement || ""}
                    />
                ) : null}
            </div>
        );
    }

    if (block.type === "terminal_command" || block.type === "run") {
        if (block.type === "terminal_command" && block.commandStatus === "pending") {
            return <TerminalApprovalRow block={block} />;
        }
        const cmd = (block.command || block.content || "").trim();
        if (isLintCommand(cmd)) {
            const status = lintStatusFromOutput(block.content || "");
            if (status === "clean") {
                return <div className="py-0.5 text-xs text-text-disabled">No linter errors</div>;
            }
            if (status === "errors") {
                return <div className="py-0.5 text-xs text-text-disabled">Linter errors found</div>;
            }
        }
        return (
            <div className="py-0.5 text-xs text-text-disabled truncate">
                Ran <span className="font-mono text-[11px] text-text-muted">{cmd}</span>
            </div>
        );
    }

    if (block.type === "create_file" || block.type === "mkdir" || block.type === "delete_file" || block.type === "rename_file") {
        const label =
            block.type === "create_file"
                ? "Created"
                : block.type === "mkdir"
                  ? "Created directory"
                  : block.type === "delete_file"
                    ? "Deleted"
                    : "Renamed";
        return (
            <div className="py-0.5 text-xs text-text-disabled">
                {label} {block.content ? fileName(block.content) : ""}
            </div>
        );
    }

    if (block.type === "git_operation" && block.gitOp === "status") {
        return <div className="py-0.5 text-xs text-text-disabled">Git status</div>;
    }

    return null;
}

function GitStageStep({ count }: { count: number }) {
    if (count === 0) return null;
    return <div className="py-0.5 text-xs text-text-disabled">Staged {count} files</div>;
}

export function TurnWorkflowSummary({
    blocks,
    isActive,
    durationMs,
    children,
}: {
    blocks: Chunk[];
    isActive?: boolean;
    durationMs?: number;
    children?: React.ReactNode;
}) {
    const visible = blocks.filter((b) => isRenderableWorkflowBlock(b, isActive));
    const hasPendingApproval = visible.some(
        (b) => b.type === "terminal_command" && b.commandStatus === "pending",
    );
    const [open, setOpen] = useState(!!isActive || hasPendingApproval);
    const [stepsOpen, setStepsOpen] = useState(hasPendingApproval);
    const [prevActive, setPrevActive] = useState(isActive);
    const [prevPending, setPrevPending] = useState(hasPendingApproval);

    if (isActive !== prevActive) {
        setPrevActive(isActive);
        if (!isActive && !hasPendingApproval) {
            setOpen(false);
            setStepsOpen(false);
        } else if (isActive) {
            setOpen(true);
        }
    }

    // Auto-expand once when a new approval appears - user can still collapse after.
    if (hasPendingApproval !== prevPending) {
        setPrevPending(hasPendingApproval);
        if (hasPendingApproval) {
            setOpen(true);
            setStepsOpen(true);
        }
    }

    if (visible.length === 0) return <>{children}</>;

    const stats = computeTurnStats(visible);
    const summaryLabel = buildSummaryLabel(stats);
    const rows = groupWorkflowRows(visible);
    const thoughtBlocks = visible.filter((b) => b.type === "think" || b.type === "thought");
    const leadThought = thoughtBlocks[0];
    const hasLintDelta = stats.linesAdded > 0 || stats.linesRemoved > 0;
    const showLintFooter = stats.lintClean && stats.lintChecks > 0;
    const lintShownInSteps = visible.some((b) => {
        if (b.type !== "terminal_command" && b.type !== "run") return false;
        const cmd = (b.command || b.content || "").trim();
        return isLintCommand(cmd) && lintStatusFromOutput(b.content || "") === "clean";
    });

    return (
        <div className="mb-2 select-none">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-fit max-w-full items-center gap-1 py-0.5 text-xs text-text-disabled hover:text-text-secondary transition-colors"
            >
                <span>{isActive ? "Working…" : `Worked for ${formatDuration(durationMs)}`}</span>
                <Icon
                    name={open ? "expand_more" : "chevron_right"}
                    size={14}
                    className="shrink-0 opacity-60"
                />
            </button>

            {!open ? children : null}

            {open ? (
                <div className="mt-0.5 flex flex-col gap-0.5">
                    {leadThought?.content?.trim() ? (
                        <ThoughtStep content={leadThought.content} isActive={leadThought.isGenerating} />
                    ) : null}

                    {summaryLabel ? (
                        <button
                            type="button"
                            title={summaryLabel}
                            onClick={() => setStepsOpen((v) => !v)}
                            className="flex max-w-full min-w-0 items-center gap-1.5 py-0.5 text-left text-xs text-text-disabled hover:text-text-secondary transition-colors"
                        >
                            <span className="min-w-0 truncate">{summaryLabel}</span>
                            {hasLintDelta ? (
                                <LineDelta add={stats.linesAdded} del={stats.linesRemoved} />
                            ) : null}
                            <Icon
                                name={stepsOpen ? "expand_more" : "chevron_right"}
                                size={12}
                                className="shrink-0 opacity-50"
                            />
                        </button>
                    ) : null}

                    {stepsOpen ? (
                        <div className="flex flex-col gap-0.5 pl-3">
                            {(() => {
                                let skippedLeadThought = false;
                                return rows.map((row, i) => {
                                    if (row.kind === "git_stage_group") {
                                        return <GitStageStep key={`stage-${i}`} count={row.paths.length} />;
                                    }
                                    if (row.kind === "block") {
                                        const isThought =
                                            row.block.type === "think" || row.block.type === "thought";
                                        if (
                                            isThought
                                            && !skippedLeadThought
                                            && leadThought
                                            && row.block.content === leadThought.content
                                        ) {
                                            skippedLeadThought = true;
                                            return null;
                                        }
                                        return <StepRow key={i} block={row.block} />;
                                    }
                                    return null;
                                });
                            })()}
                            {showLintFooter && !lintShownInSteps ? (
                                <div className="py-0.5 text-xs text-text-disabled">No linter errors</div>
                            ) : null}
                        </div>
                    ) : hasPendingApproval ? (
                        // Steps collapsed but approval still needed - keep the bar reachable.
                        <div className="flex flex-col gap-1 pl-3 my-1">
                            {visible
                                .filter((b) => b.type === "terminal_command" && b.commandStatus === "pending")
                                .map((b, i) => (
                                    <TerminalApprovalRow key={b.commandId || `pending-${i}`} block={b} />
                                ))}
                        </div>
                    ) : null}

                    {children}
                </div>
            ) : hasPendingApproval ? (
                <div className="flex flex-col gap-1 my-1">
                    {visible
                        .filter((b) => b.type === "terminal_command" && b.commandStatus === "pending")
                        .map((b, i) => (
                            <TerminalApprovalRow key={b.commandId || `pending-${i}`} block={b} />
                        ))}
                    {children}
                </div>
            ) : null}
        </div>
    );
}
