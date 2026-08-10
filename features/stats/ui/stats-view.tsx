"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CollapsibleNavGroup, NavLeafButton } from "@/components/ui/collapsible-nav";
import { commands, useProjectState } from "@/lib/backend";
import type { EventCounters, ProjectStatsSnapshot } from "@/lib/backend/types";
import { notify } from "@/features/notifications";

const LANG_COLORS: Record<string, string> = {
    TypeScript: "#3178c6",
    TSX: "#3178c6",
    JavaScript: "#f1e05a",
    JSX: "#f1e05a",
    Rust: "#dea584",
    Python: "#3572A5",
    Go: "#00ADD8",
    Java: "#b07219",
    Kotlin: "#A97BFF",
    Swift: "#F05138",
    C: "#555555",
    "C Header": "#555555",
    "C++": "#f34b7d",
    "C#": "#178600",
    Ruby: "#701516",
    PHP: "#4F5D95",
    CSS: "#563d7c",
    SCSS: "#c6538c",
    HTML: "#e34c26",
    Vue: "#41b883",
    Svelte: "#ff3e00",
    Astro: "#ff5a03",
    Markdown: "#083fa1",
    JSON: "#292929",
    YAML: "#cb171e",
    TOML: "#9c4221",
    Shell: "#89e051",
    PowerShell: "#012456",
    SQL: "#e38c00",
    Dart: "#00B4AB",
    Lua: "#000080",
};

type NavLeaf = { id: string; label: string; targetId: string; keywords?: string[] };
type NavGroup = { id: string; label: string; children: NavLeaf[] };

const NAV: NavGroup[] = [
    {
        id: "code",
        label: "Codebase",
        children: [
            { id: "overview", label: "Overview", targetId: "stats-overview", keywords: ["lines", "files", "size"] },
            { id: "languages", label: "Languages", targetId: "stats-languages" },
            { id: "files", label: "Largest files", targetId: "stats-files", keywords: ["big", "long"] },
        ],
    },
    {
        id: "activity",
        label: "Activity",
        children: [
            { id: "time", label: "Time", targetId: "stats-time", keywords: ["hours", "coding"] },
            { id: "ai", label: "AI", targetId: "stats-ai", keywords: ["agent", "terminal", "chat"] },
            { id: "you", label: "You", targetId: "stats-you", keywords: ["saves", "opens"] },
            { id: "ratios", label: "Ratios", targetId: "stats-ratios", keywords: ["per", "rate"] },
        ],
    },
    {
        id: "vcs",
        label: "Git",
        children: [
            { id: "git", label: "Repository", targetId: "stats-git" },
            { id: "churn", label: "Churn", targetId: "stats-churn", keywords: ["additions", "deletions"] },
            { id: "authors", label: "Authors", targetId: "stats-authors", keywords: ["contributors"] },
        ],
    },
];

function colorFor(name: string, index: number): string {
    if (LANG_COLORS[name]) return LANG_COLORS[name];
    const palette = ["#8b5cf6", "#06b6d4", "#f97316", "#22c55e", "#ec4899", "#eab308"];
    return palette[index % palette.length]!;
}

