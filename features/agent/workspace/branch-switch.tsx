"use client";

import { RiCheckLine, RiGitBranchLine } from "@remixicon/react";
import { useEffect, useMemo, useState } from "react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { SearchInput } from "@/components/ui/search";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { commands, useProjectState } from "@/lib/backend";
import { useGitBranch } from "@/features/workbench/hooks/use-git-branch";

const MAX_VISIBLE = 40;

export function WorkspaceBranchSwitch() {
    const { project_path } = useProjectState();
    const branch = useGitBranch(project_path);
    const [branches, setBranches] = useState<string[]>([]);
    const [query, setQuery] = useState("");
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        if (!project_path || !menuOpen) return;
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
    }, [project_path, menuOpen]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = q ? branches.filter((b) => b.toLowerCase().includes(q)) : branches;
        return list.slice(0, MAX_VISIBLE);
    }, [branches, query]);

    const hidden = Math.max(0, (query.trim()
        ? branches.filter((b) => b.toLowerCase().includes(query.trim().toLowerCase())).length
        : branches.length) - filtered.length);

    const switchTo = (name: string) => {
        if (!project_path) return;
        void commands
            .gitSwitchBranch(project_path, name)
            .then(() => {
                window.dispatchEvent(new Event("shape-git-refresh"));
            })
            .catch((err) => {
                void import("@/features/notifications").then(({ notify }) => notify.gitError(err));
            });
    };

    return (
        <DropdownMenu
            onOpenChange={(open) => {
                setMenuOpen(open);
                if (!open) setQuery("");
            }}
        >
            <DropdownMenuTrigger asChild disabled={!project_path}>
                <button
                    type="button"
                    disabled={!project_path}
                    className="inline-flex max-w-40 items-center gap-1 rounded-md px-1.5 text-sm text-text-secondary hover:text-text-primary disabled:text-text-disabled"
                >
                    <Icon icon={RiGitBranchLine} className="shrink-0" size={ICON_SIZE_SM} />
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
                {filtered.length === 0 ? (
                    <div className="px-2 py-3 text-center text-xs text-text-muted">No branches</div>
                ) : (
                    <div className="custom-scrollbar max-h-56 overflow-y-auto">
                        {filtered.map((b) => (
                            <DropdownMenuItem key={b} onClick={() => switchTo(b)} className="gap-2">
                                <span className="min-w-0 flex-1 truncate">{b}</span>
                                {branch === b ? <Icon icon={RiCheckLine} className="shrink-0" /> : null}
                            </DropdownMenuItem>
                        ))}
                    </div>
                )}
                {hidden > 0 ? (
                    <div className="border-t border-border px-2 py-1.5 text-xs text-text-muted">
                        {hidden} more — type to search
                    </div>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
