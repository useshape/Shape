"use client";

import { RiArrowRightSLine, RiCheckLine, RiCloseLine, RiPencilLine } from "@remixicon/react";
import React, { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Icon, ICON_SIZE_MD } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { diffLines } from "diff";
import { SyntaxHighlighter } from "@/lib/ui/syntax-highlight";
import { getShapeSyntaxTheme } from "@/lib/ui/syntax-theme";
import type { Chunk } from "../md/renderer";
import { openProjectFile } from "@/lib/window/open-project-file";
import { commands } from "@/lib/backend/commands";
import { Collapse } from "./collapse";
import { TerminalCommandStep } from "./terminal-live";
import {
    ActionItem,
    GitStageGroup,
    groupWorkflowRows,
    isRenderableWorkflowBlock,
    parseGitStagePath,
    GeneratedMediaStep,
} from "./workflow";
import { providerIcon } from "@/lib/ui/provider-icon";
import { PluginLogo } from "@/components/ui/plugin-logo";
import { ShapeLogo } from "@/components/ui/shape-logo";
import { Favicon } from "@/components/ui/favicon";
import { isShapePluginMeta, humanizePluginActionName } from "@/lib/plugins/logos";
import { parseWebSearchHits, WebSearchBlock } from "./search";
import { ActionLine } from "./action-line";
import { ApprovalCard } from "./approval";
import { humanizeToolName } from "@/lib/mcp/oauth";
import { ChromeBrowserIcon } from "@/components/ui/chrome-browser-icon";
import { openSubagent, upsertSubagent } from "@/features/agent/subagents/store";
import { Button } from "@/components/ui/button";

