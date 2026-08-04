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
    tabsForFocus,
    type ActionsFocus,
    type Artifact,
    type DetailTab,
    type WorkflowDef,
    type WorkflowJob,
    type WorkflowRun,
    type WorkflowStep,
} from "./types";
import {
    formatBytes,
    formatRelative,
    filterJobLogByStep,
    parseApi,
    parseWorkflowDispatch,
    resolveOwnerRepo,
    statusIcon,
    statusLabel,
    statusTone,
    actorAvatarUrl,
    type WorkflowInputDef,
} from "./utils";
import { Header } from "./header";
import { RunsList } from "./runs-list";
import { JobsPanel } from "./jobs-panel";
import { LogsPanel } from "./logs-panel";
import { DispatchDialog } from "./dispatch-dialog";
import { formatCommandError } from "@/lib/format-error";
import { notify } from "@/features/notifications";
import { save } from "@tauri-apps/plugin-dialog";

function reportActionsError(raw: unknown): string {
    const formatted = formatCommandError(raw, "GitHub");
    const text = formatted.hint
        ? `${formatted.message}\n${formatted.hint}`
        : formatted.message || formatted.title;
    notify.error(formatted.title, text);
    return text;
}

function jobLogsReady(job: WorkflowJob | null): boolean {
    if (!job) return true; // whole-run logs
    return job.status === "completed" || job.conclusion != null;
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
    const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);
    const [jobs, setJobs] = useState<WorkflowJob[]>([]);
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
    const [expandedJobs, setExpandedJobs] = useState<Set<number>>(new Set());
    const [logs, setLogs] = useState("");
    const [logHighlight, setLogHighlight] = useState<string | null>(null);
    const [stepFilterActive, setStepFilterActive] = useState(true);
    const [loadingRuns, setLoadingRuns] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [busyAction, setBusyAction] = useState<string | null>(null);
    const [downloadingArtifactId, setDownloadingArtifactId] = useState<number | null>(null);
    const [dispatchOpen, setDispatchOpen] = useState(false);
    const [dispatchWorkflow, setDispatchWorkflow] = useState<WorkflowDef | null>(null);
    const [dispatchInputs, setDispatchInputs] = useState<WorkflowInputDef[]>([]);
    const [dispatchRef, setDispatchRef] = useState("main");
    const [dispatchBusy, setDispatchBusy] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>(
        focus === "live-status" ? "in_progress" : "all",
    );
    const [detailTab, setDetailTab] = useState<DetailTab>(defaultTabForFocus(focus));
    const [live, setLive] = useState(focus === "live-status");
    const logRef = useRef<HTMLPreElement | null>(null);
    const allowedTabs = useMemo(() => tabsForFocus(focus), [focus]);

    useEffect(() => {
        setDetailTab(defaultTabForFocus(focus));
        if (focus === "live-status") {
            setStatusFilter("in_progress");
            setLive(true);
        } else if (focus === "logs") {
            setDetailTab("jobs");
            setStatusFilter("failure");
        } else if (focus === "artifacts") {
            setDetailTab("artifacts");
            setStatusFilter("all");
        } else if (focus === "workflow-definitions") {
            setDetailTab("workflows");
            setStatusFilter("all");
            setLive(false);
            setSelectedWorkflowId(null);
        } else {
            setLive(false);
            if (focus === "jobs" || focus === "steps") setStatusFilter("all");
        }
        setLogs("");
        setLogHighlight(null);
        setStepFilterActive(true);
    }, [focus]);

    useEffect(() => {
        if (!allowedTabs.includes(detailTab)) {
            setDetailTab(allowedTabs[0] ?? "jobs");
        }
    }, [allowedTabs, detailTab]);

    const repoSlug = repo ? `${repo.owner}/${repo.repo}` : null;
    const selectedRun = useMemo(
        () => runs.find((r) => r.id === selectedRunId) ?? null,
        [runs, selectedRunId],
    );
    const selectedJob = useMemo(
        () => jobs.find((j) => j.id === selectedJobId) ?? null,
        [jobs, selectedJobId],
    );

    const displayLogs = useMemo(() => {
        if (!logHighlight || !stepFilterActive || !logs) return logs;
        const { filtered, matched } = filterJobLogByStep(logs, logHighlight);
        if (matched === 0) {
            return `No log lines matched step “${logHighlight}”.\nShowing full job log below.\n\n${logs}`;
        }
        return filtered;
    }, [logHighlight, logs, stepFilterActive]);

    const filteredWorkflows = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return workflows;
        return workflows.filter((w) =>
            [w.name, w.path, w.state].join(" ").toLowerCase().includes(q),
        );
    }, [query, workflows]);

    const filteredRuns = useMemo(() => {
        const q = query.trim().toLowerCase();
        return runs.filter((run) => {
            if (selectedWorkflowId != null) {
                const wf = workflows.find((w) => w.id === selectedWorkflowId);
                if (wf) {
                    const match =
                        run.workflow_id === wf.id ||
                        run.path === wf.path ||
                        run.name === wf.name;
                    if (!match) return false;
                }
            }
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
    }, [query, runs, selectedWorkflowId, statusFilter, workflows]);

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

            const base = `/repos/${resolved.owner}/${resolved.repo}/actions/runs?per_page=40`;
            const workflowsPath = `/repos/${resolved.owner}/${resolved.repo}/actions/workflows?per_page=50`;

            let nextRuns: WorkflowRun[] = [];
            if (statusFilter === "in_progress" || focus === "live-status") {
                // GitHub allows one status per request — merge queued + in_progress.
                const [progressRaw, queuedRaw, workflowsRaw] = await Promise.all([
                    parseApi(`${base}&status=in_progress`),
                    parseApi(`${base}&status=queued`),
                    parseApi(workflowsPath),
                ]);
                const map = new Map<number, WorkflowRun>();
                for (const raw of [progressRaw, queuedRaw]) {
                    for (const r of (raw as { workflow_runs?: WorkflowRun[] }).workflow_runs ?? []) {
                        map.set(Number(r.id), { ...r, id: Number(r.id) });
                    }
                }
                nextRuns = Array.from(map.values()).sort((a, b) => {
                    const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
                    const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
                    return tb - ta;
                });
                setWorkflows(
                    ((workflowsRaw as { workflows?: WorkflowDef[] }).workflows ?? []).map((w) => ({
                        ...w,
                        id: Number(w.id),
                    })),
                );
            } else {
                const statusQuery =
                    statusFilter === "completed"
                        ? "&status=completed"
                        : statusFilter === "failure"
                          ? "&status=failure"
                          : "";
                const [runsRaw, workflowsRaw] = await Promise.all([
                    parseApi(`${base}${statusQuery}`),
                    parseApi(workflowsPath),
                ]);
                nextRuns = ((runsRaw as { workflow_runs?: WorkflowRun[] }).workflow_runs ?? []).map(
                    (r) => ({ ...r, id: Number(r.id) }),
                );
                setWorkflows(
                    ((workflowsRaw as { workflows?: WorkflowDef[] }).workflows ?? []).map((w) => ({
                        ...w,
                        id: Number(w.id),
                    })),
                );
            }

            setRuns(nextRuns);
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
                if (focus === "jobs" || focus === "steps") {
                    setExpandedJobs(new Set(nextJobs.map((j) => j.id)));
                } else if (pick) {
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
            const job = jobId != null ? jobs.find((j) => j.id === jobId) ?? null : null;
            if (job && !jobLogsReady(job)) {
                setLogs(
                    `Logs will be available when “${job.name}” finishes (status: ${job.status}).`,
                );
                return;
            }
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
                    const el = logRef.current;
                    if (!el) return;
                    const parent = el.parentElement;
                    if (parent) parent.scrollTop = 0;
                    if (logHighlight) {
                        const idx = el.textContent?.indexOf(logHighlight) ?? -1;
                        if (idx >= 0) {
                            // Approximate scroll by line
                            const before = (el.textContent ?? "").slice(0, idx);
                            const line = before.split("\n").length;
                            parent && (parent.scrollTop = Math.max(0, (line - 3) * 14));
                        }
                    }
                });
            } catch (e) {
                const msg = reportActionsError(e);
                setLogs(
                    `Failed to load logs.\n\n${msg}\n\nTip: finished jobs only — in-progress runs cannot stream via gh run view --log.`,
                );
            } finally {
                setLoadingLogs(false);
            }
        },
        [jobs, logHighlight, repoSlug],
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
        // Live status: don't auto-spam gh log on incomplete runs.
        if (focus === "live-status") return;
        if (focus === "logs" || selectedJobId != null) {
            const job = selectedJobId != null ? jobs.find((j) => j.id === selectedJobId) : null;
            if (job && !jobLogsReady(job)) {
                setLogs(
                    `Logs will be available when “${job.name}” finishes (status: ${job.status}).`,
                );
                return;
            }
            void loadLogs(selectedRunId, selectedJobId, focus === "logs" && !selectedJobId);
        }
        // Intentionally omit loadLogs from deps to avoid refetch loops when highlight changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detailTab, focus, selectedJobId, selectedRunId, jobs]);

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
        setLogHighlight(null);
    };

    const selectStep = (jobId: number, step: WorkflowStep) => {
        setSelectedJobId(jobId);
        setExpandedJobs((prev) => new Set(prev).add(jobId));
        setLogHighlight(step.name);
        setStepFilterActive(true);
        if (selectedRunId) {
            void loadLogs(selectedRunId, jobId, false);
        }
    };

    const downloadArtifact = async (art: Artifact) => {
        if (!repoSlug || art.expired) return;
        const dest = await save({
            defaultPath: project_path
                ? `${project_path}/${art.name}.zip`
                : `${art.name}.zip`,
            filters: [{ name: "Zip", extensions: ["zip"] }],
        });
        if (typeof dest !== "string") return;
        setDownloadingArtifactId(art.id);
        try {
            await commands.githubActionsDownloadArtifact(repoSlug, art.id, dest);
            notify.success("Artifact downloaded", dest);
        } catch (e) {
            reportActionsError(e);
        } finally {
            setDownloadingArtifactId(null);
        }
    };

    const openDispatch = async (wf: WorkflowDef, preferredRef?: string) => {
        if (!repoSlug) return;
        setDispatchBusy(true);
        try {
            const yaml = await commands.githubActionsWorkflowYaml(
                repoSlug,
                String(wf.id),
            );
            const parsed = parseWorkflowDispatch(yaml);
            if (!parsed.canDispatch) {
                notify.error(
                    "Cannot run",
                    "This workflow has no workflow_dispatch trigger. Add `on: workflow_dispatch` to enable manual runs.",
                );
                return;
            }
            let ref = preferredRef || selectedRun?.head_branch || "main";
            if (project_path) {
                try {
                    ref = preferredRef || (await commands.gitCurrentBranch(project_path)) || ref;
                } catch {
                    /* keep ref */
                }
            }
            setDispatchWorkflow(wf);
            setDispatchInputs(parsed.inputs);
            setDispatchRef(ref);
            setDispatchOpen(true);
        } catch (e) {
            reportActionsError(e);
        } finally {
            setDispatchBusy(false);
        }
    };

    const submitDispatch = async (gitRef: string, values: Record<string, string>) => {
        if (!repoSlug || !dispatchWorkflow) return;
        setDispatchBusy(true);
        try {
            const inputsJson = JSON.stringify(values);
            await commands.githubActionsWorkflowDispatch(
                repoSlug,
                String(dispatchWorkflow.id),
                gitRef,
                Object.keys(values).length ? inputsJson : null,
            );
            notify.success(
                "Workflow started",
                `${dispatchWorkflow.name} on ${gitRef}`,
            );
            setDispatchOpen(false);
            setLive(true);
            window.setTimeout(() => void loadRuns(), 2500);
        } catch (e) {
            reportActionsError(e);
        } finally {
            setDispatchBusy(false);
        }
    };

    const artifactRow = (art: Artifact) => (
        <li
            key={art.id}
            className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-panel-hover"
        >
            <div className="min-w-0">
                <div className="truncate text-sm">{art.name}</div>
                <div className="text-2xs text-text-muted">
                    {[
                        formatBytes(art.size_in_bytes),
                        art.expired ? "expired" : null,
                        formatRelative(art.created_at),
                    ]
                        .filter(Boolean)
                        .join(" · ")}
                </div>
            </div>
            <Button
                variant="outline"
                size="sm"
                className="h-7 shrink-0 gap-1 px-2"
                disabled={art.expired || downloadingArtifactId === art.id}
                onClick={() => void downloadArtifact(art)}
            >
                <Icon name="download" size={12} />
                {downloadingArtifactId === art.id ? "Saving…" : "Download"}
            </Button>
        </li>
    );

    const showWorkflowList = focus === "workflow-definitions";
    const jobsMode = focus === "steps" ? "steps" : "jobs";
    const logsPreferred = focus === "logs" ? 320 : 200;
    const jobsPreferred = focus === "logs" ? 160 : 220;

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

    const workflowsListPane = (
        <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden border border-border-subtle bg-panel">
            <div className="shrink-0 px-2 py-1.5 text-2xs font-medium text-text-muted">
                Workflows {loadingRuns ? "…" : `(${filteredWorkflows.length})`}
            </div>
            <ScrollArea className="min-h-0 flex-1 p-1">
                {filteredWorkflows.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-text-muted">No workflow definitions.</p>
                ) : (
                    <ul className="flex flex-col gap-0.5">
                        {filteredWorkflows.map((wf) => (
                            <li key={wf.id}>
                                <div
                                    className={cn(
                                        "flex flex-col gap-1 rounded-lg px-2 py-2",
                                        selectedWorkflowId === wf.id
                                            ? "bg-panel-hover"
                                            : "hover:bg-panel-hover/60",
                                    )}
                                >
                                    <button
                                        type="button"
                                        className="flex w-full flex-col gap-0.5 text-left"
                                        onClick={() => {
                                            setSelectedWorkflowId(wf.id);
                                            setDetailTab("jobs");
                                            const match = runs.find(
                                                (r) =>
                                                    r.workflow_id === wf.id ||
                                                    r.path === wf.path ||
                                                    r.name === wf.name,
                                            );
                                            if (match) setSelectedRunId(match.id);
                                        }}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm text-text-primary">
                                                {wf.name}
                                            </span>
                                            <span className="shrink-0 text-2xs capitalize text-text-muted">
                                                {wf.state}
                                            </span>
                                        </div>
                                        <span className="truncate text-xs text-text-muted">
                                            {wf.path}
                                        </span>
                                    </button>
                                    <div className="flex gap-1">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-6 px-2 text-2xs"
                                            disabled={dispatchBusy}
                                            onClick={() => void openDispatch(wf)}
                                        >
                                            Run workflow…
                                        </Button>
                                        {wf.html_url ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 px-2 text-2xs"
                                                onClick={() => openUrl(wf.html_url)}
                                            >
                                                GitHub
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </ScrollArea>
        </div>
    );

    const jobsLogsSplit = (
        <Panel
            direction="vertical"
            paneGap="var(--workbench-gap)"
            storageKey={
                focus === "logs" ? "git-actions-logs-first-v1" : "git-actions-jobs-logs-v3"
            }
            hideSeparator
            className="h-full min-h-0"
            panes={
                focus === "logs"
                    ? [
                          {
                              id: "actions-logs",
                              flexible: true,
                              minSize: 140,
                              children: (
                                  <LogsPanel
                                      selectedJob={selectedJob}
                                      selectedRunId={selectedRunId}
                                      logs={displayLogs}
                                      loadingLogs={loadingLogs}
                                      logRef={logRef}
                                      highlight={logHighlight}
                                      stepFilterActive={!!logHighlight && stepFilterActive}
                                      onToggleStepFilter={() => setStepFilterActive((v) => !v)}
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
                                              void loadLogs(selectedRunId, null, true);
                                          }
                                      }}
                                  />
                              ),
                          },
                          {
                              id: "actions-jobs",
                              preferredSize: jobsPreferred,
                              minSize: 100,
                              maxSize: 360,
                              snap: true,
                              children: (
                                  <JobsPanel
                                      jobs={jobs}
                                      selectedJobId={selectedJobId}
                                      expandedJobs={expandedJobs}
                                      loading={loadingDetail}
                                      mode={jobsMode}
                                      onToggleJob={toggleJob}
                                      onSelectStep={selectStep}
                                      onViewLogs={(jobId) => {
                                          setSelectedJobId(jobId);
                                          setLogHighlight(null);
                                          if (selectedRunId) {
                                              void loadLogs(selectedRunId, jobId, false);
                                          }
                                      }}
                                      onOpenUrl={openUrl}
                                  />
                              ),
                          },
                      ]
                    : [
                          {
                              id: "actions-jobs",
                              // Flexible so the pane shrinks with the window instead of clipping.
                              flexible: true,
                              minSize: 120,
                              children: (
                                  <JobsPanel
                                      jobs={jobs}
                                      selectedJobId={selectedJobId}
                                      expandedJobs={expandedJobs}
                                      loading={loadingDetail}
                                      mode={jobsMode}
                                      onToggleJob={toggleJob}
                                      onSelectStep={selectStep}
                                      onViewLogs={(jobId) => {
                                          setSelectedJobId(jobId);
                                          setLogHighlight(null);
                                          if (selectedRunId) {
                                              void loadLogs(selectedRunId, jobId, false);
                                          }
                                      }}
                                      onOpenUrl={openUrl}
                                  />
                              ),
                          },
                          {
                              id: "actions-logs",
                              preferredSize: logsPreferred,
                              minSize: 100,
                              maxSize: 480,
                              snap: true,
                              children: (
                                  <LogsPanel
                                      selectedJob={selectedJob}
                                      selectedRunId={selectedRunId}
                                      logs={displayLogs}
                                      loadingLogs={loadingLogs}
                                      logRef={logRef}
                                      highlight={logHighlight}
                                      stepFilterActive={!!logHighlight && stepFilterActive}
                                      onToggleStepFilter={() => setStepFilterActive((v) => !v)}
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
                                              void loadLogs(selectedRunId, null, true);
                                          }
                                      }}
                                  />
                              ),
                          },
                      ]
            }
        />
    );

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
                showStatusFilter={focus !== "workflow-definitions"}
            />

            <Panel
                direction="horizontal"
                paneGap="var(--workbench-gap)"
                storageKey={`git-actions-console-${focus}-v3`}
                hideSeparator
                className="min-h-0 flex-1"
                panes={[
                    {
                        id: "actions-sidebar",
                        preferredSize: 240,
                        minSize: 180,
                        maxSize: 340,
                        snap: true,
                        children: showWorkflowList ? (
                            workflowsListPane
                        ) : (
                            <RunsList
                                runs={filteredRuns}
                                selectedRunId={selectedRunId}
                                loading={loadingRuns}
                                onSelect={(id) => {
                                    setSelectedRunId(id);
                                    setLogHighlight(null);
                                    setLogs("");
                                }}
                            />
                        ),
                    },
                    {
                        id: "actions-detail",
                        flexible: true,
                        minSize: 280,
                        children: (
                            <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden border border-border-subtle bg-editor">
                                {!selectedRun && focus !== "workflow-definitions" ? (
                                    <div className="flex h-full items-center justify-center p-6 text-sm text-text-muted">
                                        Select a workflow run
                                    </div>
                                ) : !selectedRun && focus === "workflow-definitions" ? (
                                    <div className="flex h-full flex-col">
                                        <ScrollArea className="min-h-0 flex-1 p-2">
                                            <p className="px-2 py-3 text-sm text-text-muted">
                                                Select a workflow to see its recent runs, or open it
                                                on GitHub.
                                            </p>
                                            {selectedWorkflowId != null ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="mx-2"
                                                    onClick={() => {
                                                        const wf = workflows.find(
                                                            (w) => w.id === selectedWorkflowId,
                                                        );
                                                        openUrl(wf?.html_url);
                                                    }}
                                                >
                                                    Open workflow on GitHub
                                                </Button>
                                            ) : null}
                                        </ScrollArea>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle/60 px-3 py-2">
                                            <div className="flex min-w-0 flex-1 basis-[min(100%,18rem)] items-center gap-2">
                                                {(() => {
                                                    const runIcon = statusIcon(
                                                        selectedRun!.status,
                                                        selectedRun!.conclusion,
                                                    );
                                                    return (
                                                        <Icon
                                                            name={runIcon.name}
                                                            filled={runIcon.filled}
                                                            size={18}
                                                            className={cn(
                                                                "shrink-0",
                                                                statusTone(
                                                                    selectedRun!.status,
                                                                    selectedRun!.conclusion,
                                                                ),
                                                                runIcon.spin && "animate-spin",
                                                            )}
                                                        />
                                                    );
                                                })()}
                                                <div className="min-w-0 flex-1 truncate text-sm font-medium">
                                                    {selectedRun!.display_title ||
                                                        selectedRun!.name}
                                                    <span className="font-normal text-text-muted">
                                                        {" "}
                                                        · #
                                                        {selectedRun!.run_number ??
                                                            selectedRun!.id}
                                                        {selectedRun!.head_branch
                                                            ? ` · ${selectedRun!.head_branch}`
                                                            : ""}
                                                    </span>
                                                </div>
                                                {selectedRun!.actor?.login ? (
                                                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-text-muted">
                                                        {actorAvatarUrl(selectedRun!.actor) ? (
                                                            <img
                                                                src={
                                                                    actorAvatarUrl(
                                                                        selectedRun!.actor,
                                                                    )!
                                                                }
                                                                alt=""
                                                                className="size-5 rounded-full"
                                                                loading="lazy"
                                                            />
                                                        ) : null}
                                                        {selectedRun!.actor.login}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1">
                                                <span
                                                    className={cn(
                                                        "shrink-0 text-sm capitalize",
                                                        statusTone(
                                                            selectedRun!.status,
                                                            selectedRun!.conclusion,
                                                        ),
                                                    )}
                                                >
                                                    {statusLabel(
                                                        selectedRun!.status,
                                                        selectedRun!.conclusion,
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
                                                    disabled={dispatchBusy}
                                                    onClick={() => {
                                                        const wf =
                                                            workflows.find(
                                                                (w) =>
                                                                    w.id ===
                                                                        selectedRun!.workflow_id ||
                                                                    w.path === selectedRun!.path ||
                                                                    w.name === selectedRun!.name,
                                                            ) ??
                                                            (selectedWorkflowId != null
                                                                ? workflows.find(
                                                                      (w) =>
                                                                          w.id ===
                                                                          selectedWorkflowId,
                                                                  )
                                                                : undefined);
                                                        if (!wf) {
                                                            notify.error(
                                                                "Run again",
                                                                "Could not match this run to a workflow definition.",
                                                            );
                                                            return;
                                                        }
                                                        void openDispatch(
                                                            wf,
                                                            selectedRun!.head_branch,
                                                        );
                                                    }}
                                                >
                                                    Run again…
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={
                                                        !!busyAction ||
                                                        selectedRun!.status === "completed" ||
                                                        selectedRun!.status === "cancelled"
                                                    }
                                                    onClick={() => void runAction("cancel")}
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => openUrl(selectedRun!.html_url)}
                                                >
                                                    Open on GitHub
                                                </Button>
                                            </div>
                                        </div>

                                        {allowedTabs.length === 1 && allowedTabs[0] === "jobs" ? (
                                            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
                                                {jobsLogsSplit}
                                            </div>
                                        ) : allowedTabs.length === 1 &&
                                          allowedTabs[0] === "artifacts" ? (
                                            <ScrollArea className="min-h-0 flex-1 p-2">
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
                                                        {artifacts.map((art) => artifactRow(art))}
                                                    </ul>
                                                )}
                                            </ScrollArea>
                                        ) : (
                                            <Tabs
                                                value={detailTab}
                                                onValueChange={(v) =>
                                                    setDetailTab(v as DetailTab)
                                                }
                                                className="flex h-0 min-h-0 flex-1 flex-col"
                                            >
                                                <div className="flex shrink-0 items-center px-2 py-1">
                                                    <TabsList>
                                                        {allowedTabs.includes("jobs") ? (
                                                            <TabsTrigger value="jobs">
                                                                {focus === "steps"
                                                                    ? "Steps & logs"
                                                                    : "Jobs & logs"}
                                                            </TabsTrigger>
                                                        ) : null}
                                                        {allowedTabs.includes("artifacts") ? (
                                                            <TabsTrigger value="artifacts">
                                                                Artifacts ({artifacts.length})
                                                            </TabsTrigger>
                                                        ) : null}
                                                        {allowedTabs.includes("workflows") ? (
                                                            <TabsTrigger value="workflows">
                                                                Workflows ({workflows.length})
                                                            </TabsTrigger>
                                                        ) : null}
                                                    </TabsList>
                                                </div>

                                                {allowedTabs.includes("workflows") ? (
                                                    <TabsContent
                                                        value="workflows"
                                                        className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
                                                    >
                                                        <ScrollArea className="min-h-0 flex-1 p-2">
                                                            {workflows.length === 0 ? (
                                                                <p className="px-2 py-3 text-sm text-text-muted">
                                                                    No workflow definitions.
                                                                </p>
                                                            ) : (
                                                                <ul className="flex flex-col gap-0.5">
                                                                    {workflows.map((wf) => (
                                                                        <li key={wf.id}>
                                                                            <div className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-panel-hover">
                                                                                <button
                                                                                    type="button"
                                                                                    className="min-w-0 flex-1 text-left"
                                                                                    onClick={() =>
                                                                                        openUrl(
                                                                                            wf.html_url,
                                                                                        )
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
                                                                                </button>
                                                                                <Button
                                                                                    variant="outline"
                                                                                    size="sm"
                                                                                    className="h-7 shrink-0 px-2"
                                                                                    disabled={
                                                                                        dispatchBusy
                                                                                    }
                                                                                    onClick={() =>
                                                                                        void openDispatch(
                                                                                            wf,
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    Run…
                                                                                </Button>
                                                                            </div>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                        </ScrollArea>
                                                    </TabsContent>
                                                ) : null}

                                                {allowedTabs.includes("artifacts") ? (
                                                    <TabsContent
                                                        value="artifacts"
                                                        className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
                                                    >
                                                        <ScrollArea className="min-h-0 flex-1 p-2">
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
                                                                    {artifacts.map((art) =>
                                                                        artifactRow(art),
                                                                    )}
                                                                </ul>
                                                            )}
                                                        </ScrollArea>
                                                    </TabsContent>
                                                ) : null}

                                                {allowedTabs.includes("jobs") ? (
                                                    <TabsContent
                                                        value="jobs"
                                                        className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
                                                    >
                                                        {jobsLogsSplit}
                                                    </TabsContent>
                                                ) : null}
                                            </Tabs>
                                        )}
                                    </>
                                )}
                            </div>
                        ),
                    },
                ]}
            />

            <DispatchDialog
                open={dispatchOpen}
                onOpenChange={setDispatchOpen}
                workflowName={dispatchWorkflow?.name ?? "Workflow"}
                defaultRef={dispatchRef}
                inputs={dispatchInputs}
                busy={dispatchBusy}
                onSubmit={(gitRef, values) => void submitDispatch(gitRef, values)}
            />
        </div>
    );
}
