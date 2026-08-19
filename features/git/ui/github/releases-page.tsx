"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll";
import { cn } from "@/lib/utils";
import { useProjectState, commands } from "@/lib/backend";
import { loginGitHub, useGitHubAuth } from "@/lib/github-auth/store";
import { getShapeAccessToken } from "@/lib/shape-auth/store";
import { notify } from "@/features/notifications";
import { FadeTruncate } from "@/components/ui/fade-truncate";
import { GitMarkdown } from "./markdown";
import { GitAiAction } from "@/features/git/ui/shared/ai-insight";
import { formatRelative } from "@/features/git/ui/actions/utils";
import { GitListSkeleton } from "@/features/git/ui/shared/skeletons";
import { useFilter } from "@/features/git/ui/manager/filter-context";
import { Avatar } from "./detail/widgets";
import { formatBytes, type ReleaseAsset } from "./detail/types";
import { Panel } from "@/features/panels";

type ReleaseRow = {
    id: number;
    name: string;
    tagName: string;
    body: string;
    htmlUrl?: string;
    authorLogin?: string;
    authorAvatar?: string;
    publishedAt?: string;
    prerelease: boolean;
    draft: boolean;
    assets: ReleaseAsset[];
};

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

/** Releases: version list + notes panel (Actions-style workbench chrome). */
export function ReleasesPage() {
    const { project_path } = useProjectState();
    const auth = useGitHubAuth();
    const { query } = useFilter();
    const [repo, setRepo] = useState<{ owner: string; repo: string } | null>(null);
    const [releases, setReleases] = useState<ReleaseRow[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aiSummary, setAiSummary] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);

    const owner = repo?.owner;
    const repoName = repo?.repo;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const resolved = await resolveOwnerRepo(project_path);
            setRepo(resolved);
            if (!resolved) {
                setReleases([]);
                setError("Connect a GitHub remote to load releases.");
                return;
            }
            if (!auth.loggedIn) {
                setReleases([]);
                setError("Sign in with GitHub to load releases.");
                return;
            }
            const relRaw = await parseApi(
                `/repos/${resolved.owner}/${resolved.repo}/releases?per_page=40`,
            );
            const relArr = Array.isArray(relRaw) ? relRaw : [];
            setReleases(
                relArr.map((r: Record<string, unknown>) => {
                    const author =
                        r.author && typeof r.author === "object"
                            ? (r.author as { login?: string; avatar_url?: string })
                            : null;
                    const assets = Array.isArray(r.assets)
                        ? (r.assets as ReleaseAsset[])
                        : [];
                    return {
                        id: Number(r.id),
                        name: String(r.name || r.tag_name || "Untitled"),
                        tagName: String(r.tag_name || ""),
                        body: typeof r.body === "string" ? r.body : "",
                        htmlUrl: typeof r.html_url === "string" ? r.html_url : undefined,
                        authorLogin: author?.login,
                        authorAvatar: author?.avatar_url,
                        publishedAt:
                            typeof r.published_at === "string"
                                ? r.published_at
                                : typeof r.created_at === "string"
                                  ? r.created_at
                                  : undefined,
                        prerelease: Boolean(r.prerelease),
                        draft: Boolean(r.draft),
                        assets,
                    };
                }),
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setReleases([]);
        } finally {
            setLoading(false);
        }
    }, [project_path, auth.loggedIn]);

    useEffect(() => {
        void load();
    }, [load]);

    const q = query.trim().toLowerCase();
    const filtered = useMemo(
        () =>
            releases.filter((r) => {
                if (!q) return true;
                return (
                    r.name.toLowerCase().includes(q)
                    || r.tagName.toLowerCase().includes(q)
                    || r.body.toLowerCase().includes(q)
                );
            }),
        [releases, q],
    );

    useEffect(() => {
        if (filtered.length === 0) {
            setSelectedId(null);
            return;
        }
        if (selectedId != null && filtered.some((r) => r.id === selectedId)) return;
        setSelectedId(filtered[0]!.id);
    }, [filtered, selectedId]);

    useEffect(() => {
        setAiSummary(null);
        setAiLoading(false);
    }, [selectedId]);

    const selected = useMemo(
        () => filtered.find((r) => r.id === selectedId) ?? null,
        [filtered, selectedId],
    );

    const latestId = useMemo(() => {
        const firstStable = releases.find((r) => !r.prerelease && !r.draft);
        return firstStable?.id ?? releases[0]?.id ?? null;
    }, [releases]);

    const runSummarize = async () => {
        if (!owner || !repoName || !selected) return;
        const token = getShapeAccessToken();
        if (!token) {
            notify.error("AI Error", "Sign in to Shape to summarize releases.");
            return;
        }
        setAiLoading(true);
        try {
            const text = await commands.summarizeRelease(
                owner,
                repoName,
                selected.id,
                "summarize",
                token,
            );
            setAiSummary(text.trim());
            void import("@/lib/shape-auth/store")
                .then(({ refreshShapeAuth }) => {
                    void refreshShapeAuth();
                })
                .catch(() => undefined);
        } catch (err) {
            notify.error("AI Error", err instanceof Error ? err.message : String(err));
        } finally {
            setAiLoading(false);
        }
    };

    const versionsPane = (
        <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden">
            <div className="flex h-9 shrink-0 items-center gap-2 px-3">
                <Icon name="sell" size={16} className="shrink-0 text-text-muted" />
                <FadeTruncate
                    className="min-w-0 flex-1 text-sm font-medium"
                    title={owner && repoName ? `Releases · ${owner}/${repoName}` : "Releases"}
                >
                    Releases
                    {owner && repoName ? (
                        <span className="font-normal text-text-muted">
                            {" "}
                            · {owner}/{repoName}
                        </span>
                    ) : null}
                </FadeTruncate>
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
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => void load()}
                    aria-label="Refresh"
                >
                    <Icon name="refresh" size={14} />
                </Button>
            </div>
            <div className="px-3 pb-1.5 text-xs font-medium text-text-muted">Versions</div>
            <ScrollArea className="min-h-0 flex-1" fadeFrom="from-editor">
                <div className="flex flex-col gap-0.5 px-1.5 pb-2">
                    {loading && filtered.length === 0 ? (
                        <div className="px-1 py-1">
                            <GitListSkeleton rows={8} />
                        </div>
                    ) : error && filtered.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-text-muted">{error}</p>
                    ) : filtered.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-text-muted">No releases.</p>
                    ) : (
                        filtered.map((rel) => {
                            const isLatest = rel.id === latestId;
                            const active = rel.id === selectedId;
                            const label = rel.tagName || rel.name;
                            return (
                                <button
                                    key={rel.id}
                                    type="button"
                                    onClick={() => setSelectedId(rel.id)}
                                    className={cn(
                                        "flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                                        active
                                            ? "bg-panel-hover text-text-primary"
                                            : "text-text-secondary hover:bg-panel-hover/60 hover:text-text-primary",
                                    )}
                                >
                                    <span className="flex min-w-0 items-center gap-1.5">
                                        <Icon
                                            name="sell"
                                            size={12}
                                            className="shrink-0 text-text-muted"
                                        />
                                        <span className="truncate font-mono text-sm">{label}</span>
                                        {isLatest ? (
                                            <span className="shrink-0 rounded-md bg-success/20 px-1.5 py-px text-xs font-medium text-success">
                                                Latest
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="truncate pl-4 text-xs text-text-muted">
                                        {[
                                            rel.publishedAt
                                                ? formatRelative(rel.publishedAt)
                                                : null,
                                            rel.prerelease ? "Pre-release" : null,
                                            rel.draft ? "Draft" : null,
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            </ScrollArea>
        </div>
    );

    const detailPane = (
        <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden">
            {!selected ? (
                <div className="flex flex-1 items-center justify-center px-6 text-sm text-text-muted">
                    {loading ? "Loading releases…" : "Select a version"}
                </div>
            ) : (
                <>
                    <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 px-3 py-3">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-semibold text-text-primary">
                                    {selected.name}
                                </h2>
                                {selected.id === latestId && !selected.prerelease ? (
                                    <span className="rounded-md bg-success/20 px-2 py-0.5 text-xs font-medium text-success">
                                        Latest
                                    </span>
                                ) : null}
                                {selected.prerelease ? (
                                    <span className="rounded-md bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
                                        Pre-release
                                    </span>
                                ) : null}
                                {selected.draft ? (
                                    <span className="rounded-md bg-panel-hover px-2 py-0.5 text-xs font-medium text-text-muted">
                                        Draft
                                    </span>
                                ) : null}
                            </div>
                            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
                                {selected.authorLogin ? (
                                    <span className="inline-flex items-center gap-1.5">
                                        <Avatar
                                            person={{
                                                login: selected.authorLogin,
                                                avatar_url: selected.authorAvatar,
                                            }}
                                            size={16}
                                        />
                                        {selected.authorLogin}
                                    </span>
                                ) : null}
                                {selected.publishedAt ? (
                                    <span>released {formatRelative(selected.publishedAt)}</span>
                                ) : null}
                                {selected.tagName ? (
                                    <span className="inline-flex items-center gap-1 font-mono text-text-secondary">
                                        <Icon name="sell" size={12} />
                                        {selected.tagName}
                                    </span>
                                ) : null}
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                            <GitAiAction
                                label="Summarize"
                                title="Release brief"
                                content={aiSummary}
                                loading={aiLoading}
                                onRun={runSummarize}
                                mdCtx={{
                                    owner: owner ?? undefined,
                                    repo: repoName ?? undefined,
                                }}
                            />
                            {selected.htmlUrl ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-chrome gap-1 px-md"
                                    onClick={() =>
                                        void commands.openUrlExternal(selected.htmlUrl!)
                                    }
                                >
                                    <Icon name="open_in_new" size={14} />
                                    GitHub
                                </Button>
                            ) : null}
                        </div>
                    </div>

                    <ScrollArea className="min-h-0 flex-1" fadeFrom="from-editor">
                        <div className="flex max-w-3xl flex-col gap-5 px-4 py-4">
                            {selected.body.trim() ? (
                                <GitMarkdown
                                    content={selected.body}
                                    ctx={{
                                        owner: owner ?? undefined,
                                        repo: repoName ?? undefined,
                                    }}
                                />
                            ) : (
                                <p className="text-sm text-text-muted">No release notes.</p>
                            )}

                            {selected.assets.length > 0 ? (
                                <section>
                                    <h3 className="mb-2 text-xs font-medium text-text-muted">
                                        Assets
                                    </h3>
                                    <ul className="flex flex-col gap-0.5">
                                        {selected.assets.map((a) => (
                                            <li
                                                key={a.id}
                                                className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-panel-hover/50"
                                            >
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm">{a.name}</div>
                                                    <div className="text-xs text-text-muted">
                                                        {[
                                                            formatBytes(a.size),
                                                            a.download_count != null
                                                                ? `${a.download_count} downloads`
                                                                : null,
                                                        ]
                                                            .filter(Boolean)
                                                            .join(" · ")}
                                                    </div>
                                                </div>
                                                {a.browser_download_url ? (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 shrink-0 px-2"
                                                        onClick={() =>
                                                            void commands.openUrlExternal(
                                                                a.browser_download_url!,
                                                            )
                                                        }
                                                    >
                                                        Download
                                                    </Button>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ) : null}
                        </div>
                    </ScrollArea>
                </>
            )}
        </div>
    );

    return (
        <Panel
            direction="horizontal"
            paneGap="var(--workbench-gap)"
            storageKey="git-releases-split"
            hideSeparator
            className="h-full min-h-0"
            panes={[
                {
                    id: "releases-versions",
                    preferredSize: 240,
                    minSize: 180,
                    maxSize: 340,
                    snap: true,
                    children: versionsPane,
                },
                {
                    id: "releases-detail",
                    flexible: true,
                    minSize: 280,
                    children: detailPane,
                },
            ]}
        />
    );
}
