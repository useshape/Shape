export type GhListItem = {
    id: string | number;
    title: string;
    subtitle?: string;
    url?: string;
    status?: string;
    meta?: string;
    number?: number;
    author?: string;
    body?: string;
};

export type DetailSection =
    | "issues"
    | "pull-requests"
    | "releases"
    | "check-runs"
    | "check-suites"
    | "commit-statuses"
    | "deployments"
    | "deployment-statuses";

export type Label = { name: string; color?: string };
export type Person = { login: string; avatar_url?: string };
export type Comment = {
    id: number;
    body: string;
    user?: Person;
    created_at?: string;
    author_association?: string;
};
export type PrCommit = {
    sha: string;
    commit: { message: string; author?: { name?: string; date?: string } };
    author?: Person;
};
export type PrFile = {
    filename: string;
    status: string;
    additions?: number;
    deletions?: number;
    changes?: number;
};
export type CheckRun = {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    html_url?: string;
};
export type ReleaseAsset = {
    id: number;
    name: string;
    size?: number;
    download_count?: number;
    browser_download_url?: string;
};

export function formatRelative(iso?: unknown): string {
    if (typeof iso !== "string" || !iso) return "";
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "";
    const mins = Math.round((Date.now() - t) / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 48) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
}

export function formatBytes(n?: number): string {
    if (n == null || !Number.isFinite(n)) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
