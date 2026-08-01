"use client";

import * as React from "react";
import { Icon } from "@/components/ui/icon";
import {
    getRepoName,
    loadRepoHistory,
    type RepoHistoryEntry,
} from "@/lib/repo-history";
import { openSettingsWindow } from "@/lib/open-settings";
import { openShapeBilling } from "@/lib/shape-auth/store";
import { cn } from "@/lib/utils";

function parentDir(path: string): string {
    const normalized = path.replace(/\\/g, "/");
    const idx = normalized.lastIndexOf("/");
    if (idx <= 0) return path;
    const parent = normalized.slice(0, idx);
    return path.includes("\\") ? parent.replace(/\//g, "\\") : parent;
}

function ActionCard({
    icon,
    label,
    onClick,
    external,
}: {
    icon: string;
    label: string;
    onClick: () => void;
    external?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "group relative flex flex-col items-start gap-3 rounded-xl bg-surface-3 px-4 py-4 text-left",
                "text-text-secondary transition-colors",
                "hover:bg-text-primary hover:text-background",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
            )}
        >
            {external ? (
                <Icon
                    name="open_in_new"
                    size={12}
                    className="absolute right-3 top-3 opacity-40 group-hover:opacity-70"
                />
            ) : null}
            <Icon name={icon} size={18} className="shrink-0" />
            <span className="text-sm font-medium">{label}</span>
        </button>
    );
}

export function WelcomeScreen({
    recentFolders,
    onOpenProject,
    onPickFolder,
    onClone,
    onSsh,
    onConnectGitHub,
}: {
    recentFolders: RepoHistoryEntry[];
    recentChats?: unknown;
    onOpenProject: (path: string) => void;
    onPickFolder: () => void;
    onClone: () => void;
    onSsh: () => void;
    onConnectGitHub: () => void;
    onSelectChat?: (id: string) => void;
}) {
    const [showAll, setShowAll] = React.useState(false);
    const visible = showAll ? recentFolders : recentFolders.slice(0, 5);

    return (
        <div className="flex h-full min-h-0 w-full flex-col text-text-primary select-none">
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-10 py-10 sm:px-14 md:px-16">
                <div className="flex w-full max-w-2xl flex-col items-start gap-8">
                    <section className="grid w-full grid-cols-2 gap-2.5">
                        <ActionCard icon="folder" label="Open project" onClick={onPickFolder} />
                        <ActionCard icon="download" label="Clone repo" onClick={onClone} />
                        <ActionCard icon="terminal" label="Connect via SSH" onClick={onSsh} />
                        <ActionCard
                            icon="github"
                            label="Connect GitHub"
                            onClick={onConnectGitHub}
                            external
                        />
                    </section>

                    <section className="flex w-full flex-col gap-2">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-sm font-medium text-text-primary">
                                Recent projects
                            </h2>
                            {recentFolders.length > 5 ? (
                                <button
                                    type="button"
                                    className="text-sm text-text-muted hover:text-text-secondary"
                                    onClick={() => setShowAll((v) => !v)}
                                >
                                    {showAll
                                        ? "Show less"
                                        : `View all (${recentFolders.length})`}
                                </button>
                            ) : null}
                        </div>

                        {recentFolders.length === 0 ? (
                            <p className="py-2 text-sm text-text-muted">No recent projects</p>
                        ) : (
                            <ul className="flex w-full flex-col">
                                {visible.map((entry) => (
                                    <li key={entry.path}>
                                        <button
                                            type="button"
                                            onClick={() => onOpenProject(entry.path)}
                                            className="flex w-full items-baseline justify-between gap-4 rounded-md px-1 py-1.5 text-left text-sm hover:bg-panel-hover"
                                        >
                                            <span className="shrink-0 text-text-primary">
                                                {getRepoName(entry.path)}
                                            </span>
                                            <span className="min-w-0 truncate text-right text-text-muted">
                                                {parentDir(entry.path)}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}

/** Load recent folders for the welcome screen (client-only). */
export function useRecentFolders(): RepoHistoryEntry[] {
    const [entries, setEntries] = React.useState<RepoHistoryEntry[]>([]);
    React.useEffect(() => {
        setEntries(loadRepoHistory().slice(0, 15));
        const onFocus = () => setEntries(loadRepoHistory().slice(0, 15));
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, []);
    return entries;
}
