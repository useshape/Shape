"use client";

import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll";
import { cn } from "@/lib/utils";
import type { WorkflowRun } from "./types";
import { actorAvatarUrl, formatRelative, statusIcon, statusTone } from "./utils";

function RunStatusIcon({
    status,
    conclusion,
}: {
    status?: string;
    conclusion?: string | null;
}) {
    const icon = statusIcon(status, conclusion);
    return (
        <Icon
            name={icon.name}
            filled={icon.filled}
            size={16}
            className={cn(
                "mt-0.5 shrink-0",
                statusTone(status, conclusion),
                icon.spin && "animate-spin",
            )}
        />
    );
}

export function RunsList({
    runs,
    selectedRunId,
    loading,
    onSelect,
}: {
    runs: WorkflowRun[];
    selectedRunId: number | null;
    loading: boolean;
    onSelect: (id: number) => void;
}) {
    return (
        <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden bg-panel border border-border-subtle">
            <div className="px-2 py-1.5 text-2xs font-medium text-text-muted">
                Workflow runs {loading ? "…" : `(${runs.length})`}
            </div>
            <ScrollArea className="min-h-0 flex-1">
                {runs.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-text-muted">No runs match.</p>
                ) : (
                    runs.map((run) => {
                        const avatar = actorAvatarUrl(run.actor);
                        return (
                            <Button
                                key={run.id}
                                variant="ghost"
                                onClick={() => onSelect(run.id)}
                                className={cn(
                                    "h-auto w-full flex-col items-stretch gap-0.5 rounded-none px-3 py-2 text-left font-normal",
                                    selectedRunId === run.id
                                        ? "bg-panel-hover"
                                        : "hover:bg-panel-hover/60",
                                )}
                            >
                                <div className="flex items-start gap-2">
                                    <RunStatusIcon
                                        status={run.status}
                                        conclusion={run.conclusion}
                                    />
                                    <span className="min-w-0 flex-1 line-clamp-2 text-sm leading-snug text-text-primary">
                                        {run.display_title || run.name}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 pl-6 text-2xs text-text-muted">
                                    <span className="min-w-0 truncate">
                                        #{run.run_number ?? run.id}
                                        {run.head_branch ? ` · ${run.head_branch}` : ""}
                                        {run.event ? ` · ${run.event}` : ""}
                                        {run.updated_at
                                            ? ` · ${formatRelative(run.updated_at)}`
                                            : ""}
                                    </span>
                                    {avatar ? (
                                        <img
                                            src={avatar}
                                            alt={
                                                run.actor?.login
                                                    ? `${run.actor.login}'s avatar`
                                                    : "Actor avatar"
                                            }
                                            className="ml-auto size-4 shrink-0 rounded-full"
                                            loading="lazy"
                                        />
                                    ) : null}
                                </div>
                            </Button>
                        );
                    })
                )}
            </ScrollArea>
        </div>
    );
}
