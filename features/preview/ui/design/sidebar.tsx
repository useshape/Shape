"use client";

import { RiFileTextLine } from "@remixicon/react";
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll";
import { cn } from "@/lib/utils";
import {
    discoverDesignPages,
    mergeLiveDesignPages,
    type DesignPage,
} from "@/features/preview/lib/discover-routes";
import {
    getProjectWarmSnapshot,
    warmProjectAnalysis,
} from "@/features/preview/lib/project-warm";
import { DesignLayersPanel } from "@/features/preview/ui/design/layers";
import { SidebarPanelHeaderFrame } from "@/features/panels/ui/sidebar-panel-header";

/**
 * Left chrome: Pages list + Layers tree (Theme moved to right Styles section).
 */
export function DesignSidebar({
    projectPath,
    activePath,
    liveViews,
    onSelectPage,
    onSelectLayer,
    projectName,
    className,
}: {
    projectPath: string | null;
    activePath: string;
    liveViews?: Array<{ label?: string; path?: string }>;
    onSelectPage: (page: DesignPage) => void;
    onSelectLayer: (id: string) => void;
    projectName?: string;
    className?: string;
}) {
    const [filePages, setFilePages] = useState<DesignPage[]>([]);
    const [loadingPages, setLoadingPages] = useState(false);

    useEffect(() => {
        if (!projectPath) {
            setFilePages([{ path: "/", label: "Home", kind: "static" }]);
            return;
        }
        let cancelled = false;
        setLoadingPages(true);
        const warm = getProjectWarmSnapshot();
        const same =
            warm
            && warm.path.replace(/\\/g, "/").toLowerCase()
                === projectPath.replace(/\\/g, "/").toLowerCase();
        if (same && warm.pages.length) {
            setFilePages(warm.pages);
            setLoadingPages(false);
        }
        void (async () => {
            try {
                const list = await discoverDesignPages(projectPath);
                if (!cancelled && list.length) {
                    setFilePages(list);
                    return;
                }
                if (same && warm?.pages?.length && !cancelled) {
                    setFilePages(warm.pages);
                    return;
                }
                const snap = same ? warm : await warmProjectAnalysis(projectPath);
                if (!cancelled && snap?.pages?.length) setFilePages(snap.pages);
            } catch {
                if (!cancelled) {
                    setFilePages([{ path: "/", label: "Home", kind: "static" }]);
                }
            } finally {
                if (!cancelled) setLoadingPages(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [projectPath]);

    const title = useMemo(() => {
        if (projectName) return projectName;
        if (!projectPath) return "Design";
        const parts = projectPath.replace(/\\/g, "/").split("/");
        return parts[parts.length - 1] || "Design";
    }, [projectName, projectPath]);

    const pages = useMemo(
        () => mergeLiveDesignPages(filePages, liveViews ?? []),
        [filePages, liveViews],
    );

    return (
        <aside
            className={cn(
                "flex h-full w-full shrink-0 flex-col border-r border-border-subtle bg-panel text-sm text-text-primary",
                className,
            )}
        >
            <SidebarPanelHeaderFrame title={title} />

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <CollapsibleSection
                    title="Pages"
                    defaultOpen
                    storageKey="design-mode-pages"
                    headerActions={
                        <span className="tabular-nums text-xs text-text-muted">
                            {loadingPages ? "…" : pages.length}
                        </span>
                    }
                >
                    <ScrollArea className="max-h-52" fadeFrom="from-panel">
                        <div className="px-1 pb-1.5">
                            {pages.map((page) => {
                                const active = pathsMatch(activePath, page.path);
                                return (
                                    <button
                                        key={page.path}
                                        type="button"
                                        onClick={() => onSelectPage(page)}
                                        className={cn(
                                            "flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-sm",
                                            active
                                                ? "bg-panel-active text-text-primary"
                                                : "text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                                        )}
                                        title={page.source ?? page.path}
                                    >
                                        <Icon
                                            icon={RiFileTextLine}
                                            className="shrink-0 text-text-muted"
                                        />
                                        <span className="min-w-0 flex-1 truncate">{page.label}</span>
                                        {page.kind === "view" ? (
                                            <span className="shrink-0 text-xs text-text-muted">view</span>
                                        ) : page.path !== "/" ? (
                                            <span className="max-w-16 shrink-0 truncate text-xs text-text-muted">
                                                {page.path}
                                            </span>
                                        ) : null}
                                    </button>
                                );
                            })}
                            {!loadingPages && pages.length === 0 ? (
                                <p className="px-2 py-2 text-sm text-text-muted">No routes found.</p>
                            ) : null}
                        </div>
                    </ScrollArea>
                </CollapsibleSection>

                <CollapsibleSection
                    title="Layers"
                    defaultOpen
                    isFlex
                    storageKey="design-mode-layers"
                >
                    <DesignLayersPanel onSelectId={onSelectLayer} treeOnly />
                </CollapsibleSection>
            </div>
        </aside>
    );
}

function pathsMatch(current: string, pagePath: string): boolean {
    return normalizePath(current) === normalizePath(pagePath);
}

function normalizePath(p: string): string {
    if (!p) return "/";
    if (p.startsWith("view:")) return p.toLowerCase();
    try {
        if (p.includes("://")) p = new URL(p).pathname;
    } catch {
        /* ignore */
    }
    let s = p.split("?")[0]?.split("#")[0] ?? "/";
    if (!s.startsWith("/")) s = `/${s}`;
    if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
    return s || "/";
}
