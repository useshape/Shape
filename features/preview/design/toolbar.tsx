"use client";

import { useEffect, useMemo, useState } from "react";
import { RiArrowDownSLine, RiCheckLine, RiCloseLine, RiCloudLine, RiGitBranchLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { SearchInput } from "@/components/ui/search";
import { ProjectKindGlyph } from "@/features/detection/ui/kind-glyph";
import { useGitBranch } from "@/features/workbench/hooks/use-git-branch";
import { useWindowControls } from "@/features/workbench/titlebar/hooks/use-window-controls";
import { WindowControls } from "@/features/workbench/titlebar/ui/window-controls";
import { commands } from "@/lib/backend";
import { getRepoName } from "@/lib/repo-history";

export function DesignToolbar({
    onClose,
    projectPath,
    pages,
    activePage,
    onPageChange,
    onDeploy,
    saved,
}: {
    onClose: () => void;
    projectPath: string;
    pages: Array<{ path: string; label: string }>;
    activePage: string;
    onPageChange: (path: string) => void;
    onDeploy: () => void;
    saved: boolean;
}) {
    const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();
    const projectName = getRepoName(projectPath);
    const branch = useGitBranch(projectPath);
    const [branches, setBranches] = useState<string[]>([]);
    const [branchQuery, setBranchQuery] = useState("");

    useEffect(() => {
        let cancelled = false;
        void commands
            .gitBranches(projectPath)
            .then((list) => {
                if (!cancelled) setBranches(list);
            })
            .catch(() => {
                if (!cancelled) setBranches([]);
            });
        return () => {
            cancelled = true;
        };
    }, [projectPath, branch]);

    const filteredBranches = useMemo(() => {
        const q = branchQuery.trim().toLowerCase();
        if (!q) return branches;
        return branches.filter((item) => item.toLowerCase().includes(q));
    }, [branchQuery, branches]);

    return (
        <div
            className="relative flex h-titlebar shrink-0 items-center border-b border-border bg-surface-3"
            data-tauri-drag-region
        >
            <div className="relative z-10 flex h-full min-w-0 items-center gap-2 pl-2" data-no-drag>
                <Button variant="ghost" size="icon" aria-label="Close designer" onClick={onClose}>
                    <Icon icon={RiCloseLine} size={ICON_SIZE_SM} />
                </Button>
                <span className="h-4 w-px shrink-0 bg-border-subtle" />
                <ProjectKindGlyph path={projectPath} className="size-4 shrink-0" />
                <span className="max-w-40 truncate leading-none text-sm font-medium text-text-primary">
                    {projectName}
                </span>
                <DropdownMenu onOpenChange={(open) => { if (!open) setBranchQuery(""); }}>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="inline-flex h-6 max-w-32 items-center gap-1 rounded-md px-1.5 text-xs text-text-muted hover:bg-panel-hover hover:text-text-primary"
                        >
                            <Icon icon={RiGitBranchLine} size={12} />
                            <span className="truncate leading-none">{branch ?? "main"}</span>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64 p-0">
                        <p className="px-2.5 pb-1 pt-2 text-xs text-text-muted">
                            Switch branch to preview another revision of this project.
                        </p>
                        <SearchInput
                            borderless
                            value={branchQuery}
                            onChange={(event) => setBranchQuery(event.target.value)}
                            placeholder="Search branches"
                        />
                        <div className="max-h-56 overflow-y-auto p-1">
                            {filteredBranches.map((item) => (
                                <DropdownMenuItem
                                    key={item}
                                    onClick={() => {
                                        void commands.gitSwitchBranch(projectPath, item).then(() => {
                                            window.dispatchEvent(new Event("shape-git-refresh"));
                                        });
                                    }}
                                >
                                    <span className="min-w-0 flex-1 truncate">{item}</span>
                                    {item === branch ? <Icon icon={RiCheckLine} size={14} /> : null}
                                </DropdownMenuItem>
                            ))}
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>
                <span className="flex items-center gap-1 leading-none text-xs text-text-muted">
                    <Icon
                        icon={RiCheckLine}
                        size={14}
                        className={saved ? "text-success" : "text-text-muted"}
                    />
                    {saved ? "Saved" : "Saving"}
                </span>
            </div>

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="pointer-events-auto flex items-center" data-no-drag>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                                {pages.find((page) => page.path === activePage)?.label ?? "Home"}
                                <Icon icon={RiArrowDownSLine} size={12} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="min-w-52">
                            <DropdownMenuLabel>Pages</DropdownMenuLabel>
                            {pages.map((page) => (
                                <DropdownMenuItem key={page.path} onClick={() => onPageChange(page.path)}>
                                    <span className="min-w-0 flex-1 truncate">{page.label}</span>
                                    <span className="text-xs text-text-muted">{page.path}</span>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <div className="relative z-10 ml-auto flex h-full items-center pr-0" data-no-drag>
                <Button variant="default" size="sm" className="mr-1 h-7 gap-1.5" onClick={onDeploy}>
                    <Icon icon={RiCloudLine} size={ICON_SIZE_SM} />
                    Deploy
                </Button>
                <WindowControls
                    surface="chrome"
                    isMaximized={isMaximized}
                    onMinimize={minimize}
                    onToggleMaximize={toggleMaximize}
                    onClose={close}
                />
            </div>
        </div>
    );
}
