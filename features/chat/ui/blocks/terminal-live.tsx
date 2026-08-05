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
                });
            } else if (payload.kind === "data" && payload.data) {
                bufferRef.current = (bufferRef.current + stripAnsi(payload.data)).slice(-OUTPUT_CAP);
                const output = bufferRef.current;
                setState((prev) => ({
                    ...prev,
                    phase: prev.phase === "idle" ? "running" : prev.phase,
                    output,
                    sessionId: payload.sessionId ?? prev.sessionId,
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
        <div className="my-1 overflow-hidden rounded-lg border border-border-subtle bg-panel">
            <div className="flex items-center gap-2 px-3 pt-2">
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
            <div className="px-3 py-1.5">
                <div className="max-h-[96px] overflow-y-auto custom-scrollbar rounded-md bg-background/60 px-2.5 py-1.5 font-mono text-xs text-text-primary whitespace-pre-wrap break-words">
                    <span className="select-none text-text-disabled">$ </span>
                    {command}
                </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border-subtle px-2.5 py-1.5">
                <Tooltip content="Approval mode for future agent commands" side="top">
                    <select
                        value={settings.ai.autoRunMode}
                        disabled={isProcessing}
                        onChange={(e) =>
                            updateSettingSection("ai", {
                                autoRunMode: e.target.value as AutoRunModeSetting,
                            })
                        }
                        className="h-6 rounded-md border border-border-subtle bg-transparent px-1.5 text-xs text-text-muted outline-none hover:text-text-secondary focus:border-border"
                    >
                        {AUTO_RUN_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </Tooltip>
                <div className="flex shrink-0 items-center gap-1.5">
                    <Button type="button" variant="ghost" size="xs" disabled={isProcessing} onClick={onSkip}>
                        Skip
                    </Button>
                    <Button type="button" variant="default" size="xs" disabled={isProcessing} onClick={onRun}>
                        Run
                        <span className="ml-1.5 inline-flex items-center gap-0.5">
                            <kbd className="inline-flex min-w-[1.1rem] items-center justify-center rounded bg-background px-1 py-px font-sans text-xs leading-none text-text-foreground">
                                {mod}
                            </kbd>
                            <kbd className="inline-flex min-w-[1.1rem] items-center justify-center rounded bg-background px-1 py-px font-sans text-xs leading-none text-text-foreground">
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
        chunkStatus === "pending" || chunkStatus === "background" || Boolean(block.isGenerating);
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
            <div className="my-1 flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-panel/60 px-2.5 py-1.5">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Icon name="terminal" size={13} className="shrink-0 text-text-disabled" />
                    <span className="shrink-0 text-xs text-text-muted">{label}:</span>
                    <span className="truncate font-mono text-[11px] text-text-disabled line-through">
                        {command}
                    </span>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-xs text-text-disabled">
                    <Icon name="block" size={12} />
                    {effectiveStatus === "rejected" ? "Rejected" : "Blocked"}
                </span>
            </div>
        );
    }

    if (effectiveStatus === "running" || effectiveStatus === "background") {
        const liveText = stream.output || stripTerminalChunkOutput(block);
        return (
            <div className="py-0.5">
                <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    <div className="h-2.5 w-2.5 shrink-0 animate-spin rounded-full border-[1.5px] border-text-muted border-t-transparent" />
                    <span>
                        {effectiveStatus === "background" ? "Running in background" : "Running"}{" "}
                        <span className="font-mono text-[11px] text-text-secondary">{command}</span>
                    </span>
                </div>
                <LiveTerminalOutput text={liveText} />
            </div>
        );
    }

    // Terminal finished states: completed / failed / cancelled / error.
    const staticOutput = stream.output || stripTerminalChunkOutput(block);
    const failed = effectiveStatus === "failed" || (typeof exitCode === "number" && exitCode !== 0);
    const cancelled = effectiveStatus === "cancelled";
    const hasOutput = staticOutput.trim().length > 0;

    return (
        <div className="py-0.5">
            <button
                type="button"
                onClick={() => hasOutput && setOutputOpen((v) => !v)}
                className={cn(
                    "flex w-fit max-w-full items-center gap-1.5 text-left text-xs text-text-muted",
                    hasOutput && "cursor-pointer hover:text-text-primary transition-colors",
                )}
            >
                <span className="truncate">
                    {cancelled ? "Cancelled" : "Ran"}{" "}
                    <span className="font-mono text-[11px] text-text-secondary">{command}</span>
                </span>
                {failed && !cancelled ? (
                    <span className="shrink-0 rounded bg-error/15 px-1 py-px text-[10px] font-medium text-error">
                        exit {exitCode}
                    </span>
                ) : null}
                {hasOutput ? (
                    <Icon
                        name="chevron_right"
                        size={12}
                        className={cn(
                            "shrink-0 opacity-50 transition-transform duration-200",
                            outputOpen && "rotate-90",
                        )}
                    />
                ) : null}
            </button>
            {outputOpen && hasOutput ? <LiveTerminalOutput text={staticOutput} maxHeight={240} /> : null}
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
