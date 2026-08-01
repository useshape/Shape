export type { GitFileParams, GitLogEntry } from "@/lib/backend/types";

/** Sections shown in the Git Manager window. */
export type GitSectionId =
    | "source"
    | "graph"
    | "branches"
    | "issues"
    | "pull-requests"
    | "workflow-runs"
    | "workflow-definitions"
    | "jobs"
    | "steps"
    | "live-status"
    | "logs"
    | "artifacts"
    | "releases"
    | "tags"
    | "check-runs"
    | "check-suites"
    | "deployments"
    | "deployment-statuses"
    | "commit-statuses";
