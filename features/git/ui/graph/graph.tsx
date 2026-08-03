"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    commands,
    useProjectState,
    GitActivityPoint,
    GitFileParams,
    GitLogEntry,
} from "@/lib/backend";
import { notify } from "@/features/notifications";
import { computeGraphRowMeta, computeVisibleRange, GRAPH_OVERSCAN_PX } from "@/lib/git/graph-virtual";
import { Tooltip } from "@/components/ui/tooltip";
import { FadeTruncate } from "@/components/ui/fade-truncate";
import { useLoading } from "@/features/loading/context";
import { LoadingBar } from "@/components/ui/loading";
import { useFilter } from "@/features/git/ui/manager/filter-context";
import { useGitRepos } from "@/lib/git/repos";
import { resolveGithubAvatarUrl } from "@/lib/git/github-avatar";
import { useSettings } from "@/lib/settings";
import { graphCache } from "./cache";
import { EMPTY_ARRAY, EMPTY_NODE, commitIsHead } from "./constants";
import { FilterMenu } from "./filter-menu";
import { CommitActivitySparkline } from "./activity-sparkline";
import { GraphCommitRow } from "./commit-row";
import { GitManagerTrigger } from "@/features/git/ui/manager/git-manager-trigger";

// ── VIRTUAL SCROLL CONSTANTS ──
const OVERSCAN_PX = GRAPH_OVERSCAN_PX;

