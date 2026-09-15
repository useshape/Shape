"use client";

import { RiCloudOffLine, RiCrosshair2Line, RiFilter3Line, RiFullscreenExitLine, RiRefreshLine, RiUploadLine } from "@remixicon/react";
import React, { useState, useCallback, useEffect, useRef, useMemo, useDeferredValue } from "react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import {
    commands,
    useProjectState,
    GitFileParams,
    GitLogEntry,
} from "@/lib/backend";
import { notify } from "@/features/notifications";
import { computeGraphRowLayout, computeVisibleRange, GRAPH_LOG_SOFT_CAP, GRAPH_OVERSCAN_PX, rowTop } from "@/lib/git/graph-virtual";
import { Tooltip } from "@/components/ui/tooltip";
import {
    SidebarPanelHeaderFrame,
} from "@/features/panels";
import { useLoading } from "@/features/loading/context";
import { useOptionalFilter } from "@/features/git/ui/manager/filter-context";
import { useGitRepos } from "@/lib/git/repos";
import { resolveGithubAvatarUrl } from "@/lib/git/github-avatar";
import { useSettings } from "@/lib/settings";
import { graphCache } from "./cache";
import { EMPTY_ARRAY, EMPTY_NODE, commitIsHead } from "./constants";
import { FilterMenu } from "./filter-menu";
import { GraphCommitRow } from "./commit-row";
import { GraphDetailPanel, type GraphDetailSelection } from "./graph-detail-panel";
import type { RefInfo } from "./ref-pill";
import { Panel } from "@/features/panels";
import { GitManagerTrigger } from "@/features/git/ui/manager/git-manager-trigger";
import { GitChromeActions } from "@/features/git/ui/manager/chrome";

// ── VIRTUAL SCROLL CONSTANTS ──
const OVERSCAN_PX = GRAPH_OVERSCAN_PX;

