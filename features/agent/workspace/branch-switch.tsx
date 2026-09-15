"use client";

import { RiCheckLine, RiGitBranchLine } from "@remixicon/react";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { SearchInput } from "@/components/ui/search";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { commands, useProjectState } from "@/lib/backend";
import { useGitBranch } from "@/features/workbench/hooks/use-git-branch";

export function WorkspaceBranchSwitch() {
    const { project_path } = useProjectState();
    const branch = useGitBranch(project_path);
    const [branches, setBranches] = useState<string[]>([]);
    const [query, setQuery] = useState("");

    useEffect(() => {
        if (!project_path) {
            setBranches([]);
            return;
        }
        let cancelled = false;
        void commands
            .gitBranches(project_path)
            .then((list) => {
                if (!cancelled) setBranches(list);
            })
            .catch(() => {
                if (!cancelled) setBranches([]);
            });
        return () => {
            cancelled = true;
        };
    }, [project_path, branch]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return branches;
        return branches.filter((b) => b.toLowerCase().includes(q));
    }, [branches, query]);

    return (
        <DropdownMenu
            onOpenChange={(open) => {
                if (!open) setQuery("");
            }}
        >
            <DropdownMenuTrigger asChild disabled={!project_path}>
                <button
                    type="button"
                    disabled={!project_path}
                    className="inline-flex max-w-40 items-center gap-1 rounded-md px-1.5 text-sm text-text-muted hover:bg-panel-hover hover:text-text-primary disabled:text-text-disabled"
                >
                    <Icon icon={RiGitBranchLine} className="shrink-0" />
                    <span className="truncate">{branch ?? "Branch"}</span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-0">
                <SearchInput
                    borderless
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search branches"
                    autoFocus
                />
                <div className="custom-scrollbar max-h-56 overflow-y-auto">
                    {filtered.map((b) => (
                        <DropdownMenuItem
                            key={b}
                            onClick={() => {
                                if (!project_path) return;
                                void commands
                                    .gitSwitchBranch(project_path, b)
                                    .then(() => {
                                        window.dispatchEvent(new Event("shape-git-refresh"));
                                    })
                                    .catch((err) => {
                                        void import("@/features/notifications").then(({ notify }) =>
                                            notify.gitError(err),
                                        );
                                    });
                            }}
                            className="gap-2"
                        >
                            <span className="min-w-0 flex-1 truncate">{b}</span>
                            {branch === b ? <Icon icon={RiCheckLine} className="shrink-0" /> : null}
                        </DropdownMenuItem>
                    ))}
                    {filtered.length === 0 ? (
                        <div className="px-2 py-3 text-center text-xs text-text-muted">No branches</div>
                    ) : null}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
