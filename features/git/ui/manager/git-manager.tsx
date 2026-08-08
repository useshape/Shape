"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { listen } from "@tauri-apps/api/event";
import { ShapeLogo } from "@/components/ui/shape-logo";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { commands, useProjectState } from "@/lib/backend";
import type { GitSectionId } from "@/features/git/types";
import Source from "@/features/git/ui/source/source";
import Graph from "@/features/git/ui/graph/graph";
import { BranchWindow } from "@/features/git/ui/branches/panel";
import { LocalTags } from "@/features/git/ui/tags/panel";
import { GitHubSection } from "@/features/git/ui/github/section";
import { ReleasesPage } from "@/features/git/ui/github/releases-page";
import { ActionsConsole, isActionsSection } from "@/features/git/ui/actions/console";
import { useFilter, isGitSectionId, persistGitSection, readStoredGitSection } from "./filter-context";
import { useGitRepos } from "@/lib/git/repos";
import { LoadingBar } from "@/components/ui/loading";
import { useLoading } from "@/features/loading/context";
import { CollapsibleNavGroup, NavLeafButton } from "@/components/ui/collapsible-nav";
import { GitManagerShellSkeleton } from "@/features/git/ui/shared/skeletons";

export type { GitSectionId } from "@/features/git/types";

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
            { id: "tags", label: "Tags" },
        ],
    },
    {
        id: "github",
        label: "GitHub",
        children: [
            { id: "issues", label: "Issues" },
            { id: "pull-requests", label: "Pull requests", keywords: ["pr"] },
            { id: "releases", label: "Releases" },
        ],
    },
    {
        id: "actions",
        label: "Actions",
        children: [
            { id: "workflow-runs", label: "Workflow runs", keywords: ["ci", "cd"] },
            { id: "workflow-definitions", label: "Workflow definitions" },
            { id: "jobs", label: "Jobs" },
            { id: "steps", label: "Individual steps" },
            { id: "live-status", label: "Live status" },
            { id: "logs", label: "Logs" },
            { id: "artifacts", label: "Artifacts" },
        ],
    },
    {
        id: "checks",
        label: "Checks",
        children: [
            { id: "check-runs", label: "Check runs" },
            { id: "check-suites", label: "Check suites" },
            { id: "commit-statuses", label: "Commit statuses" },
        ],
    },
    {
        id: "deploy",
        label: "Deploy",
        children: [
            { id: "deployments", label: "Deployments" },
            { id: "deployment-statuses", label: "Deployment statuses" },
        ],
    },
];

const ALL_SECTION_IDS = NAV.flatMap((g) => g.children.map((c) => c.id));

function isSection(value: string | null | undefined): value is GitSectionId {
    return isGitSectionId(value) && ALL_SECTION_IDS.includes(value);
}

function initialSection(pathname: string | null, query: string | null): GitSectionId {
    if (isSection(query)) return query;
    const stored = readStoredGitSection();
    if (stored && isSection(stored)) return stored;
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
            <div className="flex h-full items-center justify-center bg-editor">
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
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-editor px-6 text-center">
            <ShapeLogo size={32} />
            <div>
                <p className="text-base font-medium text-text-primary">Project is empty</p>
                <p className="mt-1 text-sm text-text-muted">{detail}</p>
            </div>
        </div>
    );
}

function GitManagerGate() {
    const { project_path } = useProjectState();
    const { repos, activeRepoPath, loading } = useGitRepos(project_path);
    const [emptyReason, setEmptyReason] = useState<GitEmptyReason | null>(null);
    const [checking, setChecking] = useState(true);
    const [refreshToken, setRefreshToken] = useState(0);

    const repoPath = activeRepoPath ?? repos[0]?.path ?? null;

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
        return <GitManagerEmpty reason={emptyReason} />;
    }

    if (checking || loading || !project_path) {
        return <GitManagerShellSkeleton />;
    }

    return <ManagerShell key={project_path} />;
}

function ManagerShell() {
    const search = useSearchParams();
    const pathname = usePathname();
    const { section, setSection } = useFilter();
    const { resetLoading } = useLoading();
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
            if (isSection(event.payload?.section)) {
                setSection(event.payload.section);
                setActiveLeafId(event.payload.section);
            }
        }).then((fn) => {
            unlisten = fn;
        });
        return () => unlisten?.();
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

    return (
        <div className="relative flex h-full w-full min-w-0 flex-col overflow-hidden select-none bg-background text-text-primary">
            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                <aside className="flex w-64 shrink-0 flex-col bg-background">
                    <div className="p-2">
                        <div className="flex h-9 items-center rounded-lg border border-border bg-transparent px-3">
                            <Icon name="search" size={14} className="shrink-0 text-text-muted" />
                            <Input
                                placeholder="Search git"
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
                </aside>

                <section className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-tr-xl bg-panel">
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
                            <Graph surface="editor" rich active={section === "graph"} />
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
                    {visited.has("tags") ? (
                        <div
                            className={cn(
                                "absolute inset-0 min-h-0 min-w-0",
                                section === "tags" ? "z-10" : "hidden",
                            )}
                            aria-hidden={section !== "tags"}
                        >
                            <LocalTags />
                        </div>
                    ) : null}
                    {isActionsSection(section) ? (
                        <div
                            key={`actions-${section}`}
                            className="absolute inset-0 z-10 min-h-0 min-w-0"
                        >
                            <ActionsConsole focus={section} />
                        </div>
                    ) : null}
                    {section === "releases" ? (
                        <div
                            key="releases"
                            className="absolute inset-0 z-10 min-h-0 min-w-0"
                        >
                            <ReleasesPage />
                        </div>
                    ) : null}
                    {!isActionsSection(section) &&
                    section !== "source" &&
                    section !== "graph" &&
                    section !== "branches" &&
                    section !== "tags" &&
                    section !== "releases" ? (
                        <div
                            key={section}
                            className="absolute inset-0 z-10 min-h-0 min-w-0"
                        >
                            <GitHubSection section={section} />
                        </div>
                    ) : null}
                </section>
            </div>
            <LoadingBar className="absolute inset-x-0 bottom-0 z-50 pointer-events-none" />
        </div>
    );
}

export function GitManager() {
    return (
        <GitManagerIntro>
            <GitManagerGate />
        </GitManagerIntro>
    );
}

export { GitManagerTrigger } from "./git-manager-trigger";
