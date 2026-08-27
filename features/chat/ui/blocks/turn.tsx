"use client";

import React, { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { diffLines } from "diff";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getShapeSyntaxTheme } from "@/lib/ui/syntax-theme";
import type { Chunk } from "../md/renderer";
import { openProjectFile } from "@/lib/open-project-file";
import { commands } from "@/lib/backend/commands";
import { Collapse } from "./collapse";
import { ActionPhrase, ChatCard, ChatCardBody, ChatCardFooter, ChatCardHeader } from "./chat-card";
import { TerminalCommandStep } from "./terminal-live";
import { McpAuthCard, McpCallCard } from "./mcp-card";
import {
    ActionItem,
    GitStageGroup,
    groupWorkflowRows,
    visibleWorkflowBlocks,
    parseGitStagePath,
} from "./workflow";
import { LoadingState } from "./loading-state";
import { WebSearchCard, WebVisitCard } from "./web-cards";

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
            case "web_visit":
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
            case "edit_pending":
                if (block.file && block.commandStatus === "applied") {
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
        parts.push(`Edited ${stats.editFileCount} file${stats.editFileCount === 1 ? "" : "s"}`);
    }
    if (stats.reads > 0 || stats.searches > 0) {
        const bits: string[] = [];
        if (stats.reads > 0) bits.push(`${stats.reads} file${stats.reads === 1 ? "" : "s"}`);
        if (stats.searches > 0) bits.push(`${stats.searches} search${stats.searches === 1 ? "" : "es"}`);
        parts.push(`Explored ${bits.join(", ")}`);
    }
    if (stats.commands > 0) {
        parts.push(`${stats.commands} command${stats.commands === 1 ? "" : "s"}`);
    }
    if (stats.stagedCount > 0) {
        parts.push(`${stats.stagedCount} staged`);
    }
    if (stats.lintChecks > 0) {
        parts.push("lints");
    }
    return parts.length > 0 ? parts.join(", ") : null;
}

function LineDelta({ add, del }: { add: number; del: number }) {
    if (add === 0 && del === 0) return null;
    return (
        <span className="inline-flex items-center gap-1 font-mono  shrink-0 tabular-nums">
            {add > 0 ? <span className="text-success">+{add}</span> : null}
            {del > 0 ? <span className="text-error">-{del}</span> : null}
        </span>
    );
}

