"use client";

import { RiCloseLine, RiFileTextLine } from "@remixicon/react";
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
    SidebarPanelActionButton,
    SidebarPanelHeaderFrame,
} from "@/features/panels/ui/sidebar-panel-header";
import { ensureGlobalsCssLoaded } from "@/lib/css-variables-loader";
import {
    CSS_VARIABLE_SECTION_LABELS,
    CSS_VARIABLE_SECTION_ORDER,
    formatVariableDisplayName,
    getProjectColorVariables,
    parseCssVariables,
    type CssVariable,
} from "@/lib/css-variables";
import { cssColorToHex, isTransparentColor } from "../../design-mode/css";

type LeftTab = "design" | "theme";

/**
 * Left chrome: Design | Theme, Pages list, Layers tree.
 */
export function DesignSidebar({
    projectPath,
    activePath,
    liveViews,
    onSelectPage,
    onSelectLayer,
    onExit,
    projectName,
}: {
    projectPath: string | null;
    activePath: string;
    liveViews?: Array<{ label?: string; path?: string }>;
    onSelectPage: (page: DesignPage) => void;
    onSelectLayer: (id: string) => void;
    onExit: () => void;
    projectName?: string;
}) {
    const [tab, setTab] = useState<LeftTab>("design");
    const [filePages, setFilePages] = useState<DesignPage[]>([]);
    const [loadingPages, setLoadingPages] = useState(false);
    const [tokens, setTokens] = useState<CssVariable[]>([]);
    const [tokensLoading, setTokensLoading] = useState(false);
    const [tokensError, setTokensError] = useState<string | null>(null);

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

    useEffect(() => {
        if (tab !== "theme" || !projectPath) return;
        let cancelled = false;
        setTokensLoading(true);
        setTokensError(null);
        void (async () => {
            try {
                const content = await ensureGlobalsCssLoaded(projectPath);
                if (cancelled) return;
                if (!content.trim()) {
                    setTokens([]);
                    setTokensError("No globals.css (or theme CSS) with variables found.");
                    return;
                }
                const colors = getProjectColorVariables(content);
                const all = parseCssVariables(content);
                setTokens(colors.length ? colors : all.slice(0, 48));
            } catch (e) {
                if (!cancelled) {
                    setTokens([]);
                    setTokensError(e instanceof Error ? e.message : "Could not load theme tokens.");
                }
            } finally {
                if (!cancelled) setTokensLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [tab, projectPath]);

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

    const tokenGroups = useMemo(() => {
        const map = new Map<string, CssVariable[]>();
        for (const section of CSS_VARIABLE_SECTION_ORDER) map.set(section, []);
        for (const t of tokens) {
            const list = map.get(t.section) ?? map.get("other")!;
            list.push(t);
        }
        return CSS_VARIABLE_SECTION_ORDER.map((section) => ({
            section,
            label: CSS_VARIABLE_SECTION_LABELS[section],
            items: map.get(section) ?? [],
        })).filter((g) => g.items.length > 0);
    }, [tokens]);

    return (
        <aside className="flex h-full w-90 shrink-0 flex-col border-r border-border-subtle bg-panel text-sm text-text-primary">
            <SidebarPanelHeaderFrame
                title={title}
                actions={
                    <SidebarPanelActionButton aria-label="Exit Design Mode" onClick={onExit}>
                        <Icon icon={RiCloseLine} />
                    </SidebarPanelActionButton>
                }
            />

            <div className="shrink-0 px-2 py-1.5">
                <Tabs value={tab} onValueChange={(value) => setTab(value as LeftTab)}>
                    <TabsList className="w-full">
                        <TabsTrigger value="design" className="flex-1">Design</TabsTrigger>
                        <TabsTrigger value="theme" className="flex-1">Theme</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {tab === "design" ? (
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
            ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex h-chrome shrink-0 items-center px-3 text-sm text-text-secondary">
                        Theme tokens
                    </div>
                    <ScrollArea className="min-h-0 flex-1" fadeFrom="from-panel">
                        <div className="px-2 pb-3">
                            {tokensLoading ? (
                                <p className="px-1 py-2 text-sm text-text-muted">Loading tokens…</p>
                            ) : tokensError ? (
                                <p className="px-1 py-2 text-sm leading-relaxed text-text-muted">{tokensError}</p>
                            ) : tokenGroups.length === 0 ? (
                                <p className="px-1 py-2 text-sm leading-relaxed text-text-muted">
                                    No CSS variables found in this project&apos;s globals / theme CSS.
                                </p>
                            ) : (
                                tokenGroups.map((group) => (
                                    <CollapsibleSection
                                        key={group.section}
                                        title={group.label}
                                        defaultOpen
                                    >
                                        <div className="flex flex-col gap-0.5 px-1 pb-2">
                                            {group.items.map((token) => {
                                                const isColor =
                                                    token.kind === "color"
                                                    && !isTransparentColor(token.value)
                                                    && !token.value.trim().startsWith("var(");
                                                const swatch = isColor
                                                    ? cssColorToHex(token.value) || token.value
                                                    : null;
                                                return (
                                                    <div
                                                        key={token.name}
                                                        className="flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-panel-hover"
                                                        title={`${token.name}: ${token.value}`}
                                                    >
                                                        {swatch ? (
                                                            <span
                                                                className="size-3.5 shrink-0 rounded-md border border-border-subtle"
                                                                style={{ background: token.value }}
                                                            />
                                                        ) : (
                                                            <span className="flex size-3.5 shrink-0 items-center justify-center rounded-md border border-border-subtle text-2xs text-text-muted">
                                                                --
                                                            </span>
                                                        )}
                                                        <div className="min-w-0 flex-1">
                                                            <div className="truncate text-sm text-text-secondary">
                                                                {formatVariableDisplayName(token.name)}
                                                            </div>
                                                            <div className="truncate text-xs text-text-muted">
                                                                {token.value}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </CollapsibleSection>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </div>
            )}
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
