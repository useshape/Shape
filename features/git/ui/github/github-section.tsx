"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { useProjectState, commands } from "@/lib/backend";
import { loginGitHub, useGitHubAuth } from "@/lib/github-auth/store";
import { cn } from "@/lib/utils";
import type { GitSectionId } from "@/features/git/types";
import { useFilter } from "@/features/git/ui/manager/filter-context";
import { statusIcon } from "@/features/git/ui/actions/utils";
import { formatCommandError } from "@/lib/format-error";
import { notify } from "@/features/notifications";
import { Tooltip } from "@/components/ui/tooltip";
import { FadeTruncate } from "@/components/ui/fade-truncate";

type GhItem = {
    id: string | number;
    title: string;
    subtitle?: string;
    url?: string;
    status?: string;
    meta?: string;
};

export type GitHubListSection = Exclude<
    GitSectionId,
    | "source"
    | "graph"
    | "branches"
    | "tags"
    | "workflow-runs"
    | "workflow-definitions"
    | "jobs"
    | "steps"
    | "live-status"
    | "logs"
    | "artifacts"
>;

const SECTION_META: Record<
    GitHubListSection,
    { title: string; empty: string; endpoint: (owner: string, repo: string) => string }
> = {
    issues: {
        title: "Issues",
        empty: "No open issues",
        endpoint: (o, r) => `/repos/${o}/${r}/issues?state=open&per_page=50`,
    },
    "pull-requests": {
        title: "Pull requests",
        empty: "No open pull requests",
        endpoint: (o, r) => `/repos/${o}/${r}/pulls?state=open&per_page=50`,
    },
    releases: {
        title: "Releases",
        empty: "No releases",
        endpoint: (o, r) => `/repos/${o}/${r}/releases?per_page=40`,
    },
    "check-runs": {
        title: "Check runs",
        empty: "No check runs for HEAD",
        endpoint: (o, r) => `/repos/${o}/${r}/commits/HEAD/check-runs?per_page=50`,
    },
    "check-suites": {
        title: "Check suites",
        empty: "No check suites for HEAD",
        endpoint: (o, r) => `/repos/${o}/${r}/commits/HEAD/check-suites?per_page=30`,
    },
    deployments: {
        title: "Deployments",
        empty: "No deployments",
        endpoint: (o, r) => `/repos/${o}/${r}/deployments?per_page=40`,
    },
    "deployment-statuses": {
        title: "Deployment statuses",
        empty: "No deployment statuses",
        endpoint: (o, r) => `/repos/${o}/${r}/deployments?per_page=20`,
    },
    "commit-statuses": {
        title: "Commit statuses",
        empty: "No commit statuses for HEAD",
        endpoint: (o, r) => `/repos/${o}/${r}/commits/HEAD/status`,
    },
};

function asArr(v: unknown): unknown[] {
    return Array.isArray(v) ? v : v && typeof v === "object" ? [v] : [];
}

function formatRelative(iso: unknown): string {
    if (typeof iso !== "string" || !iso) return "";
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "";
    const mins = Math.round((Date.now() - t) / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 48) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
}

function statusTone(status?: string): string {
    const s = (status || "").toLowerCase();
    if (["success", "completed", "passed", "open"].includes(s)) return "text-success";
    if (["failure", "failed", "error", "cancelled", "closed"].includes(s)) return "text-error";
    if (["in_progress", "queued", "pending", "waiting"].includes(s)) return "text-warning";
    return "text-text-muted";
}

function ItemStatusIcon({ status }: { status?: string }) {
    if (!status) return null;
    const icon = statusIcon(status, status);
    return (
        <Icon
            name={icon.name}
            filled={icon.filled}
            size={14}
            className={cn("shrink-0", statusTone(status), icon.spin && "animate-spin")}
        />
    );
}

