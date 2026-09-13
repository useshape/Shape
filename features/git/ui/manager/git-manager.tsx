"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { listen } from "@tauri-apps/api/event";
import { ShapeLogo } from "@/components/ui/shape-logo";
import { SearchInput } from "@/components/ui/search";
import { cn } from "@/lib/utils";
import { commands, useProjectState } from "@/lib/backend";
import type { GitSectionId } from "@/features/git/types";
import Source from "@/features/git/ui/source/source";
import { BranchWindow } from "@/features/git/ui/branches/panel";
import { GraphTab } from "@/features/agent/workspace/graph-tab";
import { useFilter, coerceGitSection, persistGitSection, readStoredGitSection } from "./filter-context";
import { GitPageChrome } from "./chrome";
import { useGitRepos } from "@/lib/git/repos";
import { LoadingBar } from "@/components/ui/loading";
import { useLoading } from "@/features/loading/context";
import { CollapsibleNavGroup, NavLeafButton } from "@/components/ui/collapsible-nav";
import {
    GitListSkeleton,
    GitManagerShellSkeleton,
    Skeleton,
} from "@/features/git/ui/shared/skeletons";
import { HostedSidebarBack } from "@/features/agent/sidebar/hosted-nav";

export type { GitSectionId } from "@/features/git/types";

const GitEmbedCtx = createContext<{
    navPortalTarget?: HTMLElement | null;
    sidebarExpanded?: boolean;
    onClose?: () => void;
}>({});

type NavLeaf = { id: GitSectionId; label: string; keywords?: string[] };
type NavGroup = { id: string; label: string; children: NavLeaf[] };

const NAV: NavGroup[] = [
    {
        id: "local",
        label: "Local",
        children: [
            { id: "source", label: "Source Control", keywords: ["scm", "changes", "commit"] },
            { id: "graph", label: "Git Graph", keywords: ["history", "commits"] },
            { id: "branches", label: "Branches" },
        ],
    },
];

const ALL_SECTION_IDS = NAV.flatMap((g) => g.children.map((c) => c.id));

function isSection(value: string | null | undefined): value is GitSectionId {
    const mapped = coerceGitSection(value);
    return !!mapped && ALL_SECTION_IDS.includes(mapped);
}

function initialSection(pathname: string | null, query: string | null): GitSectionId {
    const fromQuery = coerceGitSection(query);
    if (fromQuery && ALL_SECTION_IDS.includes(fromQuery)) return fromQuery;
    const stored = readStoredGitSection();
    if (stored && ALL_SECTION_IDS.includes(stored)) return stored;
    if (pathname?.startsWith("/branch")) return "branches";
    return "source";
}

type GitEmptyReason = "no-project" | "no-repo" | "no-commits";

const INTRO_SEEN_KEY = "shape-git-manager-intro-seen";

function GitManagerIntro({ children }: { children: React.ReactNode }) {
    // Always start false so SSR + first paint match; skip splash after mount if already seen.
    const [ready, setReady] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let t1: number | undefined;
        let t2: number | undefined;

        try {
            if (sessionStorage.getItem(INTRO_SEEN_KEY) === "1") {
                setReady(true);
                return;
            }
        } catch {
            /* ignore */
        }

        const fadeIn = requestAnimationFrame(() => {
            if (!cancelled) setVisible(true);
        });

        t1 = window.setTimeout(() => {
            if (cancelled) return;
            setVisible(false);
            t2 = window.setTimeout(() => {
                if (cancelled) return;
                try {
                    sessionStorage.setItem(INTRO_SEEN_KEY, "1");
                } catch {
                    /* ignore */
                }
                setReady(true);
            }, 450);
        }, 1200);

        return () => {
            cancelled = true;
            cancelAnimationFrame(fadeIn);
            if (t1 !== undefined) window.clearTimeout(t1);
            if (t2 !== undefined) window.clearTimeout(t2);
        };
    }, []);

    if (!ready) {
        return (
            <div className="flex h-full items-center justify-center bg-background">
                <Image
                    src="/logos/logo.svg"
                    alt="Shape"
                    width={46}
                    height={56}
                    priority
                    style={{ width: 46, height: "auto" }}
                    className={cn(
                        "logo-invert transition-opacity duration-500 ease-out",
                        visible ? "opacity-100" : "opacity-0",
                    )}
                />
            </div>
        );
    }

    return <>{children}</>;
}

