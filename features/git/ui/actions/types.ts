export const STATUS_FILTERS = [
    { value: "all", label: "All runs" },
    { value: "in_progress", label: "In progress" },
    { value: "completed", label: "Completed" },
    { value: "failure", label: "Failed" },
] as const;

export type ActionsFocus = "workflow-runs" | "jobs";

export type WorkflowRun = {
    id: number;
    name: string;
    display_title?: string;
    status: string;
    conclusion: string | null;
    html_url: string;
    head_branch?: string;
    event?: string;
    run_number?: number;
    run_attempt?: number;
    created_at?: string;
    updated_at?: string;
    path?: string;
    workflow_id?: number;
    actor?: { login?: string; avatar_url?: string };
};

export type WorkflowJob = {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    html_url?: string;
    started_at?: string;
    completed_at?: string;
    steps?: WorkflowStep[];
};

export type WorkflowStep = {
    name: string;
    number: number;
    status: string;
    conclusion: string | null;
    started_at?: string;
    completed_at?: string;
};

export type WorkflowDef = {
    id: number;
    name: string;
    path: string;
    state: string;
    html_url?: string;
};

export type Artifact = {
    id: number;
    name: string;
    size_in_bytes?: number;
    expired?: boolean;
    created_at?: string;
    archive_download_url?: string;
};

export type DetailTab = "jobs" | "artifacts" | "workflows";

export function isActionsSection(id: string): id is ActionsFocus {
    return id === "workflow-runs" || id === "jobs";
}

export function defaultTabForFocus(focus: ActionsFocus): DetailTab {
    if (focus === "jobs") return "jobs";
    return "jobs";
}

export function tabsForFocus(focus: ActionsFocus): DetailTab[] {
    if (focus === "jobs") return ["jobs"];
    return ["jobs", "artifacts", "workflows"];
}

export function focusTitle(focus: ActionsFocus): string {
    return focus === "jobs" ? "Jobs" : "Workflow runs";
}
