"use client";

/**
 * Live terminal command UI for the chat transcript.
 *
 * The backend emits `agent-terminal-stream` events correlated by `commandId`
 * ({ kind: "start" | "data" | "background" | "exit", sessionId, data, exitCode }),
 * so a command card can show real output while the command runs instead of a
 * frozen "Working…" row. The persisted XML chunk provides the final state on
 * reload; the event stream drives the in-between states.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { commands } from "@/lib/backend/commands";
import { useSettings, updateSettingSection, type AutoRunModeSetting } from "@/lib/settings";
import type { Chunk } from "../md/renderer";

const OUTPUT_CAP = 16_000;

/** Strip ANSI CSI/OSC escapes and carriage returns for readable chat output. */
export function stripAnsi(input: string): string {
    return input
        .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
        .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
        .replace(/\u001b./g, "")
        .replace(/\r/g, "");
}

type StreamPhase = "idle" | "running" | "background" | "finished";

type StreamState = {
    phase: StreamPhase;
    output: string;
    exitCode: number | null;
    sessionId: number | null;
    cancelled: boolean;
    waitingForInput: boolean;
};

type AgentTerminalEvent = {
    commandId?: string;
    sessionId?: number;
    kind?: string;
    data?: string;
    exitCode?: number;
    cancelled?: boolean;
};

/**
 * Subscribe to live output for one command. `enabled` avoids piling up
 * listeners for historical (already finished) transcript rows.
 */
export function useAgentTerminalStream(commandId: string | undefined, enabled: boolean): StreamState {
    const [state, setState] = useState<StreamState>({
        phase: "idle",
        output: "",
        exitCode: null,
        sessionId: null,
        cancelled: false,
        waitingForInput: false,
    });
    const bufferRef = useRef("");

    useEffect(() => {
        if (!commandId || !enabled) return;
        let disposed = false;
        const unlistenPromise = listen<AgentTerminalEvent>("agent-terminal-stream", (event) => {
            const payload = event.payload;
            if (disposed || !payload || payload.commandId !== commandId) return;
            if (payload.kind === "start") {
                bufferRef.current = "";
                setState({
                    phase: "running",
                    output: "",
                    exitCode: null,
                    sessionId: payload.sessionId ?? null,
                    cancelled: false,
                    waitingForInput: false,
                });
            } else if (payload.kind === "data" && payload.data) {
                bufferRef.current = (bufferRef.current + stripAnsi(payload.data)).slice(-OUTPUT_CAP);
                const output = bufferRef.current;
                setState((prev) => ({
                    ...prev,
                    phase: prev.phase === "idle" ? "running" : prev.phase,
                    output,
                    sessionId: payload.sessionId ?? prev.sessionId,
                    waitingForInput: false,
                }));
            } else if (payload.kind === "waiting_for_input") {
                setState((prev) => ({
                    ...prev,
                    phase: prev.phase === "idle" ? "running" : prev.phase,
                    sessionId: payload.sessionId ?? prev.sessionId,
                    waitingForInput: true,
                }));
            } else if (payload.kind === "background") {
                setState((prev) => ({ ...prev, phase: "background" }));
            } else if (payload.kind === "exit") {
                if (payload.data) {
                    bufferRef.current = (bufferRef.current + stripAnsi(payload.data)).slice(-OUTPUT_CAP);
                }
                const output = bufferRef.current;
                setState((prev) => ({
                    ...prev,
                    phase: "finished",
                    output,
                    exitCode: payload.exitCode ?? -1,
                    cancelled: payload.cancelled ?? false,
                    waitingForInput: false,
                }));
            }
        });
        return () => {
            disposed = true;
            void unlistenPromise.then((unlisten) => unlisten()).catch(() => { /* ignore */ });
        };
    }, [commandId, enabled]);

    return state;
}

/** Auto-scrolling monospace output box (last lines of a running command). */
export function LiveTerminalOutput({
    text,
    maxHeight = 180,
}: {
    text: string;
    maxHeight?: number;
}) {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const pinnedRef = useRef(true);

    useEffect(() => {
        const el = scrollRef.current;
        if (el && pinnedRef.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, [text]);

    const onScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    }, []);

    if (!text.trim()) return null;

    return (
        <div
            ref={scrollRef}
            onScroll={onScroll}
            style={{ maxHeight }}
            className="my-1 overflow-y-auto custom-scrollbar rounded-md border border-border-subtle bg-panel/60 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-text-secondary whitespace-pre-wrap break-words"
        >
            {text}
        </div>
    );
}

const AUTO_RUN_OPTIONS: Array<{ value: AutoRunModeSetting; label: string }> = [
    { value: "ask", label: "Ask every time" },
    { value: "auto", label: "Auto" },
    { value: "always", label: "Run everything" },
];

function modKeyLabel(): string {
    if (typeof navigator === "undefined") return "Ctrl";
    return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
}

/**
 * Approval card for a pending terminal command:
 * header ("Run command"), monospace `$ command` body, footer with the
 * auto-run mode selector on the left and Skip / Run on the right.
 */
