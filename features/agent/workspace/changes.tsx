"use client";

import type { RemixiconComponentType } from "@remixicon/react";
import { RiArrowUpLine, RiErrorWarningLine, RiExternalLinkLine, RiEyeLine, RiGitMergeLine, RiMoreLine, RiDeleteBin6Fill, RiGitPullRequestFill, RiGithubFill, RiGitBranchLine } from "@remixicon/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { commands, type GitFileParams } from "@/lib/backend";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { notify } from "@/features/notifications";
import { discoverGitRepos, pickDefaultRepo } from "@/lib/git/repos";
import { useGitBranch } from "@/features/workbench/hooks/use-git-branch";
import { openProjectFile } from "@/lib/window/open-project-file";
import { openFileDiffTab } from "./file-diff";
import { resolveOwnerRepo } from "@/features/git/ui/actions/utils";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogBody,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GenerateStarButton, streamTextInto } from "@/features/git/ui/shared/generate-star";
import { getShapeAccessToken } from "@/lib/cloud/store";

function fileName(path: string) {
    return path.split(/[\\/]/).pop() || path;
}

function fileDir(path: string) {
    const parts = path.replace(/\\/g, "/").split("/");
    if (parts.length <= 1) return "";
    return parts.slice(0, -1).join("/");
}

function parseDiffFileStats(raw: string): Record<string, { plus: number; minus: number }> {
    const stats: Record<string, { plus: number; minus: number }> = {};
    let current: string | null = null;
    for (const line of raw.split("\n")) {
        const gitHeader = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
        if (gitHeader) {
            current = gitHeader[2].replace(/\\/g, "/");
            if (!stats[current]) stats[current] = { plus: 0, minus: 0 };
            continue;
        }
        if (line.startsWith("+++ b/")) {
            current = line.slice(6).replace(/\\/g, "/");
            if (!stats[current]) stats[current] = { plus: 0, minus: 0 };
            continue;
        }
        if (!current) continue;
        if (line.startsWith("+") && !line.startsWith("+++")) stats[current].plus += 1;
        if (line.startsWith("-") && !line.startsWith("---")) stats[current].minus += 1;
    }
    return stats;
}

/** GitHub PR Changes–style status square. */
function StatusGlyph({ status }: { status: string }) {
    const s = status.toUpperCase();
    if (s === "A" || s === "U" || s === "?" || s === "??") {
        return (
            <span
                className="flex size-3.5 shrink-0 items-center justify-center rounded-[3px] bg-success/25 text-[11px] font-semibold leading-none text-success"
                aria-label="Added"
            >
                +
            </span>
        );
    }
    if (s === "D") {
        return (
            <span
                className="flex size-3.5 shrink-0 items-center justify-center rounded-[3px] bg-error/25 text-[11px] font-semibold leading-none text-error"
                aria-label="Deleted"
            >
                −
            </span>
        );
    }
    return (
        <span
            className="flex size-3.5 shrink-0 items-center justify-center rounded-[3px]"
            style={{ background: "color-mix(in srgb, var(--git-modified) 35%, transparent)" }}
            aria-label="Modified"
        >
            <span
                className="size-1.5 rounded-[1px]"
                style={{ background: "var(--git-modified)" }}
            />
        </span>
    );
}

type FileRowProps = {
    file: GitFileParams;
    stats: { plus: number; minus: number } | null;
    onOpenDiff: (file: GitFileParams) => void;
    onOpenFile: (file: GitFileParams) => void;
    onToggleStage: (file: GitFileParams) => void;
    onDiscard: (file: GitFileParams) => void;
};

