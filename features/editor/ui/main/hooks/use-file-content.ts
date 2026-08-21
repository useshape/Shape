import { useState, useEffect, useRef } from "react";
import { commands, useProjectState } from "@/lib/backend";
import { listen } from "@tauri-apps/api/event";
import { notify, notificationStore } from "@/features/notifications";

export function useFileContent(
    path: string,
    skipTextLoad: boolean,
    isDiff: boolean,
    savedContentRef: React.MutableRefObject<string>,
    bufferVersionRef: React.MutableRefObject<number>,
) {
    const { project_path } = useProjectState();
    const [content, setContent] = useState<string>("");
    const [originalContent, setOriginalContent] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const contentRef = useRef(content);
    contentRef.current = content;
    /** One sticky Yes/No prompt per path while waiting on the user. */
    const pendingOverwriteIdRef = useRef<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        if (skipTextLoad) {
            return;
        }

        const cached = !isDiff ? commands.getCachedFileContent(path) : undefined;
        if (cached !== undefined) {
            setContent(cached);
            savedContentRef.current = cached;
            setError(null);
            setLoading(false);
        } else {
            setContent("");
            setLoading(true);
        }

        const loadFile = async (showLoading = true) => {
            if (showLoading) setLoading(true);
            setError(null);
            try {
                let currentContent = "";
                if (isDiff) {
                    const isCommitDiff = path.startsWith("diff:commit:");
                    let realPath = path;
                    let staged = false;
                    let commitHash: string | undefined;

                    if (isCommitDiff) {
                        const match = path.match(/^diff:commit:([^:]+):(.+)$/);
                        if (match) {
                            commitHash = match[1];
                            realPath = match[2];
                        } else {
                            const parts = path.split(":");
                            commitHash = parts[2];
                            realPath = parts.slice(3).join(":");
                        }
                    } else {
                        realPath = path.replace(/^diff:(staged:|unstaged:)/, "");
                        staged = path.startsWith("diff:staged:");
                    }

                    // Stale commit/diff tabs from a previous project — don't look
                    // up their SHAs in the newly opened repo.
                    if (!project_path) {
                        if (cancelled) return;
                        setOriginalContent("");
                        setContent("");
                        setLoading(false);
                        return;
                    }

                    let gitRelativePath = realPath;
                    if (realPath.startsWith(project_path)) {
                        gitRelativePath = realPath.substring(project_path.length).replace(/^[\\/]+/, "");
                    }

                    const absPath =
                        !realPath.includes(":") && !realPath.startsWith("/") && !realPath.startsWith("\\")
                            ? project_path +
                              (project_path.endsWith("/") || project_path.endsWith("\\") ? "" : "/") +
                              realPath
                            : realPath;

                    // Absolute paths under another workspace after a project switch.
                    if (
                        (realPath.includes(":") || realPath.startsWith("/") || realPath.startsWith("\\")) &&
                        !realPath
                            .replace(/\\/g, "/")
                            .toLowerCase()
                            .startsWith(project_path.replace(/\\/g, "/").toLowerCase()) &&
                        !isCommitDiff
                    ) {
                        if (cancelled) return;
                        setOriginalContent("");
                        setContent("");
                        setLoading(false);
                        return;
                    }

                    const repoAtStart = project_path;
                    let orig: string;
                    let mod: string;

                    try {
                        if (isCommitDiff && commitHash) {
                            const res = await commands.gitGetCommitFileContent(
                                repoAtStart,
                                gitRelativePath,
                                commitHash,
                            );
                            if (cancelled) return;
                            orig = res[0];
                            mod = res[1];
                        } else if (staged) {
                            const [o, m] = await Promise.all([
                                commands.gitGetItemContent(repoAtStart, gitRelativePath, true),
                                commands.gitGetItemContent(repoAtStart, gitRelativePath, false),
                            ]);
                            if (cancelled) return;
                            orig = o;
                            mod = m;
                        } else {
                            const [o, m] = await Promise.all([
                                commands.gitGetItemContent(repoAtStart, gitRelativePath, false).catch(() => ""),
                                commands.readFile(absPath).catch(() => ""),
                            ]);
                            if (cancelled) return;
                            orig = o;
                            mod = m;
                        }
                    } catch (e) {
                        if (cancelled) return;
                        const msg = e instanceof Error ? e.message : String(e);
                        const isMissingRev =
                            msg.includes("revspec") || msg.includes("not found") || msg.includes("NotFound");
                        // Missing commit after project switch — stay quiet, don't
                        // fall back to reading a path that belongs to another repo.
                        if (isCommitDiff && isMissingRev) {
                            setOriginalContent("");
                            setContent("");
                            setLoading(false);
                            return;
                        }
                        console.warn("Git content load failed:", e);
                        const fallback = await commands.readFile(absPath).catch(() => "");
                        if (cancelled) return;
                        orig = fallback;
                        mod = fallback;
                    }

                    if (cancelled) return;
                    setOriginalContent(orig);
                    setContent(mod);
                    currentContent = mod;
                } else {
                    const data = await commands.readFile(path);
                    if (cancelled) return;
                    const { loadDirtyBuffer } = await import("@/lib/dirty-buffers");
                    const dirty = loadDirtyBuffer(path);
                    if (dirty && dirty.content !== data) {
                        setContent(dirty.content);
                        savedContentRef.current = data;
                        currentContent = dirty.content;
                        void commands.markFileDirty(path, true);
                    } else {
                        setContent(data);
                        savedContentRef.current = data;
                        currentContent = data;
                        if (dirty) {
                            const { clearDirtyBuffer } = await import("@/lib/dirty-buffers");
                            clearDirtyBuffer(path);
                        }
                    }
                }

                setLoading(false);

                if (!isDiff) {
                    bufferVersionRef.current += 1;
                    const ext = path.split(".").pop()?.toLowerCase() || "";
                    window.dispatchEvent(
                        new CustomEvent("shape-editor-buffer", {
                            detail: {
                                path,
                                content: currentContent,
                                extension: ext,
                                version: bufferVersionRef.current,
                            },
                        }),
                    );
                }
            } catch (err: unknown) {
                if (cancelled) return;
                const errorStr = (err as string | Error)?.toString() || String(err);
                const errorMsg = errorStr.startsWith("Message: ") ? errorStr.replace("Message: ", "") : errorStr;

                const isGitIndexError =
                    errorMsg.includes("File not in index") ||
                    errorMsg.includes("os error 2") ||
                    errorMsg.includes("os error 3") ||
                    errorMsg.includes("cannot find the file") ||
                    errorMsg.includes("cannot find the path");
                if (isDiff && isGitIndexError) {
                    setError(errorMsg);
                    setLoading(false);
                    return;
                }

                setError(errorMsg);
                setLoading(false);

                const isAccessDenied =
                    errorMsg.includes("Access is denied") || errorMsg.includes("os error 5");
                const isCommonError =
                    errorMsg.includes("binary") ||
                    errorMsg.includes("UTF-8") ||
                    isGitIndexError ||
                    isAccessDenied;
                if (!isCommonError) {
                    console.error("Failed to read file:", err);
                    notify.error("File Error", `Failed to read file: ${errorMsg}`, { code: 4000 });
                }
            }
        };

        loadFile(cached === undefined);

        const acceptAgentWrite = async () => {
            pendingOverwriteIdRef.current = null;
            const { clearDirtyBuffer } = await import("@/lib/dirty-buffers");
            clearDirtyBuffer(path);
            void commands.markFileDirty(path, false);
            if (!cancelled) await loadFile(false);
        };

        const keepLocalEdits = async (unsaved: string) => {
            pendingOverwriteIdRef.current = null;
            try {
                const disk = await commands.readFile(path);
                if (cancelled) return;
                savedContentRef.current = disk;
                setContent(unsaved);
                contentRef.current = unsaved;
                void commands.markFileDirty(path, true);
                const { saveDirtyBuffer } = await import("@/lib/dirty-buffers");
                saveDirtyBuffer(path, unsaved, disk);
                bufferVersionRef.current += 1;
                const ext = path.split(".").pop()?.toLowerCase() || "";
                window.dispatchEvent(
                    new CustomEvent("shape-editor-buffer", {
                        detail: {
                            path,
                            content: unsaved,
                            extension: ext,
                            version: bufferVersionRef.current,
                        },
                    }),
                );
            } catch (err) {
                console.error("Failed to keep local edits after agent write:", err);
                await acceptAgentWrite();
            }
        };

        const unlistenPromise = listen<string>("shape-file-edited", (event) => {
            const cleanPayload = event.payload.replace(/\\/g, "/").toLowerCase();
            const cleanPath = path.replace(/\\/g, "/").toLowerCase();
            if (cleanPayload !== cleanPath) return;

            commands.invalidateFileCache(path);
            void import("@/lib/dirty-buffers").then(async ({ loadDirtyBuffer }) => {
                if (cancelled) return;

                // Already waiting on Yes/No for this file — keep the prompt, don't reload.
                if (pendingOverwriteIdRef.current) return;

                const dirty = loadDirtyBuffer(path);
                const live = contentRef.current;
                const hasLocalEdits =
                    live !== savedContentRef.current ||
                    Boolean(dirty && dirty.content !== savedContentRef.current);
                const unsaved =
                    dirty?.content && dirty.content !== savedContentRef.current ? dirty.content : live;

                if (!hasLocalEdits) {
                    const { clearDirtyBuffer } = await import("@/lib/dirty-buffers");
                    clearDirtyBuffer(path);
                    void commands.markFileDirty(path, false);
                    await loadFile(false);
                    return;
                }

                const fileName = path.replace(/\\/g, "/").split("/").pop() || path;
                const id = notify.warning(
                    "Replace unsaved edits?",
                    `${fileName} was updated on disk. Your unsaved typing is still in the editor.`,
                    {
                        requireAction: true,
                        actions: [
                            {
                                id: "no",
                                label: "No",
                                variant: "secondary",
                                onClick: () => {
                                    void keepLocalEdits(unsaved);
                                },
                            },
                            {
                                id: "yes",
                                label: "Yes",
                                variant: "default",
                                onClick: () => {
                                    void acceptAgentWrite();
                                },
                            },
                        ],
                    },
                );
                pendingOverwriteIdRef.current = id;
            });
        });

        const onGitRefresh = () => {
            if (!isDiff) return;
            loadFile(false);
        };
        window.addEventListener("shape-git-refresh", onGitRefresh);

        return () => {
            cancelled = true;
            // Tab/path changed while a Yes/No was open — keep local edits on disk baseline
            // so the quiet discard path does not win by unmount.
            if (pendingOverwriteIdRef.current) {
                const id = pendingOverwriteIdRef.current;
                pendingOverwriteIdRef.current = null;
                notificationStore.remove(id);
                const unsaved = contentRef.current;
                void import("@/lib/dirty-buffers").then(async ({ saveDirtyBuffer }) => {
                    try {
                        const disk = await commands.readFile(path);
                        saveDirtyBuffer(path, unsaved, disk);
                        void commands.markFileDirty(path, true);
                    } catch {
                        /* ignore */
                    }
                });
            }
            unlistenPromise.then((u) => u()).catch(() => {});
            window.removeEventListener("shape-git-refresh", onGitRefresh);
        };
    }, [path, skipTextLoad, isDiff, project_path, savedContentRef, bufferVersionRef]);

    return { content, setContent, originalContent, error, loading };
}
