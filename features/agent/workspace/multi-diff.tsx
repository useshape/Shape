"use client";

import { RiArrowGoBackLine, RiLayoutColumnLine } from "@remixicon/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commands, type GitFileParams } from "@/lib/backend";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { notify } from "@/features/notifications";
import { discoverGitRepos, pickDefaultRepo } from "@/lib/git/repos";
import { openProjectFile } from "@/lib/window/open-project-file";
import { DiffView } from "@/features/editor/ui/diff/diff-view";
import { Button } from "@/components/ui/button";

export const ALL_CHANGES_TAB_PATH = "shape://all-changes";
export const ALL_CHANGES_TAB_ID = "__all_changes__";

function fileName(path: string) {
    return path.split(/[\\/]/).pop() || path;
}

function fileDir(path: string) {
    const parts = path.replace(/\\/g, "/").split("/");
    if (parts.length <= 1) return "";
    return parts.slice(0, -1).join("/");
}

async function loadSides(
    repo: string,
    file: GitFileParams,
): Promise<{ original: string; current: string }> {
    const abs = `${repo.replace(/[\\/]+$/, "")}/${file.path.replace(/\\/g, "/")}`;
    let current = "";
    try {
        current = await commands.readFile(abs);
    } catch {
        current = "";
    }
    let original = "";
    try {
        original = await commands.gitGetFileAtRef(repo, "HEAD", file.path);
    } catch {
        original = "";
    }
    return { original, current };
}

type FileDiff = {
    file: GitFileParams;
    original: string;
    current: string;
    loading: boolean;
};

/** Lazily load + mount a single file diff when scrolled into view. */
function LazyFileDiff({
    repo,
    file,
    split,
    focused,
}: {
    repo: string;
    file: GitFileParams;
    split: boolean;
    focused: boolean;
}) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(focused);
    const [diff, setDiff] = useState<FileDiff | null>(null);
    const [hover, setHover] = useState(false);
    const key = `${file.staged ? "s" : "u"}:${file.path}`;
    const dir = fileDir(file.path);
    const name = fileName(file.path);
    const domId = `md-file-${file.path.replace(/[\\/]/g, "-")}`;

    useEffect(() => {
        if (focused) setVisible(true);
    }, [focused]);

    useEffect(() => {
        const el = hostRef.current;
        if (!el || visible) return;
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setVisible(true);
                    io.disconnect();
                }
            },
            { rootMargin: "240px 0px" },
        );
        io.observe(el);
        return () => io.disconnect();
    }, [visible]);

    useEffect(() => {
        if (!visible || !repo) return;
        let cancelled = false;
        setDiff({ file, original: "", current: "", loading: true });
        void loadSides(repo, file).then((sides) => {
            if (cancelled) return;
            setDiff({ file, ...sides, loading: false });
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when path/stage flips
    }, [visible, repo, key]);

    const toggleStage = async () => {
        try {
            if (file.staged) await commands.gitUnstage(repo, file.path);
            else await commands.gitStage(repo, file.path);
            window.dispatchEvent(new Event("shape-git-refresh"));
        } catch (err) {
            notify.gitError(err);
        }
    };

    const discard = async () => {
        try {
            await commands.gitDiscardChanges(repo, file.path);
            window.dispatchEvent(new Event("shape-git-refresh"));
        } catch (err) {
            notify.error("Git", err instanceof Error ? err.message : String(err));
        }
    };

    const openFile = async () => {
        const abs = `${repo.replace(/[\\/]+$/, "")}/${file.path.replace(/\\/g, "/")}`;
        await openProjectFile(abs, name);
    };

    return (
        <section
            ref={hostRef}
            id={domId}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            <div className="sticky top-1 z-[1] flex h-9 items-center gap-2 bg-panel pl-3 border-b border-border">
                <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-border-subtle">
                    <span
                        className={cn(
                            "size-3 rounded-xs",
                            file.staged ? "bg-success" : "bg-[var(--git-modified)]",
                        )}
                    />
                </span>
                <span className="inline-flex min-w-0 max-w-[50%] items-center overflow-hidden font-sans text-sm">
                    <span className="shrink-0 text-text-primary">{name}</span>
                    {dir ? <span className="ml-1.5 truncate text-text-muted">{dir}</span> : null}
                </span>
                <span className="flex-1" />
                <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => void toggleStage()}
                >
                    {file.staged ? "Unstage" : "Stage"}
                </Button>
                <Button
                    type="button"
                    onClick={() => void openFile()}
                    variant="ghost"
                    size="xs"
                    title="Open File"
                >
                    Open File
                </Button>
                <Button
                    type="button"
                    onClick={() => void discard()}
                    variant="ghost"
                    size="icon"
                    aria-label="Restore"
                    title="Restore"
                >
                    <Icon icon={RiArrowGoBackLine} />
                </Button>
            </div>

            <div className="relative min-h-[120px] max-h-[420px]">
                {hover ? (
                    <div className="absolute right-3 top-2 z-[2] flex gap-1">
                        <Button
                            type="button"
                            onClick={() => void toggleStage()}
                            variant="ghost"
                            className="bg-surface-4"
                            size="xs"
                        >
                            {file.staged ? "Unstage" : "Stage"}
                        </Button>
                        <Button
                            type="button"
                            onClick={() => void discard()}
                            variant="ghost"
                            className="bg-surface-4"
                            size="xs"
                        >
                            Restore
                        </Button>
                    </div>
                ) : null}
                {!visible ? (
                    <div className="flex h-[120px] items-center px-4 text-sm text-text-muted">
                        Scroll to load diff
                    </div>
                ) : diff?.loading ? (
                    <div className="p-4 text-sm text-text-muted">Loading…</div>
                ) : (
                    <DiffView
                        path={file.path}
                        originalContent={diff?.original ?? ""}
                        content={diff?.current ?? ""}
                        mode={split ? "split" : "unified"}
                        className="max-h-[420px]"
                    />
                )}
            </div>
        </section>
    );
}

