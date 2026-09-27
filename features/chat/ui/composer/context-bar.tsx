"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useProjectState } from "@/lib/backend";
import {
    getRepoName,
    loadRepoHistory,
    MAX_REPO_DROPDOWN_ITEMS,
    type RepoHistoryEntry,
} from "@/lib/workspace/repo-history";
import { SearchInput } from "@/components/ui/search";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown";
import { WorkspaceBranchSwitch } from "@/features/agent/workspace/branch-switch";

/** Recent-repo picker used by the empty-state heading. */
export function ComposerRepoMenu({
    children,
    align = "start",
}: {
    children: React.ReactNode;
    align?: "start" | "center" | "end";
}) {
    const { project_path } = useProjectState();
    const [recents, setRecents] = useState<RepoHistoryEntry[]>([]);
    const [repoQuery, setRepoQuery] = useState("");

    useEffect(() => {
        const sync = () => {
            const all = loadRepoHistory()
                .slice()
                .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
                .slice(0, MAX_REPO_DROPDOWN_ITEMS);
            setRecents(all);
        };
        sync();
        window.addEventListener("shape-repo-history-changed", sync);
        return () => window.removeEventListener("shape-repo-history-changed", sync);
    }, []);

    const filteredRepos = useMemo(() => {
        const q = repoQuery.trim().toLowerCase();
        if (!q) return recents;
        return recents.filter(
            (r) =>
                getRepoName(r.path).toLowerCase().includes(q) ||
                r.path.toLowerCase().includes(q),
        );
    }, [recents, repoQuery]);

    return (
        <DropdownMenu
            onOpenChange={(open) => {
                if (!open) setRepoQuery("");
            }}
        >
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            <DropdownMenuContent align={align} className="w-72 p-0!">
                <SearchInput
                    borderless
                    value={repoQuery}
                    onChange={(e) => setRepoQuery(e.target.value)}
                    placeholder="Search repos"
                    autoFocus
                />
                <DropdownMenuLabel className="px-2 py-1 text-sm text-text-muted">
                    Recents
                </DropdownMenuLabel>
                {filteredRepos.map((r) => (
                    <DropdownMenuItem
                        key={r.path}
                        onClick={() => {
                            window.dispatchEvent(
                                new CustomEvent("shape-open-project", {
                                    detail: { path: r.path },
                                }),
                            );
                        }}
                        className="gap-2"
                    >
                        <Icon icon={"folder"} size={ICON_SIZE_SM} className="shrink-0 text-text-primary!" />
                        <span className="min-w-0 flex-1 truncate text-sm text-text-primary!">
                            {getRepoName(r.path)}
                        </span>
                        {project_path === r.path ? (
                            <Icon icon={"check"} className="shrink-0" size={ICON_SIZE_SM} />
                        ) : null}
                    </DropdownMenuItem>
                ))}
                {filteredRepos.length === 0 ? (
                    <div className="px-2 py-3 text-center text-xs text-text-muted">No recent folders</div>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() => window.dispatchEvent(new Event("shape-open-project-pick"))}
                    className="gap-2 pb-2! pl-2.5"
                >
                    <span className="text-md text-text-muted!">Open Explorer</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/** Branch next to the composer (repo lives on the empty-state heading). */
export function ComposerContextBar({
    className,
    compact = false,
}: {
    className?: string;
    compact?: boolean;
}) {
    return (
        <div className={cn("flex min-w-0 items-center justify-start gap-1 overflow-hidden whitespace-nowrap", !compact && "w-full px-1", className)}>
            <WorkspaceBranchSwitch />
        </div>
    );
}
