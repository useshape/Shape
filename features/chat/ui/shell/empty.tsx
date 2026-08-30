"use client";

import { useProjectState } from "@/lib/backend";
import { getRepoName } from "@/lib/repo-history";

export function ChatEmptyState({
    onSelectMode: _onSelectMode,
}: {
    onSelectMode: (mode: string) => void;
}) {
    const { project_path } = useProjectState();
    const name = project_path ? getRepoName(project_path) : null;

    return (
        <div className="flex min-h-full w-full flex-col items-center justify-center px-6 py-12">
            <h1 className="max-w-lg text-center text-2xl font-medium leading-snug text-text-primary text-balance">
                {name ? `What should we work on in ${name}?` : "What should we work on?"}
            </h1>
            <p className="mt-3 max-w-md text-center text-sm leading-relaxed text-text-muted">
                Describe a change or ask a question. Open Files from the sidebar when you need to review code.
            </p>
        </div>
    );
}