const FileRow = memo(function FileRow({
    file,
    stats,
    onOpenDiff,
    onOpenFile,
    onToggleStage,
    onDiscard,
}: FileRowProps) {
    const dir = fileDir(file.path);
    const name = fileName(file.path);

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <button
                    type="button"
                    onClick={() => onOpenDiff(file)}
                    onDoubleClick={() => onOpenFile(file)}
                    className="group flex h-9 rounded-md w-full items-center gap-2 px-2 text-left transition-colors hover:bg-panel-hover"
                >
                    <span className="flex min-w-0 flex-1 items-center overflow-hidden font-sans text-sm leading-none">
                        {dir ? (
                            <span className="min-w-0 truncate text-text-muted" title={dir}>
                                {dir}/
                            </span>
                        ) : null}
                        <span className="shrink-0 font-medium text-text-primary" title={file.path}>
                            {name}
                        </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                        {stats && (stats.plus > 0 || stats.minus > 0) ? (
                            <span className="flex items-center gap-1.5 tabular-nums text-xs">
                                {stats.plus > 0 ? (
                                    <span className="text-success">+{stats.plus}</span>
                                ) : null}
                                {stats.minus > 0 ? (
                                    <span className="text-error">−{stats.minus}</span>
                                ) : null}
                            </span>
                        ) : null}
                        {file.status.toUpperCase() === "A" || file.status === "??" || file.status === "?" ? (
                            <span className="text-xs font-medium text-success">New</span>
                        ) : (
                            <StatusGlyph status={file.status} />
                        )}
                    </span>
                </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={() => onOpenDiff(file)}>Open diff</ContextMenuItem>
                <ContextMenuItem onClick={() => onOpenFile(file)}>Open file</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => onToggleStage(file)} className="gap-1.5">
                    <Icon icon={RiGitPullRequestFill} size={ICON_SIZE_SM}/>
                    {file.staged ? "Unstage" : "Stage"}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onDiscard(file)} className="text-error gap-1.5">
                    <Icon icon={RiDeleteBin6Fill} size={ICON_SIZE_SM}/>
                    Discard changes
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
});

type PrMeta = {
    number: number;
    url: string;
    mergeable: boolean | null;
    title: string;
};

type PanelTab = "changes" | "checks" | "review";

