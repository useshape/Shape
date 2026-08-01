"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { commands } from "@/lib/backend/commands";
import type { GitRepoInfo } from "@/lib/backend/types";

const ACTIVE_REPO_PREFIX = "shape-active-git-repo:";

let cachedRepos: GitRepoInfo[] = [];
let cachedWorkspace: string | null = null;
let discoverSeq = 0;
const repoForFileCache = new Map<string, string | null>();

function normalize(p: string): string {
    return p.replace(/\\/g, "/").replace(/\/$/, "");
}

function activeRepoKey(workspaceRoot: string): string {
    return `${ACTIVE_REPO_PREFIX}${normalize(workspaceRoot)}`;
}

export async function discoverGitRepos(workspaceRoot: string): Promise<GitRepoInfo[]> {
    const root = normalize(workspaceRoot);
    if (cachedWorkspace === root && cachedRepos.length > 0) {
        return cachedRepos;
    }
    const seq = ++discoverSeq;
    const repos = await commands.gitDiscoverRepos(workspaceRoot);
    // Last in-flight discover wins the shared cache; stale completions are ignored.
    if (seq === discoverSeq) {
        cachedWorkspace = root;
        cachedRepos = repos;
        repoForFileCache.clear();
    }
    return repos;
}

export function invalidateGitRepoCache(): void {
    cachedRepos = [];
    cachedWorkspace = null;
    repoForFileCache.clear();
}

export async function resolveRepoForFile(
    workspaceRoot: string,
    filePath: string,
): Promise<string | null> {
    const cacheKey = `${normalize(workspaceRoot)}::${normalize(filePath)}`;
    if (repoForFileCache.has(cacheKey)) {
        return repoForFileCache.get(cacheKey) ?? null;
    }
    const resolved = await commands.gitResolveRepoForFile(workspaceRoot, filePath);
    repoForFileCache.set(cacheKey, resolved);
    return resolved;
}

export function pickDefaultRepo(workspaceRoot: string, repos: GitRepoInfo[]): string | null {
    if (repos.length === 0) return null;
    if (repos.length === 1) return repos[0].path;

    const stored =
        typeof window !== "undefined"
            ? sessionStorage.getItem(activeRepoKey(workspaceRoot))
            : null;
    if (stored && repos.some((r) => normalize(r.path) === normalize(stored))) {
        return stored;
    }

    const rootNorm = normalize(workspaceRoot);
    const direct = repos.find((r) => normalize(r.path) === rootNorm);
    if (direct) return direct.path;

    return repos[0].path;
}

export function setActiveRepoPath(repoPath: string, workspaceRoot?: string | null): void {
    if (typeof window === "undefined") return;
    const normalized = normalize(repoPath);
    if (workspaceRoot) {
        sessionStorage.setItem(activeRepoKey(workspaceRoot), normalized);
        return;
    }
    // Legacy fallback — prefer workspace-scoped key via setActiveRepo below.
    sessionStorage.setItem("shape-active-git-repo", normalized);
}

export function useGitRepos(workspaceRoot: string | null) {
    const [repos, setRepos] = useState<GitRepoInfo[]>([]);
    const [activeRepoPath, setActiveRepoPathState] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const generationRef = useRef(0);

    const rescan = useCallback(async () => {
        const gen = ++generationRef.current;

        if (!workspaceRoot) {
            if (gen === generationRef.current) {
                setRepos([]);
                setActiveRepoPathState(null);
                setLoading(false);
            }
            return;
        }

        const rootAtStart = normalize(workspaceRoot);
        setLoading(true);
        try {
            invalidateGitRepoCache();
            const discovered = await discoverGitRepos(workspaceRoot);
            // Project closed or switched while discover was in flight.
            if (gen !== generationRef.current) return;
            if (normalize(workspaceRoot) !== rootAtStart) return;

            setRepos(discovered);
            const defaultRepo = pickDefaultRepo(workspaceRoot, discovered);
            setActiveRepoPathState(defaultRepo);
            if (defaultRepo) setActiveRepoPath(defaultRepo, workspaceRoot);
        } catch {
            if (gen !== generationRef.current) return;
            setRepos([]);
            setActiveRepoPathState(null);
        } finally {
            if (gen === generationRef.current) {
                setLoading(false);
            }
        }
    }, [workspaceRoot]);

    useEffect(() => {
        void rescan();
        return () => {
            // Invalidate in-flight work when workspace changes or unmounts.
            generationRef.current += 1;
        };
    }, [rescan]);

    useEffect(() => {
        const onRefresh = () => {
            void rescan();
        };
        window.addEventListener("shape-git-refresh", onRefresh);
        return () => window.removeEventListener("shape-git-refresh", onRefresh);
    }, [rescan]);

    const setActiveRepo = useCallback(
        (path: string) => {
            setActiveRepoPathState(path);
            setActiveRepoPath(path, workspaceRoot);
        },
        [workspaceRoot],
    );

    /** Repo path for SCM operations — only when a repo was discovered or selected. */
    const scmRepoPath = activeRepoPath ?? (repos.length === 1 ? repos[0].path : null);

    return {
        repos,
        activeRepoPath,
        scmRepoPath,
        loading,
        rescan,
        setActiveRepo,
        hasMultipleRepos: repos.length > 1,
    };
}

/** Merge git status from all repos into absolute-path maps for explorer decorations. */
export async function loadAllRepoGitStatuses(
    workspaceRoot: string,
    repos: GitRepoInfo[],
): Promise<Map<string, import("@/lib/backend/types").GitFileParams>> {
    const map = new Map<string, import("@/lib/backend/types").GitFileParams>();

    const ingest = (repoPath: string, status: import("@/lib/backend/types").GitFileParams[]) => {
        const prefix = normalize(repoPath) + "/";
        for (const s of status) {
            const rel = s.path.replace(/\\/g, "/");
            const abs = prefix + rel;
            map.set(abs, s);
        }
    };

    if (repos.length === 0) {
        return map;
    }

    await Promise.all(
        repos.map(async (repo) => {
            try {
                ingest(repo.path, await commands.gitStatus(repo.path));
            } catch {
                // skip failed repo
            }
        }),
    );

    return map;
}

export function buildGitDirMap(
    statusMap: Map<string, import("@/lib/backend/types").GitFileParams>,
): Map<string, string> {
    const dirMap = new Map<string, string>();
    const statusPriority: Record<string, number> = { D: 4, A: 3, M: 2, U: 1 };

    for (const [absPath, s] of statusMap.entries()) {
        let current = absPath;
        while (true) {
            const lastSlash = current.lastIndexOf("/");
            if (lastSlash <= 0) break;
            current = current.substring(0, lastSlash);
            const existing = dirMap.get(current);
            const newPrio = statusPriority[s.status] || 0;
            const existingPrio = existing ? statusPriority[existing] || 0 : -1;
            if (newPrio > existingPrio) {
                dirMap.set(current, s.status);
            }
        }
    }

    return dirMap;
}
