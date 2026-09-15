"use client";

import {
    RiArrowLeftLine,
    RiChatAiLine,
    RiExternalLinkLine,
    RiGitCommitLine,
    RiSearchEyeLine,
    RiSparkling2Line,
} from "@remixicon/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, ICON_SIZE_SM, ICON_SIZE_XS } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll";
import { FileIcon } from "@/components/ui/file-icon";
import { cn } from "@/lib/utils";
import { parseApi, statusIcon, statusTone } from "@/features/git/ui/actions/utils";
import { GitMarkdown, type GitMarkdownCtx } from "../markdown";
import { openProjectFile } from "@/lib/window/open-project-file";
import { commands } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { getShapeAccessToken } from "@/lib/cloud/store";
import { Panel } from "@/features/panels";
import { parsePrReview, type PrFinding } from "./parse-pr-review";
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
import { GitDetailSkeleton } from "@/features/git/ui/shared/skeletons";

export type { GhListItem } from "./types";

function sendToChat(prompt: string) {
    window.dispatchEvent(
        new CustomEvent("shape-chat-insert-prompt", {
            detail: { prompt, send: false },
        }),
    );
    notify.info("Sent to chat", "Review the prompt in the agent sidebar, then send.");
}

function FindingCard({
    finding,
    focused,
    onShowFile,
    onFix,
}: {
    finding: PrFinding;
    focused?: boolean;
    onShowFile?: () => void;
    onFix: () => void;
}) {
    return (
        <div
            className={cn(
                "rounded-lg border border-border/70 px-2.5 py-2",
                focused && "ring-1 ring-accent/40",
            )}
        >
            <div className="flex flex-wrap items-center gap-1.5">
                <span
                    className={cn(
                        "inline-block rounded px-1.5 py-0.5 text-2xs font-medium capitalize",
                        finding.severity === "blocker" && "bg-error/15 text-error",
                        finding.severity === "should-fix" && "bg-warning/15 text-warning",
                        (finding.severity === "nit" || finding.severity === "info") &&
                            "bg-panel-hover text-text-muted",
                    )}
                >
                    {finding.severity}
                </span>
                {finding.path ? (
                    <button
                        type="button"
                        className="font-mono text-xs text-accent hover:underline"
                        onClick={onShowFile}
                    >
                        {finding.path}
                    </button>
                ) : null}
            </div>
            <p className="mt-1 text-xs text-text-secondary">
                {finding.text.replace(/\*\*[^*]+\*\*/g, "").trim()}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
                {finding.path && onShowFile ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-2xs"
                        onClick={onShowFile}
                    >
                        Show file
                    </Button>
                ) : null}
                <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 gap-1 px-1.5 text-2xs"
                    onClick={onFix}
                >
                    <Icon icon={RiChatAiLine} size={ICON_SIZE_XS} />
                    Fix in chat
                </Button>
            </div>
        </div>
    );
}

