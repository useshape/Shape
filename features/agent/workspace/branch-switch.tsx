"use client";

import { Checkmark20Regular } from "@fluentui/react-icons/headless/svg/checkmark";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { confirm } from "@tauri-apps/plugin-dialog";

import { SearchInput } from "@/components/ui/search";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { commands, useProjectState } from "@/lib/backend";
import { useGitRepos } from "@/lib/git/repos";
import { useGitBranch } from "@/features/agent/workbench/hooks/use-git-branch";
import { notify } from "@/features/notifications";

const MAX_VISIBLE = 40;

function uniqueNames(names: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of names) {
        const name = raw.trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        out.push(name);
    }
    return out;
}

export function WorkspaceBranchSwitch() {
    const { project_path } = useProjectState();
    const { scmRepoPath } = useGitRepos(project_path);
    const repoPath = scmRepoPath ?? project_path;
    const branch = useGitBranch(repoPath);
    const [branches, setBranches] = useState<string[]>([]);
    const [query, setQuery] = useState("");
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        if (!repoPath || !menuOpen) return;
        let cancelled = false;
        void (async () => {
            const [listed, detailed] = await Promise.all([
                commands.gitBranches(repoPath).catch(() => [] as string[]),
                commands.gitBranchDetails(repoPath, branch ?? "", true).catch(() => []),
            ]);
            if (cancelled) return;
            const names = uniqueNames([
                ...listed,
                ...detailed.map((item) => item.name),
            ]);
            setBranches(names.length > 0 ? names : branch ? [branch] : []);
        })();
        return () => {
            cancelled = true;
        };
    }, [repoPath, menuOpen, branch]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = q ? branches.filter((b) => b.toLowerCase().includes(q)) : branches;
        return list.slice(0, MAX_VISIBLE);
    }, [branches, query]);

    const hidden = Math.max(0, (query.trim()
        ? branches.filter((b) => b.toLowerCase().includes(query.trim().toLowerCase())).length
        : branches.length) - filtered.length);

    const switchTo = async (name: string) => {
        if (!repoPath || name === branch) return;
        try {
            const files = await commands.gitStatus(repoPath).catch(() => []);
            if (files.length > 0) {
                const ok = await confirm(
                    `You have ${files.length} uncommitted file${files.length === 1 ? "" : "s"}. Switching branches will not discard them, and Git will refuse the switch if it would overwrite your work. Commit or stash first unless you are sure.`,
                    {
                        title: "Uncommitted changes",
                        kind: "warning",
                        okLabel: "Switch anyway",
                        cancelLabel: "Cancel",
                    },
                );
                if (!ok) return;
            }
            await commands.gitSwitchBranch(repoPath, name);
            window.dispatchEvent(new Event("shape-git-refresh"));
        } catch (err) {
            notify.gitError(err);
        }
    };

    return (
        <DropdownMenu
            onOpenChange={(open) => {
                setMenuOpen(open);
                if (!open) setQuery("");
            }}
        >
            <DropdownMenuTrigger asChild disabled={!repoPath}>
                <button
                    type="button"
                    disabled={!repoPath}
                    className="inline-flex max-w-40 items-center rounded-md px-1.5 text-sm text-text-secondary hover:text-text-primary disabled:text-text-disabled"
                >
                    <span className="truncate">{branch ?? "Branch"}</span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 p-0">
                <SearchInput
                    borderless
                    stickyFade
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
                            <DropdownMenuItem key={b} onClick={() => void switchTo(b)} className="gap-2">
                                <span className="min-w-0 flex-1 truncate">{b}</span>
                                {branch === b ? <Icon icon={Checkmark20Regular} className="shrink-0" /> : null}
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
