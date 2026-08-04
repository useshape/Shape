"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { FileIcon } from "@/components/ui/file-icon";
import { cn } from "@/lib/utils";
import { commands, type GitFileParams, type GitLogEntry } from "@/lib/backend";
import { resolveGithubAvatarUrl } from "@/lib/git/github-avatar";
import { renderCommitMessage, getRelativeTime } from "./utils";
import { ManagerDiffEditor } from "@/features/git/ui/manager/monaco-diff";
import { notify } from "@/features/notifications";
import { Tooltip } from "@/components/ui/tooltip";

export type GraphDetailSelection =
    | { kind: "commit"; log: GitLogEntry }
    | { kind: "file"; log: GitLogEntry; file: GitFileParams };

function countDiffLines(original: string, modified: string): { added: number; removed: number } {
    const a = original.split("\n");
    const b = modified.split("\n");
    const aCounts = new Map<string, number>();
    for (const line of a) aCounts.set(line, (aCounts.get(line) ?? 0) + 1);
    let shared = 0;
    for (const line of b) {
        const n = aCounts.get(line) ?? 0;
        if (n > 0) {
            aCounts.set(line, n - 1);
            shared += 1;
        }
    }
    return {
        added: Math.max(0, b.length - shared),
        removed: Math.max(0, a.length - shared),
    };
}

function AuthorAvatar({ log, size = 20 }: { log: GitLogEntry; size?: number }) {
    const url = resolveGithubAvatarUrl(log.author_email, log.author, size * 2);
    if (!url) {
        return (
            <span
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-panel-hover text-[10px] font-medium text-text-muted"
                style={{ width: size, height: size }}
            >
                {(log.author || "?").slice(0, 1).toUpperCase()}
            </span>
        );
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={url}
            alt=""
            width={size}
            height={size}
            className="shrink-0 rounded-full"
            draggable={false}
        />
    );
}

