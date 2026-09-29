"use client";

import { ChevronRight20Regular } from "@fluentui/react-icons/headless/svg/chevron-right";
import { Edit20Regular } from "@fluentui/react-icons/headless/svg/edit";



import React, { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Icon } from "@/components/ui/icon";


import { cn } from "@/lib/utils";
import type { Chunk } from "../md/renderer";
import { openProjectFile } from "@/lib/window/open-project-file";
import { commands } from "@/lib/backend/commands";
import { Collapse } from "./collapse";
import { TerminalCommandStep } from "./terminal-live";
import {
    ActionItem,
    GitStageGroup,
    groupWorkflowRows,
    coalesceConsecutiveSameFileEdits,
    coalesceConsecutiveSameTasks,
    isRenderableWorkflowBlock,
    parseGitStagePath,
    GeneratedMediaStep,
} from "./workflow";
import { providerIcon } from "@/lib/ui/provider-icon";
import { humanizePluginActionName } from "@/lib/plugins/logos";
import { PluginActivityCard } from "./plugin-card";
import { parseWebSearchHits, WebSearchBlock, WebSearchTrail } from "./search";
import { countChangedLines } from "@/lib/ui/diff-count";
import { ChatEditDiff } from "./chat-diff";
import { ActionLine, splitActionLabel } from "./action-line";
import { PluginLogo } from "@/components/ui/plugin-logo";
import { ApprovalCard } from "./approval";
import { humanizeToolName } from "@/lib/mcp/oauth";
import { BrowseChatCard } from "./browse-frame";
import { openSubagent, upsertSubagent } from "@/features/agent/subagents/store";

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

function modelChipLabel(model?: string): string {
    const bare = (model || "").split("/").pop()?.trim() || "";
    if (!bare || bare === "auto") return bare === "auto" ? "Auto" : "";
    return bare.replace(/[-_]/g, " ");
}

function openSpawnedAgent(block: Chunk) {
    const name = block.query || "agent";
    const id = block.file || name;
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
}

function SubagentRow({ block }: { block: Chunk }) {
    const name = block.query || "agent";
    const task = (block.type === "subagent_ref" ? block.content : "")?.trim();
    const model = modelChipLabel(block.command);
    return (
        <ActionLine
            action="Spawned"
            detail={task || name}
            icon={providerIcon(block.command || "auto", 14)}
            onClick={() => openSpawnedAgent(block)}
            extra={
                model ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-text-muted">
                        {providerIcon(block.command || "auto", 12)}
                        {model}
                    </span>
                ) : null
            }
        />
    );
}

function SubagentSpawnGroup({ blocks }: { blocks: Chunk[] }) {
    return (
        <ActionLine action="Spawning" detail="subagents" defaultOpen>
            <div className="flex flex-col">
                {blocks.map((block, index) => (
                    <SubagentRow key={`${block.type}-${block.file || block.query}-${index}`} block={block} />
                ))}
            </div>
        </ActionLine>
    );
}