export function MultiDiffEditor({
    projectPath,
    focusPath,
}: {
    projectPath: string;
    focusPath?: string;
}) {
    const [repo, setRepo] = useState<string | null>(null);
    const [files, setFiles] = useState<GitFileParams[]>([]);
    const [busy, setBusy] = useState(false);
    const [split, setSplit] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const repos = await discoverGitRepos(projectPath);
            const path = pickDefaultRepo(projectPath, repos) ?? projectPath;
            setRepo(path);
            const list = await commands.gitStatus(path);
            setFiles(list);
        } catch {
            setFiles([]);
        }
    }, [projectPath]);

    useEffect(() => {
        void refresh();
        const on = () => void refresh();
        window.addEventListener("shape-git-refresh", on);
        return () => window.removeEventListener("shape-git-refresh", on);
    }, [refresh]);

    useEffect(() => {
        if (!focusPath) return;
        const id = `md-file-${focusPath.replace(/[\\/]/g, "-")}`;
        requestAnimationFrame(() => {
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }, [focusPath, files]);

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

    const unstageAll = async () => {
        if (!repo) return;
        setBusy(true);
        try {
            for (const f of files.filter((x) => x.staged)) {
                await commands.gitUnstage(repo, f.path);
            }
            window.dispatchEvent(new Event("shape-git-refresh"));
            await refresh();
        } catch (err) {
            notify.gitError(err);
        } finally {
            setBusy(false);
        }
    };

    const commit = async () => {
        if (!repo || files.length === 0) return;
        setBusy(true);
        try {
            await commands.gitStageAll(repo);
            const name = fileName(files[0]?.path ?? "files");
            const message =
                files.length === 1 ? `Update ${name}` : `Update ${files.length} files`;
            await commands.gitCommit(repo, message);
            window.dispatchEvent(new Event("shape-git-refresh"));
            await refresh();
        } catch (err) {
            notify.gitError(err);
        } finally {
            setBusy(false);
        }
    };

    const ordered = useMemo(() => {
        const staged = files.filter((f) => f.staged);
        const unstaged = files.filter((f) => !f.staged);
        return [...unstaged, ...staged];
    }, [files]);

    return (
        <div className="flex h-full min-h-0 flex-col bg-panel">
            <div className="flex h-9 shrink-0 items-center gap-1 px-3 text-sm bg-panel">
                <span className="mr-1 font-medium text-text-primary">All changes</span>
                <span className="text-text-muted">{files.length}</span>
                <span className="flex-1" />
                <Button
                    type="button"
                    onClick={() => setSplit((v) => !v)}
                    variant="ghost"
                    size="xs"
                    aria-label="Toggle split"
                    title={split ? "Unified" : "Side by side"}
                >
                    <Icon icon={RiLayoutColumnLine} />
                </Button>
                <Button
                    type="button"
                    disabled={busy || !files.some((f) => !f.staged)}
                    onClick={() => void stageAll()}
                    variant="ghost"
                    size="xs"
                >
                    Stage All
                </Button>
                <Button
                    type="button"
                    disabled={busy || !files.some((f) => f.staged)}
                    onClick={() => void unstageAll()}
                    variant="ghost"
                    size="xs"
                >
                    Unstage
                </Button>
                <Button
                    type="button"
                    disabled={busy || files.length === 0}
                    onClick={() => void commit()}
                    variant="default"
                    className="bg-success/20 text-success"
                    size="xs"
                >
                    Commit
                </Button>
            </div>

            {files.length === 0 || !repo ? (
                <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
                    {files.length === 0 ? "No local changes" : "Loading…"}
                </div>
            ) : (
                <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                    {ordered.map((file) => {
                        const key = `${file.staged ? "s" : "u"}:${file.path}`;
                        const focused =
                            Boolean(focusPath) &&
                            file.path.replace(/\\/g, "/") === focusPath!.replace(/\\/g, "/");
                        return (
                            <LazyFileDiff
                                key={key}
                                repo={repo}
                                file={file}
                                split={split}
                                focused={focused}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/** Open All changes as a main-area tab (same chrome as chat) — does not enter Files mode. */
export function openAllChangesTab(focusPath?: string) {
    if (focusPath) {
        try {
            sessionStorage.setItem("shape-all-changes-focus", focusPath);
        } catch {
            /* ignore */
        }
    }
    window.dispatchEvent(new CustomEvent("shape-center-view", { detail: "all-changes" }));
}
