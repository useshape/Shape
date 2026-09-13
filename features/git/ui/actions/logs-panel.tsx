"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll";
import { commands } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { getShapeAccessToken } from "@/lib/cloud/store";
import type { WorkflowJob } from "./types";

export function LogsPanel({
    selectedJob,
    selectedRunId,
    logs,
    loadingLogs,
    logRef,
    highlight,
    stepFilterActive,
    explainContext,
    onReload,
    onFailedOnly,
    onToggleStepFilter,
}: {
    selectedJob: WorkflowJob | null;
    selectedRunId: number | null;
    logs: string;
    loadingLogs: boolean;
    logRef: RefObject<HTMLPreElement | null>;
    highlight?: string | null;
    stepFilterActive?: boolean;
    explainContext?: string | null;
    onReload: () => void;
    onFailedOnly: () => void;
    onToggleStepFilter?: () => void;
}) {
    const [aiText, setAiText] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const autoKey = useRef<string | null>(null);

    useEffect(() => {
        setAiText(null);
        setAiLoading(false);
        autoKey.current = null;
    }, [selectedRunId, selectedJob?.id, highlight, stepFilterActive]);

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

    const canExplain =
        !!logs.trim() &&
        !loadingLogs &&
        !logs.startsWith("Loading") &&
        !jobIncomplete;

    const jobFailed = selectedJob?.conclusion === "failure";

    useEffect(() => {
        if (!jobFailed || !canExplain) return;
        const key = `${selectedRunId}:${selectedJob?.id}:${highlight ?? ""}:${stepFilterActive ? 1 : 0}`;
        if (autoKey.current === key) return;
        const token = getShapeAccessToken();
        if (!token) return;
        autoKey.current = key;
        let cancelled = false;
        setAiLoading(true);
        void (async () => {
            try {
                const parts = [
                    explainContext?.trim(),
                    selectedJob ? `Job: ${selectedJob.name}` : null,
                    selectedJob?.conclusion ? `Conclusion: ${selectedJob.conclusion}` : null,
                    highlight ? `Step focus: ${highlight}` : null,
                    selectedRunId != null ? `Run id: ${selectedRunId}` : null,
                ].filter(Boolean);
                const text = await commands.explainCiLog(
                    logs,
                    parts.join("\n") || null,
                    token,
                );
                if (!cancelled) setAiText(text.trim());
                void import("@/lib/cloud/store")
                    .then(({ refreshShapeAuth }) => {
                        void refreshShapeAuth();
                    })
                    .catch(() => undefined);
            } catch (err) {
                if (!cancelled) {
                    const msg = err instanceof Error ? err.message : String(err);
                    notify.error("AI Error", msg);
                }
            } finally {
                if (!cancelled) setAiLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [
        jobFailed,
        canExplain,
        logs,
        selectedJob,
        selectedRunId,
        highlight,
        stepFilterActive,
        explainContext,
    ]);

    return (
        <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-2 px-3">
                <div className="min-w-0 truncate text-xs text-text-muted">
                    Logs
                    {selectedJob ? ` · ${selectedJob.name}` : " · run (all jobs)"}
                    {highlight ? ` · ${highlight}` : ""}
                    {stepFilterActive ? " (step only)" : ""}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {highlight && onToggleStepFilter ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            disabled={loadingLogs}
                            onClick={onToggleStepFilter}
                        >
                            {stepFilterActive ? "Full job log" : "This step only"}
                        </Button>
                    ) : null}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={!selectedRunId || loadingLogs}
                        onClick={onReload}
                    >
                        Reload
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={!selectedRunId || loadingLogs}
                        onClick={onFailedOnly}
                    >
                        Failed only
                    </Button>
                </div>
            </div>
            {jobFailed && (aiLoading || aiText) ? (
                <div className="mx-3 mb-2 shrink-0 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-text-primary">
                    <div className="mb-1 text-2xs font-medium uppercase tracking-wide text-error">
                        Failure summary
                    </div>
                    {aiLoading && !aiText ? (
                        <p className="text-text-muted">Analyzing log…</p>
                    ) : (
                        <p className="whitespace-pre-wrap leading-relaxed">{aiText}</p>
                    )}
                </div>
            ) : null}
            <ScrollArea className="min-h-0 flex-1">
                <pre
                    ref={logRef}
                    className="whitespace-pre-wrap break-all px-3 py-2 font-mono text-2xs leading-relaxed text-text-secondary"
                >
                    {body}
                </pre>
            </ScrollArea>
        </div>
    );
}
