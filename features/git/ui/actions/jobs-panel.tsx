"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll";
import { cn } from "@/lib/utils";
import type { WorkflowJob, WorkflowStep } from "./types";
import { durationLabel, statusIcon, statusTone } from "./utils";
import { GitListSkeleton } from "@/features/git/ui/shared/skeletons";

function JobStatusIcon({
    status,
    conclusion,
    size = 14,
}: {
    status?: string;
    conclusion?: string | null;
    size?: number;
}) {
    const icon = statusIcon(status, conclusion);
    return (
        <Icon
            name={icon.name}
            filled={icon.filled}
            size={size}
            className={cn(
                "shrink-0",
                statusTone(status, conclusion),
                icon.spin && "animate-spin",
            )}
        />
    );
}

function AnimatedCollapse({ open, children }: { open: boolean; children: ReactNode }) {
    return (
        <div
            className={cn(
                "grid transition-[grid-template-rows,opacity] duration-200 ease-[var(--ease-out)]",
                open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
            )}
        >
            <div className="min-h-0 overflow-hidden">{children}</div>
        </div>
    );
}

export function JobsPanel({
    jobs,
    selectedJobId,
    expandedJobs,
    loading,
    mode = "jobs",
    onToggleJob,
    onViewLogs,
    onOpenUrl,
    onSelectStep,
}: {
    jobs: WorkflowJob[];
    selectedJobId: number | null;
    expandedJobs: Set<number>;
    loading: boolean;
    /** Flat step list for the Steps nav focus. */
    mode?: "jobs" | "steps";
    onToggleJob: (jobId: number) => void;
    onViewLogs: (jobId: number) => void;
    onOpenUrl: (url?: string) => void;
    onSelectStep?: (jobId: number, step: WorkflowStep) => void;
}) {
    if (mode === "steps") {
        const flat = jobs.flatMap((job) =>
            (job.steps ?? []).map((step) => ({ job, step })),
        );
        return (
            <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden border border-border-subtle bg-panel">
                <div className="shrink-0 px-2 py-1.5 text-2xs font-medium text-text-muted">
                    Steps {loading ? "…" : `(${flat.length})`}
                </div>
                <ScrollArea className="min-h-0 flex-1" fadeFrom="from-panel">
                    {loading && flat.length === 0 ? (
                        <GitListSkeleton rows={8} />
                    ) : flat.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-text-muted">No steps yet.</p>
                    ) : (
                        <ul className="flex flex-col gap-0.5 p-1">
                            {flat.map(({ job, step }) => (
                                <li key={`${job.id}-${step.number}`}>
                                    <button
                                        type="button"
                                        className={cn(
                                            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs",
                                            selectedJobId === job.id
                                                ? "bg-panel-hover"
                                                : "hover:bg-panel-hover/60",
                                        )}
                                        onClick={() => onSelectStep?.(job.id, step)}
                                    >
                                        <JobStatusIcon
                                            status={step.status}
                                            conclusion={step.conclusion}
                                            size={12}
                                        />
                                        <span className="min-w-0 flex-1 truncate text-text-primary">
                                            {step.number}. {step.name}
                                        </span>
                                        <span className="max-w-[40%] shrink-0 truncate text-2xs text-text-muted">
                                            {job.name}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </ScrollArea>
            </div>
        );
    }

    return (
        <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden border border-border-subtle bg-panel">
            <div className="shrink-0 px-2 py-1.5 text-2xs font-medium text-text-muted">
                Jobs {loading ? "…" : `(${jobs.length})`}
            </div>
            <ScrollArea className="min-h-0 flex-1" fadeFrom="from-panel">
                {loading && jobs.length === 0 ? (
                    <GitListSkeleton rows={6} />
                ) : jobs.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-text-muted">No jobs yet.</p>
                ) : (
                    jobs.map((job) => {
                        const open = expandedJobs.has(job.id);
                        return (
                            <div
                                key={job.id}
                                className={cn(selectedJobId === job.id && "bg-panel-hover/50")}
                            >
                                <Button
                                    variant="ghost"
                                    className="h-auto w-full items-start gap-1 rounded-none px-2 py-2 text-left font-normal"
                                    onClick={() => onToggleJob(job.id)}
                                >
                                    <Icon
                                        name="chevron_right"
                                        size={14}
                                        className={cn(
                                            "mt-0.5 shrink-0 text-text-muted transition-transform duration-200 ease-[var(--ease-out)]",
                                            open && "rotate-90",
                                        )}
                                    />
                                    <JobStatusIcon
                                        status={job.status}
                                        conclusion={job.conclusion}
                                        size={16}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm text-text-primary">
                                            {job.name}
                                        </div>
                                        <div className="text-2xs text-text-muted">
                                            {durationLabel(job.started_at, job.completed_at)}
                                            {(job.steps?.length ?? 0) > 0
                                                ? ` · ${job.steps!.length} steps`
                                                : ""}
                                        </div>
                                    </div>
                                </Button>
                                <AnimatedCollapse open={open}>
                                    {job.steps && job.steps.length > 0 ? (
                                        <ul className="pb-2 pl-7 pr-2">
                                            {job.steps.map((step) => (
                                                <li key={`${job.id}-${step.number}`}>
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-panel-hover/60"
                                                        onClick={() => onSelectStep?.(job.id, step)}
                                                    >
                                                        <JobStatusIcon
                                                            status={step.status}
                                                            conclusion={step.conclusion}
                                                            size={12}
                                                        />
                                                        <span className="min-w-0 flex-1 truncate">
                                                            {step.number}. {step.name}
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : null}
                                    <div className="flex gap-1 px-2 pb-2 pl-7">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 gap-1 px-2 text-2xs"
                                            onClick={() => onViewLogs(job.id)}
                                        >
                                            <Icon name="terminal" size={12} />
                                            View logs
                                        </Button>
                                        {job.html_url ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 gap-1 px-2 text-2xs"
                                                onClick={() => onOpenUrl(job.html_url)}
                                            >
                                                <Icon name="github" size={12} />
                                                GitHub
                                            </Button>
                                        ) : null}
                                    </div>
                                </AnimatedCollapse>
                            </div>
                        );
                    })
                )}
            </ScrollArea>
        </div>
    );
}