export function GraphDetailPanel({
    selection,
    repoPath,
    onClose,
    onClearFile,
    onOpenFile,
}: {
    selection: GraphDetailSelection | null;
    repoPath: string | null;
    onClose: () => void;
    onClearFile?: () => void;
    onOpenFile?: (file: GitFileParams) => void;
}) {
    const log = selection?.log ?? null;
    const file = selection?.kind === "file" ? selection.file : null;

    const [original, setOriginal] = useState("");
    const [modified, setModified] = useState("");
    const [loadingDiff, setLoadingDiff] = useState(false);
    const [sideBySide, setSideBySide] = useState(false);
    const [commitFiles, setCommitFiles] = useState<GitFileParams[]>([]);
    const [filesLoading, setFilesLoading] = useState(false);

    useEffect(() => {
        if (!log || !repoPath || file) {
            if (!log) setCommitFiles([]);
            return;
        }
        let cancelled = false;
        setFilesLoading(true);
        void commands
            .gitCommitFiles(repoPath, log.hash)
            .then((files) => {
                if (!cancelled) setCommitFiles(files);
            })
            .catch(() => {
                if (!cancelled) setCommitFiles([]);
            })
            .finally(() => {
                if (!cancelled) setFilesLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [log, repoPath, file]);

    useEffect(() => {
        if (!file || !log || !repoPath) {
            setOriginal("");
            setModified("");
            return;
        }
        let cancelled = false;
        setLoadingDiff(true);
        void commands
            .gitGetCommitFileContent(repoPath, file.path, log.hash)
            .then(([orig, mod]) => {
                if (cancelled) return;
                setOriginal(orig);
                setModified(mod);
            })
            .catch((e) => {
                if (cancelled) return;
                notify.error("Git", e instanceof Error ? e.message : String(e));
                setOriginal("");
                setModified("");
            })
            .finally(() => {
                if (!cancelled) setLoadingDiff(false);
            });
        return () => {
            cancelled = true;
        };
    }, [file, log, repoPath]);

    const diffStats = useMemo(
        () => (file ? countDiffLines(original, modified) : null),
        [file, original, modified],
    );

    const fileName = file?.path.split(/[\\/]/).pop() || file?.path || "";
    const parents = log?.parents?.length ? log.parents : [];

    if (!selection || !log) {
        return (
            <div className="workbench-panel flex h-full flex-col items-center justify-center gap-2 border border-border-subtle bg-editor px-6 text-center text-sm text-text-muted">
                <Icon name="commit" size={18} className="opacity-40" />
                <p>Select a commit</p>
            </div>
        );
    }

    return (
        <div className="workbench-panel flex h-full min-w-0 flex-col overflow-hidden border border-border-subtle bg-editor">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle/60 px-3">
                {file ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 p-0"
                        onClick={onClearFile}
                        title="Back to commit"
                    >
                        <Icon name="arrow_back" size={15} />
                    </Button>
                ) : null}
                <AuthorAvatar log={log} size={18} />
                <span className="shrink-0 text-sm text-text-primary">{log.author}</span>
                {file ? (
                    <>
                        <span className="text-text-disabled">·</span>
                        <FileIcon name={fileName} className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{fileName}</span>
                        {diffStats ? (
                            <span className="shrink-0 tabular-nums text-xs">
                                <span className="text-[var(--git-added)]">+{diffStats.added}</span>
                                {" "}
                                <span className="text-[var(--git-deleted)]">−{diffStats.removed}</span>
                            </span>
                        ) : null}
                        <Tooltip content={sideBySide ? "Inline diff" : "Side by side"}>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0 p-0"
                                onClick={() => setSideBySide((v) => !v)}
                            >
                                <Icon name={sideBySide ? "split_horizontal" : "vertical_split"} size={15} />
                            </Button>
                        </Tooltip>
                    </>
                ) : (
                    <>
                        <span className="text-text-disabled">·</span>
                        <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-muted">
                            {log.hash.slice(0, 7)}
                        </span>
                        <span className="shrink-0 text-xs text-text-muted">{getRelativeTime(log.date)}</span>
                    </>
                )}
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 p-0"
                    onClick={onClose}
                >
                    <Icon name="close" size={15} />
                </Button>
            </div>

            <div className="relative shrink-0 border-b border-border-subtle/60">
                <div
                    className={cn(
                        "no-scrollbar max-h-[7.5rem] overflow-y-auto px-3 py-2.5",
                        "text-sm leading-relaxed whitespace-pre-wrap wrap-break-word text-text-primary",
                    )}
                >
                    {renderCommitMessage(log.message)}
                </div>
                <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-7"
                    style={{
                        background: "linear-gradient(to bottom, transparent, var(--color-editor))",
                    }}
                />
            </div>

            {!file && parents.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 border-b border-border-subtle/60 px-3 py-2 text-xs text-text-muted">
                    <span className="shrink-0">Parents</span>
                    {parents.map((p) => (
                        <button
                            key={p}
                            type="button"
                            className="font-mono text-text-secondary hover:text-accent"
                            onClick={() => {
                                void navigator.clipboard.writeText(p);
                                notify.success("Copied", "Parent hash copied");
                            }}
                            title="Copy parent hash"
                        >
                            {p.slice(0, 7)}
                        </button>
                    ))}
                </div>
            ) : null}

            {file ? (
                <div className="relative min-h-0 flex-1 overflow-hidden">
                    {loadingDiff ? (
                        <div className="flex h-full items-center justify-center text-sm text-text-muted">
                            Loading diff…
                        </div>
                    ) : (
                        <ManagerDiffEditor
                            original={original}
                            modified={modified}
                            path={file.path}
                            sideBySide={sideBySide}
                        />
                    )}
                </div>
            ) : (
                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                    {filesLoading ? (
                        <div className="px-2 py-6 text-center text-sm text-text-muted">Loading files…</div>
                    ) : commitFiles.length === 0 ? (
                        <div className="px-2 py-6 text-center text-sm text-text-muted">No file changes</div>
                    ) : (
                        <div className="space-y-0.5">
                            {commitFiles.map((f) => {
                                const name = f.path.split(/[\\/]/).pop() || f.path;
                                const folder = f.path.slice(0, Math.max(0, f.path.length - name.length - 1));
                                return (
                                    <button
                                        key={f.path}
                                        type="button"
                                        onClick={() => onOpenFile?.(f)}
                                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-panel-hover"
                                    >
                                        <FileIcon name={name} className="h-3.5 w-3.5 shrink-0" />
                                        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                                            {name}
                                            {folder ? (
                                                <span className="text-text-muted"> · {folder}</span>
                                            ) : null}
                                        </span>
                                        <span
                                            className="w-4 shrink-0 text-center text-xs font-medium"
                                            style={{
                                                color:
                                                    f.status === "C"
                                                        ? "var(--git-conflict)"
                                                        : f.status === "M"
                                                          ? "var(--git-modified)"
                                                          : f.status === "A" || f.status === "U"
                                                            ? "var(--git-added)"
                                                            : f.status === "D"
                                                              ? "var(--git-deleted)"
                                                              : "var(--git-added)",
                                            }}
                                        >
                                            {f.status}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
