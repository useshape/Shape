export type { GitFileParams, GitLogEntry } from "@/lib/backend/types";

/** Sections shown in Git Manager. */
export type GitSectionId =
    | "source"
    | "graph"
    | "branches"
    | "tags"
    | "pull-requests"
    | "issues"
    | "releases"
    | "workflow-runs"
    | "jobs";