function formatHours(h: number): string {
    if (!Number.isFinite(h) || h < 0.01) return "0h";
    if (h < 1) return `${Math.round(h * 60)}m`;
    const hours = Math.floor(h);
    const mins = Math.round((h - hours) * 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatNum(n: number | undefined, digits = 0): string {
    const v = n ?? 0;
    if (digits > 0) return v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
    return Math.round(v).toLocaleString();
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPct(ratio: number | undefined): string {
    return `${(((ratio ?? 0) * 100)).toFixed(1)}%`;
}

function formatRelative(ts: number | null | undefined): string {
    if (!ts) return "—";
    const ms = ts * 1000;
    const diff = Date.now() - ms;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
    return new Date(ms).toLocaleDateString();
}

function ratio(a: number, b: number): string {
    if (!b) return "—";
    return (a / b).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function emptyEvents(): EventCounters {
    return {
        aiTerminalRuns: 0,
        aiFileEdits: 0,
        aiFileCreates: 0,
        aiFileDeletes: 0,
        aiFileRenames: 0,
        aiSearches: 0,
        aiReads: 0,
        aiGitCommits: 0,
        aiGitFetches: 0,
        aiGitStages: 0,
        aiChatTurns: 0,
        aiSubagents: 0,
        aiDesignPreviews: 0,
        aiMcpCalls: 0,
        aiPlanSaves: 0,
        aiTodoUpdates: 0,
        userFileSaves: 0,
        userFilesOpened: 0,
        userGitCommits: 0,
        userGitPushes: 0,
        userGitFetches: 0,
        userGitPulls: 0,
        chatStops: 0,
    };
}

function StatLine({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
            <span className="text-text-secondary">{label}</span>
            <span className="shrink-0 tabular-nums text-text-primary">{value}</span>
        </div>
    );
}

function SectionTitle({ id, title }: { id: string; title: string }) {
    return (
        <h2 id={id} className="mb-3 scroll-mt-3 text-lg font-medium text-text-primary">
            {title}
        </h2>
    );
}

export function StatsView() {
    const { project_path } = useProjectState();
    const [stats, setStats] = useState<ProjectStatsSnapshot | null>(null);
    const [loading, setLoading] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [query, setQuery] = useState("");
    const [activeLeafId, setActiveLeafId] = useState("overview");
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
        () => new Set(NAV.map((g) => g.id)),
    );

    const load = useCallback(
        async (rescan = false) => {
            if (!project_path) {
                setStats(null);
                return;
            }
            if (rescan) setScanning(true);
            else setLoading(true);
            try {
                const next = rescan
                    ? await commands.scanProjectLoc(project_path)
                    : await commands.getProjectStats(project_path);
                setStats(next);
                if (rescan) notify.success("Statistics", "Scan finished");
            } catch (err) {
                notify.error("Statistics", err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
                setScanning(false);
            }
        },
        [project_path],
    );

    useEffect(() => {
        void load(false);
    }, [load]);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        void listen("shape-stats-refresh", () => {
            void load(false);
        }).then((fn) => {
            unlisten = fn;
        });
        const onFocus = () => void load(false);
        window.addEventListener("focus", onFocus);
        return () => {
            unlisten?.();
            window.removeEventListener("focus", onFocus);
        };
    }, [load]);

    useEffect(() => {
        if (!project_path || !stats || stats.loc || scanning || loading) return;
        void load(true);
    }, [project_path, stats, scanning, loading, load]);

    const filteredNav = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return NAV;
        return NAV.map((group) => ({
            ...group,
            children: group.children.filter(
                (leaf) =>
                    leaf.label.toLowerCase().includes(q) ||
                    group.label.toLowerCase().includes(q) ||
                    leaf.keywords?.some((k) => k.includes(q)),
            ),
        })).filter((group) => group.children.length > 0);
    }, [query]);

    useEffect(() => {
        if (!query.trim()) return;
        setExpandedGroups(new Set(filteredNav.map((g) => g.id)));
    }, [query, filteredNav]);

    const languages = stats?.loc?.languages ?? [];
    const totalCode = stats?.loc?.code ?? 0;
    const events = stats?.events ?? emptyEvents();
    const git = stats?.git;
    const loc = stats?.loc;

    const bars = useMemo(() => {
        if (!totalCode) return [];
        return languages.map((lang, i) => ({
            ...lang,
            pct: (lang.code / totalCode) * 100,
            color: colorFor(lang.name, i),
        }));
    }, [languages, totalCode]);

    const scrollToTarget = (targetId: string) => {
        document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const toggleGroup = (id: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    if (!project_path) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <Icon name="folder" size={28} className="text-text-muted" />
                <p className="text-sm text-text-secondary">Open a project to see statistics.</p>
            </div>
        );
    }

    const aiMutations =
        events.aiFileEdits + events.aiFileCreates + events.aiFileDeletes + events.aiFileRenames;
    const aiTools =
        aiMutations +
        events.aiTerminalRuns +
        events.aiSearches +
        events.aiReads +
        events.aiGitCommits +
        events.aiGitFetches +
        events.aiGitStages +
        events.aiDesignPreviews +
        events.aiMcpCalls +
        events.aiPlanSaves +
        events.aiTodoUpdates;

    return (
        <div className="flex h-full w-full min-w-0 overflow-hidden select-none bg-background">
            <aside className="flex w-64 shrink-0 flex-col bg-background">
                <div className="p-2">
                    <div className="flex h-9 items-center rounded-lg border border-border bg-transparent px-3">
                        <Icon name="search" size={14} className="shrink-0 text-text-muted" />
                        <Input
                            placeholder="Search statistics"
                            value={query}
                            className="h-auto! bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 select-text"
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </div>
                </div>
                <nav className="no-scrollbar flex-1 space-y-1 overflow-y-auto px-2 pb-2">
                    {filteredNav.map((group) => {
                        const open = expandedGroups.has(group.id) || !!query.trim();
                        return (
                            <CollapsibleNavGroup
                                key={group.id}
                                label={group.label}
                                open={open}
                                onToggle={() => toggleGroup(group.id)}
                            >
                                {group.children.map((leaf) => (
                                    <NavLeafButton
                                        key={leaf.id}
                                        active={activeLeafId === leaf.id}
                                        onClick={() => {
                                            setActiveLeafId(leaf.id);
                                            scrollToTarget(leaf.targetId);
                                        }}
                                    >
                                        <span className="truncate text-sm font-regular">
                                            {leaf.label}
                                        </span>
                                    </NavLeafButton>
                                ))}
                            </CollapsibleNavGroup>
                        );
                    })}
                </nav>
                <div className="relative p-2">
                    <div
                        className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-linear-to-t from-background to-transparent"
                        aria-hidden
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-sm"
                        disabled={scanning}
                        onClick={() => void load(true)}
                    >
                        {scanning ? "Scanning…" : "Rescan"}
                    </Button>
                </div>
            </aside>

            <section className="no-scrollbar min-w-0 flex-1 overflow-y-auto rounded-tr-xl bg-background">
                <div className="w-full space-y-10 p-6 pb-24">
                    {loading && !stats ? (
                        <p className="text-sm text-text-muted">Loading…</p>
                    ) : (
                        <>
                            <div>
                                <SectionTitle id="stats-overview" title="Overview" />
                                <div className="divide-y divide-border-subtle/60">
                                    <StatLine label="Project" value={stats?.projectName ?? "—"} />
                                    <StatLine label="Code lines" value={formatNum(loc?.code)} />
                                    <StatLine label="Total lines" value={formatNum(loc?.totalLines)} />
                                    <StatLine label="Blank" value={formatNum(loc?.blank)} />
                                    <StatLine label="Comments" value={formatNum(loc?.comment)} />
                                    <StatLine label="Code %" value={formatPct(loc?.codeRatio)} />
                                    <StatLine label="Comment %" value={formatPct(loc?.commentRatio)} />
                                    <StatLine label="Blank %" value={formatPct(loc?.blankRatio)} />
                                    <StatLine label="Files" value={formatNum(loc?.totalFiles)} />
                                    <StatLine label="Languages" value={formatNum(loc?.uniqueLanguages)} />
                                    <StatLine label="Size" value={formatBytes(loc?.totalBytes ?? 0)} />
                                    <StatLine label="Avg lines / file" value={formatNum(loc?.avgLinesPerFile, 1)} />
                                    <StatLine label="Avg code / file" value={formatNum(loc?.avgCodePerFile, 1)} />
                                    <StatLine label="Avg size / file" value={formatBytes(Math.round(loc?.avgBytesPerFile ?? 0))} />
                                    <StatLine label="Files ≥ 500 lines" value={formatNum(loc?.filesOver500Lines)} />
                                    <StatLine label="Files ≥ 1000 lines" value={formatNum(loc?.filesOver1000Lines)} />
                                    <StatLine label="Test files" value={formatNum(loc?.testFiles)} />
                                    <StatLine label="Config files" value={formatNum(loc?.configFiles)} />
                                    <StatLine label="Doc files" value={formatNum(loc?.docFiles)} />
                                    <StatLine label="AI tool calls" value={formatNum(aiTools)} />
                                    <StatLine label="Chat turns" value={formatNum(events.aiChatTurns)} />
                                    <StatLine
                                        label="Last scan"
                                        value={
                                            loc?.scannedAt
                                                ? new Date(loc.scannedAt * 1000).toLocaleString()
                                                : "Never"
                                        }
                                    />
                                </div>
                            </div>

                            <div>
                                <SectionTitle id="stats-languages" title="Languages" />
                                {bars.length === 0 ? (
                                    <p className="text-sm text-text-muted">
                                        {scanning ? "Scanning…" : "No source files yet."}
                                    </p>
                                ) : (
                                    <>
                                        <div className="mb-4 flex h-2.5 w-full overflow-hidden rounded-full bg-panel-hover">
                                            {bars.map((b) => (
                                                <div
                                                    key={b.name}
                                                    title={`${b.name} ${b.pct.toFixed(1)}%`}
                                                    className="h-full"
                                                    style={{
                                                        width: `${Math.max(b.pct, b.pct > 0 ? 0.4 : 0)}%`,
                                                        backgroundColor: b.color,
                                                    }}
                                                />
                                            ))}
                                        </div>
                                        <ul className="divide-y divide-border-subtle/60">
                                            {bars.map((b) => (
                                                <li
                                                    key={b.name}
                                                    className="flex items-center gap-2 py-1.5 text-sm"
                                                >
                                                    <span
                                                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                                                        style={{ backgroundColor: b.color }}
                                                    />
                                                    <span className="text-text-primary">{b.name}</span>
                                                    <span className="text-text-muted">{b.pct.toFixed(1)}%</span>
                                                    <span className="ml-auto text-xs tabular-nums text-text-muted">
                                                        {formatNum(b.code)} code · {formatNum(b.blank)} blank ·{" "}
                                                        {formatNum(b.comment)} comments · {b.files} files ·{" "}
                                                        {formatBytes(b.bytes)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </div>

                            <div>
                                <SectionTitle id="stats-files" title="Largest files" />
                                {(loc?.largestFiles?.length ?? 0) === 0 ? (
                                    <p className="text-sm text-text-muted">—</p>
                                ) : (
                                    <ul className="divide-y divide-border-subtle/60">
                                        {loc!.largestFiles.map((f) => (
                                            <li
                                                key={f.path}
                                                className="flex items-baseline justify-between gap-4 py-1.5 text-sm"
                                            >
                                                <span className="min-w-0 truncate font-mono text-xs text-text-primary">
                                                    {f.path}
                                                </span>
                                                <span className="shrink-0 tabular-nums text-text-muted">
                                                    {formatNum(f.lines)} lines · {f.language}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <div>
                                <SectionTitle id="stats-time" title="Time" />
                                <div className="divide-y divide-border-subtle/60">
                                    <StatLine label="Coding" value={formatHours(stats?.hours.coding ?? 0)} />
                                    <StatLine label="AI generating" value={formatHours(stats?.hours.aiGenerating ?? 0)} />
                                    <StatLine label="Window focused" value={formatHours(stats?.hours.focused ?? 0)} />
                                    <StatLine label="Active total" value={formatHours(stats?.hours.totalActive ?? 0)} />
                                    <StatLine
                                        label="Coding / focused"
                                        value={formatPct(
                                            (stats?.hours.focused ?? 0) > 0
                                                ? (stats?.hours.coding ?? 0) / (stats?.hours.focused ?? 1)
                                                : 0,
                                        )}
                                    />
                                    <StatLine
                                        label="AI / active"
                                        value={formatPct(
                                            (stats?.hours.totalActive ?? 0) > 0
                                                ? (stats?.hours.aiGenerating ?? 0) /
                                                      (stats?.hours.totalActive ?? 1)
                                                : 0,
                                        )}
                                    />
                                </div>
                            </div>

                            <div>
                                <SectionTitle id="stats-ai" title="AI" />
                                <div className="divide-y divide-border-subtle/60">
                                    <StatLine label="Chat turns" value={formatNum(events.aiChatTurns)} />
                                    <StatLine label="Stops" value={formatNum(events.chatStops)} />
                                    <StatLine label="Terminal runs" value={formatNum(events.aiTerminalRuns)} />
                                    <StatLine label="File edits" value={formatNum(events.aiFileEdits)} />
                                    <StatLine label="Files created" value={formatNum(events.aiFileCreates)} />
                                    <StatLine label="Files deleted" value={formatNum(events.aiFileDeletes)} />
                                    <StatLine label="Files renamed" value={formatNum(events.aiFileRenames)} />
                                    <StatLine label="Reads" value={formatNum(events.aiReads)} />
                                    <StatLine label="Searches" value={formatNum(events.aiSearches)} />
                                    <StatLine label="Git commits" value={formatNum(events.aiGitCommits)} />
                                    <StatLine label="Git fetches" value={formatNum(events.aiGitFetches)} />
                                    <StatLine label="Git stages" value={formatNum(events.aiGitStages)} />
                                    <StatLine label="Design previews" value={formatNum(events.aiDesignPreviews)} />
                                    <StatLine label="MCP calls" value={formatNum(events.aiMcpCalls)} />
                                    <StatLine label="Plan saves" value={formatNum(events.aiPlanSaves)} />
                                    <StatLine label="Todo updates" value={formatNum(events.aiTodoUpdates)} />
                                    <StatLine label="All tool calls" value={formatNum(aiTools)} />
                                </div>
                            </div>

                            <div>
                                <SectionTitle id="stats-you" title="You" />
                                <div className="divide-y divide-border-subtle/60">
                                    <StatLine label="Files saved" value={formatNum(events.userFileSaves)} />
                                    <StatLine label="Files opened" value={formatNum(events.userFilesOpened)} />
                                    <StatLine label="Git commits" value={formatNum(events.userGitCommits)} />
                                    <StatLine label="Git pushes" value={formatNum(events.userGitPushes)} />
                                    <StatLine label="Git fetches" value={formatNum(events.userGitFetches)} />
                                    <StatLine label="Git pulls" value={formatNum(events.userGitPulls)} />
                                </div>
                            </div>

                            <div>
                                <SectionTitle id="stats-ratios" title="Ratios" />
                                <div className="divide-y divide-border-subtle/60">
                                    <StatLine
                                        label="AI edits / chat turn"
                                        value={ratio(events.aiFileEdits, events.aiChatTurns)}
                                    />
                                    <StatLine
                                        label="Terminal runs / chat turn"
                                        value={ratio(events.aiTerminalRuns, events.aiChatTurns)}
                                    />
                                    <StatLine
                                        label="Tool calls / chat turn"
                                        value={ratio(aiTools, events.aiChatTurns)}
                                    />
                                    <StatLine
                                        label="Stop rate"
                                        value={formatPct(
                                            events.aiChatTurns > 0
                                                ? events.chatStops / events.aiChatTurns
                                                : 0,
                                        )}
                                    />
                                    <StatLine
                                        label="AI mutations / your saves"
                                        value={ratio(aiMutations, events.userFileSaves)}
                                    />
                                    <StatLine
                                        label="Your saves / opens"
                                        value={ratio(events.userFileSaves, events.userFilesOpened)}
                                    />
                                    <StatLine
                                        label="AI commits / your commits"
                                        value={ratio(events.aiGitCommits, events.userGitCommits)}
                                    />
                                    <StatLine
                                        label="Reads / edits (AI)"
                                        value={ratio(events.aiReads, events.aiFileEdits)}
                                    />
                                    <StatLine
                                        label="Searches / edits (AI)"
                                        value={ratio(events.aiSearches, events.aiFileEdits)}
                                    />
                                </div>
                            </div>

                            <div>
                                <SectionTitle id="stats-git" title="Repository" />
                                {!git?.isRepo ? (
                                    <p className="text-sm text-text-muted">Not a git repository.</p>
                                ) : (
                                    <div className="divide-y divide-border-subtle/60">
                                        <StatLine label="Branch" value={git.currentBranch ?? "—"} />
                                        <StatLine label="Commits" value={formatNum(git.commits)} />
                                        <StatLine label="Merge commits" value={formatNum(git.mergeCommits)} />
                                        <StatLine label="Contributors" value={formatNum(git.contributors)} />
                                        <StatLine label="Local branches" value={formatNum(git.branches)} />
                                        <StatLine label="Remote branches" value={formatNum(git.remoteBranches)} />
                                        <StatLine label="Remotes" value={formatNum(git.remotes)} />
                                        <StatLine label="Tags" value={formatNum(git.tags)} />
                                        <StatLine label="Stashes" value={formatNum(git.stashCount)} />
                                        <StatLine label="Dirty files" value={formatNum(git.dirtyFiles)} />
                                        <StatLine label="Untracked" value={formatNum(git.untrackedFiles)} />
                                        <StatLine label="Age" value={`${formatNum(git.ageDays, 1)} days`} />
                                        <StatLine
                                            label="Avg commits / week"
                                            value={formatNum(git.avgCommitsPerWeek, 2)}
                                        />
                                        <StatLine label="Busiest weekday" value={git.busiestWeekday ?? "—"} />
                                        <StatLine label="First commit" value={formatRelative(git.firstCommitAt)} />
                                        <StatLine label="Last commit" value={formatRelative(git.lastCommitAt)} />
                                        <StatLine label="Last author" value={git.lastCommitAuthor ?? "—"} />
                                        {git.lastCommitMessage ? (
                                            <div className="py-1.5 text-sm">
                                                <div className="text-text-secondary">Last message</div>
                                                <p className="mt-0.5 text-text-primary">{git.lastCommitMessage}</p>
                                            </div>
                                        ) : null}
                                    </div>
                                )}
                            </div>

                            <div>
                                <SectionTitle id="stats-churn" title="Churn" />
                                {!git?.isRepo ? (
                                    <p className="text-sm text-text-muted">—</p>
                                ) : (
                                    <div className="divide-y divide-border-subtle/60">
                                        <StatLine label="Commits today" value={formatNum(git.commitsToday)} />
                                        <StatLine label="Commits 7d" value={formatNum(git.commitsLast7Days)} />
                                        <StatLine label="Commits 30d" value={formatNum(git.commitsLast30Days)} />
                                        <StatLine label="Commits 90d" value={formatNum(git.commitsLast90Days)} />
                                        <StatLine label="Added 30d" value={formatNum(git.additionsLast30Days)} />
                                        <StatLine label="Deleted 30d" value={formatNum(git.deletionsLast30Days)} />
                                        <StatLine
                                            label="Net 30d"
                                            value={formatNum(
                                                git.additionsLast30Days - git.deletionsLast30Days,
                                            )}
                                        />
                                        <StatLine
                                            label="Churn 30d"
                                            value={formatNum(
                                                git.additionsLast30Days + git.deletionsLast30Days,
                                            )}
                                        />
                                        <StatLine
                                            label="Files touched 30d"
                                            value={formatNum(git.filesTouchedLast30Days)}
                                        />
                                        <StatLine
                                            label="Lines / commit (30d)"
                                            value={ratio(
                                                git.additionsLast30Days + git.deletionsLast30Days,
                                                git.commitsLast30Days,
                                            )}
                                        />
                                    </div>
                                )}
                            </div>

                            <div>
                                <SectionTitle id="stats-authors" title="Authors" />
                                {!git?.isRepo ? (
                                    <p className="text-sm text-text-muted">—</p>
                                ) : (
                                    <div className="divide-y divide-border-subtle/60">
                                        <StatLine label="Contributors" value={formatNum(git.contributors)} />
                                        <StatLine label="Top author" value={git.topAuthor ?? "—"} />
                                        <StatLine
                                            label="Top author commits"
                                            value={formatNum(git.topAuthorCommits)}
                                        />
                                        <StatLine
                                            label="Top author share"
                                            value={formatPct(
                                                git.commits > 0
                                                    ? git.topAuthorCommits / git.commits
                                                    : 0,
                                            )}
                                        />
                                        <StatLine
                                            label="Commits / contributor"
                                            value={ratio(git.commits, git.contributors)}
                                        />
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </section>
        </div>
    );
}