export default function Graph({
    className,
    surface = "panel",
    rich = false,
}: {
    className?: string;
    surface?: "panel" | "editor";
    /** Manager-only chrome: activity sparkline + author/branch filters. */
    rich?: boolean;
}) {
    const { project_path } = useProjectState();
    const { scmRepoPath } = useGitRepos(project_path);
    const gitRepo = scmRepoPath;
    const { query: commitSearch } = useFilter();
    const settings = useSettings();
    const showAllBranches = settings.git.graphShowAllBranches;
    const showGraphAvatars = settings.git.graphAvatars;
    const [authorFilter, setAuthorFilter] = useState<string>("all");
    const [branchFilter, setBranchFilter] = useState<string>("all");
    const [localSearch, setLocalSearch] = useState("");
    const [activityPoints, setActivityPoints] = useState<GitActivityPoint[]>([]);
    const [selectedHash, setSelectedHash] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);

    const cacheKey = scmRepoPath
        ? `${scmRepoPath}::${showAllBranches ? "all" : "head"}`
        : project_path
          ? `${project_path}::${showAllBranches ? "all" : "head"}`
          : null;
    const cached = cacheKey ? graphCache[cacheKey] : null;

    const [gitLogs, setGitLogs] = useState<GitLogEntry[]>(cached?.logs || []);
    const [expandedCommits, setExpandedCommits] = useState<Set<string>>(cached?.expanded || new Set());
    const [commitFilesCache, setCommitFilesCache] = useState<Record<string, GitFileParams[]>>(cached?.filesCache || {});
    const [commitFilesLoaded, setCommitFilesLoaded] = useState<Record<string, boolean>>({});

    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const [isLoadingNext, setIsLoadingNext] = useState(false);
    const isInitialLoading = !cached;

    // Virtual scroll state
    const [scrollTop, setScrollTop] = useState(cached?.scrollTop || 0);
    const [containerHeight, setContainerHeight] = useState(600);
    const scrollRafRef = useRef<number | null>(null);
    const hasRestoredScroll = useRef(false);

    const { startLoading, stopLoading } = useLoading();

    useEffect(() => {
        if (!cacheKey) return;
        if (gitLogs.length > 0) {
            graphCache[cacheKey] = {
                logs: gitLogs,
                expanded: expandedCommits,
                filesCache: commitFilesCache,
                scrollTop: scrollTop
            };
        }
    }, [cacheKey, gitLogs, expandedCommits, commitFilesCache, scrollTop]);

    useEffect(() => {
        if (scrollContainerRef.current && cached?.scrollTop && gitLogs.length > 0 && !hasRestoredScroll.current) {
            scrollContainerRef.current.scrollTop = cached.scrollTop;
            hasRestoredScroll.current = true;
        }
    }, [cached, gitLogs.length]);

    const toggleCommitExpansion = useCallback((hash: string) => {
        setExpandedCommits(prev => {
            const next = new Set(prev);
            if (next.has(hash)) next.delete(hash);
            else next.add(hash);
            return next;
        });
    }, []);

    const handleFilesLoaded = useCallback((hash: string, files: GitFileParams[]) => {
        setCommitFilesCache(prev => ({ ...prev, [hash]: files }));
        setCommitFilesLoaded(prev => ({ ...prev, [hash]: true }));
    }, []);

    const streamGenRef = useRef(0);
    const streamActiveRef = useRef(false);

    const drainStream = useCallback(async (count: number, gen: number) => {
        let remaining = count;
        while (remaining > 0 && gen === streamGenRef.current) {
            const batch = await commands.gitLogStreamNext("graph", Math.min(remaining, 200));
            if (batch.length === 0) break;
            remaining -= batch.length;
        }
    }, []);

    const refresh = useCallback(async () => {
        if (!gitRepo) return;
        const gen = ++streamGenRef.current;
        streamActiveRef.current = false;
        startLoading();
        try {
            await commands.gitLogStreamStart(gitRepo, "graph", showAllBranches);
            if (gen !== streamGenRef.current) return;
            streamActiveRef.current = true;
            const initialLogs = await commands.gitLogStreamNext("graph", 100);
            if (gen !== streamGenRef.current) return;
            setGitLogs(initialLogs);

            void commands.gitLogStreamNext("graph", 200).then(more => {
                if (gen !== streamGenRef.current || !streamActiveRef.current) return;
                if (more.length > 0) setGitLogs(prev => [...prev, ...more]);
            });
        } catch {
            if (gen === streamGenRef.current) setGitLogs([]);
        } finally {
            if (gen === streamGenRef.current) stopLoading();
        }
    }, [gitRepo, showAllBranches, startLoading, stopLoading]);

    const hasInitialized = useRef(false);

    useEffect(() => {
        hasInitialized.current = false;
    }, [cacheKey]);

    useEffect(() => {
        if (cacheKey && !hasInitialized.current) {
            hasInitialized.current = true;

            const c = graphCache[cacheKey];
            if (c && c.logs.length > 0) {
                setGitLogs(c.logs);
                setExpandedCommits(c.expanded);
                setCommitFilesCache(c.filesCache);
                setScrollTop(c.scrollTop);
                if (gitRepo) {
                    const gen = ++streamGenRef.current;
                    streamActiveRef.current = false;
                    void (async () => {
                        try {
                            await commands.gitLogStreamStart(gitRepo, "graph", showAllBranches);
                            if (gen !== streamGenRef.current) return;
                            await drainStream(c.logs.length, gen);
                            if (gen !== streamGenRef.current) return;
                            streamActiveRef.current = true;
                        } catch {
                            /* ignore */
                        }
                    })();
                }
            } else {
                refresh();
            }
        }
        return () => {
            streamGenRef.current += 1;
            streamActiveRef.current = false;
            void commands.gitLogStreamStop("graph");
        };
    }, [cacheKey, refresh, gitRepo, drainStream, showAllBranches]);

    const handleShowCommitDiff = useCallback(async (hash: string, path: string) => {
        if (!gitRepo) return;
        const name = path.split(/[\\\/]/).pop() || path;
        try {
            await commands.gitOpenCommitDiff(path, name, hash);
        } catch (e) { notify.error("Git Error", `Failed to open diff: ${e}`); }
    }, [gitRepo]);

    const handleOpenFile = useCallback(async (path: string) => {
        if (!gitRepo) return;
        const name = path.split(/[\\\/]/).pop() || path;
        const sep = gitRepo.endsWith('/') || gitRepo.endsWith('\\') ? '' : '/';
        try {
            await commands.openFile(gitRepo + sep + path, name);
        } catch (e) { notify.error("Git Error", `Failed to open file: ${e}`); }
    }, [gitRepo]);

    // ── VIRTUAL SCROLLING ──
    // Pre-compute cumulative top offsets once. Only changes when expand state or file count changes.
    const authors = useMemo(() => {
        const set = new Set<string>();
        for (const log of gitLogs) {
            if (log.author?.trim()) set.add(log.author.trim());
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [gitLogs]);

    const branchHints = useMemo(() => {
        const set = new Set<string>();
        for (const log of gitLogs) {
            for (const ref of log.refs ?? []) {
                const cleaned = ref.replace(/HEAD -> /g, "").replace(/^tag: /, "").trim();
                if (!cleaned || cleaned.toLowerCase() === "head") continue;
                set.add(cleaned);
            }
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b)).slice(0, 80);
    }, [gitLogs]);

    // Full-history activity (timestamp+hash only) — independent of virtualized list.
    useEffect(() => {
        if (!rich || !gitRepo) {
            setActivityPoints([]);
            return;
        }
        let cancelled = false;
        const load = async () => {
            try {
                const points = await commands.gitActivityTimeline(gitRepo, {
                    allRefs: branchFilter === "all" ? showAllBranches : false,
                    rev: branchFilter === "all" ? null : branchFilter,
                    author: authorFilter === "all" ? null : authorFilter,
                });
                if (!cancelled) setActivityPoints(points);
            } catch {
                if (!cancelled) setActivityPoints([]);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [rich, gitRepo, showAllBranches, branchFilter, authorFilter]);

    const activityBuckets = useMemo(() => {
        const bucketCount = 80;
        if (activityPoints.length === 0) {
            return { buckets: Array.from({ length: bucketCount }, () => 0), firstTs: 0, lastTs: 0 };
        }
        let minTs = Infinity;
        let maxTs = -Infinity;
        for (const p of activityPoints) {
            if (p.timestamp < minTs) minTs = p.timestamp;
            if (p.timestamp > maxTs) maxTs = p.timestamp;
        }
        if (!Number.isFinite(minTs) || !Number.isFinite(maxTs) || maxTs < minTs) {
            return { buckets: Array.from({ length: bucketCount }, () => 0), firstTs: 0, lastTs: 0 };
        }
        const span = Math.max(1, maxTs - minTs);
        const buckets = Array.from({ length: bucketCount }, () => 0);
        for (const p of activityPoints) {
            const t = (p.timestamp - minTs) / span;
            const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor(t * bucketCount)));
            buckets[idx] += 1;
        }
        return { buckets, firstTs: minTs, lastTs: maxTs };
    }, [activityPoints]);

    /** Match predicate — used to mute rows, not drop them (preserves lane topology). */
    const commitMatchesFilter = useCallback((log: GitLogEntry) => {
        const q = (rich ? localSearch : commitSearch).trim().toLowerCase();
        if (authorFilter !== "all" && log.author.trim() !== authorFilter) return false;
        if (branchFilter !== "all") {
            const refs = (log.refs ?? []).map((r) =>
                r.replace(/HEAD -> /g, "").replace(/^tag: /, "").trim(),
            );
            if (!refs.some((r) => r === branchFilter || r.endsWith(`/${branchFilter}`))) {
                return false;
            }
        }
        if (!q) return true;
        return (
            log.message.toLowerCase().includes(q)
            || log.author.toLowerCase().includes(q)
            || log.hash.toLowerCase().includes(q)
            || (log.refs ?? []).some((r) => r.toLowerCase().includes(q))
        );
    }, [rich, localSearch, commitSearch, authorFilter, branchFilter]);

    const hasActiveFilter = useMemo(() => {
        const q = (rich ? localSearch : commitSearch).trim();
        return authorFilter !== "all" || branchFilter !== "all" || q.length > 0;
    }, [rich, localSearch, commitSearch, authorFilter, branchFilter]);

    const mutedHashes = useMemo(() => {
        if (!hasActiveFilter) return null as Set<string> | null;
        const muted = new Set<string>();
        for (const log of gitLogs) {
            if (!commitMatchesFilter(log)) muted.add(log.hash);
        }
        return muted;
    }, [gitLogs, hasActiveFilter, commitMatchesFilter]);

    const matchCount = useMemo(() => {
        if (!mutedHashes) return gitLogs.length;
        return gitLogs.length - mutedHashes.size;
    }, [gitLogs.length, mutedHashes]);

    const headIndex = useMemo(() => {
        const idx = gitLogs.findIndex((log) => commitIsHead(log.refs));
        return idx >= 0 ? idx : 0;
    }, [gitLogs]);

    const rowMeta = useMemo(() => {
        const fileCounts: Record<string, number> = {};
        for (const log of gitLogs) {
            if (expandedCommits.has(log.hash)) {
                fileCounts[log.hash] = commitFilesCache[log.hash]?.length ?? 1;
            }
        }
        return computeGraphRowMeta(
            gitLogs.length,
            expandedCommits,
            fileCounts,
            (index) => gitLogs[index]?.hash ?? "",
        );
    }, [gitLogs, expandedCommits, commitFilesCache]);

    const scrollToIndex = useCallback((idx: number, opts?: { select?: boolean; flash?: boolean }) => {
        const meta = rowMeta[idx];
        const log = gitLogs[idx];
        if (!meta || !scrollContainerRef.current || !log) return;
        scrollContainerRef.current.scrollTop = Math.max(0, meta.top - 40);
        if (opts?.select !== false) setSelectedHash(log.hash);
        if (opts?.flash) {
            requestAnimationFrame(() => {
                const el = scrollContainerRef.current?.querySelector(`[data-hash="${log.hash}"]`);
                el?.classList.add("graph-commit-flash");
                window.setTimeout(() => el?.classList.remove("graph-commit-flash"), 800);
            });
        }
    }, [rowMeta, gitLogs]);

    const jumpToHead = useCallback(() => {
        scrollToIndex(headIndex, { select: true, flash: true });
    }, [scrollToIndex, headIndex]);

    const jumpToActivityBucket = useCallback((bucketIndex: number) => {
        const { buckets, firstTs, lastTs } = activityBuckets;
        const span = Math.max(1, buckets.length - 1);
        const targetSec =
            firstTs && lastTs
                ? firstTs + ((lastTs - firstTs) * bucketIndex) / span
                : lastTs;
        const targetMs = targetSec * 1000;
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < gitLogs.length; i++) {
            if (mutedHashes?.has(gitLogs[i].hash)) continue;
            const ts = parseInt(gitLogs[i].date, 10) * 1000;
            if (!Number.isFinite(ts)) continue;
            const dist = Math.abs(ts - targetMs);
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
            }
        }
        scrollToIndex(bestIdx, { select: true });
    }, [activityBuckets, gitLogs, mutedHashes, scrollToIndex]);

    const jumpToNextMatch = useCallback((dir: 1 | -1) => {
        if (!gitLogs.length) return;
        const start = selectedHash
            ? gitLogs.findIndex((l) => l.hash === selectedHash)
            : headIndex;
        const from = start >= 0 ? start : 0;
        for (let step = 1; step <= gitLogs.length; step++) {
            const idx = (from + dir * step + gitLogs.length * 10) % gitLogs.length;
            const log = gitLogs[idx];
            if (mutedHashes?.has(log.hash)) continue;
            scrollToIndex(idx, { select: true, flash: true });
            return;
        }
    }, [gitLogs, selectedHash, headIndex, mutedHashes, scrollToIndex]);

    const totalHeight = rowMeta.length > 0
        ? rowMeta[rowMeta.length - 1].top + rowMeta[rowMeta.length - 1].height
        : 0;

    const { startIdx, endIdx } = useMemo(
        () => computeVisibleRange(rowMeta, scrollTop, containerHeight, OVERSCAN_PX),
        [rowMeta, scrollTop, containerHeight],
    );

    // Avatars on branch/tag tips (commits with refs) and HEAD. Unique SVG clip ids
    // per hash avoid collisions; tips stay stable under filters.
    const laneAvatarByHash = useMemo(() => {
        const map = new Map<string, string>();
        if (!showGraphAvatars) return map;

        const assign = (log: GitLogEntry) => {
            if (map.has(log.hash)) return;
            const url = resolveGithubAvatarUrl(log.author_email, log.author, 32);
            if (url) map.set(log.hash, url);
        };

        // Always try HEAD / newest commit.
        if (gitLogs[0]) assign(gitLogs[0]);

        // One tip avatar per lane from ref-bearing commits (branch/tag heads).
        const laneSeen = new Set<number>();
        for (const log of gitLogs) {
            if (!log.refs?.length) continue;
            const lane = log.graphNode?.lane;
            if (lane == null || laneSeen.has(lane)) continue;
            laneSeen.add(lane);
            assign(log);
        }

        // Fallback: if a lane never had a ref tip, still mark its first commit.
        for (const log of gitLogs) {
            const lane = log.graphNode?.lane;
            if (lane == null || laneSeen.has(lane)) continue;
            laneSeen.add(lane);
            assign(log);
        }

        return map;
    }, [gitLogs, showGraphAvatars]);

    // Throttle scroll updates to one RAF per frame (not per event)
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop: st, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = requestAnimationFrame(() => {
            setScrollTop(st);
            scrollRafRef.current = null;
        });

        if (st + clientHeight > scrollHeight - 1500 && !isLoadingNext && streamActiveRef.current) {
            const gen = streamGenRef.current;
            setIsLoadingNext(true);
            void commands.gitLogStreamNext("graph", 300).then(moreLogs => {
                if (gen !== streamGenRef.current || !streamActiveRef.current) return;
                if (moreLogs.length > 0) {
                    setGitLogs(prev => [...prev, ...moreLogs]);
                }
            }).finally(() => {
                if (gen === streamGenRef.current) setIsLoadingNext(false);
            });
        }
    }, [isLoadingNext]);

    // Keep viewport height accurate on resize (sidebar drag, manager split).
    useEffect(() => {
        const node = scrollContainerRef.current;
        if (!node || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver((entries) => {
            const h = entries[0]?.contentRect.height;
            if (typeof h === "number" && h > 0) setContainerHeight(h);
        });
        ro.observe(node);
        setContainerHeight(node.clientHeight);
        return () => ro.disconnect();
    }, [gitLogs.length > 0]);

    // Keyboard: j/k or arrows move selection; Enter expands; n/N next/prev match; H → HEAD.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest("input, textarea, [contenteditable=true]")) return;
            // Only when the event originates inside this graph panel.
            if (!rootRef.current || !target || !rootRef.current.contains(target)) return;

            const key = e.key.toLowerCase();
            if (key === "j" || e.key === "ArrowDown") {
                e.preventDefault();
                jumpToNextMatch(1);
            } else if (key === "k" || e.key === "ArrowUp") {
                e.preventDefault();
                jumpToNextMatch(-1);
            } else if (key === "n" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                jumpToNextMatch(e.shiftKey ? -1 : 1);
            } else if (e.key === "Enter" && selectedHash) {
                e.preventDefault();
                toggleCommitExpansion(selectedHash);
            } else if (key === "h" && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                jumpToHead();
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [jumpToNextMatch, jumpToHead, selectedHash, toggleCommitExpansion]);

    return (
        <div
            ref={rootRef}
            className={cn("flex flex-col h-full w-full select-none relative", className)}
            style={{
                // Inner merge/HEAD dots + scroll fade must match the host surface
                // (sidebar = panel, Git Manager = editor).
                ["--graph-surface" as string]:
                    surface === "editor" ? "var(--color-editor)" : "var(--color-panel)",
            }}
        >
            {/* Top gradient: blends the first commit row into the header */}
            <div className="relative z-10 flex h-9 shrink-0 items-center justify-between gap-2 px-3 border-b border-border-subtle/60">
                <div className="min-w-0 flex-1 flex items-center gap-2">
                    <FadeTruncate className="min-w-0 text-sm font-regular" title="Graph">
                        Graph
                    </FadeTruncate>
                    {hasActiveFilter && (
                        <span className="text-xs text-text-muted tabular-nums shrink-0">
                            {matchCount}/{gitLogs.length}
                        </span>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Tooltip content="Go to HEAD (H)">
                        <Button variant="ghost" size="icon" className="w-6 h-6 p-0 text-text-primary hover:bg-panel-hover" onClick={jumpToHead}>
                            <Icon name="my_location" size={16} />
                        </Button>
                    </Tooltip>
                    <Tooltip content="Fetch From All Remotes">
                        <Button variant="ghost" size="icon" className="w-6 h-6 p-0 text-text-primary hover:bg-panel-hover" onClick={async () => {
                            if (!gitRepo) return;
                            startLoading();
                            try { await commands.gitFetch(gitRepo); notify.info("Git", "Fetched from all remotes."); refresh(); }
                            catch (e) { notify.error("Git Error", String(e)); }
                            finally { stopLoading(); }
                        }}>
                            <Icon name="sync" size={16} />
                        </Button>
                    </Tooltip>
                    <Tooltip content="Pull">
                        <Button variant="ghost" size="icon" className="w-6 h-6 p-0 text-text-primary hover:bg-panel-hover" onClick={async () => {
                            if (!gitRepo) return;
                            startLoading();
                            try { await commands.gitPull(gitRepo); notify.info("Git", "Pulled successfully."); refresh(); }
                            catch (e) { notify.error("Git Error", String(e)); }
                            finally { stopLoading(); }
                        }}>
                            <Icon name="cloud_download" size={16} />
                        </Button>
                    </Tooltip>
                    <Tooltip content="Push">
                        <Button variant="ghost" size="icon" className="w-6 h-6 p-0 text-text-primary hover:bg-panel-hover" onClick={async () => {
                            if (!gitRepo) return;
                            startLoading();
                            try { await commands.gitPush(gitRepo); notify.info("Git", "Pushed successfully."); refresh(); }
                            catch (e) { notify.error("Git Error", String(e)); }
                            finally { stopLoading(); }
                        }}>
                            <Icon name="cloud_upload" size={16} />
                        </Button>
                    </Tooltip>
                    <Tooltip content="Refresh Graph">
                        <Button variant="ghost" size="icon" className="w-6 h-6 p-0 text-text-primary hover:bg-panel-hover" onClick={refresh}>
                            <Icon name="refresh" size={16} />
                        </Button>
                    </Tooltip>
                    {!rich && project_path ? <GitManagerTrigger /> : null}
                </div>
            </div>

            {rich ? (
                <div className="relative z-20 shrink-0 px-3 pb-2 pt-1 space-y-2">
                    <CommitActivitySparkline
                        buckets={activityBuckets.buckets}
                        firstTs={activityBuckets.firstTs}
                        lastTs={activityBuckets.lastTs}
                        onJump={jumpToActivityBucket}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex h-8 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-border bg-transparent px-2.5">
                            <Icon name="search" size={14} className="shrink-0 text-text-muted" />
                            <Input
                                value={localSearch}
                                onChange={(e) => setLocalSearch(e.target.value)}
                                placeholder="Search commits, authors, hashes…"
                                className="h-auto! bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 select-text"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        jumpToNextMatch(e.shiftKey ? -1 : 1);
                                    }
                                }}
                            />
                        </div>
                        <FilterMenu
                            label="All authors"
                            value={authorFilter}
                            onChange={setAuthorFilter}
                            options={[
                                { value: "all", label: "All authors" },
                                ...authors.map((a) => ({ value: a, label: a })),
                            ]}
                        />
                        <FilterMenu
                            label="All branches / tags"
                            value={branchFilter}
                            onChange={setBranchFilter}
                            options={[
                                { value: "all", label: "All branches / tags" },
                                ...branchHints.map((b) => ({ value: b, label: b })),
                            ]}
                        />
                        {(authorFilter !== "all" || branchFilter !== "all" || localSearch.trim()) && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-text-muted"
                                onClick={() => {
                                    setAuthorFilter("all");
                                    setBranchFilter("all");
                                    setLocalSearch("");
                                }}
                            >
                                Clear
                            </Button>
                        )}
                    </div>
                    {/* Subtle separator under filters */}
                    <div className="h-px bg-border-subtle/70" />
                </div>
            ) : null}

            {/* Native Shape Loading Bar right under header */}
            {isInitialLoading && (
                <LoadingBar className="absolute top-9 left-0 right-0 z-50 pointer-events-none" />
            )}

            {/* Gradient mask beneath the header: fades the top of the commit list */}
            <div
                className="shrink-0 pointer-events-none relative z-10 transition-opacity duration-200"
                style={{
                    height: 30,
                    marginBottom: -30,
                    opacity: scrollTop > 0 ? 1 : 0,
                    background: "linear-gradient(to bottom, var(--graph-surface, var(--color-panel)) 0%, transparent 100%)",
                }}
            />
            <div
                className="flex-1 overflow-y-auto custom-scrollbar overflow-x-hidden relative outline-none"
                tabIndex={0}
                onScroll={handleScroll}
                onMouseDown={() => {
                    scrollContainerRef.current?.focus({ preventScroll: true });
                }}
                ref={(node) => {
                    if (node) {
                        scrollContainerRef.current = node;
                        if (containerHeight !== node.clientHeight) setContainerHeight(node.clientHeight);
                    }
                }}
            >
                {gitLogs.length > 0 ? (
                    <div style={{ height: totalHeight, position: 'relative' }} role="listbox" aria-label="Commit graph">
                        {gitLogs.slice(startIdx, endIdx + 1).map((log, relIdx) => {
                            const idx = startIdx + relIdx;
                            const meta = rowMeta[idx];
                            if (!meta) return null;
                            const node = log.graphNode || EMPTY_NODE;
                            return (
                                <div key={log.hash} style={{ position: 'absolute', top: meta.top, left: 0, right: 0 }}>
                                    <GraphCommitRow
                                        log={log}
                                        node={node}
                                        repoPath={gitRepo}
                                        index={idx}
                                        total={gitLogs.length}
                                        isExpanded={expandedCommits.has(log.hash)}
                                        onToggleExpand={toggleCommitExpansion}
                                        onShowCommitDiff={handleShowCommitDiff}
                                        onOpenFile={handleOpenFile}
                                        onRefresh={refresh}
                                        files={commitFilesCache[log.hash] || EMPTY_ARRAY}
                                        filesLoaded={commitFilesLoaded[log.hash] || false}
                                        onFilesLoaded={handleFilesLoaded}
                                        laneAvatarUrl={laneAvatarByHash.get(log.hash) ?? null}
                                        surface={surface}
                                        muted={mutedHashes?.has(log.hash) ?? false}
                                        selected={selectedHash === log.hash}
                                        onSelect={setSelectedHash}
                                    />
                                </div>
                            );
                        })}
                    </div>
                ) : !isInitialLoading ? (
                    <div className="flex-1 flex items-center justify-center text-xs text-text-muted">
                        No commits found
                    </div>
                ) : null}
            </div>
        </div>
    );
}
