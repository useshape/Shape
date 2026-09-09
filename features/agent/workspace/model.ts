import type { RemixiconComponentType } from "@remixicon/react";
import { RiFileTextLine, RiFolderLine, RiGitBranchLine, RiGitPullRequestLine, RiTerminalBoxLine } from "@remixicon/react";

export type TabKind = "changes" | "terminal" | "plan" | "file" | "diff" | "files";

export type WorkspaceTab = {
    id: string;
    kind: TabKind;
    title: string;
    /** Absolute path for plan / file tabs. */
    path?: string;
    diff?: {
        id: string;
        path: string;
        status: string;
        staged: boolean;
        repo: string;
    };
};

export function uid(prefix: string) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export const DEFAULT_TABS: WorkspaceTab[] = [
    { id: "changes", kind: "changes", title: "Changes" },
    { id: "files", kind: "files", title: "Files" },
];

export function iconFor(kind: TabKind): RemixiconComponentType {
    switch (kind) {
        case "changes":
            return RiGitPullRequestLine;
        case "terminal":
            return RiTerminalBoxLine;
        case "plan":
            return RiGitBranchLine;
        case "diff":
            return RiGitPullRequestLine;
        case "files":
            return RiFolderLine;
        default:
            return RiFileTextLine;
    }
}
