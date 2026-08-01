"use client";

import { useEffect, useState } from "react";
import { commands } from "@/lib/backend";

const BACKUP_POLL_MS = 60000;

export function useGitBranch(projectPath: string | null | undefined) {
    const [branch, setBranch] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        const update = async () => {
            if (!projectPath) {
                if (mounted) setBranch(null);
                return;
            }
            try {
                const next = await commands.gitCurrentBranch(projectPath);
                if (mounted) setBranch(next);
            } catch {
                if (mounted) setBranch(null);
            }
        };

        void update();
        const onGitRefresh = () => { void update(); };
        window.addEventListener("shape-git-refresh", onGitRefresh);
        const id = setInterval(update, BACKUP_POLL_MS);
        return () => {
            mounted = false;
            window.removeEventListener("shape-git-refresh", onGitRefresh);
            clearInterval(id);
        };
    }, [projectPath]);

    return branch;
}
