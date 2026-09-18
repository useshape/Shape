"use client";

import { RiCheckLine, RiFolder5Fill, RiHardDrive3Line, RiSunCloudyFill } from "@remixicon/react";
import { useEffect, useMemo, useState } from "react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useProjectState } from "@/lib/backend";
import {
    getRepoName,
    loadRepoHistory,
    MAX_REPO_DROPDOWN_ITEMS,
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
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { WorkspaceBranchSwitch } from "@/features/agent/workspace/branch-switch";

function chipClass(compact: boolean) {
    return compact
        ? "inline-flex max-w-36 items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-text-secondary hover:text-text-primary"
        : "inline-flex max-w-40 items-center gap-1.5 rounded-md px-2 py-1 text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary";
}

/** Local/cloud runtime chip — sits next to usage on the composer bar. */
export function ComposerRuntimeSelect({
    compact = false,
    className,
}: {
    compact?: boolean;
    className?: string;
}) {
    const [runtime, setRuntime] = useState<"local" | "cloud">("local");
    const [cloudSoonOpen, setCloudSoonOpen] = useState(false);
    const chip = chipClass(compact);

    return (
        <div className={cn("flex shrink-0 items-center", className)}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button type="button" className={chip}>
                        <Icon
                            icon={runtime === "cloud" ? RiSunCloudyFill : RiHardDrive3Line}
                            size={ICON_SIZE_SM}
                            className="shrink-0 text-text-muted"
                        />
                        <span className="truncate">{runtime === "cloud" ? "Cloud" : "Local"}</span>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                        className="gap-2"
                        onClick={() => setRuntime("local")}
                    >
                        <Icon icon={RiHardDrive3Line} size={ICON_SIZE_SM} className="shrink-0 text-text-muted" />
                        <span className="flex-1">Local</span>
                        {runtime === "local" ? <Icon icon={RiCheckLine} className="shrink-0" /> : null}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="gap-2"
                        onClick={() => {
                            setCloudSoonOpen(true);
                        }}
                    >
                        <Icon icon={RiSunCloudyFill} size={ICON_SIZE_SM} className="shrink-0 text-text-muted" />
                        <span className="flex-1">Cloud</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialog open={cloudSoonOpen} onOpenChange={setCloudSoonOpen}>
                <AlertDialogContent sizeClassName="max-w-[420px]">
                    <div className="aspect-video w-full overflow-hidden bg-surface-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/promo/cloud.png"
                            alt=""
                            className="size-full object-cover"
                        />
                    </div>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cloud agents coming soon</AlertDialogTitle>
                        <AlertDialogDescription>
                            Run autonomous AI agents in the cloud to work directly with your repository.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel asChild>
                            <Button type="button" variant="default" size="lg" className="w-full">
                                Close
                            </Button>
                        </AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

/** Recent-repo picker used by the empty-state heading and (previously) composer. */
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
                        <Icon icon={RiFolder5Fill} size={ICON_SIZE_SM} className="shrink-0 text-text-primary!" />
                        <span className="min-w-0 flex-1 truncate text-sm text-text-primary!">
                            {getRepoName(r.path)}
                        </span>
                        {project_path === r.path ? (
                            <Icon icon={RiCheckLine} className="shrink-0" size={ICON_SIZE_SM} />
                        ) : null}
                    </DropdownMenuItem>
                ))}
                {filteredRepos.length === 0 ? (
                    <div className="px-2 py-3 text-center text-xs text-text-muted">No recent folders</div>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() => window.dispatchEvent(new Event("open-folder-request"))}
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
