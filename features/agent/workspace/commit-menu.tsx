"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { commands, type GitFileParams } from "@/lib/backend";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { FileIcon } from "@/components/ui/file-icon";
import { Input } from "@/components/ui/input";
import { notify } from "@/features/notifications";
import { GenerateStarButton } from "@/features/git/ui/shared/generate-star";
import { discoverGitRepos, pickDefaultRepo } from "@/lib/git/repos";
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
    const [extras, setExtras] = useState(false);
    const [publishOpen, setPublishOpen] = useState(false);
    const github = useGitHubAuth();

    const refresh = useCallback(async () => {
        try {
            const repos = await discoverGitRepos(projectPath);
            const path = pickDefaultRepo(projectPath, repos) ?? projectPath;
            setRepo(path);
            const list = await commands.gitStatus(path);
            setFiles(list);
            try {
                const raw = await commands.gitDiff(path);
                setStats(parseDiffFileStats(raw || ""));
            } catch {
                setStats({});
            }
            const [log, sync, remote] = await Promise.all([
                commands.gitLog(path, 1).catch(() => []),
                commands.gitSyncStatus(path).catch(() => null),
                commands.gitHasRemote(path).catch(() => false),
            ]);
            setLastMessage(log[0]?.message?.split("\n")[0] ?? "");
            setHasRemote(remote);
            setAhead(sync?.ahead ?? 0);
        } catch {
            setFiles([]);
            setStats({});
            setLastMessage("");
            setHasRemote(false);
            setAhead(0);
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

    const suggest = async () => {
        if (!repo) return;
        const token = getShapeAccessToken();
        if (!token) {
            notify.error("Git", "Sign in to Shape to write a commit message.");
            return;
        }
        setBusy(true);
        try {
            if (files.length > 0 && files.every((file) => !file.staged)) {
                await commands.gitStageAll(repo);
            }
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
        <DropdownMenu>
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
                    <Icon icon="alt-arrow-down" size={ICON_SIZE_SM} className="opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[320px]">
                <div
                    className="flex flex-col gap-1.5 px-1.5 py-1.5"
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <div className="relative">
                        <Input
                            value={title}
                            placeholder="Message"
                            disabled={busy}
                            onChange={(event) => setTitle(event.target.value)}
                            onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                                    event.preventDefault();
                                    commitAll();
                                }
                            }}
                            className="pr-8"
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
                            className="w-full resize-none rounded-lg border border-border-subtle bg-input-bg px-2 py-1.5 text-sm text-text-primary outline-none"
                        />
                    ) : null}
                    <div className="flex overflow-hidden rounded-lg">
                        <Button
                            variant="default"
                            size="sm"
                            className="h-7 flex-1 rounded-none"
                            disabled={files.length === 0 || busy || !title.trim()}
                            onClick={commitAll}
                        >
                            <Icon icon="check" size={ICON_SIZE_SM} />
                            Commit
                        </Button>
                        <Button
                            variant="default"
                            size="sm"
                            className="h-7 rounded-none border-l border-white/20 px-1.5"
                            aria-label="Commit options"
                            disabled={busy}
                            onClick={() => setExtras((open) => !open)}
                        >
                            <Icon icon="alt-arrow-down" size={ICON_SIZE_SM} />
                        </Button>
                    </div>
                    {extras ? (
                        <div className="flex flex-col">
                            <Button variant="ghost" size="sm" className="justify-start" disabled={busy || !lastMessage} onClick={amend}>
                                Amend last commit
                            </Button>
                            <Button variant="ghost" size="sm" className="justify-start" disabled={!hasRemote || busy} onClick={() => void push()}>
                                Push
                            </Button>
                            <Button variant="ghost" size="sm" className="justify-start" disabled={files.length === 0 || busy} onClick={() => void stageAll()}>
                                Stage all
                            </Button>
                            <Button variant="ghost" size="sm" className="justify-start" disabled={!repo || busy || hasRemote} onClick={() => setPublishOpen(true)}>
                                Publish repository
                            </Button>
                        </div>
                    ) : null}
                </div>
                <DropdownMenuSeparator />
                <div className="flex items-center gap-2 px-2 py-1 text-sm text-text-secondary">
                    <Icon icon="alt-arrow-down" size={ICON_SIZE_SM} className="opacity-60" />
                    <span className="flex-1">Changes</span>
                    {files.length > 0 ? (
                        <span className="rounded-full bg-accent px-1.5 text-xs text-white">{files.length}</span>
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
                                    className="flex items-center gap-2 px-2 py-0.5 text-sm"
                                >
                                    <FileIcon name={fileName(file.path)} className="size-4 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate text-text-primary">{fileName(file.path)}</span>
                                    {folder ? <span className="shrink-0 text-xs text-text-muted">{folder}</span> : null}
                                    <span
                                        className={cn(
                                            "w-4 shrink-0 text-center text-xs",
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
                                <Icon icon="code-square" size={16} />
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
