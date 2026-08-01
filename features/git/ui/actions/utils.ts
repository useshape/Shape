import { commands } from "@/lib/backend";

export function formatRelative(iso?: string | null): string {
    if (!iso) return "";
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

export function durationLabel(start?: string, end?: string): string {
    if (!start) return "";
    const a = Date.parse(start);
    const b = end ? Date.parse(end) : Date.now();
    if (Number.isNaN(a) || Number.isNaN(b)) return "";
    const sec = Math.max(0, Math.round((b - a) / 1000));
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
}

export function statusTone(status?: string | null, conclusion?: string | null): string {
    const s = (conclusion || status || "").toLowerCase();
    if (["success", "completed", "passed"].includes(s)) return "text-success";
    if (["failure", "failed", "error", "timed_out", "cancelled", "canceled"].includes(s)) {
        return "text-error";
    }
    if (["in_progress", "queued", "pending", "waiting", "requested"].includes(s)) {
        return "text-warning";
    }
    return "text-text-muted";
}

export function statusLabel(status?: string | null, conclusion?: string | null): string {
    return (conclusion || status || "unknown").replace(/_/g, " ");
}

export type StatusIconDef = {
    name: string;
    filled?: boolean;
    spin?: boolean;
};

export function statusIcon(
    status?: string | null,
    conclusion?: string | null,
): StatusIconDef {
    const s = (conclusion || status || "").toLowerCase();
    if (["success", "completed", "passed"].includes(s)) {
        return { name: "check_circle", filled: true };
    }
    if (["failure", "failed", "error", "timed_out"].includes(s)) {
        return { name: "x_circle", filled: true };
    }
    if (["cancelled", "canceled", "skipped", "neutral", "closed"].includes(s)) {
        return { name: "stop" };
    }
    if (["open"].includes(s)) {
        return { name: "circle" };
    }
    if (["in_progress", "pending", "waiting", "requested"].includes(s)) {
        return { name: "sync", spin: true };
    }
    if (["queued"].includes(s)) {
        return { name: "circle" };
    }
    return { name: "circle" };
}

export function actorAvatarUrl(actor?: {
    login?: string;
    avatar_url?: string;
}): string | null {
    if (actor?.avatar_url) return actor.avatar_url;
    if (actor?.login) return `https://github.com/${actor.login}.png?size=32`;
    return null;
}

export async function parseApi(path: string): Promise<unknown> {
    const raw = await commands.githubApiGet(path);
    return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function resolveOwnerRepo(
    projectPath: string | null,
): Promise<{ owner: string; repo: string } | null> {
    if (!projectPath) return null;
    try {
        const remote = await commands.gitRemoteUrl(projectPath);
        if (!remote) return null;
        const m =
            remote.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/i) ||
            remote.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
        if (!m) return null;
        return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
    } catch {
        return null;
    }
}