function ThoughtHeading({ content, isActive }: { content: string; isActive?: boolean }) {
    const trimmed = content.trim();
    if (!trimmed) return isActive ? <>Thinking</> : <>Thought briefly</>;
    if (trimmed.length < 40) {
        return isActive ? <>Thinking</> : <>Thought briefly</>;
    }
    const secs = estimateThoughtSeconds(trimmed);
    if (isActive) return <>Thinking</>;
    return (
        <>
            Thought <span className="text-text-disabled">for {secs}s</span>
        </>
    );
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

    const expandable = trimmed.length >= 80;

    return (
        <div className="py-0.5">
            {isActive ? (
                <LoadingState label="Thinking" variant="Drive" />
            ) : (
                <button
                    type="button"
                    onClick={() => expandable && setOpen((v) => !v)}
                    className={cn(
                        "flex items-center gap-1  transition-colors",
                        expandable
                            ? "text-text-muted hover:text-text-primary cursor-pointer"
                            : "text-text-muted cursor-default",
                    )}
                >
                    <span>
                        <ThoughtHeading content={trimmed} isActive={false} />
                    </span>
                    {expandable ? (
                        <Icon
                            name="chevron_right"
                            size={12}
                            className={cn(
                                "opacity-50 transition-transform duration-[var(--chat-motion-duration,180ms)]",
                                open && "rotate-90",
                            )}
                        />
                    ) : null}
                </button>
            )}
            {expandable && !isActive ? (
                <Collapse open={open || !!showBody}>
                    <div className="mt-1 text-xs leading-relaxed text-text-muted max-w-full whitespace-pre-wrap">
                        {trimmed}
                    </div>
                </Collapse>
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
            <div className="max-h-[220px] overflow-y-auto custom-scrollbar  font-mono">
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

/**
 * Approval card for a staged file edit (require-edit-approval mode):
 * header with filename and +/− counts, expandable diff preview, Skip / Accept.
 */
function EditApprovalRow({ block }: { block: Chunk }) {
    const [localStatus, setLocalStatus] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [diffOpen, setDiffOpen] = useState(true);
    const { add, del } = editDelta(block);
    const file = block.file || "";

    const resolve = useCallback(
        (approved: boolean) => {
            if (!block.commandId || isProcessing) return;
            setIsProcessing(true);
            void commands
                .resolveEditApproval(block.commandId, approved)
                .then(() => setLocalStatus(approved ? "applied" : "rejected"))
                .catch(() => { /* backend upsert corrects the card */ })
                .finally(() => setIsProcessing(false));
        },
        [block.commandId, isProcessing],
    );

    // Backend resolution (or another window) flips the card instantly.
    useEffect(() => {
        if (!block.commandId) return;
        let disposed = false;
        const unlistenPromise = listen<{ id?: string; approved?: boolean }>(
            "agent-edit-resolved",
            (event) => {
                if (disposed || event.payload?.id !== block.commandId) return;
                setLocalStatus(event.payload?.approved ? "applied" : "rejected");
            },
        );
        return () => {
            disposed = true;
            void unlistenPromise.then((unlisten) => unlisten()).catch(() => { /* ignore */ });
        };
    }, [block.commandId]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (isProcessing) return;
            const t = e.target as HTMLElement | null;
            if (t?.closest("textarea, input, [contenteditable='true']")) return;
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                resolve(true);
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [isProcessing, resolve]);

    const status = localStatus ?? block.commandStatus ?? "pending";
    if (status !== "pending") {
        // Applied/rejected states render via the regular step rows once the
        // upserted chunk arrives; show a minimal line meanwhile.
        return (
            <div className="py-0.5 text-xs text-text-muted">
                <ActionPhrase
                verb={status === "applied" ? "Applying edit to" : "Rejected edit to"}
                detail={fileName(file)}
            />
            </div>
        );
    }

    return (
        <ChatCard className="w-fit max-w-full">
            <ChatCardHeader onClick={() => setDiffOpen((v) => !v)}>
                {isProcessing ? (
                    <div className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-text-muted border-t-transparent" />
                ) : (
                    <Icon name="edit" size={13} className="shrink-0 text-text-muted" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm">
                    <ActionPhrase verb="Edit file" detail={fileName(file)} />
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs">
                    <span className="text-success">+{add}</span>
                    <span className="text-error">-{del}</span>
                </span>
                <Icon
                    name="expand_more"
                    size={14}
                    className={cn(
                        "shrink-0 text-text-muted transition-transform duration-[var(--chat-motion-duration,180ms)]",
                        diffOpen && "rotate-180",
                    )}
                />
            </ChatCardHeader>
            <ChatCardBody open={diffOpen}>
                <WorkflowEditPreview
                    file={file}
                    original={block.original || ""}
                    replacement={block.replacement || ""}
                />
            </ChatCardBody>
            <ChatCardFooter>
                <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={isProcessing}
                    onClick={() => resolve(false)}
                >
                    Skip
                </Button>
                <Button
                    type="button"
                    variant="default"
                    size="xs"
                    disabled={isProcessing}
                    onClick={() => resolve(true)}
                >
                    Accept
                    <kbd className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded px-1 py-px font-sans text-xs leading-none text-text-foreground">
                        ↵
                    </kbd>
                </Button>
            </ChatCardFooter>
        </ChatCard>
    );
}

/** Applied (previously gated) edit — same presentation as a normal edit row. */
function StepRowAppliedEdit({ block }: { block: Chunk }) {
    const [diffOpen, setDiffOpen] = useState(false);
    const { add, del } = editDelta(block);
    const hasDiff = add > 0 || del > 0;
    const file = block.file || "";
    return (
        <div className="py-0.5">
            <button
                type="button"
                onClick={() => hasDiff && setDiffOpen((v) => !v)}
                className={cn(
                    "flex items-center gap-1.5 text-text-primary w-fit max-w-full text-left",
                    hasDiff && "hover:opacity-80",
                )}
            >
                <ActionPhrase verb="Edited" detail={fileName(file)} />
                <LineDelta add={add} del={del} />
                {hasDiff ? (
                    <Icon
                        name="chevron_right"
                        size={12}
                        className={cn("opacity-50 transition-transform duration-200 shrink-0", diffOpen && "rotate-90")}
                    />
                ) : null}
            </button>
            {hasDiff ? (
                <Collapse open={diffOpen}>
                    <WorkflowEditPreview
                        file={file}
                        original={block.original || ""}
                        replacement={block.replacement || ""}
                    />
                </Collapse>
            ) : null}
        </div>
    );
}

function StepRow({ block }: { block: Chunk }) {
    const [diffOpen, setDiffOpen] = useState(false);

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

    if (block.type === "think" || block.type === "thought") {
        return <ThoughtStep content={block.content || ""} isActive={block.isGenerating} />;
    }

    if (block.type === "cat") {
        const path = block.content || "";
        const range = lineRangeLabel(block.catStartLine, block.catEndLine);
        return (
            <button
                type="button"
                onClick={() => path && void openProjectFile(path)}
                className="py-0.5 text-text-primary hover:opacity-80 transition-colors w-fit text-left cursor-pointer"
            >
                <ActionPhrase
                    verb="Read"
                    detail={`${fileName(path)}${range ? ` ${range}` : ""}`}
                />
            </button>
        );
    }

    if (block.type === "grep") {
        const q = (block.query || block.content || "").trim();
        return (
            <div className="py-0.5 truncate">
                <ActionPhrase verb="Grepped" detail={q} />
            </div>
        );
    }

    if (block.type === "search" || block.type === "search_result") {
        const q = (block.query || block.content || "").trim();
        return (
            <div className="py-0.5 truncate">
                <ActionPhrase verb="Searched" detail={q} />
            </div>
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

    if (block.type === "edit" && block.file) {
        const { add, del } = editDelta(block);
        const hasDiff = add > 0 || del > 0;
        return (
            <div className="py-0.5">
                <button
                    type="button"
                    onClick={() => hasDiff && setDiffOpen((v) => !v)}
                    className={cn(
                        "flex items-center gap-1.5 text-text-primary w-fit max-w-full text-left",
                        hasDiff && "hover:opacity-80",
                    )}
                >
                    <ActionPhrase verb="Edited" detail={fileName(block.file)} />
                    <LineDelta add={add} del={del} />
                    {hasDiff ? (
                        <Icon
                            name="chevron_right"
                            size={12}
                            className={cn("opacity-0 transition-transform duration-200 shrink-0", diffOpen && "rotate-90 opacity-50")}
                        />
                    ) : null}
                </button>
                {hasDiff ? (
                    <Collapse open={diffOpen}>
                        <WorkflowEditPreview
                            file={block.file}
                            original={block.original || ""}
                            replacement={block.replacement || ""}
                        />
                    </Collapse>
                ) : null}
            </div>
        );
    }

    if (block.type === "terminal_command" || block.type === "run") {
        const cmd = (block.command || block.content || "").trim();
        const finishedFine =
            !block.commandStatus
            || block.commandStatus === "completed"
            || block.commandStatus === "background";
        if (finishedFine && !block.isGenerating && isLintCommand(cmd)) {
            const status = lintStatusFromOutput(block.content || "");
            if (status === "clean") {
                return <div className="py-0.5  text-text-muted">No linter errors</div>;
            }
            if (status === "errors") {
                return <div className="py-0.5  text-text-muted">Linter errors found</div>;
            }
        }
        return <TerminalCommandStep block={block} />;
    }

    if (block.type === "edit_pending") {
        const status = block.commandStatus || "pending";
        if (status === "pending") {
            return <EditApprovalRow block={block} />;
        }
        if (status === "applied" && block.file) {
            // Applied edits render like a normal edit row (with the diff).
            return <StepRowAppliedEdit block={block} />;
        }
        return (
            <div className="py-0.5">
                <ActionPhrase
                    verb={status === "cancelled" ? "Cancelled edit to" : "Rejected edit to"}
                    detail={block.file ? fileName(block.file) : "file"}
                />
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
            <div className="py-0.5">
                <ActionPhrase
                    verb={label}
                    detail={block.content ? fileName(block.content) : ""}
                />
            </div>
        );
    }

    // ls, rename_chat, rich git groups, and anything else ActionItem knows.
    return <ActionItem block={block} />;
}

/** One consecutive tool run, rendered in place between assistant prose. */
export function TurnWorkflowSummary({
    blocks,
    isActive,
}: {
    blocks: Chunk[];
    isActive?: boolean;
    durationMs?: number;
    activityLabel?: string | null;
    showLiveStatus?: boolean;
}) {
    const visible = visibleWorkflowBlocks(blocks, isActive);
    const hasPendingApproval = visible.some(
        (b) =>
            (b.type === "terminal_command" || b.type === "edit_pending")
            && b.commandStatus === "pending",
    );
    const collapsible = visible.filter((b) => b.type !== "think" && b.type !== "thought").length > 1;
    const [stepsOpen, setStepsOpen] = useState(!!isActive || hasPendingApproval);
    const [prevActive, setPrevActive] = useState(isActive);
    const [prevPending, setPrevPending] = useState(hasPendingApproval);

    if (isActive !== prevActive) {
        setPrevActive(isActive);
        setStepsOpen(!!isActive || hasPendingApproval);
    }

    if (hasPendingApproval !== prevPending) {
        setPrevPending(hasPendingApproval);
        if (hasPendingApproval) setStepsOpen(true);
    }

    if (visible.length === 0) return null;

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

    const pendingApprovalRows = (
        <div className="flex flex-col gap-1 my-1">
            {visible
                .filter(
                    (b) =>
                        (b.type === "terminal_command" || b.type === "edit_pending")
                        && b.commandStatus === "pending",
                )
                .map((b, i) =>
                    b.type === "edit_pending" ? (
                        <EditApprovalRow key={b.commandId || `pending-edit-${i}`} block={b} />
                    ) : (
                        <TerminalCommandStep key={b.commandId || `pending-${i}`} block={b} />
                    ),
                )}
        </div>
    );

    const stepRows = (
        <div className="flex flex-col gap-0.5">
            {(() => {
                let skippedLeadThought = false;
                return rows.map((row, i) => {
                    if (row.kind === "git_stage_group") {
                        return <GitStageGroup key={`stage-${i}`} paths={row.paths} />;
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
                <div className="py-0.5  text-text-muted">No linter errors</div>
            ) : null}
        </div>
    );

    return (
        <div className="flex flex-col gap-0.5 py-0.5 select-none">
            {leadThought?.content?.trim() ? (
                <ThoughtStep content={leadThought.content} isActive={leadThought.isGenerating} />
            ) : null}

            {collapsible && summaryLabel ? (
                <button
                    type="button"
                    title={summaryLabel}
                    onClick={() => setStepsOpen((v) => !v)}
                    className="flex max-w-full min-w-0 items-center gap-1.5 py-0.5 text-left text-text-primary hover:opacity-80 transition-colors"
                >
                    <span className="min-w-0 truncate">{summaryLabel}</span>
                    {hasLintDelta ? <LineDelta add={stats.linesAdded} del={stats.linesRemoved} /> : null}
                    <Icon
                        name="chevron_right"
                        size={12}
                        className={cn(
                            "shrink-0 opacity-50 transition-transform duration-200",
                            stepsOpen && "rotate-90",
                        )}
                    />
                </button>
            ) : null}

            {collapsible ? (
                <Collapse open={stepsOpen}>
                    {stepRows}
                </Collapse>
            ) : (
                stepRows
            )}

            {!stepsOpen && hasPendingApproval ? pendingApprovalRows : null}
        </div>
    );
}
