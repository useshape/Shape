import type { IconGlyph } from "@/components/ui/icon";
import { Branch20Regular } from "@fluentui/react-icons/headless/svg/branch";
import { BranchRequest20Regular } from "@fluentui/react-icons/headless/svg/branch-request";
import { Circle20Filled } from "@fluentui/react-icons/headless/svg/circle";
import { DocumentText20Regular } from "@fluentui/react-icons/headless/svg/document-text";
import { Folder20Filled } from "@fluentui/react-icons/headless/svg/folder";
import { Globe20Regular } from "@fluentui/react-icons/headless/svg/globe";
import { PersonAdd20Regular } from "@fluentui/react-icons/headless/svg/person-add";
import { TaskListSquareLtr20Regular } from "@fluentui/react-icons/headless/svg/task-list-square-ltr";

export type TabKind = "changes" | "graph" | "agents" | "plan" | "file" | "diff" | "files" | "prs" | "browser";

export type WorkspaceTab = {
    id: string;
    kind: TabKind;
    title: string;
    /** Absolute path for plan / file tabs. */
    path?: string;
    url?: string;
    favicon?: string;
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
];

export function iconFor(kind: TabKind): IconGlyph {
    switch (kind) {
        case "changes":
            return Circle20Filled;
        case "graph":
            return Branch20Regular;
        case "agents":
            return PersonAdd20Regular;
        case "plan":
            return TaskListSquareLtr20Regular;
        case "diff":
            return BranchRequest20Regular;
        case "files":
            return Folder20Filled;
        case "prs":
            return BranchRequest20Regular;
        case "browser":
            return Globe20Regular;
        default:
            return DocumentText20Regular;
    }
}
