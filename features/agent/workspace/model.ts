import type { RemixiconComponentType } from "@remixicon/react";
import {
    RiFileTextLine,
    RiFolderLine,
    RiGitBranchFill,
    RiGitBranchLine,
    RiGitPullRequestLine,
    RiGitRepositoryCommitsLine,
    RiUserFollowLine,
} from "@remixicon/react";

export type TabKind = "changes" | "graph" | "agents" | "plan" | "file" | "diff" | "files" | "prs";

export type WorkspaceTab = {
    id: string;
    kind: TabKind;
    title: string;
    /** Absolute path for plan / file tabs. */
    path?: string;
    markdown?: string;
    diff?: {
        id: string;
        path: string;
        status: string;
        staged: boolean;
        repo: string;
        commit?: string;
        parent?: string;
    };
};

export function uid(prefix: string) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export const DEFAULT_TABS: WorkspaceTab[] = [
    { id: "changes", kind: "changes", title: "Changes" },
    { id: "graph", kind: "graph", title: "Graph" },
    { id: "files", kind: "files", title: "Files" },
];

export function iconFor(kind: TabKind): RemixiconComponentType {
    switch (kind) {
        case "changes":
            return RiGitRepositoryCommitsLine;
        case "graph":
            return RiGitBranchFill;
        case "agents":
            return RiUserFollowLine;
        case "plan":
            return RiGitBranchLine;
        case "diff":
            return RiGitPullRequestLine;
        case "files":
            return RiFolderLine;
        case "prs":
            return RiGitPullRequestLine;
        default:
            return RiFileTextLine;
    }
}
