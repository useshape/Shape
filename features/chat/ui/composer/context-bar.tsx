"use client";

import { RiCheckLine, RiFolderLine, RiFolder5Fill } from "@remixicon/react";
import { useEffect, useMemo, useState } from "react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useProjectState } from "@/lib/backend";
import {
    getRepoName,
    loadRepoHistory,
    type RepoHistoryEntry,
} from "@/lib/repo-history";
import { SearchInput } from "@/components/ui/search";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown";

/** Repo picker above the composer. Branch switching lives in the right panel. */
export function ComposerContextBar({
    className,
    compact = false,
}: {
    className?: string;
    compact?: boolean;
}) {
    const { project_path } = useProjectState();
    const [recents, setRecents] = useState<RepoHistoryEntry[]>([]);
    const [repoQuery, setRepoQuery] = useState("");

    useEffect(() => {
        setRecents(loadRepoHistory().slice(0, 20));
        const sync = () => setRecents(loadRepoHistory().slice(0, 20));
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

    const repoLabel = project_path ? getRepoName(project_path) : "Open repo";

    const chip = compact
        ? "inline-flex max-w-[70%] items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-text-secondary hover:text-text-primary"
        : "inline-flex max-w-[80%] items-center gap-1.5 rounded-md px-2 py-1 text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary";

    return (
        <div className={cn("flex min-w-0 items-center justify-start gap-2 overflow-hidden whitespace-nowrap", !compact && "w-full px-1", className)}>
            <DropdownMenu
                onOpenChange={(open) => {
                    if (!open) setRepoQuery("");
                }}
            >
                <DropdownMenuTrigger asChild>
                    <button type="button" className={chip}>
                        <Icon icon={RiFolderLine} className="shrink-0 text-text-muted" />
                        <span className="truncate">{repoLabel}</span>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72 p-0!">
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
                            <Icon icon={RiFolder5Fill} size={ICON_SIZE_SM} className="shrink-0 text-text-primary!" />
                            <span className="min-w-0 flex-1 truncate text-sm text-text-primary!">
                                {getRepoName(r.path)}
                            </span>
                            {project_path === r.path ? (
                                <Icon icon={RiCheckLine} className="shrink-0" />
                            ) : null}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={() => window.dispatchEvent(new Event("open-folder-request"))}
                        className="gap-2 pb-2! pl-2.5"
                    >
                        <span className="text-md text-text-muted!">Open Explorer</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
