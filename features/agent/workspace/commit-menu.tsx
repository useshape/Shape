"use client";

import { GithubMark } from "@/components/ui/github-mark";
import { Checkmark20Regular } from "@fluentui/react-icons/headless/svg/checkmark";
import { Branch20Regular } from "@fluentui/react-icons/headless/svg/branch";
import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";


import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { commands, type GitFileParams } from "@/lib/backend";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Icon } from "@/components/ui/icon";

import { FileIcon } from "@/components/ui/file-icon";
import { Input } from "@/components/ui/input";
import { notify } from "@/features/notifications";
import { GenerateStarButton } from "@/features/git/ui/shared/generate-star";
import { QuickPick, type QuickPickItem } from "@/components/ui/quick-pick";
import {
    AzureDevOpsMark,
    BitbucketMark,
    GitHubMark,
    GitLabMark,
    GitUrlMark,
} from "@/features/chat/ui/shell/brand-marks";
import {
    CLONE_PLACEHOLDER,
    toCloneUrl,
    type CloneKind,
} from "@/features/chat/ui/shell/project-pick";
import { discoverGitRepos, invalidateGitRepoCache, pickDefaultRepo } from "@/lib/git/repos";
import { loginGitHub, useGitHubAuth } from "@/lib/github/store";
import { getShapeAccessToken } from "@/lib/cloud/store";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import {
    AlertDialog,
    AlertDialogBody,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function fileName(path: string) {
    return path.split(/[\\/]/).pop() || path;
}

function parentFolder(path: string) {
    const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 2]! : "";
}

async function pickDirectory(title: string): Promise<string | null> {
    const { open: pick } = await import("@tauri-apps/plugin-dialog");
    const selected = await pick({ directory: true, multiple: false, title });
    return typeof selected === "string" ? selected : null;
}

function hostMark(node: ReactNode) {
    return <span className="flex size-4 items-center justify-center">{node}</span>;
}

function GitSetupPick({
    open,
    onOpenChange,
    projectPath,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectPath: string;
}) {
    const [step, setStep] = useState<"setup" | "clone">("setup");
    const [cloneKind, setCloneKind] = useState<CloneKind>("git");
    const [query, setQuery] = useState("");

    useEffect(() => {
        if (!open) {
            setStep("setup");
            setQuery("");
        }
    }, [open]);

    const close = () => onOpenChange(false);

    const initialize = async () => {
        if (!projectPath) {
            notify.error("Git", "Open a folder first.");
            return;
        }
        try {
            await commands.gitInit(projectPath);
            invalidateGitRepoCache();
            window.dispatchEvent(new Event("shape-git-refresh"));
            notify.success("Git", "Repository initialized.");
            close();
        } catch (err) {
            notify.gitError(err, "Failed to initialize repository");
        }
    };

    const cloneFromUrl = async (repoUrl: string) => {
        const parent = await pickDirectory("Select folder to clone into");
        if (!parent) return;
        notify.info("Git", "Cloning repository…");
        try {
            const clonedPath = await commands.gitClone(repoUrl, parent);
            invalidateGitRepoCache();
            window.dispatchEvent(new Event("shape-git-refresh"));
            notify.success("Git", "Repository cloned.");
            close();
            window.dispatchEvent(new CustomEvent("shape-open-project", { detail: { path: clonedPath } }));
        } catch (err) {
            notify.error("Git", err instanceof Error ? err.message : String(err));
        }
    };

    const setupItems: QuickPickItem[] = [
        {
            id: "init",
            label: "Initialize repository",
            description: projectPath || "Open a folder first",
            icon: Branch20Regular,
        },
        {
            id: "git",
            label: "Git URL",
            description: "Clone from any git remote",
            iconNode: hostMark(<GitUrlMark />),
        },
        {
            id: "github",
            label: "GitHub repository",
            description: "Clone GitHub owner/repo",
            iconNode: hostMark(<GitHubMark />),
        },
        {
            id: "gitlab",
            label: "GitLab repository",
            description: "Clone group/project",
            iconNode: hostMark(<GitLabMark />),
        },
        {
            id: "bitbucket",
            label: "Bitbucket repository",
            description: "Clone workspace/repo",
            iconNode: hostMark(<BitbucketMark />),
        },
        {
            id: "azure",
            label: "Azure DevOps repository",
            description: "Clone org/project/repo",
            iconNode: hostMark(<AzureDevOpsMark />),
        },
    ];

    if (!open) return null;

    if (step === "clone") {
        return (
            <QuickPick
                open={open}
                onOpenChange={(next) => {
                    if (next) return;
                    setStep("setup");
                    setQuery("");
                }}
                title="Clone repository"
                placeholder={CLONE_PLACEHOLDER[cloneKind]}
                query={query}
                onQueryChange={setQuery}
                items={[]}
                emptyText="Press Enter to clone."
                onSelect={() => undefined}
                onSubmitQuery={(value) => {
                    const url = toCloneUrl(cloneKind, value);
                    if (!url) {
                        notify.error("Git", `Use ${CLONE_PLACEHOLDER[cloneKind]}`);
                        return;
                    }
                    void cloneFromUrl(url);
                }}
            />
        );
    }

    const q = query.trim().toLowerCase();
    return (
        <QuickPick
            open={open}
            onOpenChange={onOpenChange}
            title="Set up Git"
            placeholder="Initialize this folder or clone a repository…"
            query={query}
            onQueryChange={setQuery}
            items={setupItems.filter((item) => {
                if (!q) return true;
                return (
                    item.label.toLowerCase().includes(q) ||
                    (item.description ?? "").toLowerCase().includes(q)
                );
            })}
            onSelect={(item) => {
                if (item.id === "init") {
                    void initialize();
                    return;
                }
                setQuery("");
                setCloneKind(item.id as CloneKind);
                setStep("clone");
            }}
        />
    );
}