function sectionIcon(section: GitHubListSection): string {
    switch (section) {
        case "issues":
            return "bug_report";
        case "pull-requests":
            return "merge";
        case "releases":
            return "rocket";
        case "check-runs":
            return "check_circle";
        case "check-suites":
            return "checklist";
        case "commit-statuses":
            return "check_circle";
        case "deployments":
            return "rocket";
        case "deployment-statuses":
            return "cloud";
        default:
            return "github";
    }
}

function normalize(section: GitHubListSection, data: unknown): GhItem[] {
    if (section === "check-runs") {
        const runs = (data as { check_runs?: unknown[] })?.check_runs ?? asArr(data);
        return runs.map((raw) => {
            const c = raw as Record<string, unknown>;
            return {
                id: String(c.id ?? Math.random()),
                title: String(c.name ?? "Check"),
                subtitle: String((c.app as { name?: string } | undefined)?.name ?? ""),
                url: typeof c.html_url === "string" ? c.html_url : undefined,
                status: String(c.conclusion ?? c.status ?? ""),
                meta: formatRelative(c.completed_at ?? c.started_at),
            };
        });
    }
    if (section === "check-suites") {
        const suites = (data as { check_suites?: unknown[] })?.check_suites ?? asArr(data);
        return suites.map((raw) => {
            const c = raw as Record<string, unknown>;
            return {
                id: String(c.id ?? Math.random()),
                title: String((c.app as { name?: string } | undefined)?.name ?? "Check suite"),
                subtitle: String(c.head_branch ?? ""),
                status: String(c.conclusion ?? c.status ?? ""),
            };
        });
    }
    if (section === "commit-statuses") {
        const statuses = (data as { statuses?: unknown[] })?.statuses ?? asArr(data);
        return statuses.map((raw) => {
            const s = raw as Record<string, unknown>;
            return {
                id: String(s.id ?? s.context ?? Math.random()),
                title: String(s.context ?? "Status"),
                subtitle: String(s.description ?? ""),
                url: typeof s.target_url === "string" ? s.target_url : undefined,
                status: String(s.state ?? ""),
                meta: formatRelative(s.updated_at),
            };
        });
    }
    if (section === "releases") {
        return asArr(data).map((raw) => {
            const r = raw as Record<string, unknown>;
            return {
                id: String(r.id ?? r.tag_name ?? Math.random()),
                title: String(r.name || r.tag_name || "Release"),
                subtitle: [
                    r.tag_name,
                    r.draft ? "draft" : null,
                    r.prerelease ? "pre-release" : null,
                ]
                    .filter(Boolean)
                    .join(" · "),
                url: typeof r.html_url === "string" ? r.html_url : undefined,
                meta: formatRelative(r.published_at ?? r.created_at),
            };
        });
    }
    if (section === "issues" || section === "pull-requests") {
        return asArr(data)
            .filter((raw) => {
                const i = raw as Record<string, unknown>;
                if (section === "issues" && i.pull_request) return false;
                return true;
            })
            .map((raw) => {
                const i = raw as Record<string, unknown>;
                const user =
                    i.user && typeof i.user === "object"
                        ? (i.user as { login?: string }).login
                        : null;
                const labels = Array.isArray(i.labels)
                    ? i.labels
                          .map((l) =>
                              typeof l === "object" && l && "name" in l
                                  ? String((l as { name?: string }).name)
                                  : null,
                          )
                          .filter(Boolean)
                          .slice(0, 3)
                          .join(", ")
                    : "";
                return {
                    id: String(i.id ?? i.number ?? Math.random()),
                    title: String(i.title ?? `#${i.number}`),
                    subtitle: [`#${i.number}`, user, labels].filter(Boolean).join(" · "),
                    url: typeof i.html_url === "string" ? i.html_url : undefined,
                    status: String(i.state ?? ""),
                    meta: formatRelative(i.updated_at ?? i.created_at),
                };
            });
    }
    if (section === "deployment-statuses") {
        return asArr(data).map((raw) => {
            const s = raw as Record<string, unknown>;
            return {
                id: String(s.id ?? Math.random()),
                title: String(s.state ?? "status"),
                subtitle: String(s.description ?? s.environment ?? ""),
                url: typeof s.log_url === "string" ? s.log_url : undefined,
                status: String(s.state ?? ""),
                meta: formatRelative(s.created_at),
            };
        });
    }
    return asArr(data).map((raw) => {
        const i = raw as Record<string, unknown>;
        return {
            id: String(i.id ?? i.number ?? Math.random()),
            title: String(i.title ?? i.environment ?? i.ref ?? i.name ?? `#${i.number}`),
            subtitle: [
                i.number != null ? `#${i.number}` : null,
                i.state,
                i.user && typeof i.user === "object"
                    ? (i.user as { login?: string }).login
                    : null,
            ]
                .filter(Boolean)
                .join(" · "),
            url: typeof i.html_url === "string" ? i.html_url : undefined,
            status: typeof i.state === "string" ? i.state : undefined,
            meta: formatRelative(i.updated_at ?? i.created_at),
        };
    });
}

