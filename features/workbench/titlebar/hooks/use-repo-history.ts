"use client";

import { useEffect, useState } from "react";
import { loadRepoHistory, clearRepoHistory } from "@/lib/repo-history";
import type { RepoHistoryEntry } from "@/lib/repo-history";

export function useRepoHistory(projectPath: string | null) {
    const [repoHistory, setRepoHistory] = useState<RepoHistoryEntry[]>([]);

    useEffect(() => {
        setRepoHistory(loadRepoHistory());
        const refresh = () => setRepoHistory(loadRepoHistory());
        window.addEventListener("shape-open-project", refresh);
        return () => window.removeEventListener("shape-open-project", refresh);
    }, []);

    useEffect(() => {
        setRepoHistory(loadRepoHistory());
    }, [projectPath]);

    return {
        repoHistory,
        clearHistory: () => {
            clearRepoHistory();
            setRepoHistory([]);
        },
    };
}
