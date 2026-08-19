"use client";

import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useGitBranch } from "@/features/workbench/hooks/use-git-branch";
import { useProjectState } from "@/lib/backend";

export function GitStatusButton() {
    const { project_path } = useProjectState();
    const branch = useGitBranch(project_path);

    return (
        <Tooltip content="Source Control">
            <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-text-primary font-light"
                onClick={() =>
                    window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "source" }))
                }
            >
                <Icon name="account_tree" size={14} className="shrink-0" />
                {branch ? <span className="font-medium">{branch}</span> : null}
            </Button>
        </Tooltip>
    );
}