export function CommandApprovalCard({
    command,
    reason,
    isProcessing,
    onRun,
    onSkip,
}: {
    command: string;
    reason?: string;
    isProcessing: boolean;
    onRun: () => void;
    onSkip: () => void;
}) {
    const settings = useSettings();
    const mod = modKeyLabel();

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (isProcessing) return;
            const t = e.target as HTMLElement | null;
            if (t?.closest("textarea, input, [contenteditable='true']")) return;
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                onRun();
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [isProcessing, onRun]);

    return (
        <div className="my-1 overflow-hidden rounded-xl bg-transparent border border-border">
            <div className="flex items-center gap-2 px-3 pt-2 pb-2">
                {isProcessing ? (
                    <div className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-text-muted border-t-transparent" />
                ) : (
                    <Icon name="terminal" size={13} className="shrink-0 text-text-muted" />
                )}
                <span className="truncate text-xs text-text-muted">
                    Run command{reason ? "" : ""}
                </span>
                {reason ? (
                    <Tooltip content={reason} side="top">
                        <Icon name="info" size={12} className="shrink-0 text-text-disabled" />
                    </Tooltip>
                ) : null}
            </div>
            <div>
                <div className="max-h-[96px] pt-2 px-3 min-h-[64px] border-t border-border overflow-y-auto custom-scrollbar font-mono text-sm text-text-primary whitespace-pre-wrap break-words">
                    <span className="select-none text-text-disabled">$ </span>
                    {command}
                </div>
            </div>
            <div className="flex items-center justify-between gap-2 px-2 py-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild disabled={isProcessing}>
                        <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            disabled={isProcessing}
                            aria-label="Approval mode for future agent commands"
                        >
                            {AUTO_RUN_OPTIONS.find((o) => o.value === settings.ai.autoRunMode)?.label
                                ?? "Ask every time"}
                            <Icon name="expand_more" size={14} className="opacity-70" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                        {AUTO_RUN_OPTIONS.map((opt) => {
                            const selected = settings.ai.autoRunMode === opt.value;
                            return (
                                <DropdownMenuItem
                                    key={opt.value}
                                    onClick={() =>
                                        updateSettingSection("ai", { autoRunMode: opt.value })
                                    }
                                    className={cn(
                                        "flex w-full cursor-pointer items-center",
                                        selected && "bg-panel-hover",
                                    )}
                                >
                                    <span className="flex-1 text-sm text-text-primary">{opt.label}</span>
                                    {selected ? (
                                        <Icon name="check" size={16} className="text-text-primary" />
                                    ) : null}
                                </DropdownMenuItem>
                            );
                        })}
                    </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex shrink-0 items-center gap-1.5">
                    <Button type="button" variant="ghost" size="xs" disabled={isProcessing} onClick={onSkip}>
                        Skip
                    </Button>
                    <Button type="button" variant="default" size="xs" disabled={isProcessing} onClick={onRun}>
                        Run
                        <span className="ml-1.5 inline-flex items-center gap-0.5">
                            <kbd className="inline-flex min-w-[1.1rem] items-center justify-center rounded px-1 py-px font-sans text-xs leading-none text-text-foreground">
                                ↵
                            </kbd>
                        </span>
                    </Button>
                </div>
            </div>
        </div>
    );
}

