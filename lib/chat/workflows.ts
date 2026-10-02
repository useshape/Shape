export type AgentWorkflow = {
    id: string;
    name: string;
    /** Phrase in the user message that fires this workflow (case-insensitive). */
    trigger: string;
    /** Extra instructions injected for that turn. */
    prompt: string;
    /** Optional Shape plugin toolkit id. */
    pluginToolkit?: string;
    /** Optional plugin tool slug to prefer (legacy single). */
    pluginTool?: string;
    /** Plugin tool slugs pre-approved for this workflow. */
    pluginTools?: string[];
    /** How the trigger is matched. */
    when?: "slash" | "phrase" | "both";
    /** Ask the agent to search the web for this workflow. */
    webSearch?: boolean;
    /** Ask the agent to open pages in the in-app browser. */
    browse?: boolean;
    /** Optional mode for the turn. */
    mode?: "Ask" | "Code" | "Plan" | "Visual";
};

export function workflowPluginTools(w: AgentWorkflow): string[] {
    if (w.pluginTools?.length) {
        return [...new Set(w.pluginTools.map((s) => s.trim()).filter(Boolean))];
    }
    const legacy = w.pluginTool?.trim();
    return legacy ? [legacy] : [];
}

export function workflowAllowKeys(w: AgentWorkflow): string[] {
    const toolkit = w.pluginToolkit?.trim().toLowerCase();
    if (!toolkit) return [];
    return workflowPluginTools(w).flatMap((slug) => {
        const s = slug.trim().toLowerCase();
        return s ? [`${toolkit}:${s}`, s] : [];
    });
}

export function newWorkflowId(): string {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `wf-${Date.now().toString(36)}`;
}

function slashKey(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/^\/+/, "");
}

/** Canonical `/name` token inserted into the composer when a workflow is picked. */
export function workflowSlashToken(w: AgentWorkflow): string {
    const key = slashKey(w.trigger || w.name);
    return key ? `/${key}` : "";
}

function triggerHits(message: string, workflow: AgentWorkflow): boolean {
    const t = workflow.trigger.trim();
    if (!t) return false;
    const when = workflow.when ?? "both";
    const hay = message.trim();
    const first = hay.split(/\s+/)[0] ?? "";
    const slashHit = first.startsWith("/") && slashKey(first) === slashKey(t);
    const phraseHit = (() => {
        const lower = hay.toLowerCase();
        const needle = t.toLowerCase();
        if (lower.includes(needle)) return true;
        const slug = needle.replace(/\s+/g, "-");
        return slug.length >= 2 && lower.includes(slug);
    })();
    if (when === "slash") return slashHit;
    if (when === "phrase") return phraseHit;
    return slashHit || phraseHit;
}

export function matchWorkflows(message: string, workflows: AgentWorkflow[] | undefined): AgentWorkflow[] {
    if (!workflows?.length) return [];
    return workflows.filter((w) => triggerHits(message, w));
}

/** Highlight ranges for `/command` tokens that match a saved workflow. */
export function slashCommandRanges(
    text: string,
    workflows: AgentWorkflow[] | undefined,
): { start: number; end: number; token: string; workflow: AgentWorkflow }[] {
    if (!workflows?.length) return [];
    const byKey = new Map<string, AgentWorkflow>();
    for (const w of workflows) {
        const key = slashKey(w.trigger || w.name);
        if (key && !byKey.has(key)) byKey.set(key, w);
    }
    const re = /(^|\s)(\/[A-Za-z0-9_-]+)/g;
    const ranges: { start: number; end: number; token: string; workflow: AgentWorkflow }[] = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        const token = match[2]!;
        const workflow = byKey.get(slashKey(token));
        if (!workflow) continue;
        const start = match.index + match[1]!.length;
        ranges.push({ start, end: start + token.length, token, workflow });
    }
    return ranges;
}

export function workflowSeeHow(w: AgentWorkflow): string {
    const token = workflowSlashToken(w);
    const when = w.when ?? "both";
    const lines = [
        when === "slash" ? `Runs when you type ${token || "/name"} in chat.` : null,
        when === "phrase" ? `Runs when the message includes "${w.trigger || "..."}".` : null,
        when === "both" ? `Runs on ${token || "/name"} or the phrase "${w.trigger || "..."}".` : null,
        w.webSearch ? "Looks up current facts on the web." : null,
        w.browse ? "May open pages in the Shape browser." : null,
        w.mode ? `Uses ${w.mode} for the turn.` : null,
        w.pluginToolkit ? `Can call ${w.pluginToolkit} without asking again.` : null,
        w.prompt.trim() ? `Prompt: ${w.prompt.trim().slice(0, 220)}` : null,
    ].filter(Boolean);
    return lines.join("\n");
}

export function applyWorkflows(message: string, workflows: AgentWorkflow[] | undefined): string {
    const hits = matchWorkflows(message, workflows);
    if (hits.length === 0) return message;
    const blocks = hits.map((w) => {
        const tools = workflowPluginTools(w);
        const extras: string[] = [];
        if (w.webSearch) extras.push("Use web_search for current facts before you decide.");
        if (w.browse) extras.push("Use browse / visit_url when a page is needed. Do not guess the contents.");
        if (w.mode) extras.push(`Prefer ${w.mode} mode behavior for this turn.`);
        const extra = extras.length ? `\n${extras.join(" ")}` : "";
        const plugin = w.pluginToolkit
            ? tools.length
                ? `\nImmediately call plugin_run (do not call plugin_list, plugin_search, or plugin_tools first). toolkit="${w.pluginToolkit}". slugs: ${tools.map((s) => `"${s}"`).join(", ")}. These actions are already approved.`
                : `\nPrefer plugin_run with toolkit="${w.pluginToolkit}". Do not list or search plugins first unless a slug is missing.`
            : "";
        return `<workflow name="${escapeAttr(w.name)}" trigger="${escapeAttr(w.trigger)}">\n${w.prompt.trim()}${extra}${plugin}\n</workflow>`;
    });
    return `${blocks.join("\n\n")}\n\n${message}`;
}

function escapeAttr(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