async function resolveOwnerRepo(
    projectPath: string | null,
): Promise<{ owner: string; repo: string } | null> {
    if (!projectPath) return null;
    try {
        const remote = await commands.gitRemoteUrl(projectPath);
        if (!remote) return null;
        const m =
            remote.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/i) ||
            remote.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
        if (!m) return null;
        return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
    } catch {
        return null;
    }
}

async function parseApi(path: string): Promise<unknown> {
    const raw = await commands.githubApiGet(path);
    return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export function GitHubSection({ section }: { section: GitHubListSection }) {
    const meta = SECTION_META[section];
    const { project_path } = useProjectState();
    const auth = useGitHubAuth();
    const { query } = useFilter();
    const [items, setItems] = useState<GhItem[]>([]);
    const [deps, setDeps] = useState<{ id: number; label: string }[]>([]);
    const [selectedDepId, setSelectedDepId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [repo, setRepo] = useState<{ owner: string; repo: string } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const resolved = await resolveOwnerRepo(project_path);
            setRepo(resolved);
            if (!resolved) {
                setItems([]);
                setError("Connect a GitHub remote to load this view.");
                return;
            }
            if (!auth.loggedIn) {
                setItems([]);
                setError("Sign in with GitHub to load this data.");
                return;
            }

            if (section === "deployment-statuses") {
                const list = asArr(await parseApi(meta.endpoint(resolved.owner, resolved.repo)));
                const options = list
                    .map((raw) => {
                        const d = raw as Record<string, unknown>;
                        return {
                            id: Number(d.id),
                            label: `#${d.id} · ${String(d.environment ?? "deploy")} · ${String(d.ref ?? "")}`,
                        };
                    })
                    .filter((d) => Number.isFinite(d.id));
                setDeps(options);
                const depId =
                    (selectedDepId != null && options.some((d) => d.id === selectedDepId)
                        ? selectedDepId
                        : options[0]?.id) ?? null;
                if (depId == null) {
                    setSelectedDepId(null);
                    setItems([]);
                    return;
                }
                if (selectedDepId !== depId) {
                    setSelectedDepId(depId);
                    return;
                }
                const statuses = await parseApi(
                    `/repos/${resolved.owner}/${resolved.repo}/deployments/${depId}/statuses`,
                );
                setItems(normalize("deployment-statuses", statuses));
                return;
            }

            setDeps([]);
            setItems(normalize(section, await parseApi(meta.endpoint(resolved.owner, resolved.repo))));
        } catch (e) {
            setItems([]);
            const formatted = formatCommandError(e, "GitHub");
            const text = formatted.hint
                ? `${formatted.message}\n${formatted.hint}`
                : formatted.message || formatted.title;
            notify.error(formatted.title, text);
        } finally {
            setLoading(false);
        }
    }, [auth.loggedIn, meta, project_path, section, selectedDepId]);

    useEffect(() => {
        void load();
    }, [load]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return items;
        return items.filter(
            (item) =>
                item.title.toLowerCase().includes(q) ||
                item.subtitle?.toLowerCase().includes(q) ||
                item.status?.toLowerCase().includes(q),
        );
    }, [items, query]);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex h-9 shrink-0 items-center gap-2 px-3">
                <Icon name={sectionIcon(section)} size={16} className="shrink-0 text-text-muted" />
                <FadeTruncate
                    className="min-w-0 flex-1 text-sm font-medium"
                    title={
                        repo
                            ? `${meta.title} · ${repo.owner}/${repo.repo}`
                            : meta.title
                    }
                >
                    {meta.title}
                    {repo ? (
                        <span className="font-normal text-text-muted">
                            {" "}
                            · {repo.owner}/{repo.repo}
                        </span>
                    ) : null}
                </FadeTruncate>
                <div className="flex shrink-0 items-center gap-1">
                    {!auth.loggedIn ? (
                        <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 gap-1 px-2"
                            onClick={() => void loginGitHub()}
                        >
                            Sign in
                        </Button>
                    ) : null}
                    <Tooltip content="Refresh">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2"
                            onClick={() => void load()}
                            aria-label="Refresh"
                        >
                            <Icon name="refresh" size={14} />
                            Refresh
                        </Button>
                    </Tooltip>
                </div>
            </header>
            {section === "deployment-statuses" && deps.length > 0 ? (
                <div className="shrink-0 px-3 pb-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-full justify-between gap-2 px-2 font-normal"
                            >
                                <span className="truncate">
                                    {deps.find((d) => d.id === selectedDepId)?.label ??
                                        "Select deployment"}
                                </span>
                                <Icon name="expand_more" size={14} className="shrink-0" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-[480px]">
                            <DropdownMenuRadioGroup
                                value={selectedDepId != null ? String(selectedDepId) : undefined}
                                onValueChange={(v) => setSelectedDepId(Number(v) || null)}
                            >
                                {deps.map((dep) => (
                                    <DropdownMenuRadioItem key={dep.id} value={String(dep.id)}>
                                        {dep.label}
                                    </DropdownMenuRadioItem>
                                ))}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            ) : null}
            <ScrollArea className="min-h-0 flex-1 p-2">
                {loading ? (
                    <p className="px-2 py-3 text-sm text-text-muted">Loading…</p>
                ) : error ? (
                    <div className="flex flex-col gap-2 px-2 py-3">
                        <p className="text-sm text-text-muted">{error}</p>
                        {!auth.loggedIn ? (
                            <Button
                                variant="secondary"
                                size="sm"
                                className="w-fit"
                                onClick={() => void loginGitHub()}
                            >
                                Sign in with GitHub
                            </Button>
                        ) : null}
                    </div>
                ) : filtered.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-text-muted">{meta.empty}</p>
                ) : (
                    <ul className="flex flex-col gap-0.5">
                        {filtered.map((item) => {
                            const body = (
                                <>
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="flex min-w-0 items-start gap-2 text-sm leading-snug text-text-primary">
                                            <ItemStatusIcon status={item.status} />
                                            <span>{item.title}</span>
                                        </span>
                                        {item.meta ? (
                                            <span className="shrink-0 text-2xs text-text-muted">
                                                {item.meta}
                                            </span>
                                        ) : null}
                                    </div>
                                    {item.subtitle ? (
                                        <div className="flex items-center gap-2 pl-6">
                                            <span className="truncate text-xs text-text-muted">
                                                {item.subtitle}
                                            </span>
                                            {item.url ? (
                                                <Icon
                                                    name="open_in_new"
                                                    size={12}
                                                    className="shrink-0 text-text-muted"
                                                />
                                            ) : null}
                                        </div>
                                    ) : null}
                                </>
                            );
                            return (
                                <li key={item.id}>
                                    {item.url ? (
                                        <a
                                            href={item.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex flex-col gap-0.5 rounded-lg px-2 py-2 hover:bg-panel-hover"
                                        >
                                            {body}
                                        </a>
                                    ) : (
                                        <div className="flex flex-col gap-0.5 rounded-lg px-2 py-2">
                                            {body}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </ScrollArea>
        </div>
    );
}
