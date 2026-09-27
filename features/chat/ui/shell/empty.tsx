"use client";

import { useProjectState } from "@/lib/backend";
import { getRepoName } from "@/lib/workspace/repo-history";
import { ShapeLogo } from "@/components/ui/shape-logo";
import { GetPlusButton } from "@/features/agent/chrome";
import { ComposerRepoMenu } from "../composer/context-bar";

export function ChatEmptyState({
    onSelectMode: _onSelectMode,
}: {
    onSelectMode: (mode: string) => void;
}) {
    const { project_path } = useProjectState();
    const name = project_path ? getRepoName(project_path) : "this folder";

    return (
        <div className="flex w-full flex-col items-center gap-4 px-4">
            <h1 className="flex max-w-lg flex-wrap items-center justify-center gap-x-2 gap-y-1 text-balance text-center text-2xl font-medium leading-snug text-text-primary">
                <ShapeLogo size={22} />
                <span>
                    What should we work on in{" "}
                    <ComposerRepoMenu align="center">
                        <button
                            type="button"
                            className="inline underline decoration-text-muted decoration-[1.5px] underline-offset-[5px] transition-colors hover:text-text-primary hover:decoration-text-primary"
                        >
                            {name}
                        </button>
                    </ComposerRepoMenu>
                    ?
                </span>
                <GetPlusButton />
            </h1>
        </div>
    );
}
