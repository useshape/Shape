"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FileIcon } from "@/components/ui/file-icon";
import { ShapeLogo } from "@/components/ui/shape-logo";
import { GitAiAction } from "@/features/git/ui/shared/ai-insight";
import { ManagerDiffEditor } from "@/features/git/ui/shared/monaco-diff";
import { Panel } from "@/features/panels";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger
} from "@/components/ui/context";
import { Checkmark } from "@/components/ui/checkmark";
import {
    commands,
    useProjectState,
    GitFileParams,
    GitLogEntry,
} from "@/lib/backend";
import { notify } from "@/features/notifications";
import { statusProgress } from "@/lib/status-progress";
import { getSettings, useSettings } from "@/lib/settings";
import { getShapeAccessToken } from "@/lib/shape-auth/store";
import { Tooltip } from "@/components/ui/tooltip";
import {
    SidebarPanelHeaderFrame,
} from "@/features/panels";
import {
    AlertDialog,
    AlertDialogBody,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown";
import { useLoading } from "@/features/loading/context";
import { GitManagerTrigger } from "@/features/git/ui/manager/git-manager-trigger";
import { useGitRepos } from "@/lib/git/repos";

function isBenignGitError(err: unknown): boolean {
    const s = String(err).toLowerCase();
    return (
        s.includes("not a git repository")
        || s.includes("could not find repository")
        || s.includes(".invalid")
        || s.includes("unborn")
        || (s.includes("reference") && s.includes("not valid"))
    );
}
import { confirm } from "@tauri-apps/plugin-dialog";

function ChangeRow({
    file,
    projectPath,
    onRefresh,
    onShowDiff,
    selected,
}: {
    file: GitFileParams;
    projectPath: string;
    onRefresh: () => void;
    onShowDiff: (path: string, staged: boolean) => void;
    selected?: boolean;
}) {
    const handleToggleState = async () => {
        try {
            if (file.staged) {
                await commands.gitUnstage(projectPath, file.path);
            } else {
                await commands.gitStage(projectPath, file.path);
            }
            onRefresh();
        } catch (err) {
            notify.gitError(err);
        }
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <div
                    onClick={() => onShowDiff(file.path, file.staged)}
                    className={cn(
                        "flex items-center px-0.5 py-0.5 cursor-pointer rounded-lg group relative h-7 transition-colors",
                        selected ? "bg-panel-hover" : "hover:bg-panel-hover",
                    )}
                >
                    <div
                        className="w-5 h-5 flex items-center justify-center shrink-0 cursor-pointer text-text-muted hover:text-text-primary mr-1"
                        onClick={handleToggleState}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <Checkmark
                            checked={file.staged}
                            onCheckedChange={() => void handleToggleState()}
                        />
                    </div>
                    <div className="w-4 mr-1.5 flex justify-center shrink-0 pointer-events-none">
                        <FileIcon name={file.path.split(/[\\/]/).pop() || ""} />
                    </div>
                    <span className="text-sm font-medium text-text-primary group-hover:text-text-primary transition-colors flex-1 truncate mr-2 pointer-events-none">
                        {file.path.split(/[\\\/]/).pop()}
                        {file.path.includes('/') || file.path.includes('\\') ? (
                            <span className="text-text-secondary ml-1 font-normal">
                                {file.path.split(/[\\\/]/).slice(0, -1).join('/')}
                            </span>
                        ) : null}
                    </span>

                    <span
                        className="text-xs font-bold w-4 text-center shrink-0 pointer-events-none"
                        style={{
                            color: file.status === "C" ? "var(--git-conflict)" :
                                file.status === "M" ? "var(--git-modified)" :
                                file.status === "A" || file.status === "U" ? "var(--git-added)" :
                                    file.status === "D" ? "var(--git-deleted)" : "var(--git-added)"
                        }}
                    >
                        {file.status}
                    </span>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={() => void handleToggleState()}>
                    {file.staged ? "Unstage Changes" : "Stage Changes"}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onShowDiff(file.path, file.staged)}>
                    Open Changes
                </ContextMenuItem>
                {!file.staged && (
                    <ContextMenuItem
                        onClick={() => {
                            void (async () => {
                                const ok = await confirm(
                                    `Discard all unstaged changes in "${file.path.split(/[\\/]/).pop()}"? This cannot be undone.`,
                                    {
                                        title: "Discard Changes",
                                        kind: "warning",
                                        okLabel: "Discard",
                                        cancelLabel: "Cancel",
                                    },
                                );
                                if (!ok) return;
                                try {
                                    await commands.gitDiscardChanges(projectPath, file.path);
                                    onRefresh();
                                    window.dispatchEvent(new Event("shape-git-refresh"));
                                } catch (err) {
                                    notify.gitError(err);
                                }
                            })();
                        }}
                    >
                        Discard Changes
                    </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => {
                    navigator.clipboard.writeText(file.path);
                    notify.success("Copied", "File path copied to clipboard.");
                }}>
                    Copy Path
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

function ChangeSection({
    title,
    files,
    isOpen,
    onToggleOpen,
    isAllStaged,
    isSomeStaged,
    onToggleStage,
    onRefresh,
    onShowDiff,
    projectPath,
    selectedPath,
    selectedStaged,
}: {
    title: string;
    files: GitFileParams[];
    isOpen: boolean;
    onToggleOpen: () => void;
    isAllStaged: boolean;
    isSomeStaged: boolean;
    onToggleStage: () => void;
    onRefresh: () => void;
    onShowDiff: (path: string, staged: boolean) => void;
    projectPath: string;
    selectedPath?: string | null;
    selectedStaged?: boolean | null;
}) {
    if (files.length === 0) return null;

    return (
        <div className="flex flex-col">
            <div
                className="flex items-center group py-1 rounded-lg shrink-0 cursor-pointer hover:bg-panel-hover transition-colors"
                onClick={onToggleOpen}
            >
                <div className="w-4 h-4 -mr-2.5 flex items-center justify-center shrink-0 text-text-primary hover:text-text-primary">
                </div>
                <div
                    className="flex shrink-0 items-center justify-center h-full mr-2"
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                >
                    <Checkmark
                        checked={isAllStaged ? true : isSomeStaged ? "indeterminate" : false}
                        onCheckedChange={onToggleStage}
                    />
                </div>
                <span className="text-sm font-normal text-text-secondary group-hover:text-text-primary transition-colors">
                    {title} <span className="text-text-muted font-normal ml-1">{files.length} files</span>
                </span>
            </div>
            {isOpen && (
                <div className="space-y-0.5 mt-1">
                    {files.slice(0, 400).map((file, i) => (
                        <ChangeRow
                            key={`${title}-${file.path}-${file.staged ? "s" : "u"}-${i}`}
                            file={file}
                            projectPath={projectPath}
                            onRefresh={onRefresh}
                            onShowDiff={onShowDiff}
                            selected={
                                selectedPath === file.path && selectedStaged === file.staged
                            }
                        />
                    ))}
                    {files.length > 400 ? (
                        <p className="px-2 py-1.5 text-xs text-text-muted">
                            Showing 400 of {files.length} files. Stage, commit, or discard to shrink the list.
                        </p>
                    ) : null}
                </div>
            )}
        </div>
    );
}

export default function Source({
    className,
    /** When true (e.g. inside the Git manager window), hide the Git-manager opener. */
    embedded = false,
    /** Keep-alive: unmount Monaco when the source pane is hidden. */
    active = true,
}: {
    className?: string;
    embedded?: boolean;
    active?: boolean;
}) {
    const [commitTitle, setCommitTitle] = useState("");
    const [commitDescription, setCommitDescription] = useState("");
    const [commitSuggestionStatus, setCommitSuggestionStatus] = useState<"idle" | "loading">("idle");
    const [workingExplain, setWorkingExplain] = useState<string | null>(null);
    const [workingExplainLoading, setWorkingExplainLoading] = useState(false);
    const [conflictHelp, setConflictHelp] = useState<string | null>(null);
    const [conflictHelpLoading, setConflictHelpLoading] = useState(false);
    const [diffFile, setDiffFile] = useState<{ path: string; staged: boolean } | null>(null);
    const [diffOriginal, setDiffOriginal] = useState("");
    const [diffModified, setDiffModified] = useState("");
    const [diffLoading, setDiffLoading] = useState(false);
    const [sideBySide, setSideBySide] = useState(false);
    const { project_path } = useProjectState();
    const { repos, scmRepoPath, hasMultipleRepos, setActiveRepo, activeRepoPath, loading: reposLoading } = useGitRepos(project_path);
    const gitRepo = scmRepoPath;
    const [changes, setChanges] = useState<GitFileParams[]>([]);
    const [currentBranch, setCurrentBranch] = useState("...");
    const [hasRemote, setHasRemote] = useState(false);
    const [lastCommit, setLastCommit] = useState<GitLogEntry | null>(null);
    const [needsSync, setNeedsSync] = useState(false);
    // Assume repo until discovery proves otherwise — avoids empty-state flash on remount.
    const [isGitRepo, setIsGitRepo] = useState(true);

    const [isChangesOpen, setIsChangesOpen] = useState(true);
    const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);
    const [remotes, setRemotes] = useState<{ name: string; url: string }[]>([]);
    const [remoteLoading, setRemoteLoading] = useState(false);
    const [newRemoteName, setNewRemoteName] = useState("origin");
    const [newRemoteUrl, setNewRemoteUrl] = useState("");
    const [editingRemote, setEditingRemote] = useState<{ name: string; url: string } | null>(null);

    const { startLoading, stopLoading } = useLoading();
    const settings = useSettings();

    const refresh = useCallback(async (opts?: { track?: boolean }) => {
        const track = opts?.track !== false;
        const repoPath = scmRepoPath;
        if (project_path && repoPath) {
            statusProgress.push("git-refresh", "Refreshing git status...");
            if (track) startLoading();
            try {
                await Promise.all([
                    commands.gitStatus(repoPath).then((c) => {
                        setIsGitRepo(true);
                        setChanges(c);
                    }).catch((err) => {
                        if (isBenignGitError(err)) {
                            setIsGitRepo(repos.length > 0);
                            setChanges([]);
                        } else {
                            notify.error("Source Control Error", `Failed to load git status: ${err instanceof Error ? err.message : String(err)}`);
                        }
                    }),
                    commands.gitCurrentBranch(repoPath).then(setCurrentBranch).catch(() => {
                        setCurrentBranch("master");
                    }),
                    commands.gitHasRemote(repoPath).then(setHasRemote).catch(() => {
                        setHasRemote(false);
                    }),
                    commands.gitLog(repoPath, 1)
                        .then(logs => {
                            if (logs.length > 0) setLastCommit(logs[0]);
                            else setLastCommit(null);
                        }).catch(() => setLastCommit(null)),
                    commands.gitSyncStatus(repoPath).then(status => {
                        setNeedsSync(status.ahead > 0);
                    }).catch(() => setNeedsSync(false)),
                ]);
            } finally {
                if (track) stopLoading();
                statusProgress.remove("git-refresh");
            }
        } else if (project_path && !reposLoading) {
            // Only clear after discovery finished with no repo — never during the async gap.
            setIsGitRepo(false);
            setChanges([]);
            setLastCommit(null);
        }
    }, [project_path, scmRepoPath, repos.length, reposLoading, startLoading, stopLoading]);

    useEffect(() => {
        // Soft refresh on mount — don't flash the global loading bar for routine open.
        void refresh({ track: false });
    }, [refresh]);

    useEffect(() => {
        const handleGitRefresh = () => { void refresh(); };
        window.addEventListener("shape-git-refresh", handleGitRefresh);
        return () => window.removeEventListener("shape-git-refresh", handleGitRefresh);
    }, [refresh]);

    useEffect(() => {
        if (!project_path || !hasRemote || !settings.git.autoFetch || !gitRepo) return;
        const intervalMs = settings.git.autoFetchInterval * 1000;
        const id = setInterval(() => {
            commands.gitFetch(gitRepo).catch(() => { });
        }, intervalMs);
        return () => clearInterval(id);
    }, [project_path, gitRepo, hasRemote, settings.git.autoFetch, settings.git.autoFetchInterval]);

    const openRemoteDialog = async () => {
        if (!gitRepo) return;
        setRemoteDialogOpen(true);
        setRemoteLoading(true);
        setEditingRemote(null);
        setNewRemoteName("origin");
        setNewRemoteUrl("");
        try {
            const list = await commands.gitListRemotes(gitRepo);
            setRemotes(list);
        } catch {
            setRemotes([]);
        } finally {
            setRemoteLoading(false);
        }
    };

    const reloadRemotes = async () => {
        if (!gitRepo) return;
        setRemoteLoading(true);
        try {
            const list = await commands.gitListRemotes(gitRepo);
            setRemotes(list);
            setHasRemote(list.length > 0);
        } catch (e) {
            notify.gitError(e);
        } finally {
            setRemoteLoading(false);
        }
    };

    const handleAddRemote = async () => {
        if (!gitRepo || !newRemoteName.trim() || !newRemoteUrl.trim()) return;
        try {
            await commands.gitAddRemote(gitRepo, newRemoteName.trim(), newRemoteUrl.trim());
            notify.success("Git", `Added remote ${newRemoteName.trim()}`);
            setNewRemoteName("origin");
            setNewRemoteUrl("");
            await reloadRemotes();
        } catch (e) {
            notify.gitError(e);
        }
    };

    const handleRemoveRemote = async (name: string) => {
        if (!gitRepo) return;
        const ok = await confirm(`Remove remote "${name}"?`, {
            title: "Remove Remote",
            kind: "warning",
            okLabel: "Remove",
            cancelLabel: "Cancel",
        });
        if (!ok) return;
        try {
            await commands.gitRemoveRemote(gitRepo, name);
            notify.success("Git", `Removed remote ${name}`);
            await reloadRemotes();
        } catch (e) {
            notify.gitError(e);
        }
    };

    const handleSaveRemoteUrl = async () => {
        if (!gitRepo || !editingRemote) return;
        const url = editingRemote.url.trim();
        if (!url) return;
        try {
            await commands.gitSetRemoteUrl(gitRepo, editingRemote.name, url);
            notify.success("Git", `Updated remote ${editingRemote.name}`);
            setEditingRemote(null);
            await reloadRemotes();
        } catch (e) {
            notify.gitError(e);
        }
    };

    const handleCommit = async (
        all: boolean = false,
        opts?: { amend?: boolean; promptSyncAfter?: boolean },
    ) => {
        if (!gitRepo || !commitTitle) {
            notify.error("Git", "Please enter a commit title");
            return false;
        }
        const amend = opts?.amend === true;
        try {
            if (amend) {
                if (!lastCommit) {
                    notify.error("Git", "Nothing to amend");
                    return false;
                }
                if (hasRemote) {
                    const status = await commands.gitSyncStatus(gitRepo).catch(() => ({
                        ahead: 0,
                        behind: 0,
                    }));
                    if (status.ahead === 0) {
                        const rewrite = await confirm(
                            "The latest commit appears to be on the remote. Amending rewrites history. Continue?",
                            {
                                title: "Amend published commit",
                                kind: "warning",
                                okLabel: "Amend",
                                cancelLabel: "Cancel",
                            },
                        );
                        if (!rewrite) return false;
                    }
                }
            }

            if (all) {
                const unstaged = changes.filter((c: GitFileParams) => !c.staged);
                for (const file of unstaged) {
                    await commands.gitStage(gitRepo, file.path);
                }
            } else {
                const staged = changes.filter((c: GitFileParams) => c.staged);
                if (staged.length === 0 && !amend) {
                    const stageAll = await confirm(
                        "There are no staged changes to commit. Stage all changes and commit?",
                        {
                            title: "Stage and commit",
                            kind: "info",
                            okLabel: "Stage & Commit",
                            cancelLabel: "Cancel",
                        },
                    );
                    if (stageAll) {
                        const unstaged = changes.filter((c: GitFileParams) => !c.staged);
                        for (const file of unstaged) {
                            await commands.gitStage(gitRepo, file.path);
                        }
                    } else {
                        return false;
                    }
                } else if (staged.length === 0 && amend && changes.length > 0) {
                    const stageAll = await confirm(
                        "Stage all changes into the amended commit?",
                        {
                            title: "Amend commit",
                            kind: "info",
                            okLabel: "Stage & Amend",
                            cancelLabel: "Amend message only",
                        },
                    );
                    if (stageAll) {
                        const unstaged = changes.filter((c: GitFileParams) => !c.staged);
                        for (const file of unstaged) {
                            await commands.gitStage(gitRepo, file.path);
                        }
                    }
                }
            }

            const fullMessage = commitDescription ? `${commitTitle}\n\n${commitDescription}` : commitTitle;

            if (getSettings().git.confirmBeforeCommit) {
                const ok = await confirm(
                    amend ? `Amend last commit?\n\n${fullMessage}` : `Create commit?\n\n${fullMessage}`,
                    {
                        title: amend ? "Amend commit" : "Create commit",
                        kind: "info",
                        okLabel: amend ? "Amend" : "Commit",
                        cancelLabel: "Cancel",
                    },
                );
                if (!ok) return false;
            }

            if (amend) {
                await commands.gitCommitAmend(gitRepo, fullMessage);
            } else {
                await commands.gitCommit(gitRepo, fullMessage);
            }
            setCommitTitle("");
            setCommitDescription("");
            setCommitSuggestionStatus("idle");
            let ahead = 0;
            if (hasRemote) {
                const status = await commands.gitSyncStatus(gitRepo).catch(() => ({ ahead: 0, behind: 0 }));
                ahead = status.ahead;
                setNeedsSync(ahead > 0);
            }
            refresh();
            notify.success("Git", amend ? "Commit amended" : "Commit successful");

            if (opts?.promptSyncAfter && hasRemote && ahead > 0) {
                const syncNow = await confirm(
                    "Commit created. Sync with remote now?",
                    {
                        title: "Sync",
                        kind: "info",
                        okLabel: "Sync",
                        cancelLabel: "Not now",
                    },
                );
                if (syncNow) {
                    await handleSync();
                }
            }
            return true;
        } catch (e) {
            console.error("Commit failed:", e);
            notify.gitError(e, amend ? "Amend failed" : "Commit failed");
            return false;
        }
    };

    const handlePush = async () => {
        if (!gitRepo) return;
        startLoading();
        try {
            await commands.gitPush(gitRepo);
            notify.info("Git", "Pushed successfully.");
            setNeedsSync(false);
            await refresh({ track: false });
        } catch (err) {
            notify.gitError(err, "Push failed");
        } finally {
            stopLoading();
        }
    };

    const handleSync = async () => {
        if (!gitRepo) return;
        startLoading();
        try {
            await commands.gitSync(gitRepo);
            notify.info("Git Sync", "Successfully synced with remote.");
            setNeedsSync(false);
            await refresh({ track: false });
        } catch (err) {
            notify.gitError(err, "Sync failed");
        } finally {
            stopLoading();
        }
    };

    const handlePull = async () => {
        if (!gitRepo) return;
        startLoading();
        try {
            await commands.gitPull(gitRepo);
            notify.info("Git", "Pulled successfully.");
            await refresh({ track: false });
        } catch (err) {
            notify.gitError(err, "Pull failed");
        } finally {
            stopLoading();
        }
    };

    const handleFetch = async () => {
        if (!gitRepo) return;
        startLoading();
        try {
            await commands.gitFetch(gitRepo);
            notify.info("Git", "Fetched from all remotes.");
            await refresh({ track: false });
        } catch (err) {
            notify.gitError(err, "Fetch failed");
        } finally {
            stopLoading();
        }
    };

    const handleGenerateCommitMessage = async () => {
        if (!project_path) {
            notify.error("AI Error", "Open a project to generate a commit message.");
            return;
        }
        const stagedChanges = changes.filter(c => c.staged);
        if (stagedChanges.length === 0) {
            notify.error("AI Error", "You must check at least one change to generate a commit message.");
            return;
        }
        setCommitSuggestionStatus("loading");
        try {
            const token = getShapeAccessToken();
            if (!token) {
                notify.error("AI Error", "Sign in to Shape to use AI chat.");
                setCommitSuggestionStatus("idle");
                return;
            }
            const message = await commands.generateCommitMessage(token, gitRepo);
            const lines = message.trim().split('\n');
            const title = lines[0];
            const description = lines.slice(1).join('\n').trim();
            setCommitTitle(title);
            setCommitDescription(description);
            setCommitSuggestionStatus("idle");
            // Commit AI bills Shape credits — refresh account balance.
            void import("@/lib/shape-auth/store").then(({ refreshShapeAuth }) => {
                void refreshShapeAuth();
            }).catch(() => undefined);
        } catch (err) {
            notify.error("AI Error", err instanceof Error ? err.message : String(err));
            setCommitSuggestionStatus("idle");
        }
    };

    const runExplainWorking = async () => {
        if (!gitRepo) return;
        const token = getShapeAccessToken();
        if (!token) {
            notify.error("AI Error", "Sign in to Shape to explain changes.");
            return;
        }
        if (changes.filter((c) => c.staged).length === 0) {
            notify.error("AI Error", "Stage files first to explain them.");
            return;
        }
        setWorkingExplainLoading(true);
        try {
            const text = await commands.explainGitChanges("working", {
                repoPath: gitRepo,
                accessToken: token,
            });
            setWorkingExplain(text.trim());
            void import("@/lib/shape-auth/store")
                .then(({ refreshShapeAuth }) => {
                    void refreshShapeAuth();
                })
                .catch(() => undefined);
        } catch (err) {
            notify.error("AI Error", err instanceof Error ? err.message : String(err));
        } finally {
            setWorkingExplainLoading(false);
        }
    };

    const runConflictHelp = async () => {
        if (!gitRepo) return;
        const token = getShapeAccessToken();
        if (!token) {
            notify.error("AI Error", "Sign in to Shape for conflict help.");
            return;
        }
        setConflictHelpLoading(true);
        try {
            const text = await commands.explainGitChanges("conflict", {
                repoPath: gitRepo,
                accessToken: token,
            });
            setConflictHelp(text.trim());
            void import("@/lib/shape-auth/store")
                .then(({ refreshShapeAuth }) => {
                    void refreshShapeAuth();
                })
                .catch(() => undefined);
        } catch (err) {
            notify.error("AI Error", err instanceof Error ? err.message : String(err));
        } finally {
            setConflictHelpLoading(false);
        }
    };

    const handleShowDiff = async (path: string, staged: boolean) => {
        if (!gitRepo) return;
        if (embedded) {
            setDiffFile({ path, staged });
            return;
        }
        const name = path.split(/[\\/]/).pop() || path;
        const absPath = gitRepo + (gitRepo.endsWith('/') || gitRepo.endsWith('\\') ? '' : '/') + path;
        try {
            await commands.gitOpenDiff(absPath, name, staged);
        } catch (e) {
            notify.error("Git Error", `Failed to open diff: ${e}`);
        }
    };

    useEffect(() => {
        if (!embedded || !gitRepo || !diffFile) {
            setDiffOriginal("");
            setDiffModified("");
            return;
        }
        let cancelled = false;
        setDiffLoading(true);
        void (async () => {
            try {
                const original = await commands
                    .gitGetItemContent(gitRepo, diffFile.path, diffFile.staged)
                    .catch(() => "");
                let modified = "";
                if (diffFile.staged) {
                    modified = await commands
                        .gitGetItemContent(gitRepo, diffFile.path, false)
                        .catch(() => "");
                } else {
                    const sep = gitRepo.endsWith("/") || gitRepo.endsWith("\\") ? "" : "/";
                    modified = await commands
                        .readFile(`${gitRepo}${sep}${diffFile.path}`)
                        .catch(() => "");
                }
                if (!cancelled) {
                    setDiffOriginal(original);
                    setDiffModified(modified);
                }
            } catch {
                if (!cancelled) {
                    setDiffOriginal("");
                    setDiffModified("");
                }
            } finally {
                if (!cancelled) setDiffLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [embedded, gitRepo, diffFile]);





    const stagedChanges = changes.filter(c => c.staged);
    const unstagedChanges = changes.filter(c => !c.staged);
    const isAllStaged = changes.length > 0 && changes.every(c => c.staged);

    const handleToggleAllChanges = async () => {
        if (!gitRepo) return;
        if (isAllStaged) {
            await commands.gitUnstageAll(gitRepo);
        } else {
            await commands.gitStageAll(gitRepo);
        }
        refresh();
    };

    const sourceChrome = (
        <>
            <SidebarPanelHeaderFrame
                title="Source Control"
                className={embedded ? "bg-editor" : undefined}
                actions={
                    isGitRepo ? (
                        <div className="flex shrink-0 items-center gap-0.5">
                        <Tooltip content="Refresh Repository">
                            <Button variant="ghost" size="icon" className="w-6 h-6 hover:bg-panel-hover" onClick={() => void refresh()}>
                                <Icon name="refresh" size={16} />
                            </Button>
                        </Tooltip>
                        <Tooltip content="Pull">
                            <Button variant="ghost" size="icon" className="w-6 h-6 hover:bg-panel-hover" onClick={handlePull}>
                                <Icon name="download" size={16} />
                            </Button>
                        </Tooltip>
                        <Tooltip content="Push">
                            <Button variant="ghost" size="icon" className="w-6 h-6 hover:bg-panel-hover" onClick={handlePush}>
                                <Icon name="arrow_upward" size={16} />
                            </Button>
                        </Tooltip>
                        <Tooltip content="Sync Changes">
                            <Button variant="ghost" size="icon" className="w-6 h-6 hover:bg-panel-hover" onClick={handleSync}>
                                <Icon name="cloud_upload" size={16} />
                            </Button>
                        </Tooltip>
                        {!embedded && project_path ? <GitManagerTrigger /> : null}
                        {/* Tooltip must wrap the whole menu - nesting Tooltip around DropdownMenuTrigger breaks both. */}
                        <Tooltip content="More actions">
                            <span className="inline-flex">
                                <DropdownMenu modal={false}>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="w-6 h-6" aria-label="More actions">
                                            <Icon name="more_horiz" size={16} />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48">
                                        <DropdownMenuItem onClick={handleSync}>Sync (Pull / Push)</DropdownMenuItem>
                                        <DropdownMenuItem onClick={handleFetch}>Fetch All</DropdownMenuItem>
                                        <DropdownMenuItem onClick={handlePull}>Pull</DropdownMenuItem>
                                        <DropdownMenuItem onClick={handlePush}>Push</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={async () => {
                                            if (!gitRepo) return;
                                            await commands.gitStageAll(gitRepo);
                                            refresh();
                                        }}>Stage All Changes</DropdownMenuItem>
                                        <DropdownMenuItem onClick={async () => {
                                            if (!gitRepo) return;
                                            await commands.gitUnstageAll(gitRepo);
                                            refresh();
                                        }}>Unstage All Changes</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={async () => {
                                            if (!gitRepo) return;
                                            try {
                                                await commands.gitStashSave(gitRepo, "", true);
                                                notify.success("Git", "Changes stashed.");
                                                refresh();
                                            } catch (e) {
                                                notify.gitError(e, "Stash failed");
                                            }
                                        }}>Stash Changes</DropdownMenuItem>
                                        <DropdownMenuItem onClick={async () => {
                                            if (!gitRepo) return;
                                            try {
                                                await commands.gitStashPop(gitRepo, 0);
                                                notify.success("Git", "Stash applied and dropped.");
                                                refresh();
                                            } catch (e) {
                                                notify.gitError(e, "Stash pop failed");
                                            }
                                        }}>Pop Latest Stash</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={async () => {
                                            if (!gitRepo) return;
                                            try {
                                                await commands.gitMergeAbort(gitRepo);
                                                notify.info("Git", "Merge aborted.");
                                                refresh();
                                            } catch (e) {
                                                notify.gitError(e, "Merge abort failed");
                                            }
                                        }}>Abort Merge</DropdownMenuItem>
                                        <DropdownMenuItem onClick={async () => {
                                            if (!gitRepo) return;
                                            try {
                                                await commands.gitRebaseAbort(gitRepo);
                                                notify.info("Git", "Rebase aborted.");
                                                refresh();
                                            } catch (e) {
                                                notify.gitError(e, "Rebase abort failed");
                                            }
                                        }}>Abort Rebase</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => void openRemoteDialog()}>Manage Remotes...</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setIsGitRepo(false)}>Disconnect Repository</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </span>
                        </Tooltip>
                        </div>
                    ) : undefined
                }
            />

            {changes.some((c) => c.status === "C") && gitRepo ? (
                <div className="mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--git-conflict)]/40 bg-[color:var(--git-conflict)]/10 px-2 py-1.5 text-xs text-text-primary">
                    <span className="flex-1">
                        Merge conflicts detected. Resolve conflicted files, then continue or abort.
                    </span>
                    <GitAiAction
                        compact
                        label="Help resolve"
                        title="Conflict guidance"
                        content={conflictHelp}
                        loading={conflictHelpLoading}
                        onRun={runConflictHelp}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={async () => {
                            try {
                                await commands.gitMergeAbort(gitRepo);
                                notify.info("Git", "Merge aborted.");
                                refresh();
                            } catch {
                                try {
                                    await commands.gitRebaseAbort(gitRepo);
                                    notify.info("Git", "Rebase aborted.");
                                    refresh();
                                } catch (e) {
                                    notify.gitError(e, "Could not abort merge/rebase");
                                }
                            }
                        }}
                    >
                        Abort
                    </Button>
                </div>
            ) : null}

            {hasMultipleRepos && isGitRepo && (
                <div className="px-3 pb-2 shrink-0">
                    <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-full justify-between gap-2 px-2 hover:bg-panel-hover text-text-secondary hover:text-text-primary"
                            >
                                <span className="flex items-center gap-1.5 min-w-0">
                                    <Icon name="folder" size={14} className="shrink-0" />
                                    <span className="truncate text-sm">
                                        {repos.find((r) => r.path === activeRepoPath)?.name ?? "Repository"}
                                    </span>
                                </span>
                                <Icon name="expand_more" size={16} className="shrink-0" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                            {repos.map((repo) => (
                                <DropdownMenuItem
                                    key={repo.path}
                                    onClick={() => {
                                        setActiveRepo(repo.path);
                                        window.dispatchEvent(new Event("shape-git-refresh"));
                                    }}
                                >
                                    <span className="truncate">{repo.name}</span>
                                    {activeRepoPath === repo.path && (
                                        <Icon name="check" size={14} className="ml-auto shrink-0" />
                                    )}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            )}
        </>
    );

    return (
        <div className={cn("w-full h-full flex flex-col select-none overflow-hidden font-sans", className)}>
            {/* Sidebar: chrome spans full width. Embedded + repo: chrome only over the left list, like Graph. */}
            {!(embedded && isGitRepo) ? sourceChrome : null}

            <div className="flex-1 flex flex-col overflow-hidden">
                {reposLoading && !scmRepoPath ? (
                    <div className="flex h-full items-center justify-center p-4 text-sm text-text-muted">
                        Looking for Git repositories…
                    </div>
                ) : !isGitRepo ? (
                    <div className="flex flex-col items-center p-4 text-center h-full gap-4">
                        <p className="text-sm text-text-primary text-left font-normal leading-normal">
                            The folder currently open doesn&apos;t have a Git repository. You can initialize a repository which will enable source control features powered by Git. To learn more about how to use Git and source control in Shape <a href="#" className="text-accent hover:underline">Read our docs</a>.
                        </p>
                        <Button
                            variant="default"
                            className="w-full mb-4"
                            onClick={async () => {
                                if (!project_path) return;
                                try {
                                    await commands.gitInit(project_path);
                                    setIsGitRepo(true);
                                    window.dispatchEvent(new Event("shape-git-refresh"));
                                    notify.success("Git", "Repository initialized.");
                                } catch (e) {
                                    notify.gitError(e, "Failed to initialize repository");
                                }
                            }}
                        >
                            Initialize Repository
                        </Button>
                    </div>
                ) : embedded ? (
                    <Panel
                        direction="horizontal"
                        paneGap="var(--workbench-gap)"
                        storageKey="git-source-split"
                        hideSeparator
                        className="min-h-0 flex-1"
                        panes={[
                            {
                                id: "source-list",
                                preferredSize: 360,
                                minSize: 260,
                                maxSize: 520,
                                children: (
                    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
                        {sourceChrome}
                        <div className="overflow-y-auto custom-scrollbar flex-1 space-y-4 py-2 px-2">
                            <ChangeSection
                                title="Staged Changes"
                                files={stagedChanges}
                                isOpen={isChangesOpen}
                                onToggleOpen={() => setIsChangesOpen(!isChangesOpen)}
                                isAllStaged={stagedChanges.length > 0}
                                isSomeStaged={stagedChanges.length > 0}
                                onToggleStage={handleToggleAllChanges}
                                onRefresh={refresh}
                                onShowDiff={handleShowDiff}
                                projectPath={gitRepo || ""}
                                selectedPath={diffFile?.path}
                                selectedStaged={diffFile?.staged}
                            />
                            <ChangeSection
                                title="Changes"
                                files={unstagedChanges}
                                isOpen={isChangesOpen}
                                onToggleOpen={() => setIsChangesOpen(!isChangesOpen)}
                                isAllStaged={false}
                                isSomeStaged={unstagedChanges.some(c => c.staged)}
                                onToggleStage={handleToggleAllChanges}
                                onRefresh={refresh}
                                onShowDiff={handleShowDiff}
                                projectPath={gitRepo || ""}
                                selectedPath={diffFile?.path}
                                selectedStaged={diffFile?.staged}
                            />
                        </div>

                        <div className={cn("py-2 flex flex-col shrink-0 z-10 relative", embedded ? "bg-editor" : "bg-panel")}>
                            <div
                                className={cn(
                                    "absolute left-0 right-0 top-0 -translate-y-full pb-10 h-8 bg-linear-to-t to-transparent pointer-events-none z-10",
                                    embedded ? "from-editor" : "from-panel",
                                )}
                            />
                            {lastCommit && (
                                <div className="flex items-center text-sm text-text-muted gap-0.5 px-2 min-w-0">
                                    <Icon name="account_tree" size={16} className="shrink-0" />
                                    <span className="font-medium shrink-0 truncate max-w-[30%]">{currentBranch}</span>
                                    <Icon name="chevron_right" size={16} className="shrink-0" />
                                    <span className="truncate flex-1 min-w-0">
                                        {lastCommit.message.split('\n')[0]}
                                    </span>
                                </div>
                            )}

                            <div className={cn(
                                "flex flex-col gap-0.5 relative overflow-hidden m-2 border border-border rounded-xl",
                                embedded ? "bg-transparent" : "bg-transparent",
                            )}>
                                <Input
                                    placeholder="Commit title"
                                    value={commitTitle}
                                    onChange={(e) => setCommitTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                            e.preventDefault();
                                            void handleCommit(false, { promptSyncAfter: true });
                                        }
                                    }}
                                    className="border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-2 bg-transparent"
                                />
                                <Textarea
                                    placeholder="Add description..."
                                    value={commitDescription}
                                    onChange={(e) => setCommitDescription(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                            e.preventDefault();
                                            void handleCommit(false, { promptSyncAfter: true });
                                        }
                                    }}
                                    className="border-none shadow-none resize-none text-sm min-h-[60px] focus-visible:ring-0 focus-visible:ring-offset-0 px-2 pb-2 mt-0 rounded-none bg-transparent"
                                    rows={2}
                                />
                            </div>

                            <div className="flex w-full flex-col gap-1.5 px-2">
                                <div className="flex w-full items-center justify-between gap-1">
                                    <div className="flex min-w-0 items-center gap-1">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-chrome gap-1.5 px-md"
                                            disabled={
                                                commitSuggestionStatus === "loading"
                                                || changes.filter((c) => c.staged).length === 0
                                            }
                                            onClick={() => void handleGenerateCommitMessage()}
                                        >
                                            <ShapeLogo size={12} />
                                            {commitSuggestionStatus === "loading"
                                                ? "Generating…"
                                                : "Generate"}
                                        </Button>
                                        <GitAiAction
                                            label="Explain staged"
                                            title="Staged changes"
                                            content={workingExplain}
                                            loading={workingExplainLoading}
                                            disabled={changes.filter((c) => c.staged).length === 0}
                                            onRun={runExplainWorking}
                                        />
                                    </div>

                                <div className="flex items-center gap-1.5">
                                    {needsSync && changes.length === 0 ? (
                                        <Button
                                            variant="default"
                                            size="sm"
                                            className="gap-1 px-3 h-7 text-xs font-medium"
                                            onClick={() => void handleSync()}
                                        >
                                            <Icon name="cloud_upload" size={14} />
                                            <span>Push</span>
                                        </Button>
                                    ) : (
                                        <div className="flex items-stretch overflow-hidden rounded-lg">
                                            <Button
                                                variant="default"
                                                size="sm"
                                                className="h-7 rounded-none px-3 text-xs font-medium"
                                                onClick={() =>
                                                    void handleCommit(false, { promptSyncAfter: true })
                                                }
                                                disabled={!commitTitle.trim() || changes.length === 0}
                                            >
                                                Commit
                                            </Button>
                                            <DropdownMenu modal={false}>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="default"
                                                        size="sm"
                                                        className="h-7 rounded-none border-l border-white/20 px-1.5"
                                                        disabled={!commitTitle.trim()}
                                                        aria-label="Commit options"
                                                    >
                                                        <Icon name="expand_more" size={14} />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48">
                                                    <DropdownMenuItem
                                                        disabled={!commitTitle.trim() || changes.length === 0}
                                                        onClick={() =>
                                                            void handleCommit(false, {
                                                                promptSyncAfter: true,
                                                            })
                                                        }
                                                    >
                                                        Commit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        disabled={!commitTitle.trim() || !lastCommit}
                                                        onClick={() =>
                                                            void handleCommit(false, {
                                                                amend: true,
                                                                promptSyncAfter: true,
                                                            })
                                                        }
                                                    >
                                                        Commit (Amend)
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        disabled={
                                                            !commitTitle.trim() ||
                                                            changes.length === 0 ||
                                                            !hasRemote
                                                        }
                                                        onClick={async () => {
                                                            if (
                                                                await handleCommit(false, {
                                                                    promptSyncAfter: false,
                                                                })
                                                            ) {
                                                                await handlePush();
                                                            }
                                                        }}
                                                    >
                                                        Commit & Push
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        disabled={
                                                            !commitTitle.trim() ||
                                                            changes.length === 0 ||
                                                            !hasRemote
                                                        }
                                                        onClick={async () => {
                                                            if (
                                                                await handleCommit(false, {
                                                                    promptSyncAfter: false,
                                                                })
                                                            ) {
                                                                await handleSync();
                                                            }
                                                        }}
                                                    >
                                                        Commit & Sync
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    )}
                                </div>
                                </div>
                            </div>
                        </div>
                    </div>
                            ),
                            },
                            {
                                id: "source-diff",
                                flexible: true,
                                minSize: 280,
                                children: (
                                    <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden border border-border-subtle bg-editor">
                                        {!diffFile ? (
                                            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-text-muted">
                                                <Icon name="description" size={18} className="text-text-muted" />
                                                <p>Select a file to view changes</p>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex h-9 shrink-0 items-center gap-2 px-3">
                                                    <FileIcon
                                                        name={
                                                            diffFile.path.split(/[\\/]/).pop()
                                                            || diffFile.path
                                                        }
                                                        className="h-3.5 w-3.5 shrink-0"
                                                    />
                                                    <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
                                                        {diffFile.path}
                                                    </span>
                                                    <span className="shrink-0 text-xs text-text-muted">
                                                        {diffFile.staged ? "Staged" : "Unstaged"}
                                                    </span>
                                                    <Tooltip content={sideBySide ? "Inline diff" : "Side by side"}>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 shrink-0 p-0"
                                                            onClick={() => setSideBySide((v) => !v)}
                                                        >
                                                            <Icon
                                                                name={
                                                                    sideBySide
                                                                        ? "split_horizontal"
                                                                        : "vertical_split"
                                                                }
                                                                size={15}
                                                            />
                                                        </Button>
                                                    </Tooltip>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 shrink-0 p-0"
                                                        onClick={() => setDiffFile(null)}
                                                    >
                                                        <Icon name="close" size={15} />
                                                    </Button>
                                                </div>
                                                <div className="relative min-h-0 flex-1 overflow-hidden">
                                                    {diffLoading ? (
                                                        <div className="flex h-full items-center justify-center text-sm text-text-muted">
                                                            Loading diff…
                                                        </div>
                                                    ) : (
                                                        <ManagerDiffEditor
                                                            active={active}
                                                            original={diffOriginal}
                                                            modified={diffModified}
                                                            path={diffFile.path}
                                                            sideBySide={sideBySide}
                                                        />
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ),
                            },
                        ]}
                    />
                ) : (
                    <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
                        <div className="overflow-y-auto custom-scrollbar flex-1 space-y-4 py-2 px-2">
                            <ChangeSection
                                title="Staged Changes"
                                files={stagedChanges}
                                isOpen={isChangesOpen}
                                onToggleOpen={() => setIsChangesOpen(!isChangesOpen)}
                                isAllStaged={stagedChanges.length > 0}
                                isSomeStaged={stagedChanges.length > 0}
                                onToggleStage={handleToggleAllChanges}
                                onRefresh={refresh}
                                onShowDiff={handleShowDiff}
                                projectPath={gitRepo || ""}
                            />
                            <ChangeSection
                                title="Changes"
                                files={unstagedChanges}
                                isOpen={isChangesOpen}
                                onToggleOpen={() => setIsChangesOpen(!isChangesOpen)}
                                isAllStaged={false}
                                isSomeStaged={unstagedChanges.some(c => c.staged)}
                                onToggleStage={handleToggleAllChanges}
                                onRefresh={refresh}
                                onShowDiff={handleShowDiff}
                                projectPath={gitRepo || ""}
                            />
                        </div>
                        <div className={cn("py-2 flex flex-col shrink-0 z-10 relative", "bg-panel")}>
                            <div
                                className={cn(
                                    "absolute left-0 right-0 top-0 -translate-y-full pb-10 h-8 bg-linear-to-t to-transparent pointer-events-none z-10",
                                    "from-panel",
                                )}
                            />
                            {lastCommit && (
                                <div className="flex items-center text-sm text-text-muted gap-0.5 px-2 min-w-0">
                                    <Icon name="account_tree" size={16} className="shrink-0" />
                                    <span className="font-medium shrink-0 truncate max-w-[30%]">{currentBranch}</span>
                                    <Icon name="chevron_right" size={16} className="shrink-0" />
                                    <span className="truncate flex-1 min-w-0">
                                        {lastCommit.message.split('\n')[0]}
                                    </span>
                                </div>
                            )}
                            <div className="flex flex-col gap-0.5 relative overflow-hidden m-2 border border-border rounded-xl bg-transparent">
                                <Input
                                    placeholder="Commit title"
                                    value={commitTitle}
                                    onChange={(e) => setCommitTitle(e.target.value)}
                                    className="border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-2 bg-transparent"
                                />
                                <Textarea
                                    placeholder="Add description..."
                                    value={commitDescription}
                                    onChange={(e) => setCommitDescription(e.target.value)}
                                    className="border-none shadow-none resize-none text-sm min-h-[60px] focus-visible:ring-0 focus-visible:ring-offset-0 px-2 pb-2 mt-0 rounded-none bg-transparent"
                                    rows={2}
                                />
                            </div>
                            <div className="flex w-full items-center justify-between gap-1 px-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={
                                        commitSuggestionStatus === "loading"
                                        || changes.filter((c) => c.staged).length === 0
                                    }
                                    onClick={() => void handleGenerateCommitMessage()}
                                >
                                    <ShapeLogo size={12} />
                                    {commitSuggestionStatus === "loading"
                                        ? "Generating…"
                                        : "Generate"}
                                </Button>
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() =>
                                        void handleCommit(false, { promptSyncAfter: true })
                                    }
                                    disabled={!commitTitle.trim() || changes.length === 0}
                                >
                                    Commit
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <AlertDialog open={remoteDialogOpen} onOpenChange={setRemoteDialogOpen}>
                <AlertDialogContent sizeClassName="max-w-[520px]">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Manage Remotes</AlertDialogTitle>
                        <AlertDialogDescription>
                            Add, edit, or remove remotes for this repository.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogBody>
                        <div className="space-y-2 mb-4 max-h-[220px] overflow-y-auto custom-scrollbar">
                            {remoteLoading && remotes.length === 0 ? (
                                <div className="text-xs text-text-muted px-1 py-2">Loading remotes...</div>
                            ) : remotes.length === 0 ? (
                                <div className="text-xs text-text-muted px-1 py-2">No remotes configured.</div>
                            ) : (
                                remotes.map((remote) => (
                                    <div key={remote.name} className="rounded-lg border border-border-subtle bg-panel-secondary p-2">
                                        {editingRemote?.name === remote.name ? (
                                            <div className="space-y-2">
                                                <div className="text-xs font-medium text-text-primary">{remote.name}</div>
                                                <Input
                                                    value={editingRemote.url}
                                                    onChange={(e) => setEditingRemote({ ...editingRemote, url: e.target.value })}
                                                    className="h-7 text-xs"
                                                />
                                                <div className="flex gap-2">
                                                    <Button size="sm" className="h-7 text-xs" onClick={() => void handleSaveRemoteUrl()}>Save</Button>
                                                    <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => setEditingRemote(null)}>Cancel</Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-start gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-xs font-medium text-text-primary">{remote.name}</div>
                                                    <div className="text-xs text-text-muted break-all">{remote.url || "No URL"}</div>
                                                </div>
                                                <div className="flex gap-1 shrink-0">
                                                    <Tooltip content="Edit URL">
                                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingRemote(remote)} aria-label="Edit URL">
                                                            <Icon name="edit" size={14} />
                                                        </Button>
                                                    </Tooltip>
                                                    <Tooltip content="Copy URL">
                                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void navigator.clipboard.writeText(remote.url)} aria-label="Copy URL">
                                                            <Icon name="content_copy" size={14} />
                                                        </Button>
                                                    </Tooltip>
                                                    <Tooltip content="Remove">
                                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-error" onClick={() => void handleRemoveRemote(remote.name)} aria-label="Remove remote">
                                                            <Icon name="delete" size={14} />
                                                        </Button>
                                                    </Tooltip>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="pt-3 space-y-2">
                            <div className="text-xs font-medium text-text-secondary">Add Remote</div>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Name"
                                    value={newRemoteName}
                                    onChange={(e) => setNewRemoteName(e.target.value)}
                                    className="h-7 text-xs w-28 shrink-0"
                                />
                                <Input
                                    placeholder="https://github.com/user/repo.git"
                                    value={newRemoteUrl}
                                    onChange={(e) => setNewRemoteUrl(e.target.value)}
                                    className="h-7 text-xs flex-1"
                                />
                                <Button size="sm" className="h-7 text-xs shrink-0" onClick={() => void handleAddRemote()}>
                                    Add
                                </Button>
                            </div>
                        </div>
                    </AlertDialogBody>
                    <AlertDialogFooter>
                        <Button variant="default" size="sm" onClick={() => setRemoteDialogOpen(false)}>
                            Done
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div >
    );
}
