"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll";
import { GitAiInsight } from "@/features/git/ui/shared/ai-insight";
import { AiActionButton } from "@/features/git/ui/shared/ai-action-button";
import { commands } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { getShapeAccessToken } from "@/lib/shape-auth/store";
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

    useEffect(() => {
        setAiText(null);
        setAiLoading(false);
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

    const handleExplain = async () => {
        if (!canExplain) return;
        const token = getShapeAccessToken();
        if (!token) {
            notify.error("AI Error", "Sign in to Shape to explain CI logs.");
            return;
        }
        setAiLoading(true);
        try {
            const parts = [
                explainContext?.trim(),
                selectedJob ? `Job: ${selectedJob.name}` : null,
                selectedJob?.conclusion ? `Conclusion: ${selectedJob.conclusion}` : null,
                highlight ? `Step focus: ${highlight}` : null,
                selectedRunId != null ? `Run id: ${selectedRunId}` : null,
            ].filter(Boolean);
            const text = await commands.explainCiLog(logs, parts.join("\n") || null, token);
            setAiText(text.trim());
            void import("@/lib/shape-auth/store")
                .then(({ refreshShapeAuth }) => {
                    void refreshShapeAuth();
                })
                .catch(() => undefined);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            notify.error("AI Error", msg);
        } finally {
            setAiLoading(false);
        }
    };

    return (
        <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden border border-border-subtle bg-editor">
            <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5">
                <div className="min-w-0 truncate text-2xs text-text-muted">
                    Logs
                    {selectedJob ? ` · ${selectedJob.name}` : " · run (all jobs)"}
                    {highlight ? ` · ${highlight}` : ""}
                    {stepFilterActive ? " (step only)" : ""}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <AiActionButton
                        loading={aiLoading}
                        disabled={!canExplain || aiLoading}
                        onClick={() => void handleExplain()}
                        className="h-6 text-2xs"
                    >
                        {aiLoading ? "Explaining…" : aiText ? "Re-explain" : "Explain failure"}
                    </AiActionButton>
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
            {aiText ? (
                <div className="shrink-0 border-b border-border-subtle/60 px-3 py-2">
                    <GitAiInsight
                        title="AI explanation"
                        content={aiText}
                        onDismiss={() => setAiText(null)}
                    />
                </div>
            ) : null}
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