function editDelta(block: Chunk): { add: number; del: number } {
    return countChangedLines(block.original || "", block.replacement || "");
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

function ThoughtStep({
    content,
    isActive,
}: {
    content: string;
    isActive?: boolean;
}) {
    const trimmed = content.trim();
    if (!trimmed) return null;
    if (isActive) return <ActionLine action="Thinking" shimmer />;

    const expandable = trimmed.length >= 80;
    const detail = trimmed.length < 40 ? "briefly" : `${estimateThoughtSeconds(trimmed)}s`;
    return (
        <ActionLine action="Thought" detail={detail}>
            {expandable ? (
                <div className="mt-1 w-full min-w-0 whitespace-pre-wrap chat-text leading-relaxed text-text-muted">
                    {trimmed}
                </div>
            ) : null}
        </ActionLine>
    );
}

function WorkflowEditPreview({
    original,
    replacement,
}: {
    original: string;
    replacement: string;
}) {
    return <ChatEditDiff original={original} replacement={replacement} />;
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
                action={status === "applied" ? "Edited" : "Rejected"}
                detail={fileName(file)}
            />
        );
    }

    return (
        <ApprovalCard
            icon={<Icon icon={Edit20Regular} className="text-text-muted" />}
            title={
                <button
                    type="button"
                    onClick={() => setDiffOpen((v) => !v)}
                    className="group/line flex min-w-0 items-center gap-1.5 text-left chat-text font-normal text-text-muted"
                >
                    <span className="text-text-secondary group-hover/line:text-text-primary">Edit</span>
                    <span className="min-w-0 truncate text-text-muted">{fileName(file)}</span>
                    {add > 0 || del > 0 ? (
                        <span className="flex shrink-0 items-center gap-1 tabular-nums">
                            {add > 0 ? <span className="text-success">+{add}</span> : null}
                            {del > 0 ? <span className="text-error">-{del}</span> : null}
                        </span>
                    ) : null}
                    <Icon
                        icon={ChevronRight20Regular}
                        className={cn(
                            "shrink-0 text-text-muted opacity-50 transition-transform duration-[var(--transition-fast)] ease-[var(--ease-out)]",
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
                    original={block.original || ""}
                    replacement={block.replacement || ""}
                />
            </Collapse>
        </ApprovalCard>
    );
}

/** Applied (previously gated) edit — same presentation as a normal edit row. */
function StepRowAppliedEdit({ block }: { block: Chunk }) {
    const { add, del } = editDelta(block);
    const file = block.file || "";
    return (
        <ActionLine action="Edited" detail={fileName(file)} add={add} del={del}>
            {add > 0 || del > 0 ? (
                <WorkflowEditPreview
                    original={block.original || ""}
                    replacement={block.replacement || ""}
                />
            ) : null}
        </ActionLine>
    );
}

function PluginCallStep({ block }: { block: Chunk }) {
    const [localStatus, setLocalStatus] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const status = localStatus ?? block.commandStatus ?? "ok";
    const toolkit = block.pluginToolkit || "";
    const slug = block.pluginSlug || "";
    const label = humanizePluginActionName(slug, block.pluginLabel) || "Plugin";
    const discovery = slug === "plugin_list" || slug === "plugin_search" || slug === "plugin_tools";

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

    if (discovery || status !== "pending") {
        const lead = splitActionLabel(label);
        const failed = status === "error" || status === "rejected" || status === "cancelled";
        return (
            <ActionLine
                action={failed ? "Failed" : lead.action}
                detail={failed ? lead.detail || label : lead.detail}
            />
        );
    }

    return (
        <PluginActivityCard
            toolkit={toolkit}
            slug={slug}
            label={label}
            body={block.content || ""}
            status={status}
            pending={status === "pending"}
            busy={isProcessing}
            onAllow={handleAccept}
            onReject={handleReject}
        />
    );
}

function StepRow({ block }: { block: Chunk }) {
    if (block.type === "browse_session") {
        let image = "";
        let x: number | undefined;
        let y: number | undefined;
        let consoleLines: string[] | undefined;
        try {
            const parsed = JSON.parse(block.content || "") as {
                image?: string;
                x?: number;
                y?: number;
                console?: string[];
            };
            image = parsed.image || "";
            x = parsed.x;
            y = parsed.y;
            consoleLines = parsed.console;
        } catch {
            image = "";
        }
        return (
            <div className="py-0.5">
                <div className="mt-1.5">
                    <BrowseChatCard
                        url={block.visitUrl}
                        title={block.visitTitle}
                        status={block.commandStatus}
                        image={image}
                        x={x}
                        y={y}
                        consoleLines={consoleLines}
                        followLive={Boolean(block.isGenerating) || !image.trim()}
                    />
                </div>
            </div>
        );
    }

    if (block.type === "think" || block.type === "thought") {
        return <ThoughtStep content={block.content || ""} isActive={block.isGenerating} />;
    }

    if (block.type === "tool_result") {
        const raw = block.content || "";
        const mcp = raw.match(/^\[MCP\s+([^\]]+)\]/i)?.[1]?.trim();
        if (mcp) {
            const label = humanizeToolName(mcp.replace(/^mcp__/i, "").replace(/__/g, " "));
            return <ActionLine action="Called" detail={label} />;
        }
        const summary = raw.replace(/\s+/g, " ").trim().slice(0, 72);
        return (
            <ActionLine
                action="Ran"
                detail={summary ? `${summary}${raw.length > 72 ? "…" : ""}` : "tool"}
            />
        );
    }

    if (block.type === "plugin_call") {
        return <PluginCallStep block={block} />;
    }

    if (block.type === "generated_svg" || block.type === "generated_image" || block.type === "generated_audio") {
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
        return <SubagentRow block={block} />;
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
            <ActionLine
                action={block.isGenerating ? "Visiting" : "Visited"}
                detail={host}
                favicons={url ? [url] : undefined}
                shimmer={Boolean(block.isGenerating)}
                onClick={block.visitUrl ? () => void commands.openUrlExternal(block.visitUrl!) : undefined}
            />
        );
    }

    if (block.type === "edit" && block.file) {
        const { add, del } = editDelta(block);
        const file = block.file;
        return (
            <ActionLine action="Edited" detail={fileName(file)} add={add} del={del}>
                {add > 0 || del > 0 ? (
                    <WorkflowEditPreview
                        original={block.original || ""}
                        replacement={block.replacement || ""}
                    />
                ) : null}
            </ActionLine>
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
                return <ActionLine action="Checked" detail="no linter errors" />;
            }
            if (status === "errors") {
                return <ActionLine action="Checked" detail="linter errors" />;
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
            <ActionLine
                action={status === "cancelled" ? "Cancelled" : "Rejected"}
                detail={block.file ? fileName(block.file) : "file"}
            />
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

function turnSummary(blocks: Chunk[], stats: ReturnType<typeof computeTurnStats>, isActive?: boolean, activityLabel?: string | null) {
    const status = [...blocks].reverse().find((b) => b.type === "status" && b.content?.trim());
    if (status?.content?.trim()) return status.content.trim();
    if (isActive && activityLabel?.trim() && !/^(working|thinking)$/i.test(activityLabel.trim())) {
        return activityLabel.trim();
    }
    const parts: string[] = [];
    if (stats.editFileCount > 0) {
        parts.push(`Edited ${stats.editFileCount} file${stats.editFileCount === 1 ? "" : "s"}`);
    }
    if (stats.reads > 0) {
        parts.push(`${parts.length ? "explored" : "Explored"} ${stats.reads} file${stats.reads === 1 ? "" : "s"}`);
    }
    if (stats.searches > 0 && stats.reads === 0) {
        parts.push(`${parts.length ? "searched" : "Searched"} ${stats.searches} time${stats.searches === 1 ? "" : "s"}`);
    }
    if (parts.length > 0) return parts.join(", ");
    return isActive ? "Working" : "Worked";
}

function turnMarks(blocks: Chunk[]) {
    const urls: string[] = [];
    const toolkits: string[] = [];
    for (const block of blocks) {
        if (block.type === "web_visit" && (block.visitUrl || block.visitHost)) {
            urls.push(block.visitUrl || `https://${block.visitHost}`);
        }
        if (block.type === "inspect_runtime" && block.query) urls.push(block.query);
        if (block.type === "web_search" || block.type === "web_result") {
            for (const hit of parseWebSearchHits(block.content || "")) {
                if (hit.url) urls.push(hit.url);
            }
        }
        if (
            block.type === "plugin_call"
            && block.pluginToolkit
            && block.pluginToolkit !== "plugins"
            && block.pluginSlug !== "plugin_list"
            && block.pluginSlug !== "plugin_search"
            && block.pluginSlug !== "plugin_tools"
        ) {
            toolkits.push(block.pluginToolkit);
        }
    }
    return {
        urls: [...new Set(urls.filter(Boolean))].slice(0, 4),
        toolkits: [...new Set(toolkits.filter(Boolean))].slice(0, 4),
    };
}

export function TurnWorkflowSummary({
    blocks,
    isActive,
    showHeader = true,
    activityLabel,
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

    if (isActive !== prevActive) {
        setPrevActive(isActive);
        setOpen(!!isActive);
    }

    if (visible.length === 0) return <>{children}</>;

    const coalesced = coalesceConsecutiveSameTasks(coalesceConsecutiveSameFileEdits(visible));
    const stats = computeTurnStats(coalesced);
    const rows = groupWorkflowRows(
        coalesced.filter(
            (b) =>
                !((b.type === "terminal_command" || b.type === "edit_pending" || b.type === "plugin_call")
                    && b.commandStatus === "pending"),
        ),
    );
    const thoughtBlocks = coalesced.filter((b) => b.type === "think" || b.type === "thought");
    const leadThought = thoughtBlocks[0];
    const showLintFooter = stats.lintClean && stats.lintChecks > 0;
    const lintShownInSteps = visible.some((b) => {
        if (b.type !== "terminal_command" && b.type !== "run") return false;
        const cmd = (b.command || b.content || "").trim();
        return isLintCommand(cmd) && lintStatusFromOutput(b.content || "") === "clean";
    });
    const headline = splitActionLabel(turnSummary(blocks, stats, isActive, activityLabel));
    const marks = turnMarks(blocks);

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
                <ActionLine
                    action={headline.action}
                    detail={headline.detail}
                    add={stats.linesAdded}
                    del={stats.linesRemoved}
                    favicons={marks.urls}
                    shimmer={Boolean(isActive)}
                    open={open}
                    onOpenChange={setOpen}
                    extra={
                        marks.toolkits.length > 0 ? (
                            <span className="inline-flex shrink-0 items-center -space-x-1.5">
                                {marks.toolkits.map((toolkit) => (
                                    <span
                                        key={toolkit}
                                        className="inline-flex size-4 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-panel"
                                    >
                                        <PluginLogo toolkit={toolkit} name={toolkit} size={12} />
                                    </span>
                                ))}
                            </span>
                        ) : null
                    }
                >
                    <div className="flex flex-col">
                    {leadThought?.content?.trim() ? (
                        <ThoughtStep content={leadThought.content} isActive={leadThought.isGenerating} />
                    ) : null}
                            {(() => {
                                let skippedLeadThought = false;
                                return rows.map((row, i) => {
                                    if (row.kind === "subagent_group") {
                                        return <SubagentSpawnGroup key={`subs-${i}`} blocks={row.blocks} />;
                                    }
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
                                                detail={row.count > 1 ? `${row.count} times` : groupDetail(row.queries)}
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
                                        return (
                                            <WebSearchTrail
                                                key={`web-${i}`}
                                                blocks={row.blocks}
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
                                <ActionLine action="Checked" detail="no linter errors" />
                            ) : null}
                    </div>
                </ActionLine>
            ) : null}

            {pendingBlocks.length > 0 ? pendingApprovalRows : null}

            {children}
        </div>
    );
}
