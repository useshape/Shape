"use client";

import * as React from "react";
import { QuickPick, type QuickPickItem } from "@/components/ui/quick-pick";
import { commands } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { invalidateGitRepoCache } from "@/lib/git/repos";
import { getRepoName, type RepoHistoryEntry } from "@/lib/repo-history";
import { loginGitHub } from "@/lib/github-auth/store";

async function pickDirectory(title: string): Promise<string | null> {
    const { open: pick } = await import("@tauri-apps/plugin-dialog");
    const selected = await pick({
        directory: true,
        multiple: false,
        title,
    });
    return typeof selected === "string" ? selected : null;
}

/** Open project — recent folders + Browse (command-palette style). */
export function WelcomeOpenDialog({
    open,
    onOpenChange,
    recentFolders,
    onOpen,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    recentFolders: RepoHistoryEntry[];
    onOpen: (path: string) => void;
}) {
    const items: QuickPickItem[] = React.useMemo(() => {
        const recent: QuickPickItem[] = recentFolders.map((entry) => ({
            id: entry.path,
            label: getRepoName(entry.path),
            description: entry.path,
            icon: "folder",
        }));
        return [
            ...recent,
            {
                id: "__browse__",
                label: "Browse...",
                icon: "folder",
            },
        ];
    }, [recentFolders]);

    return (
        <QuickPick
            open={open}
            onOpenChange={onOpenChange}
            placeholder="Select a directory"
            items={items}
            onSelect={(item) => {
                if (item.id === "__browse__") {
                    void (async () => {
                        const path = await pickDirectory("Open project");
                        if (path) {
                            onOpenChange(false);
                            onOpen(path);
                        }
                    })();
                    return;
                }
                onOpenChange(false);
                onOpen(item.id);
            }}
        />
    );
}

/** Clone repo — URL / GitHub source, then parent directory (command-palette style). */
export function WelcomeCloneDialog({
    open,
    onOpenChange,
    recentFolders,
    onCloned,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    recentFolders?: RepoHistoryEntry[];
    onCloned: (path: string) => void;
}) {
    const [step, setStep] = React.useState<"source" | "dir">("source");
    const [url, setUrl] = React.useState("");
    const [pendingUrl, setPendingUrl] = React.useState("");
    const [cloning, setCloning] = React.useState(false);

    React.useEffect(() => {
        if (!open) {
            setStep("source");
            setUrl("");
            setPendingUrl("");
            setCloning(false);
        }
    }, [open]);

    const goToDir = (repoUrl: string) => {
        setPendingUrl(repoUrl);
        setStep("dir");
    };

    const runClone = async (parentDir: string) => {
        if (cloning) return;
        setCloning(true);
        const repoUrl = pendingUrl;
        onOpenChange(false);
        notify.info("Git", "Cloning repository…");
        try {
            const clonedPath = await commands.gitClone(repoUrl, parentDir);
            invalidateGitRepoCache();
            window.dispatchEvent(new Event("shape-git-refresh"));
            notify.success("Git", "Repository cloned.");
            onCloned(clonedPath);
        } catch (err) {
            notify.error(err instanceof Error ? err.message : String(err));
        } finally {
            setCloning(false);
        }
    };

    const sourceItems: QuickPickItem[] = [
        {
            id: "__github__",
            label: "Clone from GitHub",
            icon: "github",
            hint: "remote sources",
        },
    ];

    const dirItems: QuickPickItem[] = React.useMemo(() => {
        const recent = (recentFolders ?? []).slice(0, 6).map((entry) => {
            const normalized = entry.path.replace(/\\/g, "/");
            const idx = normalized.lastIndexOf("/");
            const parent =
                idx > 0
                    ? entry.path.includes("\\")
                        ? normalized.slice(0, idx).replace(/\//g, "\\")
                        : normalized.slice(0, idx)
                    : entry.path;
            return {
                id: parent,
                label: getRepoName(parent) || parent,
                description: parent,
                icon: "folder",
            };
        });
        // Dedupe parents
        const seen = new Set<string>();
        const unique = recent.filter((item) => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });
        return [
            ...unique,
            { id: "__browse__", label: "Browse...", icon: "folder" },
        ];
    }, [recentFolders]);

    if (step === "dir") {
        return (
            <QuickPick
                open={open}
                onOpenChange={onOpenChange}
                placeholder={cloning ? "Cloning repository…" : "Select a directory"}
                items={cloning ? [] : dirItems}
                emptyText={cloning ? "Cloning repository…" : "No results"}
                onSelect={(item) => {
                    if (cloning) return;
                    if (item.id === "__browse__") {
                        void (async () => {
                            const path = await pickDirectory("Select folder to clone into");
                            if (path) await runClone(path);
                        })();
                        return;
                    }
                    void runClone(item.id);
                }}
            />
        );
    }

    return (
        <QuickPick
            open={open}
            onOpenChange={onOpenChange}
            placeholder="Provide repository URL or pick a repository source."
            query={url}
            onQueryChange={setUrl}
            items={sourceItems}
            onSelect={(item) => {
                if (item.id === "__github__") {
                    void (async () => {
                        await loginGitHub();
                        void commands.openUrlExternal("https://github.com");
                        notify.info("Copy a repository URL, then paste it here to clone.");
                    })();
                    return;
                }
            }}
            onSubmitQuery={(value) => {
                if (!value.trim()) {
                    notify.error("Enter a repository URL");
                    return;
                }
                goToDir(value.trim());
            }}
        />
    );
}

/** SSH — command-palette style host picker. */
export function WelcomeSshDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [target, setTarget] = React.useState("");

    React.useEffect(() => {
        if (!open) setTarget("");
    }, [open]);

    const connect = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) {
            notify.error("Enter user@host");
            return;
        }
        if (!/^[\w.@+-]+$/.test(trimmed)) {
            notify.error("Invalid SSH target");
            return;
        }
        window.dispatchEvent(
            new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }),
        );
        window.dispatchEvent(
            new CustomEvent("shape-terminal-shortcut", { detail: { action: "new" } }),
        );
        window.dispatchEvent(
            new CustomEvent("shape-terminal-run", {
                detail: { command: `ssh ${trimmed}` },
            }),
        );
        onOpenChange(false);
    };

    const items: QuickPickItem[] = [
        {
            id: "__add__",
            label: "+ Add new host...",
            icon: "terminal",
        },
    ];

    return (
        <QuickPick
            open={open}
            onOpenChange={onOpenChange}
            title="Select SSH Host"
            placeholder="Enter [user@]hostname[:port] or select configured host."
            query={target}
            onQueryChange={setTarget}
            items={items}
            onSelect={() => connect(target)}
            onSubmitQuery={connect}
        />
    );
}
