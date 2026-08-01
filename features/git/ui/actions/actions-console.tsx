"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll";
import { commands, useProjectState } from "@/lib/backend";
import { loginGitHub, useGitHubAuth } from "@/lib/github-auth/store";
import { cn } from "@/lib/utils";
import { Panel } from "@/features/panels";
import { useFilter } from "../manager/filter-context";
import {
    defaultTabForFocus,
    type ActionsFocus,
    type Artifact,
    type DetailTab,
    type WorkflowDef,
    type WorkflowJob,
    type WorkflowRun,
} from "./types";
import { formatBytes, formatRelative, parseApi, resolveOwnerRepo, statusIcon, statusLabel, statusTone, actorAvatarUrl } from "./utils";
import { Header } from "./header";
import { RunsList } from "./runs-list";
import { JobsPanel } from "./jobs-panel";
import { LogsPanel } from "./logs-panel";
import { formatCommandError } from "@/lib/format-error";
import { notify } from "@/features/notifications";

function reportActionsError(raw: unknown): void {
    const formatted = formatCommandError(raw, "GitHub");
    const text = formatted.hint
        ? `${formatted.message}\n${formatted.hint}`
        : formatted.message || formatted.title;
    notify.error(formatted.title, text);
}

export type { ActionsFocus } from "./types";
export { isActionsSection } from "./types";