function GitManagerEmpty({ reason }: { reason: GitEmptyReason }) {
    const detail =
        reason === "no-project"
            ? "Open a project in Shape to use Git Manager."
            : reason === "no-repo"
              ? "This folder is not a Git repository yet."
              : "This repository has no commits yet.";

    return (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-panel px-6 text-center">
            <ShapeLogo size={32} />
            <div>
                <p className="text-base font-medium text-text-primary">Project is empty</p>
                <p className="mt-1 text-sm text-text-muted">{detail}</p>
            </div>
        </div>
    );
}

/** Content-only skeleton — nav lives in the agent sidebar when embedded. */
function GitContentSkeleton() {
    return (
        <div
            className="h-full min-h-0 w-full overflow-hidden bg-panel p-3"
            aria-busy
            aria-label="Loading Git Manager"
        >
            <Skeleton className="mb-3 h-9 w-48" />
            <GitListSkeleton rows={10} />
        </div>
    );
}

/** Minimal Back control while Git is loading / empty — still uses the agent sidebar slot. */
function GitEmbedNavChrome() {
    const { navPortalTarget, sidebarExpanded = true, onClose } = useContext(GitEmbedCtx);
    if (!navPortalTarget || !onClose) return null;
    const collapsed = !sidebarExpanded;
    return createPortal(
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <HostedSidebarBack
                label="Back to app"
                onBack={onClose}
                collapsed={collapsed}
            />
        </div>,
        navPortalTarget,
    );
}

function GitManagerGate() {
    const { project_path } = useProjectState();
    const { repos, activeRepoPath, loading } = useGitRepos(project_path);
    const { navPortalTarget } = useContext(GitEmbedCtx);
    const [emptyReason, setEmptyReason] = useState<GitEmptyReason | null>(null);
    const [checking, setChecking] = useState(true);
    const [refreshToken, setRefreshToken] = useState(0);

    const repoPath = activeRepoPath ?? repos[0]?.path ?? null;
    const embedded = Boolean(navPortalTarget);

    useEffect(() => {
        const onRefresh = () => setRefreshToken((n) => n + 1);
        window.addEventListener("shape-git-refresh", onRefresh);
        return () => window.removeEventListener("shape-git-refresh", onRefresh);
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function check() {
            if (!project_path) {
                if (!cancelled) {
                    setEmptyReason("no-project");
                    setChecking(false);
                }
                return;
            }
            if (loading) {
                if (!cancelled) {
                    setChecking(true);
                    setEmptyReason(null);
                }
                return;
            }
            if (!repoPath) {
                if (!cancelled) {
                    setEmptyReason("no-repo");
                    setChecking(false);
                }
                return;
            }

            // Show the shell immediately once we have a repo — don't wait on log I/O.
            if (!cancelled) {
                setEmptyReason(null);
                setChecking(false);
            }

            try {
                // One cheap `git log -1` — avoid starting a full unbounded stream just to probe.
                const logs = await commands.gitLog(repoPath, 1);
                if (!cancelled && logs.length === 0) {
                    setEmptyReason("no-commits");
                }
            } catch {
                if (!cancelled) setEmptyReason("no-repo");
            }
        }

        void check();
        return () => {
            cancelled = true;
        };
    }, [project_path, loading, repoPath, refreshToken]);

    if (emptyReason) {
        return (
            <>
                {embedded ? <GitEmbedNavChrome /> : null}
                <GitManagerEmpty reason={emptyReason} />
            </>
        );
    }

    if (checking || loading || !project_path) {
        return (
            <>
                {embedded ? <GitEmbedNavChrome /> : null}
                {embedded ? <GitContentSkeleton /> : <GitManagerShellSkeleton />}
            </>
        );
    }

    return <ManagerShell key={project_path} />;
}