export function ChangesView({ projectPath }: { projectPath: string }) {
    const branch = useGitBranch(projectPath);
    const [repo, setRepo] = useState<string | null>(null);
    const [files, setFiles] = useState<GitFileParams[]>([]);
    const [fileStatsMap, setFileStatsMap] = useState<
        Record<string, { plus: number; minus: number }>
    >({});
    const [busy, setBusy] = useState(false);
    const [pr, setPr] = useState<PrMeta | null>(null);
    const [panelTab, setPanelTab] = useState<PanelTab>("changes");

    const refresh = useCallback(async () => {
        try {
            const repos = await discoverGitRepos(projectPath);
            const path = pickDefaultRepo(projectPath, repos) ?? projectPath;
            setRepo(path);
            const list = await commands.gitStatus(path);
            setFiles(list);
            try {
                const raw = await commands.gitDiff(path);
                setFileStatsMap(parseDiffFileStats(raw || ""));
            } catch {
                setFileStatsMap({});
            }
        } catch {
            setFiles([]);
            setFileStatsMap({});
        }
    }, [projectPath]);

    useEffect(() => {
        void refresh();
        const on = () => void refresh();
        window.addEventListener("shape-git-refresh", on);
        return () => window.removeEventListener("shape-git-refresh", on);
    }, [refresh]);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            if (!branch || branch === "HEAD") {
                if (!cancelled) setPr(null);
                return;
            }
            try {
                const ownerRepo = await resolveOwnerRepo(projectPath);
                if (!ownerRepo || cancelled) return;
                const raw = await commands.githubApiGet(
                    `/repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls?state=open&head=${ownerRepo.owner}:${encodeURIComponent(branch)}&per_page=5`,
                );
                const list = (typeof raw === "string" ? JSON.parse(raw) : raw) as Array<{
                    number: number;
                    html_url: string;
                    mergeable?: boolean | null;
                    title?: string;
                }>;
                const hit = Array.isArray(list) ? list[0] : null;
                if (!hit || cancelled) {
                    if (!cancelled) setPr(null);
                    return;
                }
                let mergeable: boolean | null =
                    typeof hit.mergeable === "boolean" ? hit.mergeable : null;
                if (mergeable === null) {
                    try {
                        const detailRaw = await commands.githubApiGet(
                            `/repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls/${hit.number}`,
                        );
                        const detail = (
                            typeof detailRaw === "string" ? JSON.parse(detailRaw) : detailRaw
                        ) as { mergeable?: boolean | null };
                        if (typeof detail.mergeable === "boolean") mergeable = detail.mergeable;
                    } catch {
                        /* ignore */
                    }
                }
                if (!cancelled) {
                    setPr({
                        number: hit.number,
                        url: hit.html_url,
                        mergeable,
                        title: hit.title || `PR #${hit.number}`,
                    });
                }
            } catch {
                if (!cancelled) setPr(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [projectPath, branch]);

    const staged = useMemo(() => files.filter((f) => f.staged), [files]);
    const unstaged = useMemo(() => files.filter((f) => !f.staged), [files]);
    const totals = useMemo(() => {
        let plus = 0;
        let minus = 0;
        for (const s of Object.values(fileStatsMap)) {
            plus += s.plus;
            minus += s.minus;
        }
        return { plus, minus };
    }, [fileStatsMap]);

    const statsFor = useCallback(
        (file: GitFileParams) => {
            const key = file.path.replace(/\\/g, "/");
            return fileStatsMap[key] ?? fileStatsMap[fileName(key)] ?? null;
        },
        [fileStatsMap],
    );

    const openFile = useCallback(
        async (file: GitFileParams) => {
            if (!repo) return;
            const abs = `${repo.replace(/[\\/]+$/, "")}/${file.path.replace(/\\/g, "/")}`;
            await openProjectFile(abs, fileName(file.path));
        },
        [repo],
    );

    const openDiff = useCallback(
        (file: GitFileParams) => {
            if (!repo) return;
            openFileDiffTab(file, repo);
        },
        [repo],
    );

    const [commitOpen, setCommitOpen] = useState(false);
    const [commitMessage, setCommitMessage] = useState("");
    const [commitGenerating, setCommitGenerating] = useState(false);
    const [ownerRepo, setOwnerRepo] = useState<{ owner: string; repo: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        void resolveOwnerRepo(projectPath).then((next) => {
            if (!cancelled) setOwnerRepo(next);
        });
        return () => {
            cancelled = true;
        };
    }, [projectPath]);

    const openCommitModal = () => {
        if (!repo || files.length === 0) return;
        const name = fileName(files[0]?.path ?? "files");
        setCommitMessage(
            files.length === 1 ? `Update ${name}` : `Update ${files.length} files`,
        );
        setCommitOpen(true);
    };

    const generateCommitMessage = async () => {
        if (!repo) return;
        setCommitGenerating(true);
        try {
            await commands.gitStageAll(repo);
            const token = getShapeAccessToken();
            if (!token) {
                notify.error("AI Error", "Sign in to Shape to use AI.");
                return;
            }
            const message = await commands.generateCommitMessage(token, repo);
            await streamTextInto(message, setCommitMessage);
            void import("@/lib/cloud/store")
                .then(({ refreshShapeAuth }) => {
                    void refreshShapeAuth();
                })
                .catch(() => undefined);
        } catch (err) {
            notify.error("AI Error", err instanceof Error ? err.message : String(err));
        } finally {
            setCommitGenerating(false);
        }
    };

    const commitAndPush = async () => {
        if (!repo || files.length === 0) return;
        setBusy(true);
        setCommitOpen(false);
        try {
            await commands.gitStageAll(repo);
            await commands.gitCommit(repo, commitMessage.trim() || "Update files");
            await commands.gitPush(repo);
            window.dispatchEvent(new Event("shape-git-refresh"));
            await refresh();
            notify.success("Git", "Committed and pushed");
        } catch (err) {
            notify.gitError(err);
        } finally {
            setBusy(false);
        }
    };

    const mergePr = async () => {
        if (!pr) return;
        setBusy(true);
        try {
            const ownerRepo = await resolveOwnerRepo(projectPath);
            if (!ownerRepo) throw new Error("No GitHub remote");
            await commands.githubApiRequest(
                "PUT",
                `/repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls/${pr.number}/merge`,
                JSON.stringify({ merge_method: "squash" }),
            );
            notify.success("GitHub", `Merged #${pr.number}`);
            window.dispatchEvent(new Event("shape-git-refresh"));
            setPr(null);
        } catch (err) {
            notify.error("Merge failed", err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    const toggleStage = useCallback(
        async (file: GitFileParams) => {
            if (!repo) return;
            try {
                if (file.staged) await commands.gitUnstage(repo, file.path);
                else await commands.gitStage(repo, file.path);
                window.dispatchEvent(new Event("shape-git-refresh"));
                await refresh();
            } catch (err) {
                notify.gitError(err);
            }
        },
        [repo, refresh],
    );

    const discard = useCallback(
        async (file: GitFileParams) => {
            if (!repo) return;
            try {
                await commands.gitDiscardChanges(repo, file.path);
                window.dispatchEvent(new Event("shape-git-refresh"));
                await refresh();
            } catch (err) {
                notify.error("Git", err instanceof Error ? err.message : String(err));
            }
        },
        [repo, refresh],
    );

    const badgeLabel = pr ? `#${pr.number}` : branch ? branch : "local";
    /** success = clean / ready; warn = conflicted only (not “up to date”). */
    const statusTone: "success" | "warn" | "muted" = pr
        ? pr.mergeable === false
            ? "warn"
            : "success"
        : files.length === 0
          ? "success"
          : "success";
    const statusLabel = pr
        ? pr.mergeable === false
            ? "Conflicted"
            : "Ready to merge"
        : files.length === 0
          ? "Up to date"
          : staged.length > 0
            ? "Ready to commit"
            : `${files.length} Uncommitted change${files.length === 1 ? "" : "s"}`;

    const toneBg =
        statusTone === "warn"
            ? "color-mix(in srgb, var(--color-warn) 14%, var(--color-panel))"
            : statusTone === "success"
              ? "color-mix(in srgb, var(--color-success) 14%, var(--color-panel))"
              : "var(--color-panel)";
    const toneFg =
        statusTone === "warn" ? "var(--color-warn)" : "var(--color-success)";
    const toneChipBg =
        statusTone === "warn"
            ? "color-mix(in srgb, var(--color-warn) 22%, transparent)"
            : "color-mix(in srgb, var(--color-success) 22%, transparent)";

    const tabs: { id: PanelTab; label: string; icon?: RemixiconComponentType }[] = [
        { id: "changes", label: `Changes${files.length ? ` ${files.length}` : ""}` },
        { id: "checks", label: "Checks" },
        { id: "review", label: "Review", icon: RiEyeLine },
    ];

    return (
        <div className="flex h-full min-h-0 flex-col bg-panel">
            {/* GitHub-style status strip — badge/text/CTA share the same tone */}
            <div
                className="mx-2 flex h-9 shrink-0 items-center gap-2 rounded-lg px-1"
                style={{ background: toneBg }}
            >
                <button
                    type="button"
                    title={pr?.title || branch || "Local changes"}
                    onClick={() => {
                        if (pr?.url) void commands.openUrlExternal(pr.url);
                    }}
                    className="inline-flex h-6 items-center rounded-md px-2 text-sm font-medium"
                    style={{ background: toneChipBg, color: toneFg }}
                >
                    {badgeLabel}
                </button>
                {pr?.url ? (
                    <button
                        type="button"
                        aria-label="Open on GitHub"
                        onClick={() => void commands.openUrlExternal(pr.url)}
                        className="flex size-6 items-center justify-center rounded-md hover:opacity-90"
                        style={{ color: toneFg }}
                    >
                        <Icon icon={RiExternalLinkLine} size={ICON_SIZE_SM}/>
                    </button>
                ) : null}
                <span
                    className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm font-medium"
                    style={{ color: toneFg }}
                >
                    <Icon
                        icon={statusTone === "warn" ? RiErrorWarningLine : RiArrowUpLine}
                    />
                    {statusLabel}
                    {totals.plus > 0 || totals.minus > 0 ? (
                        <span className="inline-flex items-center gap-1.5 tabular-nums">
                            {totals.plus > 0 ? <span className="text-success">+{totals.plus}</span> : null}
                            {totals.minus > 0 ? <span className="text-error">-{totals.minus}</span> : null}
                        </span>
                    ) : null}
                </span>
                <span className="flex-1" />
                {pr ? (
                    <button
                        type="button"
                        disabled={busy || pr.mergeable === false}
                        onClick={() => void mergePr()}
                        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium disabled:opacity-40"
                        style={{
                            background: toneChipBg,
                            color: toneFg,
                        }}
                    >
                        <Icon icon={RiGitMergeLine} size={ICON_SIZE_SM}/>
                        Merge
                    </button>
                ) : (
                    <button
                        type="button"
                        disabled={busy || files.length === 0}
                        onClick={openCommitModal}
                        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium disabled:opacity-40"
                        style={{
                            background: toneChipBg,
                            color: toneFg,
                        }}
                    >
                        <Icon icon={RiGitMergeLine} size={ICON_SIZE_SM}/>
                        Commit & Push
                    </button>
                )}
            </div>

            <AlertDialog open={commitOpen} onOpenChange={setCommitOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-md font-medium leading-snug">
                            <span>Committing to</span>
                            <Icon icon={RiGithubFill} size={ICON_SIZE_SM} className="text-text-primary" />
                            <span className="text-text-primary">
                                {ownerRepo
                                    ? `${ownerRepo.owner}/${ownerRepo.repo}`
                                    : fileName(projectPath)}
                            </span>
                            <span>on branch</span>
                            <Icon icon={RiGitBranchLine} size={ICON_SIZE_SM} className="text-text-primary" />
                            <span className="text-text-primary">{branch ?? "HEAD"}</span>
                            <span>
                                with{" "}
                                <span className="tabular-nums text-success">
                                    {totals.plus.toLocaleString()}
                                </span>{" "}
                                additions and{" "}
                                <span className="tabular-nums text-error">
                                    {totals.minus.toLocaleString()}
                                </span>{" "}
                                deletions
                            </span>
                        </AlertDialogTitle>
                    </AlertDialogHeader>
                    <AlertDialogBody className="p-0 mb-1">
                        <div className="relative">
                            <Textarea
                                value={commitMessage}
                                onChange={(e) => setCommitMessage(e.target.value)}
                                rows={4}
                                placeholder="Commit message"
                                className="min-h-[96px] pb-8 border-t border-b border-border rounded-none bg-surface-3"
                            />
                            <GenerateStarButton
                                loading={commitGenerating}
                                disabled={busy || files.length === 0}
                                onClick={() => void generateCommitMessage()}
                            />
                        </div>
                    </AlertDialogBody>
                    <AlertDialogFooter>
                        <AlertDialogCancel asChild>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                            >
                                Cancel
                            </Button>
                        </AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <Button
                                type="button"
                                disabled={busy || !commitMessage.trim()}
                                onClick={() => void commitAndPush()}
                                variant="default"
                                size="sm"
                            >
                                Commit & Push
                            </Button>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Secondary tabs — matches GH Changes chrome */}
            <div className="flex h-10 mt-2 shrink-0 items-center gap-0.5 px-1.5">
                {tabs.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setPanelTab(t.id)}
                        className={cn(
                            "inline-flex h-7 items-center gap-1 rounded-sm px-2 text-sm font-medium transition-colors",
                            panelTab === t.id
                                ? "bg-surface-3 text-text-primary"
                                : "text-text-muted hover:bg-panel-hover hover:text-text-secondary",
                        )}
                    >
                        {t.icon ? <Icon icon={t.icon} /> : null}
                        {t.label}
                    </button>
                ))}
                <span className="flex-1" />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover"
                            aria-label="More"
                        >
                            <Icon icon={RiMoreLine} size={ICON_SIZE_SM} />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => void refresh()}>Refresh</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {panelTab === "checks" ? (
                <ChecksPanel projectPath={projectPath} branch={branch} pr={pr} />
            ) : panelTab === "review" ? (
                <ReviewPanel projectPath={projectPath} pr={pr} />
            ) : files.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
                    No local changes
                </div>
            ) : (
                <div className="min-h-0 flex-1 overflow-y-auto py-1 custom-scrollbar">
                    {staged.length > 0 ? (
                        <section className="mb-1">
                            <div className="px-2 pb-0.5 text-sm font-medium text-text-muted">
                                Staged {staged.length}
                            </div>
                            <div className="flex flex-col">
                                {staged.map((file) => (
                                    <FileRow
                                        key={`s:${file.path}`}
                                        file={file}
                                        stats={statsFor(file)}
                                        onOpenDiff={openDiff}
                                        onOpenFile={(f) => void openFile(f)}
                                        onToggleStage={(f) => void toggleStage(f)}
                                        onDiscard={(f) => void discard(f)}
                                    />
                                ))}
                            </div>
                        </section>
                    ) : null}
                    {unstaged.length > 0 ? (
                        <section>
                            <div className="flex items-center gap-2 px-2 pb-0.5 text-sm font-medium text-text-muted">
                                <span className="min-w-0 flex-1 truncate">
                                    {unstaged.length} Uncommitted change{unstaged.length === 1 ? "" : "s"}
                                </span>
                                {totals.plus > 0 || totals.minus > 0 ? (
                                    <span className="inline-flex shrink-0 items-center gap-1.5 tabular-nums">
                                        {totals.plus > 0 ? <span className="text-success">+{totals.plus}</span> : null}
                                        {totals.minus > 0 ? <span className="text-error">-{totals.minus}</span> : null}
                                    </span>
                                ) : null}
                            </div>
                            <div className="flex flex-col">
                                {unstaged.map((file) => (
                                    <FileRow
                                        key={`u:${file.path}`}
                                        file={file}
                                        stats={statsFor(file)}
                                        onOpenDiff={openDiff}
                                        onOpenFile={(f) => void openFile(f)}
                                        onToggleStage={(f) => void toggleStage(f)}
                                        onDiscard={(f) => void discard(f)}
                                    />
                                ))}
                            </div>
                        </section>
                    ) : null}
                </div>
            )}
        </div>
    );
}