export function ActionsConsole({ focus }: { focus: ActionsFocus }) {
    const { project_path } = useProjectState();
    const auth = useGitHubAuth();
    const { query } = useFilter();
    const [repo, setRepo] = useState<{ owner: string; repo: string } | null>(null);
    const [runs, setRuns] = useState<WorkflowRun[]>([]);
    const [workflows, setWorkflows] = useState<WorkflowDef[]>([]);
    const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
    const [jobs, setJobs] = useState<WorkflowJob[]>([]);
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
    const [expandedJobs, setExpandedJobs] = useState<Set<number>>(new Set());
    const [logs, setLogs] = useState("");
    const [loadingRuns, setLoadingRuns] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [busyAction, setBusyAction] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>(
        focus === "live-status" ? "in_progress" : "all",
    );
    const [detailTab, setDetailTab] = useState<DetailTab>(defaultTabForFocus(focus));
    const [live, setLive] = useState(focus === "live-status");
    const logRef = useRef<HTMLPreElement | null>(null);

    useEffect(() => {
        setDetailTab(defaultTabForFocus(focus));
        if (focus === "live-status") {
            setStatusFilter("in_progress");
            setLive(true);
        } else if (focus === "logs") {
            setDetailTab("jobs");
        } else if (focus === "artifacts") {
            setDetailTab("artifacts");
        } else if (focus === "workflow-definitions") {
            setDetailTab("workflows");
        }
    }, [focus]);

    const repoSlug = repo ? `${repo.owner}/${repo.repo}` : null;
    const selectedRun = useMemo(
        () => runs.find((r) => r.id === selectedRunId) ?? null,
        [runs, selectedRunId],
    );
    const selectedJob = useMemo(
        () => jobs.find((j) => j.id === selectedJobId) ?? null,
        [jobs, selectedJobId],
    );

    const filteredRuns = useMemo(() => {
        const q = query.trim().toLowerCase();
        return runs.filter((run) => {
            if (statusFilter === "in_progress") {
                if (run.status !== "in_progress" && run.status !== "queued") return false;
            } else if (statusFilter === "completed") {
                if (run.status !== "completed") return false;
            } else if (statusFilter === "failure") {
                if (run.conclusion !== "failure") return false;
            }
            if (!q) return true;
            const hay = [
                run.display_title,
                run.name,
                run.head_branch,
                run.event,
                String(run.run_number ?? ""),
                run.actor?.login,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return hay.includes(q);
        });
    }, [query, runs, statusFilter]);

    const loadRuns = useCallback(async () => {
        setLoadingRuns(true);
        try {
            const resolved = await resolveOwnerRepo(project_path);
            setRepo(resolved);
            if (!resolved) {
                setRuns([]);
                setWorkflows([]);
                return;
            }
            if (!auth.loggedIn) {
                setRuns([]);
                setWorkflows([]);
                return;
            }

            const statusQuery =
                statusFilter === "in_progress"
                    ? "&status=in_progress"
                    : statusFilter === "completed"
                      ? "&status=completed"
                      : "";
            const [runsRaw, workflowsRaw] = await Promise.all([
                parseApi(
                    `/repos/${resolved.owner}/${resolved.repo}/actions/runs?per_page=40${statusQuery}`,
                ),
                parseApi(`/repos/${resolved.owner}/${resolved.repo}/actions/workflows?per_page=50`),
            ]);
            const nextRuns =
                ((runsRaw as { workflow_runs?: WorkflowRun[] }).workflow_runs ?? []).map((r) => ({
                    ...r,
                    id: Number(r.id),
                }));
            const nextWorkflows =
                ((workflowsRaw as { workflows?: WorkflowDef[] }).workflows ?? []).map((w) => ({
                    ...w,
                    id: Number(w.id),
                }));
            setRuns(nextRuns);
            setWorkflows(nextWorkflows);

            setSelectedRunId((prev) => {
                if (prev && nextRuns.some((r) => r.id === prev)) return prev;
                if (focus === "logs") {
                    const failed = nextRuns.find((r) => r.conclusion === "failure");
                    return failed?.id ?? nextRuns[0]?.id ?? null;
                }
                return nextRuns[0]?.id ?? null;
            });
        } catch (e) {
            reportActionsError(e);
            setRuns([]);
        } finally {
            setLoadingRuns(false);
        }
    }, [auth.loggedIn, focus, project_path, statusFilter]);

    const loadRunDetail = useCallback(
        async (runId: number) => {
            if (!repo) return;
            setLoadingDetail(true);
            try {
                const [jobsRaw, artsRaw] = await Promise.all([
                    parseApi(
                        `/repos/${repo.owner}/${repo.repo}/actions/runs/${runId}/jobs?per_page=100`,
                    ),
                    parseApi(
                        `/repos/${repo.owner}/${repo.repo}/actions/runs/${runId}/artifacts?per_page=50`,
                    ),
                ]);
                const nextJobs = ((jobsRaw as { jobs?: WorkflowJob[] }).jobs ?? []).map((j) => ({
                    ...j,
                    id: Number(j.id),
                    steps: j.steps ?? [],
                }));
                const nextArts = ((artsRaw as { artifacts?: Artifact[] }).artifacts ?? []).map(
                    (a) => ({ ...a, id: Number(a.id) }),
                );
                setJobs(nextJobs);
                setArtifacts(nextArts);

                const preferFailed = focus === "logs" || focus === "steps";
                const pick =
                    (preferFailed
                        ? nextJobs.find((j) => j.conclusion === "failure")
                        : null) ??
                    nextJobs.find((j) => j.status === "in_progress") ??
                    nextJobs[0] ??
                    null;
                setSelectedJobId(pick?.id ?? null);
                if (pick) {
                    setExpandedJobs(new Set([pick.id]));
                } else {
                    setExpandedJobs(new Set());
                }
            } catch (e) {
                setJobs([]);
                setArtifacts([]);
                reportActionsError(e);
            } finally {
                setLoadingDetail(false);
            }
        },
        [focus, repo],
    );

    const loadLogs = useCallback(
        async (runId: number, jobId: number | null, failedOnly: boolean) => {
            if (!repoSlug) return;
            setLoadingLogs(true);
            try {
                const text = await commands.githubActionsLogs(
                    repoSlug,
                    runId,
                    jobId,
                    failedOnly,
                );
                setLogs(text || "(empty log)");
                requestAnimationFrame(() => {
                    if (logRef.current) logRef.current.scrollTop = 0;
                });
            } catch (e) {
                setLogs("");
                reportActionsError(e);
            } finally {
                setLoadingLogs(false);
            }
        },
        [repoSlug],
    );

    useEffect(() => {
        void loadRuns();
    }, [loadRuns]);

    useEffect(() => {
        if (!selectedRunId || !repo) {
            setJobs([]);
            setArtifacts([]);
            return;
        }
        void loadRunDetail(selectedRunId);
    }, [loadRunDetail, repo, selectedRunId]);

    useEffect(() => {
        if (!selectedRunId || detailTab !== "jobs") return;
        if (focus === "logs" || selectedJobId != null) {
            void loadLogs(selectedRunId, selectedJobId, focus === "logs" && !selectedJobId);
        }
    }, [detailTab, focus, loadLogs, selectedJobId, selectedRunId]);

    useEffect(() => {
        if (!live) return;
        const id = window.setInterval(() => {
            void loadRuns();
            if (selectedRunId) void loadRunDetail(selectedRunId);
        }, 12_000);
        return () => window.clearInterval(id);
    }, [live, loadRunDetail, loadRuns, selectedRunId]);

    const runAction = async (kind: "rerun" | "rerun-failed" | "cancel") => {
        if (!repo || !selectedRunId) return;
        setBusyAction(kind);
        try {
            const base = `/repos/${repo.owner}/${repo.repo}/actions/runs/${selectedRunId}`;
            const path =
                kind === "rerun"
                    ? `${base}/rerun`
                    : kind === "rerun-failed"
                      ? `${base}/rerun-failed-jobs`
                      : `${base}/cancel`;
            await commands.githubApiRequest("POST", path);
            await loadRuns();
            await loadRunDetail(selectedRunId);
        } catch (e) {
            reportActionsError(e);
        } finally {
            setBusyAction(null);
        }
    };

    const openUrl = (url?: string) => {
        if (!url) return;
        void commands.openUrlExternal(url);
    };

    const toggleJob = (jobId: number) => {
        setExpandedJobs((prev) => {
            const next = new Set(prev);
            if (next.has(jobId)) next.delete(jobId);
            else next.add(jobId);
            return next;
        });
        setSelectedJobId(jobId);
    };

    if (!auth.loggedIn) {
        return (
            <div className="flex h-full flex-col items-start gap-3 p-4">
                <h2 className="text-sm font-semibold">Actions</h2>
                <p className="text-sm text-text-muted">
                    Sign in with GitHub to browse workflow runs, jobs, logs, and artifacts.
                </p>
                <Button variant="secondary" size="sm" onClick={() => void loginGitHub()}>
                    Sign in with GitHub
                </Button>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <Header
                repoSlug={repoSlug}
                focus={focus}
                live={live}
                onLiveChange={setLive}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                loadingRuns={loadingRuns}
                onRefresh={() => void loadRuns()}
            />

            <Panel
                direction="horizontal"
                paneGap="var(--workbench-gap)"
                storageKey="git-actions-console-v2"
                hideSeparator
                className="min-h-0 flex-1"
                panes={[
                    {
                        id: "actions-runs",
                        preferredSize: 240,
                        minSize: 180,
                        maxSize: 320,
                        snap: true,
                        children: (
                            <RunsList
                                runs={filteredRuns}
                                selectedRunId={selectedRunId}
                                loading={loadingRuns}
                                onSelect={setSelectedRunId}
                            />
                        ),
                    },
                    {
                        id: "actions-detail",
                        flexible: true,
                        minSize: 280,
                        children: (
                            <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden bg-editor border border-border-subtle">
                                {!selectedRun ? (
                                    <div className="flex h-full items-center justify-center p-6 text-sm text-text-muted">
                                        Select a workflow run
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-3">
                                            <div className="flex min-w-0 flex-1 basis-[min(100%,18rem)] items-center gap-2">
                                                {(() => {
                                                    const runIcon = statusIcon(
                                                        selectedRun.status,
                                                        selectedRun.conclusion,
                                                    );
                                                    return (
                                                        <Icon
                                                            name={runIcon.name}
                                                            filled={runIcon.filled}
                                                            size={18}
                                                            className={cn(
                                                                "shrink-0",
                                                                statusTone(
                                                                    selectedRun.status,
                                                                    selectedRun.conclusion,
                                                                ),
                                                                runIcon.spin && "animate-spin",
                                                            )}
                                                        />
                                                    );
                                                })()}
                                                <div className="min-w-0 flex-1 truncate text-sm font-medium">
                                                    {selectedRun.display_title || selectedRun.name}
                                                    <span className="font-normal text-text-muted">
                                                        {" "}
                                                        · #{selectedRun.run_number ?? selectedRun.id}
                                                        {selectedRun.run_attempt &&
                                                        selectedRun.run_attempt > 1
                                                            ? ` attempt ${selectedRun.run_attempt}`
                                                            : ""}
                                                        {selectedRun.head_branch
                                                            ? ` · ${selectedRun.head_branch}`
                                                            : ""}
                                                    </span>
                                                </div>
                                                {selectedRun.actor?.login ? (
                                                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-text-muted">
                                                        {actorAvatarUrl(selectedRun.actor) ? (
                                                            <img
                                                                src={
                                                                    actorAvatarUrl(
                                                                        selectedRun.actor,
                                                                    )!
                                                                }
                                                                alt={`${selectedRun.actor.login}'s avatar`}
                                                                className="size-5 rounded-full"
                                                                loading="lazy"
                                                            />
                                                        ) : null}
                                                        {selectedRun.actor.login}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1">
                                            {repoSlug ? (
                                                <span className="flex shrink-0 items-center gap-1 text-xs text-text-muted">
                                                    <Icon name="github" size={14} />
                                                    {repoSlug}
                                                </span>
                                            ) : null}
                                            <span
                                                className={cn(
                                                    "shrink-0 text-sm capitalize",
                                                    statusTone(
                                                        selectedRun.status,
                                                        selectedRun.conclusion,
                                                    ),
                                                )}
                                            >
                                                {statusLabel(
                                                    selectedRun.status,
                                                    selectedRun.conclusion,
                                                )}
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={!!busyAction}
                                                onClick={() => void runAction("rerun")}
                                            >
                                                Re-run
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={!!busyAction}
                                                onClick={() => void runAction("rerun-failed")}
                                            >
                                                Re-run failed
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={
                                                    !!busyAction ||
                                                    selectedRun.status === "completed" ||
                                                    selectedRun.status === "cancelled"
                                                }
                                                onClick={() => void runAction("cancel")}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => openUrl(selectedRun.html_url)}
                                            >
                                                Open on GitHub
                                            </Button>
                                            </div>
                                        </div>

                                        <Tabs
                                            value={detailTab}
                                            onValueChange={(v) => setDetailTab(v as DetailTab)}
                                            className="flex min-h-0 flex-1 flex-col"
                                        >
                                            <div className="flex shrink-0 items-center px-2 py-1 pb-5">
                                                <TabsList>
                                                    <TabsTrigger value="jobs">
                                                        Jobs & steps
                                                    </TabsTrigger>
                                                    <TabsTrigger value="artifacts">
                                                        Artifacts ({artifacts.length})
                                                    </TabsTrigger>
                                                    <TabsTrigger value="workflows">
                                                        Workflows ({workflows.length})
                                                    </TabsTrigger>
                                                </TabsList>
                                            </div>

                                            <TabsContent
                                                value="workflows"
                                                className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
                                            >
                                                <ScrollArea className="h-full p-2">
                                                    {workflows.length === 0 ? (
                                                        <p className="px-2 py-3 text-sm text-text-muted">
                                                            No workflow definitions.
                                                        </p>
                                                    ) : (
                                                        <ul className="flex flex-col gap-0.5">
                                                            {workflows.map((wf) => (
                                                                <li key={wf.id}>
                                                                    <Button
                                                                        variant="ghost"
                                                                        className="h-auto w-full flex-col items-stretch gap-0.5 px-2 py-2 text-left font-normal"
                                                                        onClick={() =>
                                                                            openUrl(wf.html_url)
                                                                        }
                                                                    >
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <span className="text-sm text-text-primary">
                                                                                {wf.name}
                                                                            </span>
                                                                            <span className="text-2xs capitalize text-text-muted">
                                                                                {wf.state}
                                                                            </span>
                                                                        </div>
                                                                        <span className="truncate text-xs text-text-muted">
                                                                            {wf.path}
                                                                        </span>
                                                                    </Button>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </ScrollArea>
                                            </TabsContent>

                                            <TabsContent
                                                value="artifacts"
                                                className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
                                            >
                                                <ScrollArea className="h-full p-2">
                                                    {loadingDetail ? (
                                                        <p className="px-2 py-3 text-sm text-text-muted">
                                                            Loading…
                                                        </p>
                                                    ) : artifacts.length === 0 ? (
                                                        <p className="px-2 py-3 text-sm text-text-muted">
                                                            No artifacts for this run.
                                                        </p>
                                                    ) : (
                                                        <ul className="flex flex-col gap-0.5">
                                                            {artifacts.map((art) => (
                                                                <li
                                                                    key={art.id}
                                                                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-panel-hover"
                                                                >
                                                                    <div className="min-w-0">
                                                                        <div className="truncate text-sm">
                                                                            {art.name}
                                                                        </div>
                                                                        <div className="text-2xs text-text-muted">
                                                                            {[
                                                                                formatBytes(
                                                                                    art.size_in_bytes,
                                                                                ),
                                                                                art.expired
                                                                                    ? "expired"
                                                                                    : null,
                                                                                formatRelative(
                                                                                    art.created_at,
                                                                                ),
                                                                            ]
                                                                                .filter(Boolean)
                                                                                .join(" · ")}
                                                                        </div>
                                                                    </div>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-7 shrink-0 px-2"
                                                                        disabled={art.expired}
                                                                        onClick={() =>
                                                                            openUrl(
                                                                                `https://github.com/${repoSlug}/actions/runs/${selectedRunId}/artifacts/${art.id}`,
                                                                            )
                                                                        }
                                                                    >
                                                                        Download
                                                                    </Button>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </ScrollArea>
                                            </TabsContent>

                                            <TabsContent
                                                value="jobs"
                                                className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
                                            >
                                                <Panel
                                                    direction="vertical"
                                                    paneGap="var(--workbench-gap)"
                                                    storageKey="git-actions-jobs-logs-v2"
                                                    hideSeparator
                                                    className="h-full min-h-0"
                                                    panes={[
                                                        {
                                                            id: "actions-jobs",
                                                            preferredSize: 280,
                                                            minSize: 140,
                                                            maxSize: 520,
                                                            snap: true,
                                                            children: (
                                                                <JobsPanel
                                                                    jobs={jobs}
                                                                    selectedJobId={selectedJobId}
                                                                    expandedJobs={expandedJobs}
                                                                    loading={loadingDetail}
                                                                    onToggleJob={toggleJob}
                                                                    onViewLogs={(jobId) => {
                                                                        setSelectedJobId(jobId);
                                                                        if (selectedRunId) {
                                                                            void loadLogs(
                                                                                selectedRunId,
                                                                                jobId,
                                                                                false,
                                                                            );
                                                                        }
                                                                    }}
                                                                    onOpenUrl={openUrl}
                                                                />
                                                            ),
                                                        },
                                                        {
                                                            id: "actions-logs",
                                                            flexible: true,
                                                            minSize: 120,
                                                            children: (
                                                                <LogsPanel
                                                                    selectedJob={selectedJob}
                                                                    selectedRunId={selectedRunId}
                                                                    logs={logs}
                                                                    loadingLogs={loadingLogs}
                                                                    logRef={logRef}
                                                                    onReload={() => {
                                                                        if (selectedRunId) {
                                                                            void loadLogs(
                                                                                selectedRunId,
                                                                                selectedJobId,
                                                                                false,
                                                                            );
                                                                        }
                                                                    }}
                                                                    onFailedOnly={() => {
                                                                        if (selectedRunId) {
                                                                            void loadLogs(
                                                                                selectedRunId,
                                                                                null,
                                                                                true,
                                                                            );
                                                                        }
                                                                    }}
                                                                />
                                                            ),
                                                        },
                                                    ]}
                                                />
                                            </TabsContent>
                                        </Tabs>
                                    </>
                                )}
                            </div>
                        ),
                    },
                ]}
            />
        </div>
    );
}
