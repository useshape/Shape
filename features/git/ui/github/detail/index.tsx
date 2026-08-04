"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll";
import { FileIcon } from "@/components/ui/file-icon";
import { cn } from "@/lib/utils";
import { parseApi } from "@/features/git/ui/actions/utils";
import { statusIcon, statusTone } from "@/features/git/ui/actions/utils";
import { GitMarkdown, type GitMarkdownCtx } from "../markdown";
import { GitAiInsight } from "@/features/git/ui/shared/ai-insight";
import { AiActionButton } from "@/features/git/ui/shared/ai-action-button";
import { openProjectFile } from "@/lib/open-project-file";
import { commands } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { getShapeAccessToken } from "@/lib/shape-auth/store";
import {
    type CheckRun,
    type Comment,
    type DetailSection,
    type GhListItem,
    type Label,
    type Person,
    type PrCommit,
    type PrFile,
    type ReleaseAsset,
    formatBytes,
    formatRelative,
} from "./types";
import {
    Avatar,
    CommentCard,
    SidebarSection,
    StateBadge,
    ThreadMessage,
    openGitHubUser,
} from "./widgets";

export type { GhListItem } from "./types";

export function GitHubDetailPane({
    section,
    item,
    owner,
    repo,
    onBack,
}: {
    section: DetailSection;
    item: GhListItem | null;
    owner: string;
    repo: string;
    onBack?: () => void;
}) {
    const [loading, setLoading] = useState(false);
    const [title, setTitle] = useState("");
    const [status, setStatus] = useState<string | undefined>();
    const [merged, setMerged] = useState(false);
    const [body, setBody] = useState("");
    const [url, setUrl] = useState<string | undefined>();
    const [author, setAuthor] = useState<Person | null>(null);
    const [createdAt, setCreatedAt] = useState<string | undefined>();
    const [updatedAt, setUpdatedAt] = useState<string | undefined>();
    const [baseRef, setBaseRef] = useState<string | undefined>();
    const [headRef, setHeadRef] = useState<string | undefined>();
    const [headSha, setHeadSha] = useState<string | undefined>();
    const [labels, setLabels] = useState<Label[]>([]);
    const [assignees, setAssignees] = useState<Person[]>([]);
    const [reviewers, setReviewers] = useState<Person[]>([]);
    const [milestone, setMilestone] = useState<string | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [commits, setCommits] = useState<PrCommit[]>([]);
    const [files, setFiles] = useState<PrFile[]>([]);
    const [checks, setChecks] = useState<CheckRun[]>([]);
    const [assets, setAssets] = useState<ReleaseAsset[]>([]);
    const [tagName, setTagName] = useState<string | undefined>();
    const [additions, setAdditions] = useState(0);
    const [deletions, setDeletions] = useState(0);
    const [tab, setTab] = useState("conversation");
    const [aiSummary, setAiSummary] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);

    const isPr = section === "pull-requests";
    const isIssue = section === "issues";
    const isRelease = section === "releases";

    useEffect(() => {
        setTab("conversation");
        setAiSummary(null);
        setAiLoading(false);
    }, [item?.id, section]);

    useEffect(() => {
        if (!item) return;
        setTitle(item.title);
        setStatus(item.status);
        setBody(item.body ?? "");
        setUrl(item.url);
        setAuthor(item.author ? { login: item.author } : null);
        setMerged(false);
        setComments([]);
        setCommits([]);
        setFiles([]);
        setChecks([]);
        setAssets([]);
        setLabels([]);
        setAssignees([]);
        setReviewers([]);
        setMilestone(null);
        setAdditions(0);
        setDeletions(0);

        let cancelled = false;
        setLoading(true);

        void (async () => {
            try {
                if ((isPr || isIssue) && item.number != null) {
                    const n = item.number;
                    const mainPath = isPr
                        ? `/repos/${owner}/${repo}/pulls/${n}`
                        : `/repos/${owner}/${repo}/issues/${n}`;

                    const main = (await parseApi(mainPath)) as Record<string, unknown>;
                    if (cancelled) return;

                    const user =
                        main.user && typeof main.user === "object"
                            ? (main.user as Person)
                            : item.author
                              ? { login: item.author }
                              : null;

                    setTitle(String(main.title ?? item.title));
                    setStatus(String(main.state ?? item.status ?? ""));
                    setMerged(Boolean(main.merged));
                    setBody(typeof main.body === "string" ? main.body : item.body ?? "");
                    setUrl(
                        typeof main.html_url === "string" ? main.html_url : item.url,
                    );
                    setAuthor(user);
                    setCreatedAt(
                        typeof main.created_at === "string" ? main.created_at : undefined,
                    );
                    setUpdatedAt(
                        typeof main.updated_at === "string" ? main.updated_at : undefined,
                    );
                    setLabels(
                        Array.isArray(main.labels)
                            ? (main.labels as Label[]).map((l) => ({
                                  name: String(l.name),
                                  color: l.color ? String(l.color) : undefined,
                              }))
                            : [],
                    );
                    setAssignees(
                        Array.isArray(main.assignees)
                            ? (main.assignees as Person[]).map((a) => ({
                                  login: String(a.login),
                                  avatar_url: a.avatar_url,
                              }))
                            : [],
                    );
                    setMilestone(
                        main.milestone && typeof main.milestone === "object"
                            ? String((main.milestone as { title?: string }).title ?? "")
                            : null,
                    );

                    if (isPr) {
                        setBaseRef(
                            main.base && typeof main.base === "object"
                                ? String((main.base as { ref?: string }).ref ?? "")
                                : undefined,
                        );
                        setHeadRef(
                            main.head && typeof main.head === "object"
                                ? String((main.head as { ref?: string }).ref ?? "")
                                : undefined,
                        );
                        const sha =
                            main.head && typeof main.head === "object"
                                ? String((main.head as { sha?: string }).sha ?? "")
                                : "";
                        setHeadSha(sha || undefined);
                        setAdditions(Number(main.additions ?? 0));
                        setDeletions(Number(main.deletions ?? 0));

                        const [commentsRaw, commitsRaw, filesRaw, reviewsRaw] =
                            await Promise.all([
                                parseApi(
                                    `/repos/${owner}/${repo}/issues/${n}/comments?per_page=50`,
                                ).catch(() => []),
                                parseApi(
                                    `/repos/${owner}/${repo}/pulls/${n}/commits?per_page=50`,
                                ).catch(() => []),
                                parseApi(
                                    `/repos/${owner}/${repo}/pulls/${n}/files?per_page=100`,
                                ).catch(() => []),
                                parseApi(
                                    `/repos/${owner}/${repo}/pulls/${n}/requested_reviewers`,
                                ).catch(() => ({})),
                            ]);
                        if (cancelled) return;

                        setComments(
                            (Array.isArray(commentsRaw) ? commentsRaw : []).map(
                                (c) => c as Comment,
                            ),
                        );
                        setCommits(
                            (Array.isArray(commitsRaw) ? commitsRaw : []).map(
                                (c) => c as PrCommit,
                            ),
                        );
                        const fileList = (
                            Array.isArray(filesRaw) ? filesRaw : []
                        ).map((f) => f as PrFile);
                        setFiles(fileList);
                        if (!main.additions && !main.deletions) {
                            setAdditions(
                                fileList.reduce((s, f) => s + (f.additions ?? 0), 0),
                            );
                            setDeletions(
                                fileList.reduce((s, f) => s + (f.deletions ?? 0), 0),
                            );
                        }

                        const rev = reviewsRaw as {
                            users?: Person[];
                        };
                        setReviewers(
                            Array.isArray(rev.users)
                                ? rev.users.map((u) => ({
                                      login: String(u.login),
                                      avatar_url: u.avatar_url,
                                  }))
                                : [],
                        );

                        if (sha) {
                            const checksRaw = await parseApi(
                                `/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=50`,
                            ).catch(() => null);
                            if (cancelled) return;
                            const runs =
                                checksRaw &&
                                typeof checksRaw === "object" &&
                                Array.isArray(
                                    (checksRaw as { check_runs?: CheckRun[] }).check_runs,
                                )
                                    ? (checksRaw as { check_runs: CheckRun[] }).check_runs
                                    : [];
                            setChecks(runs);
                        }
                    } else {
                        const commentsRaw = await parseApi(
                            `/repos/${owner}/${repo}/issues/${n}/comments?per_page=50`,
                        ).catch(() => []);
                        if (cancelled) return;
                        setComments(
                            (Array.isArray(commentsRaw) ? commentsRaw : []).map(
                                (c) => c as Comment,
                            ),
                        );
                    }
                } else if (isRelease) {
                    const path =
                        typeof item.id === "number"
                            ? `/repos/${owner}/${repo}/releases/${item.id}`
                            : null;
                    if (path) {
                        const rel = (await parseApi(path)) as Record<string, unknown>;
                        if (cancelled) return;
                        setTitle(String(rel.name || rel.tag_name || item.title));
                        setTagName(
                            typeof rel.tag_name === "string" ? rel.tag_name : undefined,
                        );
                        setBody(
                            typeof rel.body === "string" ? rel.body : item.body ?? "",
                        );
                        setUrl(
                            typeof rel.html_url === "string" ? rel.html_url : item.url,
                        );
                        setAuthor(
                            rel.author && typeof rel.author === "object"
                                ? (rel.author as Person)
                                : item.author
                                  ? { login: item.author }
                                  : null,
                        );
                        setCreatedAt(
                            typeof rel.published_at === "string"
                                ? rel.published_at
                                : typeof rel.created_at === "string"
                                  ? rel.created_at
                                  : undefined,
                        );
                        setStatus(rel.prerelease ? "prerelease" : "published");
                        setAssets(
                            Array.isArray(rel.assets)
                                ? (rel.assets as ReleaseAsset[])
                                : [],
                        );
                        setTab("notes");
                    }
                }
            } catch {
                /* keep list-derived fields */
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [item, owner, repo, isPr, isIssue, isRelease]);

    const tabs = useMemo(() => {
        if (isPr) {
            return [
                { id: "conversation", label: `Conversation (${comments.length})` },
                { id: "commits", label: `Commits (${commits.length})` },
                { id: "checks", label: `Checks (${checks.length})` },
                { id: "files", label: `Files changed (${files.length})` },
            ];
        }
        if (isIssue) {
            return [{ id: "conversation", label: `Conversation (${comments.length})` }];
        }
        if (isRelease) {
            return [
                { id: "notes", label: "Release notes" },
                { id: "assets", label: `Assets (${assets.length})` },
            ];
        }
        return [{ id: "conversation", label: "Details" }];
    }, [isPr, isIssue, isRelease, comments.length, commits.length, checks.length, files.length, assets.length]);

    if (!item) {
        return (
            <div className="workbench-panel flex h-full min-h-0 flex-col items-center justify-center overflow-hidden border border-border-subtle bg-editor px-6 text-sm text-text-muted">
                Select an item
            </div>
        );
    }

    const openUrl = (href?: string) => {
        if (!href) return;
        void commands.openUrlExternal(href);
    };

    const mdCtx: GitMarkdownCtx = {
        owner,
        repo,
        ref: headSha || headRef || undefined,
    };

    const openCommit = (sha: string) => {
        void commands.openUrlExternal(
            `https://github.com/${owner}/${repo}/commit/${sha}`,
        );
    };

    const openChangedFile = async (path: string) => {
        const ok = await openProjectFile(path);
        if (ok) return;
        const ref = headSha || headRef || "HEAD";
        await commands.openUrlExternal(
            `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(ref)}/${path
                .split("/")
                .map(encodeURIComponent)
                .join("/")}`,
        );
        notify.info("Opened on GitHub", path);
    };

    const handleSummarizePr = async () => {
        if (!isPr || item?.number == null) return;
        const token = getShapeAccessToken();
        if (!token) {
            notify.error("AI Error", "Sign in to Shape to summarize pull requests.");
            return;
        }
        setAiLoading(true);
        try {
            const summary = await commands.summarizePullRequest(
                owner,
                repo,
                item.number,
                token,
            );
            setAiSummary(summary.trim());
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

    const openBranch = (ref?: string) => {
        if (!ref) return;
        void commands.openUrlExternal(
            `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(ref)}`,
        );
    };

    return (
        <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden bg-editor">
            {/* Header — back + title + actions */}
            <div className="shrink-0 px-3 py-3">
                <div className="flex items-start gap-2">
                    {onBack ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="mt-0.5 h-7 w-7 shrink-0 px-0"
                            onClick={onBack}
                            aria-label="Back to list"
                        >
                            <Icon name="arrow_back" size={16} />
                        </Button>
                    ) : null}
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            {url ? (
                                <button
                                    type="button"
                                    className="min-w-0 text-left text-base font-semibold text-text-primary hover:text-accent"
                                    onClick={() => void commands.openUrlExternal(url)}
                                    title="Open on GitHub"
                                >
                                    {title}
                                    {item.number != null ? (
                                        <span className="ml-1.5 font-normal text-text-muted">
                                            #{item.number}
                                        </span>
                                    ) : null}
                                </button>
                            ) : (
                                <h2 className="min-w-0 text-base font-semibold text-text-primary">
                                    {title}
                                    {item.number != null ? (
                                        <span className="ml-1.5 font-normal text-text-muted">
                                            #{item.number}
                                        </span>
                                    ) : null}
                                </h2>
                            )}
                            <StateBadge status={status} merged={merged} />
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
                            {author ? (
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1.5 text-text-secondary hover:text-accent"
                                    onClick={() => openGitHubUser(author.login)}
                                >
                                    <Avatar person={author} size={16} />
                                    <span>{author.login}</span>
                                </button>
                            ) : null}
                            {isPr && baseRef && headRef ? (
                                <span>
                                    {merged ? "merged" : status === "open" ? "wants to merge" : "closed"}{" "}
                                    into{" "}
                                    <button
                                        type="button"
                                        className="font-mono text-text-secondary hover:text-accent hover:underline"
                                        onClick={() => openBranch(baseRef)}
                                    >
                                        {baseRef}
                                    </button>{" "}
                                    from{" "}
                                    <button
                                        type="button"
                                        className="font-mono text-text-secondary hover:text-accent hover:underline"
                                        onClick={() => openBranch(headRef)}
                                    >
                                        {headRef}
                                    </button>
                                </span>
                            ) : null}
                            {isRelease && tagName ? (
                                <button
                                    type="button"
                                    className="hover:text-accent hover:underline"
                                    onClick={() => openBranch(tagName)}
                                >
                                    tag {tagName}
                                </button>
                            ) : null}
                            {createdAt ? <span>· {formatRelative(createdAt)}</span> : null}
                            {loading ? <span>· Loading…</span> : null}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {isPr && item?.number != null ? (
                            <AiActionButton
                                loading={aiLoading}
                                onClick={() => void handleSummarizePr()}
                            >
                                {aiLoading
                                    ? "Summarizing…"
                                    : aiSummary
                                      ? "Re-summarize"
                                      : "Summarize"}
                            </AiActionButton>
                        ) : null}
                        {url ? (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2"
                                onClick={() => {
                                    if (url) void commands.openUrlExternal(url);
                                }}
                            >
                                <Icon name="open_in_new" size={14} />
                                Open on GitHub
                            </Button>
                        ) : null}
                    </div>
                </div>

                {isPr && (additions > 0 || deletions > 0 || files.length > 0) ? (
                    <div className={cn("mt-2 flex items-center gap-2 text-xs", onBack && "pl-9")}>
                        <span className="text-git-added">+{additions}</span>
                        <span className="text-git-deleted">−{deletions}</span>
                        <span className="h-2 w-16 overflow-hidden rounded-sm bg-panel-hover">
                            <span
                                className="block h-full bg-git-added"
                                style={{
                                    width: `${Math.min(100, (additions / Math.max(1, additions + deletions)) * 100)}%`,
                                }}
                            />
                        </span>
                    </div>
                ) : null}
            </div>

            <div className="flex min-h-0 min-w-0 flex-1">
                {/* Main column */}
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <Tabs
                        value={tab}
                        onValueChange={setTab}
                        className="flex h-0 min-h-0 flex-1 flex-col"
                    >
                        <div className="flex shrink-0 items-center px-2 py-1">
                            <TabsList>
                                {tabs.map((t) => (
                                    <TabsTrigger key={t.id} value={t.id}>
                                        {t.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </div>

                        <TabsContent
                            value="conversation"
                            className="flex h-0 min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                        >
                            <ScrollArea className="min-h-0 flex-1">
                                <div className="flex flex-col gap-0 p-3">
                                    <GitAiInsight
                                        title="AI summary"
                                        content={aiSummary}
                                        mdCtx={mdCtx}
                                        className="mb-3"
                                        onDismiss={() => setAiSummary(null)}
                                    />
                                    <ThreadMessage
                                        person={author}
                                        when={formatRelative(createdAt)}
                                        isLast={comments.length === 0}
                                    >
                                        {body.trim() ? (
                                            <GitMarkdown content={body} ctx={mdCtx} />
                                        ) : (
                                            <p className="text-sm text-text-muted">
                                                No description provided.
                                            </p>
                                        )}
                                    </ThreadMessage>
                                    {comments.map((c, i) => (
                                        <CommentCard
                                            key={c.id}
                                            comment={c}
                                            ctx={mdCtx}
                                            isLast={i === comments.length - 1}
                                        />
                                    ))}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent
                            value="notes"
                            className="flex h-0 min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                        >
                            <ScrollArea className="min-h-0 flex-1">
                                <div className="min-w-0 overflow-x-auto p-4">
                                    {body.trim() ? (
                                        <GitMarkdown content={body} ctx={mdCtx} />
                                    ) : (
                                        <p className="text-sm text-text-muted">
                                            No release notes.
                                        </p>
                                    )}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent
                            value="commits"
                            className="flex h-0 min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                        >
                            <ScrollArea className="min-h-0 flex-1">
                                <ul className="flex flex-col gap-0.5 p-2">
                                    {commits.length === 0 ? (
                                        <li className="px-2 py-3 text-sm text-text-muted">
                                            No commits.
                                        </li>
                                    ) : (
                                        commits.map((c) => (
                                            <li key={c.sha}>
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-panel-hover"
                                                    onClick={() => openCommit(c.sha)}
                                                    title="Open commit on GitHub"
                                                >
                                                    <Icon
                                                        name="commit"
                                                        size={14}
                                                        className="shrink-0 text-text-muted"
                                                    />
                                                    <span className="min-w-0 flex-1 truncate text-sm">
                                                        {c.commit.message.split("\n")[0]}
                                                    </span>
                                                    <code className="shrink-0 font-mono text-2xs text-accent">
                                                        {c.sha.slice(0, 7)}
                                                    </code>
                                                </button>
                                            </li>
                                        ))
                                    )}
                                </ul>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent
                            value="checks"
                            className="flex h-0 min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                        >
                            <ScrollArea className="min-h-0 flex-1">
                                <ul className="flex flex-col gap-0.5 p-2">
                                    {checks.length === 0 ? (
                                        <li className="px-2 py-3 text-sm text-text-muted">
                                            {headSha
                                                ? "No check runs."
                                                : "Checks unavailable."}
                                        </li>
                                    ) : (
                                        checks.map((run) => {
                                            const icon = statusIcon(
                                                run.status,
                                                run.conclusion,
                                            );
                                            return (
                                                <li key={run.id}>
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-panel-hover"
                                                        onClick={() => openUrl(run.html_url)}
                                                    >
                                                        <Icon
                                                            name={icon.name}
                                                            filled={icon.filled}
                                                            size={14}
                                                            className={cn(
                                                                "shrink-0",
                                                                statusTone(
                                                                    run.status,
                                                                    run.conclusion,
                                                                ),
                                                                icon.spin && "animate-spin",
                                                            )}
                                                        />
                                                        <span className="min-w-0 flex-1 truncate text-sm">
                                                            {run.name}
                                                        </span>
                                                        <span className="shrink-0 text-2xs capitalize text-text-muted">
                                                            {run.conclusion || run.status}
                                                        </span>
                                                    </button>
                                                </li>
                                            );
                                        })
                                    )}
                                </ul>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent
                            value="files"
                            className="flex h-0 min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                        >
                            <ScrollArea className="min-h-0 flex-1">
                                <ul className="flex flex-col gap-0.5 p-2">
                                    {files.length === 0 ? (
                                        <li className="px-2 py-3 text-sm text-text-muted">
                                            No files.
                                        </li>
                                    ) : (
                                        files.map((f) => (
                                            <li key={f.filename}>
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-panel-hover"
                                                    onClick={() => void openChangedFile(f.filename)}
                                                    title="Open in editor, or on GitHub if missing"
                                                >
                                                    <FileIcon
                                                        name={
                                                            f.filename.split("/").pop() ||
                                                            f.filename
                                                        }
                                                        className="h-3.5 w-3.5 shrink-0"
                                                    />
                                                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-accent">
                                                        {f.filename}
                                                    </span>
                                                    <span className="shrink-0 text-2xs tabular-nums">
                                                        <span className="text-git-added">
                                                            +{f.additions ?? 0}
                                                        </span>{" "}
                                                        <span className="text-git-deleted">
                                                            −{f.deletions ?? 0}
                                                        </span>
                                                    </span>
                                                </button>
                                            </li>
                                        ))
                                    )}
                                </ul>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent
                            value="assets"
                            className="flex h-0 min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                        >
                            <ScrollArea className="min-h-0 flex-1">
                                <ul className="flex flex-col gap-0.5 p-2">
                                    {assets.length === 0 ? (
                                        <li className="px-2 py-3 text-sm text-text-muted">
                                            No assets.
                                        </li>
                                    ) : (
                                        assets.map((a) => (
                                            <li
                                                key={a.id}
                                                className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-panel-hover"
                                            >
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm">
                                                        {a.name}
                                                    </div>
                                                    <div className="text-2xs text-text-muted">
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
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 shrink-0 px-2"
                                                    onClick={() =>
                                                        openUrl(a.browser_download_url)
                                                    }
                                                >
                                                    Download
                                                </Button>
                                            </li>
                                        ))
                                    )}
                                </ul>
                            </ScrollArea>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Sidebar metadata */}
                {(isPr || isIssue || isRelease) && (
                    <aside className="hidden w-50 shrink-0 flex-col overflow-hidden min-[720px]:flex">
                        <ScrollArea className="min-h-0 flex-1">
                            {(isPr || isIssue) && (
                                <>
                                    {isPr ? (
                                        <SidebarSection title="Reviewers">
                                            {reviewers.length === 0 ? (
                                                <span className="text-text-muted">No reviews</span>
                                            ) : (
                                                <ul className="flex flex-col gap-1.5">
                                                    {reviewers.map((r) => (
                                                        <li key={r.login}>
                                                            <button
                                                                type="button"
                                                                className="flex w-full items-center gap-1.5 text-left hover:text-accent"
                                                                onClick={() => openGitHubUser(r.login)}
                                                            >
                                                                <Avatar person={r} size={18} />
                                                                <span className="truncate">
                                                                    {r.login}
                                                                </span>
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </SidebarSection>
                                    ) : null}
                                    <SidebarSection title="Assignees">
                                        {assignees.length === 0 ? (
                                            <span className="text-text-muted">No one assigned</span>
                                        ) : (
                                            <ul className="flex flex-col gap-1.5">
                                                {assignees.map((a) => (
                                                    <li key={a.login}>
                                                        <button
                                                            type="button"
                                                            className="flex w-full items-center gap-1.5 text-left hover:text-accent"
                                                            onClick={() => openGitHubUser(a.login)}
                                                        >
                                                            <Avatar person={a} size={18} />
                                                            <span className="truncate">{a.login}</span>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </SidebarSection>
                                    <SidebarSection title="Labels">
                                        {labels.length === 0 ? (
                                            <span className="text-text-muted">None yet</span>
                                        ) : (
                                            <div className="flex flex-wrap gap-1">
                                                {labels.map((l) => (
                                                    <span
                                                        key={l.name}
                                                        className="rounded-full px-2 py-0.5 text-2xs"
                                                        style={
                                                            l.color
                                                                ? {
                                                                      backgroundColor: `#${l.color}33`,
                                                                      color: `#${l.color}`,
                                                                  }
                                                                : undefined
                                                          }
                                                    >
                                                        {l.name}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </SidebarSection>
                                    <SidebarSection title="Milestone">
                                        {milestone ? (
                                            milestone
                                        ) : (
                                            <span className="text-text-muted">No milestone</span>
                                        )}
                                    </SidebarSection>
                                </>
                            )}
                            {isRelease ? (
                                <SidebarSection title="Tag">
                                    {tagName ?? "—"}
                                </SidebarSection>
                            ) : null}
                            <SidebarSection title="Participants">
                                {author ? (
                                    <button
                                        type="button"
                                        className="flex items-center gap-1.5 hover:text-accent"
                                        onClick={() => openGitHubUser(author.login)}
                                    >
                                        <Avatar person={author} size={18} />
                                        <span className="truncate">{author.login}</span>
                                    </button>
                                ) : (
                                    <span className="text-text-muted">—</span>
                                )}
                            </SidebarSection>
                            {updatedAt ? (
                                <SidebarSection title="Updated">
                                    {formatRelative(updatedAt)}
                                </SidebarSection>
                            ) : null}
                        </ScrollArea>
                    </aside>
                )}
            </div>
        </div>
    );
}
