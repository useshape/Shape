"use client";

import { RiArrowDownSLine, RiArrowLeftLine, RiExternalLinkLine, RiGitPullRequestLine, RiRefreshLine } from "@remixicon/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
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
import { loginGitHub, useGitHubAuth } from "@/lib/github/store";
import { cn } from "@/lib/utils";
import { useFilter } from "@/features/git/ui/manager/filter-context";
import { statusIcon } from "@/features/git/ui/actions/utils";
import { formatCommandError } from "@/lib/errors/format";
import { notify } from "@/features/notifications";
import { Tooltip } from "@/components/ui/tooltip";
import { GitHubDetailPane } from "./detail";
import { GitMarkdown } from "./markdown";
import { GitDetailSkeleton, GitListSkeleton } from "@/features/git/ui/shared/skeletons";
import { GitChromeActions } from "@/features/git/ui/manager/chrome";
import { CreatePullRequestDialog } from "./create-pr-dialog";
import { Panel } from "@/features/panels";

type IssueStateFilter = "open" | "closed" | "all";

type GhItem = {
    id: string | number;
    title: string;
    subtitle?: string;
    url?: string;
    status?: string;
    meta?: string;
    number?: number;
    author?: string;
    body?: string;
};

type GhDetail = {
    title: string;
    status?: string;
    author?: string;
    body?: string;
    url?: string;
    subtitle?: string;
    meta?: string;
};

export type GitHubListSection = "issues" | "pull-requests";

const SECTION_META: Record<
    GitHubListSection,
    {
        title: string;
        empty: (state?: IssueStateFilter) => string;
        endpoint: (owner: string, repo: string, state?: IssueStateFilter) => string;
    }
> = {
    issues: {
        title: "Issues",
        empty: (state) =>
            state === "closed"
                ? "No closed issues"
                : state === "all"
                  ? "No issues"
                  : "No open issues",
        endpoint: (o, r, state = "open") =>
            `/repos/${o}/${r}/issues?state=${state}&per_page=50`,
    },
    "pull-requests": {
        title: "Pull requests",
        empty: (state) =>
            state === "closed"
                ? "No closed pull requests"
                : state === "all"
                  ? "No pull requests"
                  : "No open pull requests",
        endpoint: (o, r, state = "open") =>
            `/repos/${o}/${r}/pulls?state=${state}&per_page=50`,
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
            icon={icon.icon}
            size={ICON_SIZE_SM}
            className={cn("shrink-0", statusTone(status), icon.spin && "animate-spin")}
        />
    );
}

function supportsStateFilter(section: GitHubListSection): boolean {
    return section === "issues" || section === "pull-requests";
}

function normalize(section: GitHubListSection, data: unknown): GhItem[] {
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
                    : undefined;
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
            const number = typeof i.number === "number" ? i.number : Number(i.number);
            return {
                id: String(i.id ?? i.number ?? Math.random()),
                title: String(i.title ?? `#${i.number}`),
                subtitle: [`#${i.number}`, user, labels].filter(Boolean).join(" · "),
                url: typeof i.html_url === "string" ? i.html_url : undefined,
                status: String(i.state ?? ""),
                meta: formatRelative(i.updated_at ?? i.created_at),
                number: Number.isFinite(number) ? number : undefined,
                author: user,
                body: typeof i.body === "string" ? i.body : undefined,
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

function StateBadge({ status }: { status?: string }) {
    if (!status) return null;
    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
                statusTone(status),
                "bg-panel-hover",
            )}
        >
            {status}
        </span>
    );
}

