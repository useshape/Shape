"use client";

import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll";
import type { WorkflowJob } from "./types";

export function LogsPanel({
    selectedJob,
    selectedRunId,
    logs,
    loadingLogs,
    logRef,
    highlight,
    stepFilterActive,
    onReload,
    onFailedOnly,
    onToggleStepFilter,
}: {
    selectedJob: WorkflowJob | null;
    selectedRunId: number | null;
    logs: string;
    loadingLogs: boolean;
    logRef: RefObject<HTMLPreElement | null>;
    /** Step name currently focused. */
    highlight?: string | null;
    /** True when the visible log is filtered to that step. */
    stepFilterActive?: boolean;
    onReload: () => void;
    onFailedOnly: () => void;
    onToggleStepFilter?: () => void;
}) {
    const jobIncomplete =
        selectedJob != null &&
        selectedJob.status !== "completed" &&
        selectedJob.conclusion == null;

    let body = logs;
    if (loadingLogs) body = "Loading logs…";
    else if (!logs && jobIncomplete) {
        body = `Logs will be available when “${selectedJob?.name}” finishes (status: ${selectedJob?.status}).`;
    } else if (!logs) {
        body = selectedRunId
            ? "No logs loaded. Select a completed job or click Reload."
            : "Select a workflow run to view logs.";
    }

    return (
        <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden border border-border-subtle bg-editor">
            <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5">
                <div className="min-w-0 truncate text-2xs text-text-muted">
                    Logs
                    {selectedJob ? ` · ${selectedJob.name}` : " · run (all jobs)"}
                    {highlight ? ` · ${highlight}` : ""}
                    {stepFilterActive ? " (step only)" : ""}
                </div>
                <div className="flex shrink-0 gap-1">
                    {highlight && onToggleStepFilter ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-2xs"
                            disabled={loadingLogs}
                            onClick={onToggleStepFilter}
                        >
                            {stepFilterActive ? "Full job log" : "This step only"}
                        </Button>
                    ) : null}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-2xs"
                        disabled={!selectedRunId || loadingLogs}
                        onClick={onReload}
                    >
                        Reload
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-2xs"
                        disabled={!selectedRunId || loadingLogs}
                        onClick={onFailedOnly}
                    >
                        Failed only
                    </Button>
                </div>
            </div>
            <ScrollArea className="min-h-0 flex-1">
                <pre
                    ref={logRef}
                    className="break-all px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-text-secondary"
                >
                    {body}
                </pre>
            </ScrollArea>
        </div>
    );
}
