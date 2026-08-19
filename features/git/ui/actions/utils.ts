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

/**
 * `gh run view --log` lines are typically: JOB\tSTEP\tTIMESTAMP\tMESSAGE
 * Filter to a single step when the user clicks a step in the jobs panel.
 */
export function filterJobLogByStep(
    log: string,
    stepName: string,
): { filtered: string; matched: number } {
    const needle = stepName.trim();
    if (!needle || !log) return { filtered: log, matched: 0 };
    const lines = log.split(/\r?\n/);
    const matchedLines = lines.filter((line) => {
        const parts = line.split("\t");
        if (parts.length < 2) return false;
        const step = parts[1]?.trim() ?? "";
        return step === needle || step.endsWith(needle) || step.includes(needle);
    });
    return { filtered: matchedLines.join("\n"), matched: matchedLines.length };
}

export type WorkflowInputDef = {
    name: string;
    description?: string;
    required: boolean;
    default?: string;
    type?: string;
    options?: string[];
};

/**
 * Parse `on.workflow_dispatch.inputs` from a workflow YAML string.
 * Intentionally pragmatic (indent-based) — good enough for standard Actions YAML.
 */
export function parseWorkflowDispatch(yaml: string): {
    canDispatch: boolean;
    inputs: WorkflowInputDef[];
} {
    const lines = yaml.split(/\r?\n/);
    let inOn = false;
    let onIndent = -1;
    let inDispatch = false;
    let dispatchIndent = -1;
    let inInputs = false;
    let inputsIndent = -1;
    let canDispatch = false;
    const inputs: WorkflowInputDef[] = [];
    let current: WorkflowInputDef | null = null;
    let inOptions = false;
    let optionsIndent = -1;

    const indentOf = (line: string) => {
        const m = line.match(/^(\s*)/);
        return m ? m[1].length : 0;
    };

    const flush = () => {
        if (current) {
            inputs.push(current);
            current = null;
        }
        inOptions = false;
    };

    for (const raw of lines) {
        if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
        const ind = indentOf(raw);
        const trimmed = raw.trim();

        if (!inOn && /^on:\s*$/.test(trimmed)) {
            inOn = true;
            onIndent = ind;
            continue;
        }
        if (inOn && !inDispatch && ind <= onIndent && !trimmed.startsWith("#")) {
            // left the on: block
            if (!/^workflow_dispatch/.test(trimmed)) {
                inOn = false;
            }
        }

        if (inOn && /^workflow_dispatch\s*:?\s*$/.test(trimmed)) {
            canDispatch = true;
            inDispatch = true;
            dispatchIndent = ind;
            continue;
        }
        if (inOn && /^workflow_dispatch\s*:\s*\[/.test(trimmed)) {
            canDispatch = true;
            continue;
        }
        // workflow_dispatch as list item under on:
        if (inOn && /^-\s*workflow_dispatch\s*$/.test(trimmed)) {
            canDispatch = true;
            continue;
        }

        if (inDispatch && ind <= dispatchIndent && !trimmed.startsWith("inputs:")) {
            flush();
            inDispatch = false;
            inInputs = false;
        }

        if (inDispatch && /^inputs:\s*$/.test(trimmed)) {
            inInputs = true;
            inputsIndent = ind;
            continue;
        }

        if (!inInputs) continue;

        if (ind <= inputsIndent) {
            flush();
            inInputs = false;
            continue;
        }

        // New input key at inputsIndent+2-ish
        const keyMatch = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (keyMatch && ind <= inputsIndent + 2 && !inOptions) {
            // Could be a new input name (sibling of previous)
            const key = keyMatch[1];
            const rest = keyMatch[2].trim();
            const metaKeys = new Set([
                "description",
                "required",
                "default",
                "type",
                "options",
            ]);
            if (!metaKeys.has(key) && ind === inputsIndent + 2) {
                flush();
                current = {
                    name: key,
                    required: false,
                    default: rest && rest !== "|" && rest !== ">" ? rest.replace(/^["']|["']$/g, "") : undefined,
                };
                continue;
            }
        }

        if (!current) continue;

        if (/^options:\s*$/.test(trimmed)) {
            inOptions = true;
            optionsIndent = ind;
            current.options = [];
            continue;
        }

        if (inOptions) {
            if (ind <= optionsIndent) {
                inOptions = false;
            } else if (trimmed.startsWith("-")) {
                const opt = trimmed.replace(/^-\s*/, "").replace(/^["']|["']$/g, "");
                current.options = [...(current.options ?? []), opt];
                continue;
            }
        }

        const desc = trimmed.match(/^description:\s*(.*)$/);
        if (desc) {
            current.description = desc[1].replace(/^["']|["']$/g, "");
            continue;
        }
        const req = trimmed.match(/^required:\s*(true|false)\s*$/i);
        if (req) {
            current.required = req[1].toLowerCase() === "true";
            continue;
        }
        const def = trimmed.match(/^default:\s*(.*)$/);
        if (def) {
            current.default = def[1].replace(/^["']|["']$/g, "");
            continue;
        }
        const typ = trimmed.match(/^type:\s*(.*)$/);
        if (typ) {
            current.type = typ[1].replace(/^["']|["']$/g, "");
            continue;
        }
    }
    flush();

    return { canDispatch, inputs };
}