function statusLetter(status: string) {
    const code = status.trim().replace("?", "U").charAt(0).toUpperCase();
    return code || "M";
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
        if (!current) continue;
        if (line.startsWith("+") && !line.startsWith("+++")) stats[current].plus += 1;
        if (line.startsWith("-") && !line.startsWith("---")) stats[current].minus += 1;
    }
    return stats;
}

export function CommitMenu({ projectPath }: { projectPath: string }) {
    const [repo, setRepo] = useState<string | null>(null);
    const [files, setFiles] = useState<GitFileParams[]>([]);
    const [stats, setStats] = useState<Record<string, { plus: number; minus: number }>>({});
    const [busy, setBusy] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [lastMessage, setLastMessage] = useState("");
    const [hasRemote, setHasRemote] = useState(false);
    const [ahead, setAhead] = useState(0);
    const [behind, setBehind] = useState(0);
    const [branch, setBranch] = useState("");
    const [publishOpen, setPublishOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [setupOpen, setSetupOpen] = useState(false);
    const github = useGitHubAuth();

    const refresh = useCallback(async () => {
        try {
            const repos = await discoverGitRepos(projectPath);
            const path = pickDefaultRepo(projectPath, repos);
            setRepo(path);
            if (!path) {
                setFiles([]);
                setStats({});
                setLastMessage("");
                setHasRemote(false);
                setAhead(0);
                setBehind(0);
                setBranch("");
                return;
            }
            const list = await commands.gitStatus(path);
            setFiles(list);
            try {
                const raw = await commands.gitDiff(path);
                setStats(parseDiffFileStats(raw || ""));
            } catch {
                setStats({});
            }
            const [log, sync, remote, current] = await Promise.all([
                commands.gitLog(path, 1).catch(() => []),
                commands.gitSyncStatus(path).catch(() => null),
                commands.gitHasRemote(path).catch(() => false),
                commands.gitCurrentBranch(path).catch(() => ""),
            ]);
            setLastMessage(log[0]?.message?.split("\n")[0] ?? "");
            setHasRemote(remote);
            setAhead(sync?.ahead ?? 0);
            setBehind(sync?.behind ?? 0);
            setBranch(current || "");
        } catch {
            setRepo(null);
            setFiles([]);
            setStats({});
            setLastMessage("");
            setHasRemote(false);
            setAhead(0);
            setBehind(0);
            setBranch("");
        }
    }, [projectPath]);

    useEffect(() => {
        void refresh();
        const on = () => void refresh();
        window.addEventListener("shape-git-refresh", on);
        return () => window.removeEventListener("shape-git-refresh", on);
    }, [refresh]);

    const totals = useMemo(() => {
        let plus = 0;
        let minus = 0;
        for (const file of files) {
            const key = file.path.replace(/\\/g, "/");
            const row = stats[key];
            if (!row) continue;
            plus += row.plus;
            minus += row.minus;
        }
        return { plus, minus };
    }, [files, stats]);

    const messageBody = () => {
        const head = title.trim();
        const body = description.trim();
        return body ? `${head}\n\n${body}` : head;
    };

    const commitPaths = async (paths: string[], message: string, amend = false) => {
        if (!repo || !message.trim()) {
            notify.error("Git", "Enter a commit title");
            return;
        }
        let toStage = paths;
        if (toStage.length === 0 && !amend) return;
        const staged = files.filter((file) => file.staged);
        if (!amend && staged.length === 0) {
            const stageAll = await confirm(
                "Nothing is staged. Stage these changes and commit?",
                {
                    title: "Stage and commit",
                    kind: "warning",
                    okLabel: "Stage and commit",
                    cancelLabel: "Cancel",
                },
            );
            if (!stageAll) return;
        }
        if (amend && staged.length === 0 && paths.length > 0) {
            const stageAll = await confirm(
                "Stage these changes into the amended commit?",
                {
                    title: "Amend commit",
                    kind: "info",
                    okLabel: "Stage and amend",
                    cancelLabel: "Message only",
                },
            );
            if (!stageAll) toStage = [];
        }
        if (amend && hasRemote && ahead === 0) {
            const rewrite = await confirm(
                "The latest commit is already on the remote. Amending rewrites that history.",
                {
                    title: "Amend published commit",
                    kind: "warning",
                    okLabel: "Amend",
                    cancelLabel: "Cancel",
                },
            );
            if (!rewrite) return;
        }
        if (getSettings().git.confirmBeforeCommit) {
            const ok = await confirm(
                amend ? `Amend the last commit?\n\n${message}` : `Create this commit?\n\n${message}`,
                {
                    title: amend ? "Amend commit" : "Create commit",
                    kind: "info",
                    okLabel: amend ? "Amend" : "Commit",
                    cancelLabel: "Cancel",
                },
            );
            if (!ok) return;
        }
        setBusy(true);
        try {
            for (const path of toStage) {
                await commands.gitStage(repo, path);
            }
            if (amend) await commands.gitCommitAmend(repo, message);
            else await commands.gitCommit(repo, message);
            window.dispatchEvent(new Event("shape-git-refresh"));
            notify.success("Git", amend ? "Commit amended" : "Committed");
            setTitle("");
            setDescription("");
            await refresh();
        } catch (err) {
            notify.gitError(err);
        } finally {
            setBusy(false);
        }
    };

    const commitAll = () => {
        void commitPaths(files.map((file) => file.path), messageBody());
    };

    const amend = () => {
        if (!lastMessage && !title.trim()) {
            notify.error("Git", "Nothing to amend");
            return;
        }
        const message = title.trim() ? messageBody() : lastMessage;
        void commitPaths(files.map((file) => file.path), message, true);
    };

    const push = async () => {
        if (!repo) return;
        const ok = await confirm(
            ahead > 0 ? `Push ${ahead} commit${ahead === 1 ? "" : "s"} to the remote?` : "Push to the remote?",
            {
                title: "Push",
                kind: "info",
                okLabel: "Push",
                cancelLabel: "Cancel",
            },
        );
        if (!ok) return;
        setBusy(true);
        try {
            await commands.gitPush(repo);
            window.dispatchEvent(new Event("shape-git-refresh"));
            notify.success("Git", "Pushed");
            await refresh();
        } catch (err) {
            notify.gitError(err);
        } finally {
            setBusy(false);
        }
    };

    const stageAll = async () => {
        if (!repo) return;
        setBusy(true);
        try {
            await commands.gitStageAll(repo);
            window.dispatchEvent(new Event("shape-git-refresh"));
            await refresh();
        } catch (err) {
            notify.gitError(err);
        } finally {
            setBusy(false);
        }
    };

    const runGit = async (label: string, task: () => Promise<unknown>) => {
        if (!repo) return;
        setBusy(true);
        try {
            await task();
            window.dispatchEvent(new Event("shape-git-refresh"));
            notify.success("Git", label);
            await refresh();
        } catch (err) {
            notify.gitError(err);
        } finally {
            setBusy(false);
        }
    };

    const discardAll = async () => {
        if (!repo || files.length === 0) return;
        const ok = await confirm("Discard every uncommitted change in this repo?", {
            title: "Discard changes",
            kind: "warning",
            okLabel: "Discard",
            cancelLabel: "Cancel",
        });
        if (!ok) return;
        await runGit("Changes discarded", async () => {
            for (const file of files) await commands.gitDiscardChanges(repo, file.path);
        });
    };

    const createBranch = async () => {
        if (!repo) return;
        const name = window.prompt("New branch name");
        if (!name?.trim()) return;
        await runGit(`Switched to ${name.trim()}`, async () => {
            await commands.gitCreateBranch(repo, name.trim());
            await commands.gitSwitchBranch(repo, name.trim());
        });
    };

    const suggest = async () => {
        if (!repo) return;
        const token = getShapeAccessToken();
        if (!token) {
            notify.error("Git", "Sign in to Shape to write a commit message.");
            return;
        }
        setBusy(true);
        try {
            await commands.gitStageAll(repo);
            const message = await commands.generateCommitMessage(token, repo);
            const lines = message.trim().split("\n");
            setTitle(lines[0] ?? "");
            setDescription(lines.slice(1).join("\n").trim());
        } catch (err) {
            notify.gitError(err);
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
        <DropdownMenu
            open={menuOpen}
            onOpenChange={(next) => {
                if (!next) {
                    setMenuOpen(false);
                    return;
                }
                void (async () => {
                    const repos = await discoverGitRepos(projectPath).catch(() => []);
                    const found = pickDefaultRepo(projectPath, repos);
                    if (!found) {
                        setRepo(null);
                        setMenuOpen(false);
                        setSetupOpen(true);
                        return;
                    }
                    setRepo(found);
                    setMenuOpen(true);
                })();
            }}
        >
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    className="px-1.5 text-sm font-normal text-text-muted hover:bg-panel-hover hover:text-text-primary"
                >
                    <span>Commit</span>
                    {totals.plus > 0 ? <span className="tabular-nums text-success">+{totals.plus}</span> : null}
                    {totals.minus > 0 ? <span className="tabular-nums text-error">−{totals.minus}</span> : null}
                    <Icon icon={ChevronDown20Regular} className="opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[320px]">
                <div
                    className="flex flex-col gap-1.5"
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <div className="relative">
                        <Input
                            value={title}
                            placeholder="Message"
                            className="bg-transparent border-none focus-visible:ring-0 h-11 pr-9"
                            disabled={busy}
                            onChange={(event) => setTitle(event.target.value)}
                            onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                                    event.preventDefault();
                                    commitAll();
                                }
                            }}
                        />
                        <GenerateStarButton
                            placement="inline"
                            loading={busy}
                            disabled={files.length === 0}
                            onClick={() => void suggest()}
                        />
                    </div>
                    {description ? (
                        <textarea
                            value={description}
                            disabled={busy}
                            rows={2}
                            onChange={(event) => setDescription(event.target.value)}
                            onKeyDown={(event) => event.stopPropagation()}
                            className="w-full resize-none rounded-lg border border-border-subtle px-2 py-1.5 text-sm text-text-primary outline-none"
                        />
                    ) : null}
                    <div className="flex overflow-hidden px-1.5 pb-1.5">
                        <Button
                            variant="default"
                            size="md"
                            className="flex-1"
                            disabled={files.length === 0 || busy || !title.trim()}
                            onClick={commitAll}
                        >
                            Commit
                        </Button>
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger
                                aria-label="Commit options"
                                disabled={busy}
                                className="bg-panel-hover ml-2"
                            >
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="min-w-52">
                                <DropdownMenuItem disabled={busy || !lastMessage} onSelect={amend}>
                                    Amend last commit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={busy || files.every((file) => !file.staged)}
                                    onSelect={() => {
                                        const staged = files.filter((file) => file.staged).map((file) => file.path);
                                        void commitPaths(staged, messageBody());
                                    }}
                                >
                                    Commit staged
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem disabled={files.length === 0 || busy} onSelect={() => void stageAll()}>
                                    Stage all
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={!repo || busy} onSelect={() => void runGit("Unstaged", () => commands.gitUnstageAll(repo!))}>
                                    Unstage all
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={files.length === 0 || busy} onSelect={() => void discardAll()}>
                                    Discard all changes
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem disabled={!hasRemote || busy} onSelect={() => void runGit("Fetched", () => commands.gitFetch(repo!))}>
                                    Fetch
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={!hasRemote || busy} onSelect={() => void runGit("Pulled", () => commands.gitPull(repo!))}>
                                    Pull{behind > 0 ? ` (${behind})` : ""}
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={!hasRemote || busy} onSelect={() => void push()}>
                                    Push{ahead > 0 ? ` (${ahead})` : ""}
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={!hasRemote || busy} onSelect={() => void runGit("Synced", () => commands.gitSync(repo!))}>
                                    Sync
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem disabled={files.length === 0 || busy} onSelect={() => void runGit("Stashed", () => commands.gitStashSave(repo!, title.trim() || "WIP", true))}>
                                    Stash changes
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={!repo || busy} onSelect={() => void runGit("Stash applied", () => commands.gitStashPop(repo!, 0))}>
                                    Pop stash
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={!repo || busy} onSelect={() => void createBranch()}>
                                    New branch{branch ? ` from ${branch}` : ""}
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={!repo || busy || hasRemote} onSelect={() => setPublishOpen(true)}>
                                    Publish repository
                                </DropdownMenuItem>
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-2 py-1 text-sm text-text-secondary">
                    <span className="flex-1">Changes</span>
                    {files.length > 0 ? (
                        <span className="rounded-full bg-primary px-1.5 text-xs text-text-primary">{files.length}</span>
                    ) : null}
                </div>
                <div className="max-h-64 overflow-y-auto">
                    {files.length === 0 ? (
                        <div className="px-2 py-2 text-sm text-text-muted">No changes</div>
                    ) : (
                        files.map((file) => {
                            const letter = statusLetter(file.status);
                            const folder = parentFolder(file.path);
                            return (
                                <div
                                    key={`${file.path}-${file.staged}`}
                                    className="flex items-center gap-2 px-2 py-1 text-sm"
                                >
                                    <FileIcon name={fileName(file.path)} className="size-4 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate text-text-primary">{fileName(file.path)}</span>
                                    {folder ? <span className="shrink-0 text-sm text-text-muted">{folder}</span> : null}
                                    <span
                                        className={cn(
                                            "w-4 shrink-0 text-center text-sm",
                                            letter === "A" && "text-success",
                                            letter === "D" && "text-error",
                                            letter !== "A" && letter !== "D" && "text-warning",
                                        )}
                                    >
                                        {letter}
                                    </span>
                                </div>
                            );
                        })
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
        <PublishRepoDialog
            open={publishOpen}
            repo={repo}
            githubUser={github.loggedIn ? github.username : null}
            onClose={() => setPublishOpen(false)}
            onPublished={() => {
                setPublishOpen(false);
                void refresh();
            }}
        />
        <GitSetupPick open={setupOpen} onOpenChange={setSetupOpen} projectPath={projectPath} />
        </>
    );
}

function PublishRepoDialog({
    open,
    repo,
    githubUser,
    onClose,
    onPublished,
}: {
    open: boolean;
    repo: string | null;
    githubUser: string | null;
    onClose: () => void;
    onPublished: () => void;
}) {
    const [step, setStep] = useState<"provider" | "repository" | "summary">("provider");
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const remoteUrl = githubUser && name.trim()
        ? `https://github.com/${githubUser}/${name.trim()}.git`
        : name.trim();

    useEffect(() => {
        if (!open) {
            setStep("provider");
            setName("");
        }
    }, [open]);

    const publish = async () => {
        if (!repo || !remoteUrl.startsWith("http")) return;
        setBusy(true);
        try {
            await commands.gitAddRemote(repo, "origin", remoteUrl);
            await commands.gitPush(repo);
            window.dispatchEvent(new Event("shape-git-refresh"));
            notify.success("Git", "Repository published");
            onPublished();
        } catch (err) {
            notify.gitError(err);
        } finally {
            setBusy(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
            <AlertDialogContent sizeClassName="max-w-[520px]">
                <AlertDialogHeader>
                    <AlertDialogTitle>Publish repository</AlertDialogTitle>
                    <AlertDialogDescription>
                        Pick where to host it, then point at a repo to push to. Commits stay local until you publish.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogBody>
                    <div className="grid grid-cols-3 gap-2">
                        {(["provider", "repository", "summary"] as const).map((id, index) => (
                            <div
                                key={id}
                                className={cn(
                                    "rounded-lg border px-2 py-1.5 text-xs",
                                    step === id ? "border-accent bg-surface-2 text-text-primary" : "border-border-subtle text-text-muted",
                                )}
                            >
                                <div>Step {index + 1}</div>
                                <div className="capitalize">{id}</div>
                            </div>
                        ))}
                    </div>
                    {step === "provider" ? (
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                className="flex items-center gap-2 rounded-lg border border-accent px-3 py-2 text-left text-sm text-text-primary"
                                onClick={() => {
                                    if (!githubUser) {
                                        void loginGitHub();
                                        return;
                                    }
                                    setStep("repository");
                                }}
                            >
                                <Icon icon={GithubMark} />
                                <span className="flex-1">GitHub</span>
                                {githubUser ? null : <span className="text-xs text-warning">Setup required</span>}
                            </button>
                            {["Azure DevOps", "Bitbucket", "GitLab"].map((label) => (
                                <div key={label} className="flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-sm text-text-muted">
                                    <span className="flex-1">{label}</span>
                                    <span className="text-xs text-warning">Setup required</span>
                                </div>
                            ))}
                        </div>
                    ) : null}
                    {step === "repository" ? (
                        <Input
                            value={name}
                            placeholder={githubUser ? "Repository name" : "https://github.com/you/repo.git"}
                            onChange={(event) => setName(event.target.value)}
                        />
                    ) : null}
                    {step === "summary" ? (
                        <p className="text-sm text-text-secondary">
                            Push this folder to <span className="text-text-primary">{remoteUrl}</span>
                        </p>
                    ) : null}
                </AlertDialogBody>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
                    {step === "provider" ? null : (
                        <Button variant="secondary" size="sm" onClick={() => setStep(step === "summary" ? "repository" : "provider")}>
                            Back
                        </Button>
                    )}
                    {step === "repository" ? (
                        <Button variant="default" size="sm" disabled={!name.trim()} onClick={() => setStep("summary")}>
                            Next
                        </Button>
                    ) : null}
                    {step === "summary" ? (
                        <Button variant="default" size="sm" disabled={busy || !remoteUrl.startsWith("http")} onClick={() => void publish()}>
                            Publish
                        </Button>
                    ) : null}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
