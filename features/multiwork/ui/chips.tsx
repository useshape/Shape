"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { stripOrphanThinkTags } from "@/features/chat/ui/md/stream";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import {
    getWorkers,
    isMultiworkMode,
    openWorker,
    subscribeMultiwork,
    type MultiworkWorker,
} from "../session/store";

/** Turn worker tokens into a short readable window. Drops tool markup. */
export function agentWindowText(raw: string): string {
    let text = raw.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, (block) => {
        const inner = block.replace(/<\/?think[^>]*>/gi, "").replace(/\s+/g, " ").trim();
        return inner ? `${inner} ` : "";
    });
    text = text.replace(/<think\b[^>]*>[\s\S]*$/i, (block) => {
        const inner = block.replace(/<think\b[^>]*>/i, "").replace(/\s+/g, " ").trim();
        return inner ? `${inner} ` : "";
    });
    text = text.replace(/<edit\b[^>]*\bfile="([^"]*)"[^>]*>/gi, (_, file: string) => {
        const name = file.split(/[\\/]/).pop() || file;
        return `Editing ${name} `;
    });
    text = text.replace(/<terminal_command\b[^>]*>([\s\S]*?)<\/terminal_command>/gi, (_, cmd: string) => {
        const line = cmd.trim().split("\n")[0] ?? "";
        return line ? `Running ${line.slice(0, 80)} ` : "";
    });
    text = text.replace(/<[^>\n]{0,120}>/g, " ");
    text = stripOrphanThinkTags(text).replace(/\s+/g, " ").trim();
    if (text.length <= 220) return text;
    return text.slice(-220).replace(/^\S*\s/, "");
}

function windowCopy(worker: MultiworkWorker): string {
    const live = agentWindowText(worker.live || "");
    if (live) return live;
    const transcript = agentWindowText(worker.transcript || "");
    if (transcript) return transcript;
    const activity = agentWindowText(worker.activity || "");
    if (activity && activity !== "Working…" && activity !== "Starting…") return activity;
    const task = agentWindowText(worker.task || "");
    return task || "Working…";
}

function toneClass(worker: MultiworkWorker): string {
    if (worker.status === "error") return "bg-error";
    if (worker.column === "done" || worker.status === "done") return "bg-success";
    if (worker.column === "review") return "bg-warning";
    return "bg-accent";
}

/** One edited-files-style menu for every agent in this Multiwork chat. */
export function MultiworkAgentChips() {
    const on = useSyncExternalStore(subscribeMultiwork, isMultiworkMode, () => false);
    const workers = useSyncExternalStore(subscribeMultiwork, getWorkers, getWorkers);
    if (!on || workers.length === 0) return null;
    const live = workers.filter((w) => w.status === "running" || w.status === "pending").length;

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="flex h-6 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                >
                    Agents
                    <span className="tabular-nums text-text-muted">
                        {workers.length}
                        {live ? ` · ${live}` : ""}
                    </span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" sideOffset={6} className="w-[28rem]">
                <div className={cn("grid gap-1.5 p-1", workers.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                    {workers.map((worker) => (
                        <button
                            key={worker.id}
                            type="button"
                            onClick={() => openWorker(worker.id)}
                            className="flex min-h-[7.5rem] flex-col gap-1.5 rounded-lg bg-surface-1 px-2.5 py-2 text-left hover:bg-panel-hover"
                        >
                            <span className="flex min-w-0 items-center gap-1.5">
                                <span className={cn("size-1.5 shrink-0 rounded-full", toneClass(worker))} aria-hidden />
                                <span className="block min-w-0 flex-1 overflow-hidden whitespace-nowrap text-sm text-text-primary [mask-image:linear-gradient(to_right,#000_0,#000_calc(100%-1.25rem),transparent)]">
                                    {worker.title}
                                </span>
                            </span>
                            <span className="line-clamp-4 text-xs leading-relaxed text-text-secondary">
                                {windowCopy(worker)}
                            </span>
                        </button>
                    ))}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