function SimpleDetailPane({
    detail,
    loading,
    onBack,
}: {
    detail: GhDetail | null;
    loading: boolean;
    onBack: () => void;
}) {
    return (
        <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden bg-editor">
            {!detail && loading ? (
                <>
                    <div className="flex shrink-0 items-center gap-2 px-3 py-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 shrink-0 px-0"
                            onClick={onBack}
                            aria-label="Back to list"
                        >
                            <Icon icon={RiArrowLeftLine} size={ICON_SIZE_SM} />
                        </Button>
                    </div>
                    <GitDetailSkeleton />
                </>
            ) : !detail ? (
                <div className="flex h-full items-center justify-center p-6 text-sm text-text-muted">
                    Select an item
                </div>
            ) : (
                <>
                    <div className="flex shrink-0 flex-col gap-2 px-3 py-3">
                        <div className="flex items-start gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 shrink-0 px-0"
                                onClick={onBack}
                                aria-label="Back to list"
                            >
                                <Icon icon={RiArrowLeftLine} size={ICON_SIZE_SM} />
                            </Button>
                            <ItemStatusIcon status={detail?.status} />
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="min-w-0 text-sm font-medium text-text-primary">
                                        {detail.title}
                                    </h2>
                                    <StateBadge status={detail?.status} />
                                </div>
                                {detail?.subtitle ? (
                                    <p className="mt-0.5 truncate text-xs text-text-muted">
                                        {detail.subtitle}
                                    </p>
                                ) : null}
                            </div>
                            {detail?.url ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 shrink-0 gap-1 px-2"
                                    onClick={() => {
                                        if (detail.url) void commands.openUrlExternal(detail.url);
                                    }}
                                >
                                    <Icon icon={RiExternalLinkLine} size={ICON_SIZE_SM} />
                                    Open on GitHub
                                </Button>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 pl-9 text-xs text-text-muted">
                            {detail?.author ? <span>@{detail.author}</span> : null}
                            {detail?.meta ? <span>{detail.meta}</span> : null}
                            {loading ? <span>Refreshing…</span> : null}
                        </div>
                    </div>
                    <ScrollArea className="min-h-0 flex-1">
                        <div className="px-3 py-3">
                            {detail?.body?.trim() ? (
                                <GitMarkdown content={detail.body} />
                            ) : (
                                <p className="text-sm text-text-muted">
                                    {loading ? "Loading details…" : "No description."}
                                </p>
                            )}
                        </div>
                    </ScrollArea>
                </>
            )}
        </div>
    );
}

export function GitHubSection({ section }: { section: GitHubListSection }) {
    const meta = SECTION_META[section];
    const { project_path } = useProjectState();
    const auth = useGitHubAuth();
    const { query } = useFilter();
    const [items, setItems] = useState<GhItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [repo, setRepo] = useState<{ owner: string; repo: string } | null>(null);
    const [issueState, setIssueState] = useState<IssueStateFilter>("open");
    const [selectedId, setSelectedId] = useState<string | number | null>(null);
    const [detail, setDetail] = useState<GhDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [createPrOpen, setCreatePrOpen] = useState(false);

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

            const state = supportsStateFilter(section) ? issueState : undefined;
            setItems(
                normalize(
                    section,
                    await parseApi(meta.endpoint(resolved.owner, resolved.repo, state)),
                ),
            );
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
    }, [auth.loggedIn, issueState, meta, project_path, section]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        setSelectedId(null);
        setDetail(null);
        setItems([]);
        setError(null);
    }, [section, issueState]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return items;
        return items.filter(
            (item) =>
                item.title.toLowerCase().includes(q) ||
                item.subtitle?.toLowerCase().includes(q) ||
                item.status?.toLowerCase().includes(q) ||
                item.author?.toLowerCase().includes(q),
        );
    }, [items, query]);

    const selectedItem = useMemo(
        () => filtered.find((item) => item.id === selectedId) ?? null,
        [filtered, selectedId],
    );

    useEffect(() => {
        if (!selectedItem) {
            setDetail(null);
            setDetailLoading(false);
            return;
        }

        const fromList: GhDetail = {
            title: selectedItem.title,
            status: selectedItem.status,
            author: selectedItem.author,
            body: selectedItem.body,
            url: selectedItem.url,
            subtitle: selectedItem.subtitle,
            meta: selectedItem.meta,
        };
        setDetail(fromList);

        if (
            !repo ||
            !supportsStateFilter(section) ||
            selectedItem.number == null
        ) {
            setDetailLoading(false);
            return;
        }

        let cancelled = false;
        setDetailLoading(true);
        const path =
            section === "pull-requests"
                ? `/repos/${repo.owner}/${repo.repo}/pulls/${selectedItem.number}`
                : `/repos/${repo.owner}/${repo.repo}/issues/${selectedItem.number}`;

        void parseApi(path)
            .then((raw) => {
                if (cancelled) return;
                const d = raw as Record<string, unknown>;
                const user =
                    d.user && typeof d.user === "object"
                        ? (d.user as { login?: string }).login
                        : selectedItem.author;
                setDetail({
                    title: String(d.title ?? selectedItem.title),
                    status: String(d.state ?? selectedItem.status ?? ""),
                    author: user,
                    body: typeof d.body === "string" ? d.body : selectedItem.body,
                    url:
                        typeof d.html_url === "string"
                            ? d.html_url
                            : selectedItem.url,
                    subtitle: selectedItem.subtitle,
                    meta: formatRelative(d.updated_at ?? d.created_at) || selectedItem.meta,
                });
            })
            .catch(() => {
                if (!cancelled) {
                    // Keep list-derived detail; body may already be present from the list payload.
                }
            })
            .finally(() => {
                if (!cancelled) setDetailLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [repo, section, selectedItem]);

    const emptyLabel = supportsStateFilter(section)
        ? meta.empty(issueState)
        : meta.empty();

    const closeDetail = useCallback(() => setSelectedId(null), []);

    useEffect(() => {
        if (!selectedItem) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                closeDetail();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selectedItem, closeDetail]);


    const listPane = (
        <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden border border-border-subtle bg-panel">
            <ScrollArea className="h-full min-h-0 p-2" fadeFrom="from-panel">
                {loading && items.length === 0 ? (
                    <GitListSkeleton rows={10} />
                ) : error && items.length === 0 ? (
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
                    <p className="px-2 py-3 text-sm text-text-muted">{emptyLabel}</p>
                ) : (
                    <ul className="flex flex-col gap-0.5">
                        {filtered.map((item) => (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    onClick={() => setSelectedId(item.id)}
                                    className={cn(
                                        "flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left hover:bg-panel-hover/60",
                                        selectedId === item.id && "bg-panel-hover",
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="flex min-w-0 items-start gap-2 text-sm leading-snug text-text-primary">
                                            <ItemStatusIcon status={item.status} />
                                            <span className="line-clamp-2">{item.title}</span>
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
                                                    icon={RiExternalLinkLine}
                                                    size={ICON_SIZE_SM}
                                                    className="shrink-0 text-text-muted"
                                                />
                                            ) : null}
                                        </div>
                                    ) : null}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </ScrollArea>
        </div>
    );

    const detailPane = selectedItem && repo ? (
        <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden border border-border-subtle bg-panel">
            <GitHubDetailPane
                section={section}
                item={selectedItem}
                owner={repo.owner}
                repo={repo.repo}
                onBack={closeDetail}
            />
        </div>
    ) : (
        <div className="workbench-panel flex h-full items-center justify-center border border-border-subtle bg-panel px-4 text-sm text-text-muted">
            Select an item to open it in this panel.
        </div>
    );

    return (
        <div className="flex h-full min-h-0 flex-col">
            <GitChromeActions>
                {supportsStateFilter(section) ? (
                    <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-2 capitalize"
                            >
                                {issueState}
                                <Icon icon={RiArrowDownSLine} size={ICON_SIZE_SM} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuRadioGroup
                                value={issueState}
                                onValueChange={(v) =>
                                    setIssueState(v as IssueStateFilter)
                                }
                            >
                                <DropdownMenuRadioItem value="open">Open</DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="closed">
                                    Closed
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : null}
                {section === "pull-requests" ? (
                    <Tooltip content="Create pull request">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setCreatePrOpen(true)}
                            aria-label="Create pull request"
                        >
                            <Icon icon={RiGitPullRequestLine} size={ICON_SIZE_SM} />
                        </Button>
                    </Tooltip>
                ) : null}
                {!auth.loggedIn ? (
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => void loginGitHub()}
                    >
                        Sign in
                    </Button>
                ) : null}
                <Tooltip content="Refresh">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => void load()}
                        aria-label="Refresh"
                    >
                        <Icon icon={RiRefreshLine} size={ICON_SIZE_SM} />
                    </Button>
                </Tooltip>
            </GitChromeActions>
            <CreatePullRequestDialog
                open={createPrOpen}
                onOpenChange={setCreatePrOpen}
                owner={repo?.owner ?? null}
                repo={repo?.repo ?? null}
                onCreated={() => void load()}
            />

            <Panel
                direction="horizontal"
                paneGap="var(--workbench-gap)"
                storageKey={`git-github-${section}-split`}
                hideSeparator
                className="h-full min-h-0 flex-1"
                panes={[
                    {
                        id: "github-list",
                        preferredSize: 320,
                        minSize: 220,
                        maxSize: 480,
                        snap: true,
                        children: listPane,
                    },
                    {
                        id: "github-detail",
                        flexible: true,
                        minSize: 360,
                        visible: Boolean(selectedItem),
                        children: detailPane,
                    },
                ]}
            />
        </div>
    );
}
