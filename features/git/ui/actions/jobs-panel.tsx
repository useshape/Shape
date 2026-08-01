"use client";

import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll";
import { cn } from "@/lib/utils";
import type { WorkflowJob } from "./types";
import { durationLabel, statusIcon, statusTone } from "./utils";

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

export function JobsPanel({
    jobs,
    selectedJobId,
    expandedJobs,
    loading,
    onToggleJob,
    onViewLogs,
    onOpenUrl,
}: {
    jobs: WorkflowJob[];
    selectedJobId: number | null;
    expandedJobs: Set<number>;
    loading: boolean;
    onToggleJob: (jobId: number) => void;
    onViewLogs: (jobId: number) => void;
    onOpenUrl: (url?: string) => void;
}) {
    return (
        <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden bg-panel border border-border-subtle">
            <div className="px-2 py-1.5 text-2xs font-medium text-text-muted">
                Jobs {loading ? "…" : `(${jobs.length})`}
            </div>
            <ScrollArea className="min-h-0 flex-1">
                {jobs.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-text-muted">No jobs yet.</p>
                ) : (
                    jobs.map((job) => {
                        const open = expandedJobs.has(job.id);
                        return (
                            <div
                                key={job.id}
                                className={cn(
                                    selectedJobId === job.id && "bg-panel-hover/50",
                                )}
                            >
                                <Button
                                    variant="ghost"
                                    className="h-auto w-full items-start gap-1 rounded-none px-2 py-2 text-left font-normal"
                                    onClick={() => onToggleJob(job.id)}
                                >
                                    <Icon
                                        name={open ? "expand_more" : "chevron_right"}
                                        size={14}
                                        className="mt-0.5 shrink-0 text-text-muted"
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
                                {open && job.steps && job.steps.length > 0 ? (
                                    <ul className="pb-2 pl-7 pr-2">
                                        {job.steps.map((step) => (
                                            <li
                                                key={`${job.id}-${step.number}`}
                                                className="flex items-center gap-2 rounded px-1.5 py-1 text-xs"
                                            >
                                                <JobStatusIcon
                                                    status={step.status}
                                                    conclusion={step.conclusion}
                                                    size={12}
                                                />
                                                <span className="min-w-0 flex-1 truncate">
                                                    {step.number}. {step.name}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                                {open ? (
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
                                ) : null}
                            </div>
                        );
                    })
                )}
            </ScrollArea>
        </div>
    );
}