function ManagerShell() {
    const search = useSearchParams();
    const pathname = usePathname();
    const { project_path } = useProjectState();
    const { section, setSection } = useFilter();
    const { resetLoading } = useLoading();
    const { navPortalTarget, sidebarExpanded = true, onClose } = useContext(GitEmbedCtx);
    const [query, setQuery] = useState("");
    const [activeLeafId, setActiveLeafId] = useState<string>(() => section);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
        () => new Set(NAV.map((g) => g.id)),
    );
    // Mount each heavy local pane once, then keep it alive while switching.
    const [visited, setVisited] = useState<Set<string>>(() => new Set([section]));

    useEffect(() => {
        setVisited((prev) => {
            if (prev.has(section)) return prev;
            const next = new Set(prev);
            next.add(section);
            return next;
        });
    }, [section]);

    // Clear any leaked global loading starts when leaving Git Manager.
    useEffect(() => () => resetLoading(), [resetLoading]);

    // Sync once from URL / storage on mount; avoid resetting to Source on reload.
    useEffect(() => {
        const next = initialSection(pathname, search.get("section"));
        setSection(next);
        setActiveLeafId(next);
        persistGitSection(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
    }, []);

    useEffect(() => {
        setActiveLeafId(section);
    }, [section]);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        void listen<{ section?: string }>("shape-git-section", (event) => {
            const next = coerceGitSection(event.payload?.section);
            if (next && ALL_SECTION_IDS.includes(next)) {
                setSection(next);
                setActiveLeafId(next);
            }
        }).then((fn) => {
            unlisten = fn;
        });
        const onWindow = (e: Event) => {
            const next = coerceGitSection(
                (e as CustomEvent<{ section?: string }>).detail?.section,
            );
            if (next && ALL_SECTION_IDS.includes(next)) {
                setSection(next);
                setActiveLeafId(next);
            }
        };
        window.addEventListener("shape-git-section", onWindow as EventListener);
        return () => {
            unlisten?.();
            window.removeEventListener("shape-git-section", onWindow as EventListener);
        };
    }, [setSection]);

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

    const toggleGroup = (id: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const select = useCallback(
        (id: GitSectionId) => {
            setActiveLeafId(id);
            setSection(id);
        },
        [setSection],
    );

    const collapsed = Boolean(navPortalTarget) && !sidebarExpanded;

    return (
        <div
            className={cn(
                "relative flex h-full w-full min-w-0 flex-col overflow-hidden select-none text-text-primary",
                navPortalTarget ? "bg-panel" : "bg-background",
            )}
        >
            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                {(() => {
                    const nav = (
                        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
                            {onClose ? (
                                <HostedSidebarBack
                                    label="Back to app"
                                    onBack={onClose}
                                    collapsed={collapsed}
                                />
                            ) : null}
                            {collapsed ? null : (
                                <>
                                    <div className="shrink-0 px-2 pb-2">
                                        <SearchInput
                                            placeholder="Search git"
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                            className="h-9 w-full rounded-full border border-border-subtle bg-input-bg px-3"
                                        />
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
                                                            active={activeLeafId === leaf.id || section === leaf.id}
                                                            onClick={() => select(leaf.id)}
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
                                </>
                            )}
                        </div>
                    );
                    if (navPortalTarget) return createPortal(nav, navPortalTarget);
                    return (
                        <aside className="flex w-64 shrink-0 flex-col overflow-hidden bg-background">
                            {nav}
                        </aside>
                    );
                })()}

                <section className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-panel">
                    <GitPageChrome />
                    {/* Keep-alive panes use `hidden` (not `invisible`) so Monaco/diff
                        overlays cannot paint over other sections when inactive. */}
                    {visited.has("source") ? (
                        <div
                            className={cn(
                                "absolute inset-0 min-h-0 min-w-0",
                                section === "source" ? "z-10" : "hidden",
                            )}
                            aria-hidden={section !== "source"}
                        >
                            <Source embedded active={section === "source"} />
                        </div>
                    ) : null}
                    {visited.has("graph") ? (
                        <div
                            className={cn(
                                "absolute inset-0 min-h-0 min-w-0",
                                section === "graph" ? "z-10" : "hidden",
                            )}
                            aria-hidden={section !== "graph"}
                        >
                            <GraphTab projectPath={project_path || ""} />
                        </div>
                    ) : null}
                    {visited.has("branches") ? (
                        <div
                            className={cn(
                                "absolute inset-0 min-h-0 min-w-0",
                                section === "branches" ? "z-10" : "hidden",
                            )}
                            aria-hidden={section !== "branches"}
                        >
                            <BranchWindow active={section === "branches"} />
                        </div>
                    ) : null}
                </section>
            </div>
            <LoadingBar className="absolute inset-x-0 bottom-0 z-50 pointer-events-none" />
        </div>
    );
}

export function GitManager({
    embedded = false,
    navPortalTarget,
    sidebarExpanded = true,
    onClose,
}: {
    embedded?: boolean;
    navPortalTarget?: HTMLElement | null;
    sidebarExpanded?: boolean;
    onClose?: () => void;
}) {
    const body = embedded ? (
        <GitManagerGate />
    ) : (
        <GitManagerIntro>
            <GitManagerGate />
        </GitManagerIntro>
    );
    return (
        <GitEmbedCtx.Provider value={{ navPortalTarget, sidebarExpanded, onClose }}>
            {body}
        </GitEmbedCtx.Provider>
    );
}

export { GitManagerTrigger } from "./git-manager-trigger";
