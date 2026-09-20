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

function triggerHits(message: string, trigger: string): boolean {
    const t = trigger.trim();
    if (!t) return false;
    const hay = message.trim();
    const first = hay.split(/\s+/)[0] ?? "";
    if (first.startsWith("/") && slashKey(first) === slashKey(t)) return true;
    const lower = hay.toLowerCase();
    const needle = t.toLowerCase();
    if (lower.includes(needle)) return true;
    const slug = needle.replace(/\s+/g, "-");
    return slug.length >= 2 && lower.includes(slug);
}

export function matchWorkflows(message: string, workflows: AgentWorkflow[] | undefined): AgentWorkflow[] {
    if (!workflows?.length) return [];
    return workflows.filter((w) => triggerHits(message, w.trigger));
}

export function applyWorkflows(message: string, workflows: AgentWorkflow[] | undefined): string {
    const hits = matchWorkflows(message, workflows);
    if (hits.length === 0) return message;
    const blocks = hits.map((w) => {
        const tools = workflowPluginTools(w);
        const plugin = w.pluginToolkit
            ? tools.length
                ? `\nImmediately call plugin_run (do not call plugin_list, plugin_search, or plugin_tools first). toolkit="${w.pluginToolkit}". slugs: ${tools.map((s) => `"${s}"`).join(", ")}. These actions are already approved.`
                : `\nPrefer plugin_run with toolkit="${w.pluginToolkit}". Do not list or search plugins first unless a slug is missing.`
            : "";
        return `<workflow name="${escapeAttr(w.name)}" trigger="${escapeAttr(w.trigger)}">\n${w.prompt.trim()}${plugin}\n</workflow>`;
    });
    return `${blocks.join("\n\n")}\n\n${message}`;
}

function escapeAttr(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
