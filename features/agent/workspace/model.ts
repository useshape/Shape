import type { SolarIconName } from "@/components/ui/icon";

export type TabKind = "changes" | "graph" | "agents" | "plan" | "file" | "diff" | "files" | "prs" | "browser";

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
    { id: "graph", kind: "graph", title: "Graph" },
    { id: "files", kind: "files", title: "Files" },
    { id: "browser", kind: "browser", title: "Browser" },
];

export function iconFor(kind: TabKind): SolarIconName {
    switch (kind) {
        case "changes":
            return "git-commit";
        case "graph":
            return "git-branch";
        case "agents":
            return "user-plus";
        case "plan":
            return "git-branch";
        case "diff":
            return "git-pull-request";
        case "files":
            return "folder";
        case "prs":
            return "git-pull-request";
        case "browser":
            return "global";
        default:
            return "file-text";
    }
}