export function GitHubDetailPane({
    section,
    item,
    owner,
    repo,
    onBack,
}: {
    section: DetailSection | "issues" | "pull-requests" | "releases";
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
    const [tab, setTab] = useState("overview");
    const [walkthrough, setWalkthrough] = useState<string | null>(null);
    const [walkthroughLoading, setWalkthroughLoading] = useState(false);
    const [findingsMd, setFindingsMd] = useState<string | null>(null);
    const [findingsLoading, setFindingsLoading] = useState(false);
    const [focusedFindingPath, setFocusedFindingPath] = useState<string | null>(null);
    const fileRowRefs = useRef<Map<string, HTMLLIElement>>(new Map());

    const isPr = section === "pull-requests";
    const isIssue = section === "issues";
    const isRelease = section === "releases";

    useEffect(() => {
        setTab(isPr ? "overview" : isRelease ? "notes" : "conversation");
        setWalkthrough(null);
        setWalkthroughLoading(false);
        setFindingsMd(null);
        setFindingsLoading(false);
        setFocusedFindingPath(null);
    }, [item?.id, section, isPr, isRelease]);

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
        setTagName(undefined);
        setBaseRef(undefined);
        setHeadRef(undefined);
        setHeadSha(undefined);
        setCreatedAt(undefined);
        setUpdatedAt(undefined);

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
                    setBody(typeof main.body === "string" ? main.body : (item.body ?? ""));
                    setUrl(typeof main.html_url === "string" ? main.html_url : item.url);
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
                            ? String((main.milestone as { title?: string }).title ?? "") ||
                                  null
                            : null,
                    );

                    if (isPr) {
                        setBaseRef(
                            main.base && typeof main.base === "object"
                                ? String((main.base as { ref?: string }).ref ?? "") ||
                                      undefined
                                : undefined,
                        );
                        setHeadRef(
                            main.head && typeof main.head === "object"
                                ? String((main.head as { ref?: string }).ref ?? "") ||
                                      undefined
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
                        const fileList = (Array.isArray(filesRaw) ? filesRaw : []).map(
                            (f) => f as PrFile,
                        );
                        setFiles(fileList);
                        if (!main.additions && !main.deletions) {
                            setAdditions(
                                fileList.reduce((s, f) => s + (f.additions ?? 0), 0),
                            );
                            setDeletions(
                                fileList.reduce((s, f) => s + (f.deletions ?? 0), 0),
                            );
                        }
                        const rev = reviewsRaw as { users?: Person[] };
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
                } else if (isRelease && typeof item.id === "number") {
                    const rel = (await parseApi(
                        `/repos/${owner}/${repo}/releases/${item.id}`,
                    )) as Record<string, unknown>;
                    if (cancelled) return;
                    setTitle(String(rel.name || rel.tag_name || item.title));
                    setTagName(typeof rel.tag_name === "string" ? rel.tag_name : undefined);
                    setBody(typeof rel.body === "string" ? rel.body : (item.body ?? ""));
                    setUrl(typeof rel.html_url === "string" ? rel.html_url : item.url);
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
                        Array.isArray(rel.assets) ? (rel.assets as ReleaseAsset[]) : [],
                    );
                }
            } catch {
                /* keep list fields */
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [item, owner, repo, isPr, isIssue, isRelease]);

    const findings = useMemo(
        () => parsePrReview(findingsMd ?? "", files.map((f) => f.filename)).findings,
        [findingsMd, files],
    );
    const failedChecks = useMemo(
        () => checks.filter((c) => c.conclusion === "failure"),
        [checks],
    );
    const pendingChecks = useMemo(
        () =>
            checks.filter(
                (c) => c.status === "queued" || c.status === "in_progress" || !c.conclusion,
            ),
        [checks],
    );
    const blockers = useMemo(
        () => findings.filter((f) => f.severity === "blocker"),
        [findings],
    );
    const shouldFix = useMemo(
        () => findings.filter((f) => f.severity === "should-fix"),
        [findings],
    );
    const advisory = useMemo(
        () => findings.filter((f) => f.severity === "nit" || f.severity === "info"),
        [findings],
    );

    const mergeReadiness = useMemo(() => {
        if (merged) return { label: "Merged", tone: "bg-accent/15 text-accent" };
        if (status === "closed")
            return { label: "Closed", tone: "bg-panel-hover text-text-muted" };
        if (failedChecks.length > 0 || blockers.length > 0) {
            return { label: "Blocked", tone: "bg-error/15 text-error" };
        }
        if (pendingChecks.length > 0 || shouldFix.length > 0 || !findingsMd) {
            return { label: "Needs attention", tone: "bg-warning/15 text-warning" };
        }
        return { label: "Ready to merge", tone: "bg-success/15 text-success" };
    }, [
        merged,
        status,
        failedChecks.length,
        blockers.length,
        pendingChecks.length,
        shouldFix.length,
        findingsMd,
    ]);

    const tabs = useMemo(() => {
        if (isPr) {
            return [
                { id: "overview", label: "Overview" },
                { id: "conversation", label: `Conversation (${comments.length})` },
                { id: "files", label: `Files (${files.length})` },
                { id: "commits", label: `Commits (${commits.length})` },
                { id: "checks", label: `Checks (${checks.length})` },
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
    }, [
        isPr,
        isIssue,
        isRelease,
        comments.length,
        files.length,
        commits.length,
        checks.length,
        assets.length,
    ]);

    const mdCtx: GitMarkdownCtx = {
        owner,
        repo,
        ref: headSha || headRef || undefined,
    };

    const openUrl = (href?: string) => {
        if (!href) return;
        void commands.openUrlExternal(href);
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

    const runWalkthrough = async () => {
        if (!isPr || item?.number == null) return;
        const token = getShapeAccessToken();
        if (!token) {
            notify.error("AI Error", "Sign in to Shape to walk through this pull request.");
            return;
        }
        setWalkthroughLoading(true);
        setTab("overview");
        try {
            const text = await commands.summarizePullRequest(
                owner,
                repo,
                item.number,
                token,
            );
            setWalkthrough(text.trim());
            void import("@/lib/cloud/store")
                .then(({ refreshShapeAuth }) => {
                    void refreshShapeAuth();
                })
                .catch(() => undefined);
        } catch (err) {
            notify.error("AI Error", err instanceof Error ? err.message : String(err));
        } finally {
            setWalkthroughLoading(false);
        }
    };

    const runFindIssues = async () => {
        if (!isPr || item?.number == null) return;
        const token = getShapeAccessToken();
        if (!token) {
            notify.error("AI Error", "Sign in to Shape to find issues in this pull request.");
            return;
        }
        setFindingsLoading(true);
        try {
            const text = await commands.reviewPullRequest(
                owner,
                repo,
                item.number,
                token,
            );
            setFindingsMd(text.trim());
            setTab("overview");
            void import("@/lib/cloud/store")
                .then(({ refreshShapeAuth }) => {
                    void refreshShapeAuth();
                })
                .catch(() => undefined);
        } catch (err) {
            notify.error("AI Error", err instanceof Error ? err.message : String(err));
        } finally {
            setFindingsLoading(false);
        }
    };

    const focusFindingPath = (path: string | null) => {
        if (!path) return;
        setTab("files");
        setFocusedFindingPath(path);
        requestAnimationFrame(() => {
            fileRowRefs.current.get(path)?.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
            });
        });
    };

    const fixFindingInChat = (finding: PrFinding) => {
        sendToChat(
            [
                `Fix this pull request finding in ${owner}/${repo}#${item?.number ?? "?"}.`,
                finding.path ? `File: ${finding.path}` : null,
                `Severity: ${finding.severity}`,
                finding.text.replace(/\*\*/g, ""),
                "Propose a minimal patch and apply it.",
            ]
                .filter(Boolean)
                .join("\n"),
        );
    };

    const askInChat = () => {
        sendToChat(
            [
                `Help me with pull request ${owner}/${repo}#${item?.number ?? "?"}.`,
                title ? `Title: ${title}` : null,
                "Ask clarifying questions if needed, then propose next steps.",
            ]
                .filter(Boolean)
                .join("\n"),
        );
    };

    if (!item) {
        return (
            <div className="flex h-full items-center justify-center bg-editor px-6 text-sm text-text-muted">
                Select an item
            </div>
        );
    }

    if (loading && !body.trim() && comments.length === 0 && commits.length === 0) {
        return (
            <div className="flex h-full min-h-0 flex-col overflow-hidden bg-editor">
                <div className="flex shrink-0 items-center gap-2 px-3 py-2">
                    {onBack ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 shrink-0 px-0"
                            onClick={onBack}
                            aria-label="Back to list"
                        >
                            <Icon icon={RiArrowLeftLine} size={ICON_SIZE_SM} />
                        </Button>
                    ) : null}
                </div>
                <GitDetailSkeleton />
            </div>
        );
    }

    const attentionEmpty =
        failedChecks.length === 0 &&
        blockers.length === 0 &&
        shouldFix.length === 0 &&
        pendingChecks.length === 0 &&
        advisory.length === 0;

    const mainPane = (
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
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
                            <Icon icon={RiArrowLeftLine} size={ICON_SIZE_SM} />
                        </Button>
                    ) : null}
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            {url ? (
                                <button
                                    type="button"
                                    className="min-w-0 text-left text-base font-medium text-text-primary hover:text-accent"
                                    onClick={() => openUrl(url)}
                                >
                                    {title}
                                    {item.number != null ? (
                                        <span className="ml-1.5 font-normal text-text-muted">
                                            #{item.number}
                                        </span>
                                    ) : null}
                                </button>
                            ) : (
                                <h2 className="text-base font-medium text-text-primary">
                                    {title}
                                    {item.number != null ? (
                                        <span className="ml-1.5 font-normal text-text-muted">
                                            #{item.number}
                                        </span>
                                    ) : null}
                                </h2>
                            )}
                            <StateBadge status={status} merged={merged} />
                            {isPr ? (
                                <span
                                    className={cn(
                                        "inline-flex rounded-full px-2 py-0.5 text-2xs font-medium",
                                        mergeReadiness.tone,
                                    )}
                                >
                                    {mergeReadiness.label}
                                </span>
                            ) : null}
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
                                    {merged
                                        ? "merged"
                                        : status === "open"
                                          ? "wants to merge"
                                          : "closed"}{" "}
                                    into{" "}
                                    <span className="font-mono text-text-secondary">
                                        {baseRef}
                                    </span>{" "}
                                    from{" "}
                                    <span className="font-mono text-text-secondary">
                                        {headRef}
                                    </span>
                                </span>
                            ) : null}
                            {createdAt ? <span>· {formatRelative(createdAt)}</span> : null}
                        </p>
                    </div>
                    {url ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 px-2"
                            onClick={() => openUrl(url)}
                        >
                            <Icon icon={RiExternalLinkLine} size={ICON_SIZE_SM} />
                            Open
                        </Button>
                    ) : null}
                </div>
                {isPr && (additions > 0 || deletions > 0) ? (
                    <div
                        className={cn(
                            "mt-2 flex items-center gap-2 text-xs",
                            onBack && "pl-9",
                        )}
                    >
                        <span className="text-git-added">+{additions}</span>
                        <span className="text-git-deleted">−{deletions}</span>
                    </div>
                ) : null}
            </div>

            <Tabs
                value={tab}
                onValueChange={setTab}
                className="flex h-0 min-h-0 flex-1 flex-col"
            >
                <div className="flex shrink-0 flex-wrap items-center gap-2 px-2 py-1">
                    <TabsList>
                        {tabs.map((t) => (
                            <TabsTrigger key={t.id} value={t.id}>
                                {t.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    {isPr ? (
                        <div className="ml-auto flex flex-wrap justify-end gap-1">
                            <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                disabled={walkthroughLoading}
                                onClick={() => void runWalkthrough()}
                            >
                                <Icon
                                    icon={RiSparkling2Line}
                                    size={ICON_SIZE_SM}
                                    className={cn(walkthroughLoading && "animate-spin")}
                                />
                                {walkthroughLoading ? "Walking through…" : "Walk through"}
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                disabled={findingsLoading}
                                onClick={() => void runFindIssues()}
                            >
                                <Icon
                                    icon={RiSearchEyeLine}
                                    size={ICON_SIZE_SM}
                                    className={cn(findingsLoading && "animate-spin")}
                                />
                                {findingsLoading ? "Finding issues…" : "Find issues"}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={askInChat}
                            >
                                <Icon icon={RiChatAiLine} size={ICON_SIZE_SM} />
                                Ask in chat
                            </Button>
                        </div>
                    ) : null}
                </div>

                <TabsContent
                    value="overview"
                    className="flex h-0 min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                >
                    <ScrollArea className="min-h-0 flex-1">
                        <div className="flex flex-col gap-3 p-3">
                            <section className="rounded-xl border border-border bg-panel/40 px-3 py-3">
                                <div className="mb-1.5 text-sm font-medium text-text-primary">
                                    Walkthrough
                                </div>
                                {walkthroughLoading && !walkthrough ? (
                                    <p className="text-sm text-text-muted">
                                        Mapping the change set…
                                    </p>
                                ) : walkthrough ? (
                                    <GitMarkdown content={walkthrough} ctx={mdCtx} />
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <p className="text-sm text-text-muted">
                                            Orient before the diff — what changed, how checks
                                            look, and merge readiness. Runs only when you ask.
                                        </p>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            className="h-7 w-fit gap-1 px-2 text-xs"
                                            disabled={walkthroughLoading}
                                            onClick={() => void runWalkthrough()}
                                        >
                                            <Icon
                                                icon={RiSparkling2Line}
                                                size={ICON_SIZE_SM}
                                            />
                                            Walk through this pull request
                                        </Button>
                                    </div>
                                )}
                            </section>

                            <section className="rounded-xl border border-border bg-panel/40 px-3 py-3">
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                    <div className="text-sm font-medium text-text-primary">
                                        Needs your attention
                                    </div>
                                    {!findingsMd && !findingsLoading ? (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-1.5 text-2xs"
                                            onClick={() => void runFindIssues()}
                                        >
                                            Find issues
                                        </Button>
                                    ) : null}
                                </div>
                                {findingsLoading && attentionEmpty ? (
                                    <p className="text-sm text-text-muted">
                                        Scanning for merge-blocking issues…
                                    </p>
                                ) : attentionEmpty ? (
                                    <p className="text-sm text-text-muted">
                                        {findingsMd
                                            ? "Nothing blocking merge from the last scan."
                                            : "Run Find issues to triage blockers, or wait on checks."}
                                    </p>
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        {failedChecks.length > 0 || blockers.length > 0 ? (
                                            <div>
                                                <div className="mb-1 text-xs font-medium text-error">
                                                    Blockers
                                                </div>
                                                <ul className="flex flex-col gap-1.5">
                                                    {failedChecks.map((c) => (
                                                        <li key={`check-${c.id}`}>
                                                            <button
                                                                type="button"
                                                                className="w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-panel-hover"
                                                                onClick={() =>
                                                                    openUrl(c.html_url)
                                                                }
                                                            >
                                                                Check failed: {c.name}
                                                            </button>
                                                        </li>
                                                    ))}
                                                    {blockers.map((f, i) => (
                                                        <li key={`b-${i}`}>
                                                            <FindingCard
                                                                finding={f}
                                                                onShowFile={
                                                                    f.path
                                                                        ? () =>
                                                                              focusFindingPath(
                                                                                  f.path,
                                                                              )
                                                                        : undefined
                                                                }
                                                                onFix={() =>
                                                                    fixFindingInChat(f)
                                                                }
                                                            />
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : null}
                                        {shouldFix.length > 0 ? (
                                            <div>
                                                <div className="mb-1 text-xs font-medium text-warning">
                                                    High priority
                                                </div>
                                                <ul className="flex flex-col gap-1.5">
                                                    {shouldFix.map((f, i) => (
                                                        <li key={`s-${i}`}>
                                                            <FindingCard
                                                                finding={f}
                                                                onShowFile={
                                                                    f.path
                                                                        ? () =>
                                                                              focusFindingPath(
                                                                                  f.path,
                                                                              )
                                                                        : undefined
                                                                }
                                                                onFix={() =>
                                                                    fixFindingInChat(f)
                                                                }
                                                            />
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : null}
                                        {pendingChecks.length > 0 ? (
                                            <div>
                                                <div className="mb-1 text-xs font-medium text-text-muted">
                                                    Pending
                                                </div>
                                                <ul className="flex flex-col gap-0.5">
                                                    {pendingChecks.map((c) => (
                                                        <li
                                                            key={`p-${c.id}`}
                                                            className="px-2 py-1 text-xs text-text-secondary"
                                                        >
                                                            {c.name} — {c.status}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : null}
                                        {advisory.length > 0 ? (
                                            <div>
                                                <div className="mb-1 text-xs font-medium text-text-muted">
                                                    Advisory
                                                </div>
                                                <ul className="flex flex-col gap-1.5">
                                                    {advisory.map((f, i) => (
                                                        <li key={`a-${i}`}>
                                                            <FindingCard
                                                                finding={f}
                                                                onShowFile={
                                                                    f.path
                                                                        ? () =>
                                                                              focusFindingPath(
                                                                                  f.path,
                                                                              )
                                                                        : undefined
                                                                }
                                                                onFix={() =>
                                                                    fixFindingInChat(f)
                                                                }
                                                            />
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : null}
                                    </div>
                                )}
                            </section>

                            <section className="rounded-xl border border-border bg-panel/40 px-3 py-3">
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                    <div className="text-sm font-medium text-text-primary">
                                        Changed files
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-1.5 text-2xs"
                                        onClick={() => setTab("files")}
                                    >
                                        Open files
                                    </Button>
                                </div>
                                {files.length === 0 ? (
                                    <p className="text-sm text-text-muted">No files loaded.</p>
                                ) : (
                                    <ul className="flex flex-col gap-0.5">
                                        {files.slice(0, 12).map((f) => (
                                            <li key={f.filename}>
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-panel-hover"
                                                    onClick={() =>
                                                        void openChangedFile(f.filename)
                                                    }
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
                                        ))}
                                        {files.length > 12 ? (
                                            <li className="px-2 py-1 text-xs text-text-muted">
                                                +{files.length - 12} more files
                                            </li>
                                        ) : null}
                                    </ul>
                                )}
                            </section>
                        </div>
                    </ScrollArea>
                </TabsContent>

                <TabsContent
                    value="conversation"
                    className="flex h-0 min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                >
                    <ScrollArea className="min-h-0 flex-1">
                        <div className="flex flex-col p-3">
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
                        <div className="p-4">
                            {body.trim() ? (
                                <GitMarkdown content={body} ctx={mdCtx} />
                            ) : (
                                <p className="text-sm text-text-muted">No release notes.</p>
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
                                            onClick={() =>
                                                openUrl(
                                                    `https://github.com/${owner}/${repo}/commit/${c.sha}`,
                                                )
                                            }
                                        >
                                            <Icon
                                                icon={RiGitCommitLine}
                                                size={ICON_SIZE_SM}
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
                                    {headSha ? "No check runs." : "Checks unavailable."}
                                </li>
                            ) : (
                                checks.map((run) => {
                                    const icon = statusIcon(run.status, run.conclusion);
                                    return (
                                        <li key={run.id}>
                                            <button
                                                type="button"
                                                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-panel-hover"
                                                onClick={() => openUrl(run.html_url)}
                                            >
                                                <Icon
                                                    icon={icon.icon}
                                                    size={ICON_SIZE_SM}
                                                    className={cn(
                                                        "shrink-0",
                                                        statusTone(run.status, run.conclusion),
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
                        <div className="flex flex-col gap-2 p-2">
                            {isPr &&
                            (findingsLoading || findings.length > 0 || findingsMd) ? (
                                <div className="rounded-xl border border-border bg-panel/40 px-3 py-2.5">
                                    <div className="mb-1.5 text-sm font-medium text-text-primary">
                                        Findings
                                    </div>
                                    {findingsLoading && findings.length === 0 ? (
                                        <p className="text-sm text-text-muted">
                                            Scanning for merge-blocking issues…
                                        </p>
                                    ) : findings.length === 0 ? (
                                        <p className="text-sm text-text-muted">
                                            No high-signal issues found.
                                        </p>
                                    ) : (
                                        <ul className="flex flex-col gap-2">
                                            {findings.map((f, i) => (
                                                <li key={`${f.severity}-${i}`}>
                                                    <FindingCard
                                                        finding={f}
                                                        focused={
                                                            !!f.path &&
                                                            focusedFindingPath === f.path
                                                        }
                                                        onShowFile={
                                                            f.path
                                                                ? () =>
                                                                      focusFindingPath(f.path)
                                                                : undefined
                                                        }
                                                        onFix={() => fixFindingInChat(f)}
                                                    />
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ) : null}
                            <ul className="flex flex-col gap-0.5">
                                {files.length === 0 ? (
                                    <li className="px-2 py-3 text-sm text-text-muted">
                                        No files.
                                    </li>
                                ) : (
                                    files.map((f) => (
                                        <li
                                            key={f.filename}
                                            ref={(el) => {
                                                if (el)
                                                    fileRowRefs.current.set(f.filename, el);
                                                else fileRowRefs.current.delete(f.filename);
                                            }}
                                        >
                                            <button
                                                type="button"
                                                className={cn(
                                                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-panel-hover",
                                                    focusedFindingPath === f.filename &&
                                                        "bg-panel-hover ring-1 ring-border",
                                                )}
                                                onClick={() =>
                                                    void openChangedFile(f.filename)
                                                }
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
                        </div>
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
                                            <div className="truncate text-sm">{a.name}</div>
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
    );

    const metaPane = (
        <ScrollArea className="h-full min-h-0">
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
                                                <span className="truncate">{r.login}</span>
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
                        {milestone ?? <span className="text-text-muted">No milestone</span>}
                    </SidebarSection>
                </>
            )}
            {isRelease ? (
                <SidebarSection title="Tag">{tagName ?? "—"}</SidebarSection>
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
            {updatedAt || createdAt ? (
                <SidebarSection title="Updated">
                    {formatRelative(updatedAt || createdAt)}
                </SidebarSection>
            ) : null}
            {isPr ? (
                <div className="px-3 py-3">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 w-full gap-1 text-xs"
                        onClick={askInChat}
                    >
                        <Icon icon={RiChatAiLine} size={ICON_SIZE_SM} />
                        Ask in chat
                    </Button>
                </div>
            ) : null}
        </ScrollArea>
    );

    const showMeta = isPr || isIssue || isRelease;

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-editor">
            <Panel
                direction="horizontal"
                paneGap="var(--workbench-gap)"
                storageKey="git-github-detail-meta"
                hideSeparator
                className="h-full min-h-0 flex-1"
                panes={[
                    {
                        id: "pr-main",
                        flexible: true,
                        minSize: 320,
                        children: mainPane,
                    },
                    {
                        id: "pr-meta",
                        preferredSize: 240,
                        minSize: 180,
                        maxSize: 320,
                        snap: true,
                        visible: showMeta,
                        children: (
                            <div className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border-subtle">
                                {metaPane}
                            </div>
                        ),
                    },
                ]}
            />
        </div>
    );
}