export default function Graph({
    className,
    surface = "panel",
    rich = false,
    active = true,
    hideHeader = false,
}: {
    className?: string;
    surface?: "panel" | "editor";
    /** Manager-only chrome: author/branch filters and richer titlebar. */
    rich?: boolean;
    /** When false (keep-alive pane hidden), unmount Monaco so it cannot overlay other pages. */
    active?: boolean;
    /** Skip the in-panel header (agent workspace tab already has chrome). */
    hideHeader?: boolean;
}) {
    const { project_path } = useProjectState();
    const { scmRepoPath } = useGitRepos(project_path);
    const gitRepo = scmRepoPath;
    const commitSearch = useOptionalFilter()?.query ?? "";
    const settings = useSettings();
    const showAllBranches = settings.git.graphShowAllBranches;
    const showGraphAvatars = settings.git.graphAvatars;
    const [authorFilter, setAuthorFilter] = useState<string>("all");
    const [branchFilter, setBranchFilter] = useState<string>("all");
    const [kindFilter, setKindFilter] = useState<"all" | "merges" | "non-merges">("all");
    const [refKindFilter, setRefKindFilter] = useState<"all" | "branches" | "remotes" | "tags">("all");
    const [dateFilter, setDateFilter] = useState<"all" | "7d" | "30d" | "90d">("all");
    const [localSearch, setLocalSearch] = useState("");
    const deferredLocalSearch = useDeferredValue(localSearch);
    const deferredCommitSearch = useDeferredValue(commitSearch);
    const [selectedHash, setSelectedHash] = useState<string | null>(null);
    const [detail, setDetail] = useState<GraphDetailSelection | null>(null);
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
            const prev = graphCache[cacheKey];
            const logs =
                gitLogs.length > GRAPH_LOG_SOFT_CAP
                    ? gitLogs.slice(0, GRAPH_LOG_SOFT_CAP)
                    : gitLogs;
            graphCache[cacheKey] = {
                logs,
                expanded: expandedCommits,
                filesCache: commitFilesCache,
                scrollTop: scrollTop,
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
        // Cap catch-up so remounting a large cache doesn't freeze the UI.
        let remaining = Math.min(count, GRAPH_LOG_SOFT_CAP);
        while (remaining > 0 && gen === streamGenRef.current) {
            const batch = await commands.gitLogStreamNext("graph", Math.min(remaining, 400));
            if (batch.length === 0) break;
            remaining -= batch.length;
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
        }
    }, []);

    const appendLogs = useCallback((more: GitLogEntry[]) => {
        if (more.length === 0) return;
        setGitLogs((prev) => {
            if (prev.length >= GRAPH_LOG_SOFT_CAP) return prev;
            const room = GRAPH_LOG_SOFT_CAP - prev.length;
            if (more.length <= room) return [...prev, ...more];
            return [...prev, ...more.slice(0, room)];
        });
    }, []);

    const refresh = useCallback(async (opts?: { track?: boolean }) => {
        if (!gitRepo) return;
        const track = opts?.track !== false;
        const gen = ++streamGenRef.current;
        streamActiveRef.current = false;
        if (track) startLoading();
        try {
            await commands.gitLogStreamStart(gitRepo, "graph", showAllBranches);
            if (gen !== streamGenRef.current) return;
            streamActiveRef.current = true;
            const initialLogs = await commands.gitLogStreamNext("graph", 100);
            if (gen !== streamGenRef.current) return;
            setGitLogs(initialLogs);

            void commands.gitLogStreamNext("graph", 200).then((more) => {
                if (gen !== streamGenRef.current || !streamActiveRef.current) return;
                appendLogs(more);
            });
        } catch {
            if (gen === streamGenRef.current) setGitLogs([]);
        } finally {
            // Always pair start/stop — skipping on gen mismatch left the bar stuck forever.
            if (track) stopLoading();
        }
    }, [gitRepo, showAllBranches, startLoading, stopLoading, appendLogs]);

    const hasInitialized = useRef(false);

    useEffect(() => {
        hasInitialized.current = false;
    }, [cacheKey]);

    useEffect(() => {
        if (cacheKey && !hasInitialized.current) {
            hasInitialized.current = true;

            const c = graphCache[cacheKey];
            if (c && c.logs.length > 0) {
                // Soft-cap restored logs so huge caches don't rehydrate the whole history.
                setGitLogs(c.logs.length > GRAPH_LOG_SOFT_CAP ? c.logs.slice(0, GRAPH_LOG_SOFT_CAP) : c.logs);
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
                void refresh({ track: false });
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
        if (rich) {
            const log = gitLogs.find((l) => l.hash === hash);
            const files = commitFilesCache[hash] ?? [];
            const file = files.find((f) => f.path === path) ?? ({ path, status: "M" } as GitFileParams);
            if (log) {
                setSelectedHash(hash);
                setDetail({ kind: "file", log, file });
            }
            return;
        }
        const name = path.split(/[\\\/]/).pop() || path;
        try {
            await commands.gitOpenCommitDiff(path, name, hash);
        } catch (e) { notify.error("Git Error", `Failed to open diff: ${e}`); }
    }, [gitRepo, rich, gitLogs, commitFilesCache]);

    const handleSelectCommit = useCallback((hash: string) => {
        setSelectedHash(hash);
        if (!rich) return;
        const log = gitLogs.find((l) => l.hash === hash);
        if (!log) return;
        setDetail((prev) => {
            if (prev?.kind === "file" && prev.log.hash === hash) return prev;
            return { kind: "commit", log };
        });
    }, [rich, gitLogs]);

    const handleRefActivate = useCallback((ref: RefInfo) => {
        if (!rich) return;
        const label = ref.label.replace(/^tag:\s*/i, "").trim();
        if (!label || label.toLowerCase() === "head") return;
        setBranchFilter((prev) => (prev === label ? "all" : label));
    }, [rich]);

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
        // Cap scan + options — author dropdown doesn't need every unique name from 8k commits.
        const limit = Math.min(gitLogs.length, 2_000);
        for (let i = 0; i < limit; i++) {
            const a = gitLogs[i].author?.trim();
            if (a) set.add(a);
            if (set.size >= 80) break;
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [gitLogs]);

    const branchHints = useMemo(() => {
        const set = new Set<string>();
        const limit = Math.min(gitLogs.length, 2_000);
        for (let i = 0; i < limit; i++) {
            for (const ref of gitLogs[i].refs ?? []) {
                const cleaned = ref.replace(/HEAD -> /g, "").replace(/^tag: /, "").trim();
                if (!cleaned || cleaned.toLowerCase() === "head") continue;
                set.add(cleaned);
            }
            if (set.size >= 80) break;
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b)).slice(0, 80);
    }, [gitLogs]);

    /** Match predicate — used to mute rows, not drop them (preserves lane topology). */
    const commitMatchesFilter = useCallback((log: GitLogEntry) => {
        const q = (rich ? (deferredLocalSearch || deferredCommitSearch) : deferredCommitSearch).trim().toLowerCase();
        if (authorFilter !== "all" && log.author.trim() !== authorFilter) return false;
        if (branchFilter !== "all") {
            const refs = (log.refs ?? []).map((r) =>
                r.replace(/HEAD -> /g, "").replace(/^tag: /, "").trim(),
            );
            if (!refs.some((r) => r === branchFilter || r.endsWith(`/${branchFilter}`))) {
                return false;
            }
        }
        if (kindFilter === "merges" && log.parent_count <= 1) return false;
        if (kindFilter === "non-merges" && log.parent_count > 1) return false;
        if (refKindFilter !== "all") {
            const refs = log.refs ?? [];
            if (refs.length === 0) return false;
            const has = refs.some((r) => {
                const cleaned = r.replace(/HEAD -> /g, "").trim();
                if (refKindFilter === "tags") return cleaned.startsWith("tag: ");
                if (refKindFilter === "remotes") {
                    return cleaned.startsWith("origin/") || cleaned.startsWith("upstream/");
                }
                // local branches
                return (
                    !cleaned.startsWith("tag: ")
                    && !cleaned.startsWith("origin/")
                    && !cleaned.startsWith("upstream/")
                    && cleaned.toLowerCase() !== "head"
                );
            });
            if (!has) return false;
        }
        if (dateFilter !== "all") {
            const ts = parseInt(log.date, 10);
            if (Number.isFinite(ts)) {
                const days = dateFilter === "7d" ? 7 : dateFilter === "30d" ? 30 : 90;
                const cutoff = Date.now() / 1000 - days * 86400;
                if (ts < cutoff) return false;
            }
        }
        if (!q) return true;
        return (
            log.message.toLowerCase().includes(q)
            || log.author.toLowerCase().includes(q)
            || log.hash.toLowerCase().includes(q)
            || (log.refs ?? []).some((r) => r.toLowerCase().includes(q))
        );
    }, [rich, deferredLocalSearch, deferredCommitSearch, authorFilter, branchFilter, kindFilter, refKindFilter, dateFilter]);

    const hasActiveFilter = useMemo(() => {
        const q = (rich ? (deferredLocalSearch || deferredCommitSearch) : deferredCommitSearch).trim();
        return (
            authorFilter !== "all"
            || branchFilter !== "all"
            || kindFilter !== "all"
            || refKindFilter !== "all"
            || dateFilter !== "all"
            || q.length > 0
        );
    }, [rich, deferredLocalSearch, deferredCommitSearch, authorFilter, branchFilter, kindFilter, refKindFilter, dateFilter]);

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

    const rowLayout = useMemo(() => {
        const fileCounts: Record<string, number> = {};
        if (expandedCommits.size > 0) {
            for (const hash of expandedCommits) {
                fileCounts[hash] = commitFilesCache[hash]?.length ?? 1;
            }
        }
        return computeGraphRowLayout(
            gitLogs.length,
            expandedCommits,
            fileCounts,
            (index) => gitLogs[index]?.hash ?? "",
        );
    }, [gitLogs, expandedCommits, commitFilesCache]);

    const scrollToIndex = useCallback((idx: number, opts?: { select?: boolean; flash?: boolean }) => {
        const log = gitLogs[idx];
        if (!log || !scrollContainerRef.current) return;
        scrollContainerRef.current.scrollTop = Math.max(0, rowTop(rowLayout, idx) - 40);
        if (opts?.select !== false) setSelectedHash(log.hash);
        if (opts?.flash) {
            requestAnimationFrame(() => {
                const el = scrollContainerRef.current?.querySelector(`[data-hash="${log.hash}"]`);
                el?.classList.add("graph-commit-flash");
                window.setTimeout(() => el?.classList.remove("graph-commit-flash"), 800);
            });
        }
    }, [rowLayout, gitLogs]);

    const jumpToHead = useCallback(() => {
        const headLog = gitLogs[headIndex];
        if (headLog && mutedHashes?.has(headLog.hash)) {
            // Prefer the nearest matching commit around HEAD when filters are active.
            for (let step = 0; step < gitLogs.length; step++) {
                for (const dir of [1, -1] as const) {
                    const idx = headIndex + dir * step;
                    if (idx < 0 || idx >= gitLogs.length) continue;
                    if (mutedHashes.has(gitLogs[idx].hash)) continue;
                    scrollToIndex(idx, { select: true, flash: true });
                    return;
                }
            }
            return;
        }
        scrollToIndex(headIndex, { select: true, flash: true });
    }, [scrollToIndex, headIndex, gitLogs, mutedHashes]);

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

    const totalHeight = rowLayout.totalHeight;

    const { startIdx, endIdx } = useMemo(
        () => computeVisibleRange(rowLayout, scrollTop, containerHeight, OVERSCAN_PX),
        [rowLayout, scrollTop, containerHeight],
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
        const scanLimit = Math.min(gitLogs.length, 2_500);
        for (let i = 0; i < scanLimit; i++) {
            const log = gitLogs[i];
            if (!log.refs?.length) continue;
            const lane = log.graphNode?.lane;
            if (lane == null || laneSeen.has(lane)) continue;
            laneSeen.add(lane);
            assign(log);
        }

        // Fallback: if a lane never had a ref tip, still mark its first commit.
        for (let i = 0; i < scanLimit; i++) {
            const log = gitLogs[i];
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

        if (
            st + clientHeight > scrollHeight - 1500
            && !isLoadingNext
            && streamActiveRef.current
        ) {
            const gen = streamGenRef.current;
            setIsLoadingNext(true);
            void commands.gitLogStreamNext("graph", 300).then((moreLogs) => {
                if (gen !== streamGenRef.current || !streamActiveRef.current) return;
                appendLogs(moreLogs);
            }).finally(() => {
                if (gen === streamGenRef.current) setIsLoadingNext(false);
            });
        }
    }, [isLoadingNext, appendLogs]);

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

    // When filters change and the current selection is muted, snap to the next match.
    const filterKey = `${authorFilter}\0${branchFilter}\0${kindFilter}\0${refKindFilter}\0${dateFilter}\0${rich ? (deferredLocalSearch || deferredCommitSearch) : deferredCommitSearch}`;
    useEffect(() => {
        if (!mutedHashes || !selectedHash || matchCount === 0) return;
        if (!mutedHashes.has(selectedHash)) return;
        jumpToNextMatch(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to filter changes
    }, [filterKey]);

    // Keep manager detail panel in sync with selected commit (unless viewing a file of that commit).
    useEffect(() => {
        if (!rich || !selectedHash) return;
        const log = gitLogs.find((l) => l.hash === selectedHash);
        if (!log) return;
        setDetail((prev) => {
            if (prev?.kind === "file" && prev.log.hash === selectedHash) {
                return { ...prev, log };
            }
            if (prev?.kind === "commit" && prev.log.hash === selectedHash) {
                return { kind: "commit", log };
            }
            if (!prev) return { kind: "commit", log };
            if (prev.log.hash !== selectedHash) return { kind: "commit", log };
            return prev;
        });
    }, [rich, selectedHash, gitLogs]);

    // Keyboard: j/k or arrows move selection among matches; Tab next; Enter expands; n/N; H → HEAD.
    // Search fields (in-graph + manager titlebar) also accept arrows/Tab for match nav.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;

            const inGraphSearch = !!target.closest("[data-graph-search]");
            const inTitlebarSearch = !!target.closest("[data-git-titlebar-search]");
            const inThisGraph = !!(rootRef.current && rootRef.current.contains(target));
            const inField = !!target.closest("input, textarea, [contenteditable=true]");

            if (!inThisGraph && !inTitlebarSearch) return;
            if (inField && !inGraphSearch && !inTitlebarSearch) return;
            // Titlebar search is shared — only steal keys while Git Graph is the active manager surface.
            if (inTitlebarSearch && !rich) return;

            const isNav =
                e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Tab"
                || e.key.toLowerCase() === "j" || e.key.toLowerCase() === "k"
                || (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey)
                || e.key === "Enter"
                || (e.key.toLowerCase() === "h" && !e.ctrlKey && !e.metaKey && !e.altKey);

            if ((inGraphSearch || inTitlebarSearch) && !isNav) return;
            if ((inGraphSearch || inTitlebarSearch) && (e.key.toLowerCase() === "j" || e.key.toLowerCase() === "k")) return;

            const key = e.key.toLowerCase();
            if (key === "j" || e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
                e.preventDefault();
                jumpToNextMatch(1);
            } else if (key === "k" || e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
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
    }, [jumpToNextMatch, jumpToHead, selectedHash, toggleCommitExpansion, rich]);

    const graphList = (
        <div
            className="graph-scroll min-h-0 flex-1 overflow-y-scroll overflow-x-hidden relative outline-none"
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
                <div style={{ height: totalHeight, position: "relative" }} role="listbox" aria-label="Commit graph">
                    {gitLogs.slice(startIdx, endIdx + 1).map((log, relIdx) => {
                        const idx = startIdx + relIdx;
                        const top = rowTop(rowLayout, idx);
                        const node = log.graphNode || EMPTY_NODE;
                        const isMuted = mutedHashes?.has(log.hash) ?? false;
                        const prevMuted = idx > 0 ? (mutedHashes?.has(gitLogs[idx - 1].hash) ?? false) : true;
                        const nextMuted = idx < gitLogs.length - 1 ? (mutedHashes?.has(gitLogs[idx + 1].hash) ?? false) : true;
                        return (
                            <div key={log.hash} style={{ position: "absolute", top, left: 0, right: 0 }}>
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
                                    muted={isMuted}
                                    matchHighlight={hasActiveFilter && !isMuted}
                                    blendTop={isMuted && !prevMuted}
                                    blendBottom={isMuted && !nextMuted}
                                    selected={selectedHash === log.hash}
                                    onSelect={handleSelectCommit}
                                    onRefActivate={rich ? handleRefActivate : undefined}
                                />
                            </div>
                        );
                    })}
                </div>
            ) : !isInitialLoading ? (
                <div className="flex h-full flex-1 items-center justify-center text-xs text-text-muted">
                    No commits found
                </div>
            ) : null}
        </div>
    );

    const graphChrome = (
        <>
            {rich ? (
                active ? (
                <GitChromeActions>
                    <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label="Filter commits"
                            >
                                <Icon icon={RiFilter3Line} size={ICON_SIZE_SM} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-auto p-2">
                            <div className="flex flex-col gap-1.5">
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
                                    label="All commits"
                                    value={kindFilter}
                                    onChange={(v) => setKindFilter(v as typeof kindFilter)}
                                    options={[
                                        { value: "all", label: "All commits" },
                                        { value: "merges", label: "Merges only" },
                                        { value: "non-merges", label: "No merges" },
                                    ]}
                                />
                                <FilterMenu
                                    label="Any time"
                                    value={dateFilter}
                                    onChange={(v) => setDateFilter(v as typeof dateFilter)}
                                    options={[
                                        { value: "all", label: "Any time" },
                                        { value: "7d", label: "Last 7 days" },
                                        { value: "30d", label: "Last 30 days" },
                                        { value: "90d", label: "Last 90 days" },
                                    ]}
                                />
                                {hasActiveFilter ? (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8"
                                        onClick={() => {
                                            setAuthorFilter("all");
                                            setBranchFilter("all");
                                            setKindFilter("all");
                                            setRefKindFilter("all");
                                            setDateFilter("all");
                                            setLocalSearch("");
                                        }}
                                    >
                                        Clear filters
                                    </Button>
                                ) : null}
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Tooltip content="Go to HEAD">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={jumpToHead} aria-label="Go to HEAD">
                            <Icon icon={RiCrosshair2Line} size={ICON_SIZE_SM} />
                        </Button>
                    </Tooltip>
                    <Tooltip content="Fetch">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={async () => {
                                if (!gitRepo) return;
                                startLoading();
                                try {
                                    await commands.gitFetch(gitRepo);
                                    notify.info("Git", "Fetched from all remotes.");
                                    await refresh({ track: false });
                                } catch (e) {
                                    notify.error("Git Error", String(e));
                                } finally {
                                    stopLoading();
                                }
                            }}
                            aria-label="Fetch"
                        >
                            <Icon icon={RiRefreshLine} size={ICON_SIZE_SM} />
                        </Button>
                    </Tooltip>
                    <Tooltip content="Pull">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={async () => {
                                if (!gitRepo) return;
                                startLoading();
                                try {
                                    await commands.gitPull(gitRepo);
                                    notify.info("Git", "Pulled successfully.");
                                    await refresh({ track: false });
                                } catch (e) {
                                    notify.error("Git Error", String(e));
                                } finally {
                                    stopLoading();
                                }
                            }}
                            aria-label="Pull"
                        >
                            <Icon icon={RiCloudOffLine} size={ICON_SIZE_SM} />
                        </Button>
                    </Tooltip>
                    <Tooltip content="Push">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={async () => {
                                if (!gitRepo) return;
                                startLoading();
                                try {
                                    await commands.gitPush(gitRepo);
                                    notify.info("Git", "Pushed successfully.");
                                    await refresh({ track: false });
                                } catch (e) {
                                    notify.error("Git Error", String(e));
                                } finally {
                                    stopLoading();
                                }
                            }}
                            aria-label="Push"
                        >
                            <Icon icon={RiUploadLine} size={ICON_SIZE_SM} />
                        </Button>
                    </Tooltip>
                    {expandedCommits.size > 0 ? (
                        <Tooltip content="Collapse all">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setExpandedCommits(new Set())}
                                aria-label="Collapse all"
                            >
                                <Icon icon={RiFullscreenExitLine} size={ICON_SIZE_SM} />
                            </Button>
                        </Tooltip>
                    ) : null}
                </GitChromeActions>
            ) : null
            ) : hideHeader ? null : (
            <SidebarPanelHeaderFrame
                title="Git Graph"
                className={rich ? "bg-editor" : undefined}
                titleExtra={
                    hasActiveFilter ? (
                        <span className="shrink-0 text-xs tabular-nums text-text-muted">
                            {matchCount}/{gitLogs.length}
                        </span>
                    ) : null
                }
                actions={
                    <>
                    <Tooltip content="Go to HEAD (H)">
                        <Button variant="ghost" size="icon" className="text-text-primary hover:bg-panel-hover" onClick={jumpToHead}>
                            <Icon icon={RiCrosshair2Line} size={ICON_SIZE_SM} />
                        </Button>
                    </Tooltip>
                    <Tooltip content="Fetch From All Remotes">
                        <Button variant="ghost" size="icon" className="text-text-primary hover:bg-panel-hover" onClick={async () => {
                            if (!gitRepo) return;
                            startLoading();
                            try {
                                await commands.gitFetch(gitRepo);
                                notify.info("Git", "Fetched from all remotes.");
                                await refresh({ track: false });
                            } catch (e) { notify.error("Git Error", String(e)); }
                            finally { stopLoading(); }
                        }}>
                            <Icon icon={RiRefreshLine} size={ICON_SIZE_SM} />
                        </Button>
                    </Tooltip>
                    <Tooltip content="Pull">
                        <Button variant="ghost" size="icon" className="text-text-primary hover:bg-panel-hover" onClick={async () => {
                            if (!gitRepo) return;
                            startLoading();
                            try {
                                await commands.gitPull(gitRepo);
                                notify.info("Git", "Pulled successfully.");
                                await refresh({ track: false });
                            } catch (e) { notify.error("Git Error", String(e)); }
                            finally { stopLoading(); }
                        }}>
                            <Icon icon={RiCloudOffLine} size={ICON_SIZE_SM} />
                        </Button>
                    </Tooltip>
                    <Tooltip content="Push">
                        <Button variant="ghost" size="icon" className="text-text-primary hover:bg-panel-hover" onClick={async () => {
                            if (!gitRepo) return;
                            startLoading();
                            try {
                                await commands.gitPush(gitRepo);
                                notify.info("Git", "Pushed successfully.");
                                await refresh({ track: false });
                            } catch (e) { notify.error("Git Error", String(e)); }
                            finally { stopLoading(); }
                        }}>
                            <Icon icon={RiUploadLine} size={ICON_SIZE_SM} />
                        </Button>
                    </Tooltip>
                    <Tooltip content="Refresh Graph">
                        <Button variant="ghost" size="icon" className="text-text-primary hover:bg-panel-hover" onClick={() => void refresh()}>
                            <Icon icon={RiRefreshLine} size={ICON_SIZE_SM} />
                        </Button>
                    </Tooltip>
                    {!rich && project_path ? <GitManagerTrigger /> : null}
                    </>
                }
            />
            )}

            <div
                className="shrink-0 pointer-events-none relative z-10 transition-opacity duration-200"
                style={{
                    height: 30,
                    marginBottom: -30,
                    opacity: scrollTop > 0 ? 1 : 0,
                    background: "linear-gradient(to bottom, var(--graph-surface, var(--color-panel)) 0%, transparent 100%)",
                }}
            />
            {graphList}
        </>
    );

    return (
        <div
            ref={rootRef}
            className={cn("flex flex-col h-full w-full select-none relative", className)}
            style={{
                ["--graph-surface" as string]:
                    surface === "editor" ? "var(--color-editor)" : "var(--color-panel)",
            }}
        >
            {rich ? (
                <Panel
                    className="min-h-0 flex-1"
                    direction="horizontal"
                    storageKey="git-manager-graph-detail"
                    hideSeparator
                    paneGap="var(--workbench-gap)"
                    panes={[
                        {
                            id: "graph-main",
                            flexible: true,
                            minSize: 360,
                            preferredSize: 640,
                            // Main graph canvas — flush like Actions content, not a workbench card.
                            children: (
                                <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
                                    {graphChrome}
                                </div>
                            ),
                        },
                        {
                            id: "graph-detail",
                            preferredSize: 360,
                            minSize: 260,
                            maxSize: 560,
                            snap: true,
                            visible: Boolean(detail),
                            children: (
                                <GraphDetailPanel
                                    selection={
                                        detail
                                            ? { kind: "commit", log: detail.log }
                                            : null
                                    }
                                    repoPath={gitRepo}
                                    active={active}
                                    forceCommit
                                    onClose={() => {
                                        setDetail(null);
                                        setSelectedHash(null);
                                    }}
                                    onOpenFile={(file) => {
                                        if (detail?.log) setDetail({ kind: "file", log: detail.log, file });
                                    }}
                                />
                            ),
                        },
                        {
                            id: "graph-diff",
                            preferredSize: 480,
                            minSize: 280,
                            maxSize: 900,
                            snap: true,
                            visible: detail?.kind === "file",
                            children: (
                                <GraphDetailPanel
                                    selection={detail?.kind === "file" ? detail : null}
                                    repoPath={gitRepo}
                                    active={active && detail?.kind === "file"}
                                    onClose={() => {
                                        if (detail?.log) setDetail({ kind: "commit", log: detail.log });
                                    }}
                                    onClearFile={() => {
                                        if (detail?.log) setDetail({ kind: "commit", log: detail.log });
                                    }}
                                />
                            ),
                        },
                    ]}
                />
            ) : (
                graphChrome
            )}
        </div>
    );
}