/** Compact terminal row for finished/rejected states + live card while running. */
export function TerminalCommandStep({ block }: { block: Chunk }) {
    const command = (block.command || block.content || "").trim();
    const chunkStatus = block.commandStatus || "completed";
    const [localStatus, setLocalStatus] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [outputOpen, setOutputOpen] = useState(false);

    // Live events can outrun the transcript chunk (approval → start → exit).
    const couldBeLive =
        chunkStatus === "pending"
        || chunkStatus === "running"
        || chunkStatus === "background"
        || Boolean(block.isGenerating);
    const stream = useAgentTerminalStream(block.commandId, couldBeLive);

    // Approval resolution flips the card before any stream/chunk update lands.
    useEffect(() => {
        if (chunkStatus !== "pending" || !block.commandId) return;
        let disposed = false;
        const unlistenPromise = listen<{ id?: string; approved?: boolean }>(
            "agent-command-resolved",
            (event) => {
                if (disposed || event.payload?.id !== block.commandId) return;
                setLocalStatus(event.payload?.approved ? "running" : "rejected");
            },
        );
        return () => {
            disposed = true;
            void unlistenPromise.then((unlisten) => unlisten()).catch(() => { /* ignore */ });
        };
    }, [chunkStatus, block.commandId]);

    const effectiveStatus = useMemo(() => {
        if (stream.phase === "finished") {
            if (stream.cancelled) return "cancelled";
            return (stream.exitCode ?? 0) === 0 ? "completed" : "failed";
        }
        if (stream.phase === "running") return "running";
        if (stream.phase === "background") return "background";
        if (localStatus) return localStatus;
        return chunkStatus;
    }, [stream.phase, stream.cancelled, stream.exitCode, localStatus, chunkStatus]);

    const exitCode = stream.exitCode ?? block.exitCode;

    const handleRun = useCallback(() => {
        if (!block.commandId || isProcessing) return;
        setIsProcessing(true);
        void commands
            .approveTerminalCommand(block.commandId)
            .then(() => setLocalStatus("running"))
            .catch(() => setLocalStatus("error"))
            .finally(() => setIsProcessing(false));
    }, [block.commandId, isProcessing]);

    const handleSkip = useCallback(() => {
        if (!block.commandId || isProcessing) return;
        setIsProcessing(true);
        void commands
            .rejectTerminalCommand(block.commandId)
            .then(() => setLocalStatus("rejected"))
            .catch(() => setLocalStatus("error"))
            .finally(() => setIsProcessing(false));
    }, [block.commandId, isProcessing]);

    if (effectiveStatus === "pending") {
        return (
            <CommandApprovalCard
                command={command}
                reason={block.commandReason}
                isProcessing={isProcessing}
                onRun={handleRun}
                onSkip={handleSkip}
            />
        );
    }

    if (effectiveStatus === "rejected" || effectiveStatus === "blocked") {
        const label = effectiveStatus === "rejected" ? "Rejected command" : "Blocked command";
        return (
            <div className="my-1 overflow-hidden rounded-xl border border-border bg-transparent">
                <div className="flex items-center gap-2 px-3 py-2">
                    <Icon name="block" size={13} className="shrink-0 text-text-muted" />
                    <span className="truncate text-xs text-text-muted">{label}</span>
                </div>
                <div className="border-t border-border px-3 py-2">
                    <span className="font-mono text-sm text-text-disabled line-through whitespace-pre-wrap break-words">
                        <span className="select-none">$ </span>
                        {command}
                    </span>
                </div>
            </div>
        );
    }

    if (effectiveStatus === "running" || effectiveStatus === "background") {
        const liveText = stream.output || stripTerminalChunkOutput(block);
        return (
            <div className="my-1 overflow-hidden rounded-xl border border-border bg-transparent">
                <div className="flex items-center gap-2 px-3 py-2">
                    <div className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-text-muted border-t-transparent" />
                    <span className="truncate text-xs text-text-muted">
                        {effectiveStatus === "background" ? "Running in background" : "Running command"}
                    </span>
                </div>
                <div className="border-t border-border px-3 py-2">
                    <div className="font-mono text-sm text-text-primary whitespace-pre-wrap break-words">
                        <span className="select-none text-text-disabled">$ </span>
                        {command}
                    </div>
                    {stream.waitingForInput ? (
                        <div className="mt-2 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                            Waiting for input — the agent can answer with write_to_terminal, or stop the turn.
                        </div>
                    ) : null}
                    <div className="mt-2">
                        <LiveTerminalOutput text={liveText} />
                    </div>
                </div>
            </div>
        );
    }

    // Terminal finished states: completed / failed / cancelled / error.
    const staticOutput = stream.output || stripTerminalChunkOutput(block);
    const failed = effectiveStatus === "failed" || (typeof exitCode === "number" && exitCode !== 0);
    const cancelled = effectiveStatus === "cancelled";
    const hasOutput = staticOutput.trim().length > 0;
    const statusLabel = cancelled
        ? "Cancelled command"
        : failed
          ? "Failed command"
          : "Ran command";

    return (
        <div className="my-1 overflow-hidden rounded-xl border border-border bg-transparent">
            <button
                type="button"
                onClick={() => hasOutput && setOutputOpen((v) => !v)}
                className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left",
                    hasOutput && "cursor-pointer hover:bg-panel-hover/40 transition-colors",
                )}
            >
                <Icon
                    name={cancelled ? "cancel" : failed ? "error" : "terminal"}
                    size={13}
                    className="shrink-0 text-text-muted"
                />
                <span className="truncate text-xs text-text-muted">{statusLabel}</span>
                {failed && !cancelled && typeof exitCode === "number" ? (
                    <span className="shrink-0 rounded bg-error/15 px-1 py-px text-[10px] font-medium text-error">
                        exit {exitCode}
                    </span>
                ) : null}
                {hasOutput ? (
                    <Icon
                        name={outputOpen ? "expand_less" : "expand_more"}
                        size={14}
                        className="ml-auto shrink-0 text-text-muted"
                    />
                ) : null}
            </button>
            <div className="border-t border-border px-3 py-2">
                <div className="font-mono text-sm text-text-primary whitespace-pre-wrap break-words">
                    <span className="select-none text-text-disabled">$ </span>
                    {command}
                </div>
                {outputOpen && hasOutput ? (
                    <div className="mt-2">
                        <LiveTerminalOutput text={staticOutput} maxHeight={240} />
                    </div>
                ) : null}
            </div>
        </div>
    );
}

/** Output portion of a persisted terminal chunk (body minus the command line). */
function stripTerminalChunkOutput(block: Chunk): string {
    const content = block.content || "";
    const command = (block.command || "").trim();
    const lines = content.split("\n");
    if (lines[0]?.trim() === command) {
        return lines.slice(1).join("\n").trim();
    }
    return content.trim() === command ? "" : content.trim();
}