function ChecksPanel({
    projectPath,
    branch,
    pr,
}: {
    projectPath: string;
    branch: string | null;
    pr: PrMeta | null;
}) {
    const [rows, setRows] = useState<
        { name: string; status: string; conclusion: string | null; url?: string }[]
    >([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            setLoading(true);
            setError(null);
            try {
                const ownerRepo = await resolveOwnerRepo(projectPath);
                if (!ownerRepo) throw new Error("No GitHub remote");
                const ref = branch || "HEAD";
                const raw = await commands.githubApiGet(
                    `/repos/${ownerRepo.owner}/${ownerRepo.repo}/commits/${encodeURIComponent(ref)}/check-runs?per_page=30`,
                );
                const data = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
                    check_runs?: Array<{
                        name: string;
                        status: string;
                        conclusion: string | null;
                        html_url?: string;
                    }>;
                };
                if (cancelled) return;
                setRows(
                    (data.check_runs ?? []).map((c) => ({
                        name: c.name,
                        status: c.status,
                        conclusion: c.conclusion,
                        url: c.html_url,
                    })),
                );
            } catch (e) {
                if (!cancelled) {
                    setRows([]);
                    setError(e instanceof Error ? e.message : String(e));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [projectPath, branch, pr?.number]);

    if (loading) {
        return (
            <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
                Loading checks…
            </div>
        );
    }
    if (error) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-text-muted">
                <span>{error}</span>
                {pr?.url ? (
                    <button
                        type="button"
                        className="text-accent-text hover:underline"
                        onClick={() => void commands.openUrlExternal(`${pr.url}/checks`)}
                    >
                        Open checks on GitHub
                    </button>
                ) : null}
            </div>
        );
    }
    if (rows.length === 0) {
        return (
            <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-text-muted">
                No checks for this branch yet.
            </div>
        );
    }
    return (
        <div className="min-h-0 flex-1 overflow-y-auto py-1 custom-scrollbar">
            {rows.map((r) => {
                const tone = (r.conclusion || r.status || "").toLowerCase();
                const ok = ["success", "neutral", "skipped"].includes(tone);
                const bad = ["failure", "timed_out", "cancelled", "action_required"].includes(tone);
                return (
                    <button
                        key={`${r.name}-${r.url}`}
                        type="button"
                        onClick={() => r.url && void commands.openUrlExternal(r.url)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-panel-hover"
                    >
                        <span
                            className={cn(
                                "size-2 shrink-0 rounded-full",
                                ok ? "bg-success" : bad ? "bg-error" : "bg-warn",
                            )}
                        />
                        <span className="min-w-0 flex-1 truncate text-text-primary">{r.name}</span>
                        <span className="shrink-0 text-text-muted">
                            {r.conclusion || r.status}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

function ReviewPanel({
    projectPath,
    pr,
}: {
    projectPath: string;
    pr: PrMeta | null;
}) {
    const [reviews, setReviews] = useState<
        { user: string; state: string; body: string }[]
    >([]);
    const [requested, setRequested] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!pr) return;
        let cancelled = false;
        setLoading(true);
        void (async () => {
            try {
                const ownerRepo = await resolveOwnerRepo(projectPath);
                if (!ownerRepo) return;
                const [revRaw, reqRaw] = await Promise.all([
                    commands.githubApiGet(
                        `/repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls/${pr.number}/reviews`,
                    ),
                    commands.githubApiGet(
                        `/repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls/${pr.number}/requested_reviewers`,
                    ),
                ]);
                if (cancelled) return;
                const rev = (typeof revRaw === "string" ? JSON.parse(revRaw) : revRaw) as Array<{
                    user?: { login?: string };
                    state?: string;
                    body?: string;
                }>;
                const req = (typeof reqRaw === "string" ? JSON.parse(reqRaw) : reqRaw) as {
                    users?: Array<{ login?: string }>;
                };
                setReviews(
                    (rev ?? []).map((r) => ({
                        user: r.user?.login || "reviewer",
                        state: r.state || "",
                        body: (r.body || "").trim(),
                    })),
                );
                setRequested((req.users ?? []).map((u) => u.login || "").filter(Boolean));
            } catch {
                if (!cancelled) {
                    setReviews([]);
                    setRequested([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [projectPath, pr]);

    if (!pr) {
        return (
            <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-text-muted">
                No open pull request on this branch.
            </div>
        );
    }
    if (loading) {
        return (
            <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
                Loading review…
            </div>
        );
    }

    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 custom-scrollbar">
            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text-primary">{pr.title}</div>
                    <div className="text-xs text-text-muted">#{pr.number}</div>
                </div>
                <button
                    type="button"
                    onClick={() => void commands.openUrlExternal(pr.url)}
                    className="shrink-0 rounded-md px-2 py-1 text-sm text-accent-text hover:bg-panel-hover"
                >
                    Open PR
                </button>
            </div>
            {requested.length > 0 ? (
                <div className="mb-3">
                    <div className="mb-1 text-xs font-medium text-text-muted">Requested</div>
                    <div className="flex flex-wrap gap-1.5">
                        {requested.map((u) => (
                            <span
                                key={u}
                                className="rounded-md bg-surface-3 px-2 py-0.5 text-xs text-text-secondary"
                            >
                                {u}
                            </span>
                        ))}
                    </div>
                </div>
            ) : null}
            {reviews.length === 0 ? (
                <div className="text-sm text-text-muted">No reviews yet.</div>
            ) : (
                <div className="flex flex-col gap-2">
                    {reviews.map((r, i) => (
                        <div
                            key={`${r.user}-${i}`}
                            className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-2"
                        >
                            <div className="flex items-center gap-2 text-sm">
                                <span className="font-medium text-text-primary">{r.user}</span>
                                <span className="text-text-muted">{r.state.toLowerCase()}</span>
                            </div>
                            {r.body ? (
                                <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">
                                    {r.body}
                                </p>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