function formatDuration(ms?: number): string {
    if (!ms || ms < 1000) return "1s";
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

/** Action word bright; detail muted — no chip / full-line highlight. */
function GroupActionLabel({
    action,
    detail,
}: {
    action: string;
    detail?: string | null;
}) {
    return <ActionLine action={action} detail={detail} />;
}

function groupDetail(names: string[]): string | null {
    const unique = [...new Set(names.map(fileName).filter(Boolean))];
    if (unique.length === 0) return null;
    if (unique.length === 1) return unique[0]!;
    return `${unique[0]} and more`;
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
            case "inspect_runtime":
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

function LineDelta({ add, del }: { add: number; del: number }) {
    if (add === 0 && del === 0) return null;
    return (
        <span className="inline-flex items-center gap-1 font-mono chat-text shrink-0 tabular-nums">
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
            Thought <span className="wf-summary-text-strong">for {secs}s</span>
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
                <span className="wf-summary-text">Thinking</span>
            ) : (
                <button
                    type="button"
                    onClick={() => expandable && setOpen((v) => !v)}
                    className={cn(
                        "flex items-center gap-1 wf-summary-text transition-colors",
                        expandable
                            ? "hover:text-text-primary cursor-pointer"
                            : "cursor-default",
                    )}
                >
                    <span>
                        <ThoughtHeading content={trimmed} isActive={false} />
                    </span>
                    {expandable ? (
                        <Icon
                            icon={RiArrowRightSLine}
                            className={cn(
                                "opacity-0 transition-transform duration-200",
                                open && "rotate-90 opacity-50",
                            )}
                        />
                    ) : null}
                </button>
            )}
            {expandable && !isActive ? (
                <Collapse open={open || !!showBody}>
                    <div className="mt-1 chat-text leading-relaxed text-text-muted max-w-full whitespace-pre-wrap">
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
        const all = out.filter((r) => r.type === "add" || r.type === "remove");
        return all.slice(0, 24);
    }, [original, replacement]);

    if (rows.length === 0) return null;

    return (
        <div className="my-1.5 overflow-hidden border-t border-b border-border bg-surface-3 max-w-full">
            <div className="max-h-[220px] overflow-y-auto custom-scrollbar chat-text font-mono">
                {rows.map((row, i) => (
                    <div
                        key={`${row.type}-${i}`}
                        className={cn(
                            "flex items-start gap-2 px-2 py-px border-l-2",
                            row.type === "add"
                                ? "border-l-success/50 bg-success/[0.04]"
                                : "border-l-error/40 bg-error/[0.04]",
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

    const status = localStatus ?? block.commandStatus ?? "pending";
    if (status !== "pending") {
        return (
            <ActionLine
                action={status === "applied" ? "Applying edit to" : "Rejected edit to"}
                detail={fileName(file)}
            />
        );
    }

    return (
        <ApprovalCard
            icon={<Icon icon={RiPencilLine} className="shrink-0 text-text-muted" size={ICON_SIZE_MD} />}
            title={
                <button
                    type="button"
                    onClick={() => setDiffOpen((v) => !v)}
                    className="flex min-w-0 items-center gap-1.5 text-left"
                >
                    <span>Edit file</span>
                    <span className="truncate text-text-primary">{fileName(file)}</span>
                    <span className="flex shrink-0 items-center gap-1">
                        <span className="text-success">+{add}</span>
                        <span className="text-error">-{del}</span>
                    </span>
                    <Icon
                        icon={RiArrowRightSLine}
                        className={cn(
                            "shrink-0 opacity-50 transition-transform duration-200",
                            diffOpen && "rotate-90",
                        )}
                    />
                </button>
            }
            isProcessing={isProcessing}
            onSkip={() => resolve(false)}
            onAccept={() => resolve(true)}
            skipLabel="Skip"
            acceptLabel="Accept"
        >
            <Collapse open={diffOpen}>
                <WorkflowEditPreview
                    file={file}
                    original={block.original || ""}
                    replacement={block.replacement || ""}
                />
            </Collapse>
        </ApprovalCard>
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
                    "flex items-center gap-1.5 chat-text text-text-muted w-fit max-w-full text-left",
                    hasDiff && "hover:text-text-primary transition-colors",
                )}
            >
                <span>
                    Edited <span className="text-text-secondary">{fileName(file)}</span>
                </span>
                <LineDelta add={add} del={del} />
                {hasDiff ? (
                    <Icon
                        icon={RiArrowRightSLine}
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

function PluginCallStep({ block }: { block: Chunk }) {
    const [localStatus, setLocalStatus] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const status = localStatus ?? block.commandStatus ?? "ok";
    const toolkit = block.pluginToolkit || "plugins";
    const label = humanizePluginActionName(block.pluginSlug || "", block.pluginLabel) || "Plugin";
    const detail = (block.content || "")
        .replace(/^(Awaiting approval|Rejected|Cancelled)\s*[·:]?\s*/i, "")
        .replace(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const truncated =
        detail.length > 72 ? `${detail.slice(0, 69).trimEnd()}…` : detail;

    useEffect(() => {
        if (status !== "pending" || !block.commandId) return;
        let disposed = false;
        const unlistenPromise = listen<{ id?: string; approved?: boolean }>(
            "agent-command-resolved",
            (event) => {
                if (disposed || event.payload?.id !== block.commandId) return;
                setLocalStatus(event.payload?.approved ? "ok" : "rejected");
            },
        );
        return () => {
            disposed = true;
            void unlistenPromise.then((unlisten) => unlisten()).catch(() => undefined);
        };
    }, [status, block.commandId]);

    const handleAccept = useCallback(() => {
        if (!block.commandId || isProcessing) return;
        setIsProcessing(true);
        void commands
            .approveTerminalCommand(block.commandId)
            .then(() => setLocalStatus("ok"))
            .catch(() => setLocalStatus("error"))
            .finally(() => setIsProcessing(false));
    }, [block.commandId, isProcessing]);

    const handleReject = useCallback(() => {
        if (!block.commandId || isProcessing) return;
        setIsProcessing(true);
        void commands
            .rejectTerminalCommand(block.commandId)
            .then(() => setLocalStatus("rejected"))
            .catch(() => setLocalStatus("error"))
            .finally(() => setIsProcessing(false));
    }, [block.commandId, isProcessing]);

    if (status === "pending") {
        const subtitle = truncated || "Waiting for approval";
        return (
            <div className="my-1 flex items-center gap-3 squircle-xl bg-surface-3 px-3 py-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden squircle-xl bg-surface-2">
                    {isShapePluginMeta(toolkit, block.pluginSlug) ? (
                        <ShapeLogo size={ICON_SIZE_MD} />
                    ) : (
                        <PluginLogo toolkit={toolkit} name={toolkit} slug={block.pluginSlug} size={22} />
                    )}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-md font-medium text-text-primary">{label}</div>
                    <div className="truncate text-xs font-medium text-text-muted">{subtitle}</div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 border border-border-secondary squircle-2xl px-1 divide-x divide-border-secondary">
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="rounded-none hover:bg-transparent"
                        aria-label="Reject"
                        disabled={isProcessing}
                        onClick={handleReject}
                    >
                        <Icon icon={RiCloseLine} size={ICON_SIZE_MD} />
                    </Button>
                    <Button
                        type="button"
                        aria-label="Allow"
                        size="icon"
                        variant="ghost"
                        className="rounded-none hover:bg-transparent"
                        disabled={isProcessing}
                        onClick={handleAccept}
                    >
                        <Icon icon={RiCheckLine} size={ICON_SIZE_MD} />
                    </Button>
                </div>
            </div>
        );
    }

    const verb =
        status === "rejected"
            ? "Rejected"
            : status === "cancelled"
              ? "Cancelled"
              : status === "error"
                ? "Failed"
                : label;
    return (
        <div className="flex items-center gap-1.5 py-0.5 chat-text font-regular font-sans text-text-primary/80 min-w-0">
            {isShapePluginMeta(toolkit, block.pluginSlug) ? (
                <ShapeLogo size={12} />
            ) : (
                <PluginLogo toolkit={toolkit} name={toolkit} slug={block.pluginSlug} size={14} className="rounded-sm" />
            )}
            <span className="truncate">
                {verb}
                {status === "ok" || status === "error" ? null : (
                    <>
                        {" "}
                        <span className="text-text-secondary">{label}</span>
                    </>
                )}
            </span>
        </div>
    );
}

function StepRow({ block }: { block: Chunk }) {
    const [diffOpen, setDiffOpen] = useState(false);

    if (block.type === "think" || block.type === "thought") {
        return <ThoughtStep content={block.content || ""} isActive={block.isGenerating} />;
    }

    if (block.type === "tool_result") {
        const raw = block.content || "";
        const mcp = raw.match(/^\[MCP\s+([^\]]+)\]/i)?.[1]?.trim();
        if (mcp) {
            const label = humanizeToolName(mcp.replace(/^mcp__/i, "").replace(/__/g, " "));
            return (
                <div className="py-0.5 chat-text font-regular text-text-primary/80 truncate">
                    Called <span className="text-text-secondary">{label}</span>
                </div>
            );
        }
        const summary = raw.replace(/\s+/g, " ").trim().slice(0, 72);
        return (
            <div className="py-0.5 chat-text font-regular text-text-primary/80 truncate">
                Tool result
                {summary ? (
                    <>
                        {" "}
                        <span className="text-text-secondary">{summary}{raw.length > 72 ? "…" : ""}</span>
                    </>
                ) : null}
            </div>
        );
    }

    if (block.type === "plugin_call") {
        return <PluginCallStep block={block} />;
    }

    if (block.type === "generated_svg" || block.type === "generated_image") {
        return <GeneratedMediaStep block={block} />;
    }

    if (block.type === "cat") {
        const path = block.content || "";
        const fileName = path.split(/[\\/]/).pop() || path;
        return (
            <ActionLine
                action="Read"
                detail={fileName || "file"}
                onClick={() => path && void openProjectFile(path)}
            />
        );
    }

    if (block.type === "subagent" || block.type === "subagent_ref") {
        const name = block.query || "agent";
        const id = block.file || name;
        return (
            <button
                type="button"
                className="flex items-center gap-1.5 py-0.5 chat-text font-medium text-text-primary/80 hover:text-text-primary"
                onClick={() => {
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
                }}
            >
                {providerIcon(block.command || "auto", 14)}
                <span>
                    Spawned <span className="text-text-secondary">{name}</span>
                </span>
            </button>
        );
    }

    if (block.type === "grep") {
        const q = (block.query || block.content || "").trim();
        return <ActionLine action="Grepped" detail={q} />;
    }

    if (block.type === "search" || block.type === "search_result") {
        const q = (block.query || block.content || "").trim();
        return <ActionLine action="Searched" detail={q} />;
    }

    if (block.type === "inspect_runtime") {
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
        if (!detail) detail = (block.inspectKind || "runtime").trim();
        return (
            <ActionLine
                action={block.isGenerating ? "Inspecting" : "Inspected"}
                detail={detail}
                extra={<ChromeBrowserIcon size={14} branded />}
            />
        );
    }

    if (block.type === "web_search" || block.type === "web_result") {
        return (
            <WebSearchBlock
                query={(block.query || "").trim()}
                results={parseWebSearchHits(block.content || "")}
                isActive={block.isGenerating}
            />
        );
    }

    if (block.type === "web_visit") {
        const host = block.visitHost || block.visitTitle || block.content || "";
        const url = block.visitUrl || block.visitHost || "";
        return (
            <button
                type="button"
                onClick={() => {
                    if (block.visitUrl) void commands.openUrlExternal(block.visitUrl);
                }}
                className="flex items-center gap-1.5 py-0.5 chat-text font-regular text-text-primary/80 hover:text-text-primary transition-colors w-fit max-w-full text-left"
            >
                {url ? (
                    <span className="chat-link-favicon">
                        <Favicon url={url} size={12} />
                    </span>
                ) : null}
                <span>
                    {block.isGenerating ? "Visiting" : "Visited"}{" "}
                    <span className="text-text-secondary">{host}</span>
                </span>
            </button>
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
                        "flex items-center gap-1.5 text-md font-medium text-text-primary/80 w-fit max-w-full text-left",
                        hasDiff && "hover:text-text-primary transition-colors",
                    )}
                >
                    <span>
                        Edited <span className="text-text-secondary">{fileName(block.file)}</span>
                    </span>
                    <LineDelta add={add} del={del} />
                    {hasDiff ? (
                        <Icon
                            icon={RiArrowRightSLine}
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
                return <div className="py-0.5 text-md text-text-primary/80">No linter errors</div>;
            }
            if (status === "errors") {
                return <div className="py-0.5 text-md text-text-primary/80">Linter errors found</div>;
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
            <div className="py-0.5 text-md text-text-primary/80">
                {status === "cancelled" ? "Cancelled edit to " : "Rejected edit to "}
                <span className="text-text-secondary">{block.file ? fileName(block.file) : "file"}</span>
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
            <ActionLine
                action={label}
                detail={block.content ? fileName(block.content) : undefined}
            />
        );
    }

    // ls, rename_chat, rich git groups, and anything else ActionItem knows.
    return <ActionItem block={block} />;
}

export function TurnWorkflowSummary({
    blocks,
    isActive,
    durationMs,
    showHeader = true,
    children,
}: {
    blocks: Chunk[];
    isActive?: boolean;
    durationMs?: number;
    activityLabel?: string | null;
    /** When false, only the step pile is shown (for interleaved mid-turn groups). */
    showHeader?: boolean;
    children?: React.ReactNode;
}) {
    const visible = blocks.filter((b) => isRenderableWorkflowBlock(b, isActive));
    const pendingBlocks = visible.filter(
        (b) =>
            (b.type === "terminal_command" || b.type === "edit_pending" || b.type === "plugin_call")
            && b.commandStatus === "pending",
    );
    const [open, setOpen] = useState(() => !!isActive);
    const [prevActive, setPrevActive] = useState(isActive);
    const startedAtRef = React.useRef<number | null>(isActive ? Date.now() : null);
    const [tick, setTick] = useState(0);

    if (isActive !== prevActive) {
        setPrevActive(isActive);
        setOpen(!!isActive);
        startedAtRef.current = isActive ? Date.now() : null;
    }

    useEffect(() => {
        if (!isActive) return;
        const id = window.setInterval(() => setTick((n) => n + 1), 250);
        return () => window.clearInterval(id);
    }, [isActive]);

    if (visible.length === 0) return <>{children}</>;

    const stats = computeTurnStats(visible);
    const rows = groupWorkflowRows(
        visible.filter(
            (b) =>
                !((b.type === "terminal_command" || b.type === "edit_pending" || b.type === "plugin_call")
                    && b.commandStatus === "pending"),
        ),
    );
    const thoughtBlocks = visible.filter((b) => b.type === "think" || b.type === "thought");
    const leadThought = thoughtBlocks[0];
    const showLintFooter = stats.lintClean && stats.lintChecks > 0;
    const lintShownInSteps = visible.some((b) => {
        if (b.type !== "terminal_command" && b.type !== "run") return false;
        const cmd = (b.command || b.content || "").trim();
        return isLintCommand(cmd) && lintStatusFromOutput(b.content || "") === "clean";
    });
    const elapsedMs = (isActive && startedAtRef.current
        ? Date.now() - startedAtRef.current
        : durationMs) ?? 0;
    void tick;
    const workedLabel = formatDuration(elapsedMs);

    const pendingApprovalRows = (
        <div className="flex flex-col gap-1 my-1">
            {pendingBlocks.map((b, i) =>
                b.type === "edit_pending" ? (
                    <EditApprovalRow key={b.commandId || `pending-edit-${i}`} block={b} />
                ) : b.type === "plugin_call" ? (
                    <PluginCallStep key={b.commandId || `pending-plugin-${i}`} block={b} />
                ) : (
                    <TerminalCommandStep key={b.commandId || `pending-${i}`} block={b} />
                ),
            )}
        </div>
    );

    return (
        <div className="mb-2 select-none">
            {showHeader ? (
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full max-w-full items-center gap-2 py-0.5 chat-text font-medium text-text-muted hover:text-text-primary transition-colors"
            >
                <span className="wf-summary-text min-w-0 flex-1 text-left">
                    Worked for{" "}
                    <span className="wf-summary-text-strong">{workedLabel}</span>
                </span>
                <Icon
                    icon={RiArrowRightSLine}
                    className={cn("shrink-0 opacity-50 transition-transform duration-200", open && "rotate-90")}
                />
            </button>
            ) : null}

            <Collapse open={showHeader ? open : true}>
                <div className="mt-0.5 flex flex-col gap-0.5">
                    {leadThought?.content?.trim() ? (
                        <ThoughtStep content={leadThought.content} isActive={leadThought.isGenerating} />
                    ) : null}

                    <div className="relative ml-0.5 flex flex-col gap-0.5 pl-0">
                            {(() => {
                                let skippedLeadThought = false;
                                return rows.map((row, i) => {
                                    if (row.kind === "git_stage_group") {
                                        return <GitStageGroup key={`stage-${i}`} paths={row.paths} />;
                                    }
                                    if (row.kind === "read_group") {
                                        return (
                                            <GroupActionLabel
                                                key={`reads-${i}`}
                                                action="Explored"
                                                detail={groupDetail(row.files.map((f) => f.path))}
                                            />
                                        );
                                    }
                                    if (row.kind === "search_group") {
                                        return (
                                            <GroupActionLabel
                                                key={`searches-${i}`}
                                                action="Searched"
                                                detail={
                                                    row.count > 1
                                                        ? `${row.count} times`
                                                        : groupDetail(row.queries)
                                                }
                                            />
                                        );
                                    }
                                    if (row.kind === "write_group") {
                                        return (
                                            <GroupActionLabel
                                                key={`writes-${i}`}
                                                action="Edited"
                                                detail={groupDetail(row.paths)}
                                            />
                                        );
                                    }
                                    if (row.kind === "list_group") {
                                        return (
                                            <GroupActionLabel
                                                key={`lists-${i}`}
                                                action="Listed"
                                                detail={row.count > 1 ? `${row.count} folders` : "folders"}
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
                                <div className="py-0.5 chat-text font-medium text-text-muted">No linter errors</div>
                            ) : null}
                    </div>
                </div>
            </Collapse>

            {pendingBlocks.length > 0 ? pendingApprovalRows : null}

            {children}
        </div>
    );
}
