export type SubagentStatus = "pending" | "running" | "done" | "error";
export type SubagentPhase = "reviewing" | "editing" | "working";
export type SubagentRead = { path: string; start?: number; end?: number };

export type SubagentCard = {
    id: string;
    title: string;
    agent?: string;
    model?: string;
    activity: string;
    task?: string;
    transcript?: string;
    parentId?: string;
    status: SubagentStatus;
    phase?: SubagentPhase;
    reads?: SubagentRead[];
    tokens?: number;
    truncated?: boolean;
    startedAt?: number;
    updatedAt: number;
};

type Listener = () => void;

let cards: SubagentCard[] = [];
let activeId: string | null = null;
let parentConversationId: string | null = null;
const listeners = new Set<Listener>();

function emit() {
    for (const l of listeners) l();
}

export function getActiveSubagentId(): string | null {
    return activeId;
}

export function getActiveSubagent(): SubagentCard | null {
    if (!activeId) return null;
    return cards.find((c) => c.id === activeId) ?? null;
}

export function openSubagent(id: string) {
    if (!id) return;
    activeId = id;
    emit();
    window.dispatchEvent(new CustomEvent("shape-subagent-open", { detail: { id } }));
}

export function closeSubagent() {
    activeId = null;
    emit();
}

export function setSubagentParentConversation(id: string | null) {
    parentConversationId = id;
}

export function subagentsForParent(parentId: string): SubagentCard[] {
    return cards.filter((c) => c.parentId === parentId);
}

export function extractSubagentsFromText(text: string, parentId?: string): Array<{
    id: string;
    title: string;
    task: string;
    model?: string;
    transcript?: string;
    status: SubagentStatus;
}> {
    const out: Array<{
        id: string;
        title: string;
        task: string;
        model?: string;
        transcript?: string;
        status: SubagentStatus;
    }> = [];
    const seen = new Set<string>();
    const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
    const push = (id: string, title: string, task: string, model?: string, transcript?: string, statusRaw?: string) => {
        const key = id || title;
        if (!key || seen.has(key)) return;
        seen.add(key);
        const raw = (statusRaw || "").toLowerCase();
        const status: SubagentStatus =
            raw === "error" || raw === "failed"
                ? "error"
                : raw === "done" || raw === "completed"
                  ? "done"
                  : raw === "pending"
                    ? "pending"
                    : raw === "running"
                      ? "running"
                      : "done";
        out.push({ id: key, title, task, model, transcript, status });
        void parentId;
    };
    for (const m of text.matchAll(/<subagent_ref\b([^>]*)\/>/gi)) {
        const tag = m[1] || "";
        push(attr(tag, "id"), attr(tag, "agent") || "Subagent", attr(tag, "task"), attr(tag, "model") || undefined, undefined, attr(tag, "status"));
    }
    for (const m of text.matchAll(/<subagent\b([^>]*)>([\s\S]*?)<\/subagent>/gi)) {
        const tag = m[1] || "";
        push(attr(tag, "id"), attr(tag, "agent") || attr(tag, "name") || "Subagent", attr(tag, "task"), attr(tag, "model") || undefined, (m[2] || "").trim(), attr(tag, "status"));
    }
    return out;
}

export function subagentWorkflowContent(card: SubagentCard): string {
    const transcript = card.transcript?.trim() ?? "";
    if (transcript) return transcript;
    const parts: string[] = [];
    for (const read of card.reads ?? []) {
        const start = read.start != null ? ` start="${read.start}"` : "";
        const end = read.end != null ? ` end="${read.end}"` : "";
        parts.push(`<cat${start}${end}>${read.path}</cat>`);
    }
    if (parts.length === 0 && card.activity?.trim()) {
        parts.push(`<search>${card.activity.trim()}</search>`);
    }
    return parts.join("\n");
}

export function getSubagents(): SubagentCard[] {
    return cards;
}

export function subscribeSubagents(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function inferPhase(activity: string, explicit?: SubagentPhase): SubagentPhase {
    if (explicit) return explicit;
    const lower = activity.toLowerCase();
    if (/\breview/.test(lower)) return "reviewing";
    if (/\bedit/.test(lower)) return "editing";
    return "working";
}

function parseReadsFromActivity(activity: string): SubagentRead[] {
    const reads: SubagentRead[] = [];
    const re = /(?:read(?:ing)?|reviewing)\s+(\S+?)(?::(\d+)(?:-(\d+))?)?(?:\s|$)/gi;
    for (const match of activity.matchAll(re)) {
        const path = match[1]?.replace(/[.,;]+$/, "");
        if (!path) continue;
        reads.push({
            path,
            start: match[2] ? Number(match[2]) : undefined,
            end: match[3] ? Number(match[3]) : undefined,
        });
    }
    return reads;
}

export function upsertSubagent(next: Omit<SubagentCard, "updatedAt"> & { updatedAt?: number }) {
    const existing = cards.find((c) => c.id === next.id);
    const activity = next.activity || existing?.activity || "Working…";
    const card: SubagentCard = {
        ...existing,
        ...next,
        activity,
        task: next.task ?? existing?.task,
        transcript: next.transcript ?? existing?.transcript,
        parentId: next.parentId ?? existing?.parentId ?? parentConversationId ?? undefined,
        phase: inferPhase(activity, next.phase ?? existing?.phase),
        reads: next.reads ?? existing?.reads ?? parseReadsFromActivity(activity),
        tokens: next.tokens ?? existing?.tokens,
        truncated: next.truncated ?? existing?.truncated,
        startedAt: next.startedAt ?? existing?.startedAt ?? Date.now(),
        updatedAt: next.updatedAt ?? Date.now(),
    };
    const idx = cards.findIndex((c) => c.id === card.id);
    if (idx >= 0) cards = cards.map((c, i) => (i === idx ? { ...c, ...card } : c));
    else cards = [...cards, card];
    emit();
}

export function clearFinishedSubagents() {
    cards = cards.filter((c) => c.status === "running" || c.status === "pending");
    emit();
}

let demoTimer: ReturnType<typeof setInterval> | null = null;

export function resetSubagents() {
    if (demoTimer) {
        clearInterval(demoTimer);
        demoTimer = null;
    }
    cards = [];
    activeId = null;
    emit();
}

export function applySubagentEvent(payload: {
    id?: string;
    title?: string;
    activity?: string;
    status?: string;
    model?: string;
    phase?: SubagentPhase;
    reads?: SubagentRead[];
    tokens?: number;
    truncated?: boolean;
}) {
    if (!payload.id) return;
    const raw = (payload.status || "running").toLowerCase();
    const status: SubagentStatus =
        raw === "error" || raw === "failed"
            ? "error"
            : raw === "done" || raw === "completed"
              ? "done"
              : raw === "pending"
                ? "pending"
                : "running";
    upsertSubagent({
        id: payload.id,
        title: payload.title || "Subagent",
        activity: payload.activity || "Working…",
        status,
        model: payload.model,
        phase: payload.phase,
        reads: payload.reads,
        tokens: payload.tokens,
        truncated: payload.truncated,
    });
}

const DEMO_ACTIVITY: Record<string, string[]> = {
    "demo-sub-policy": [
        "Reviewing applyUsagePlan...",
        "Reading ThrottlePolicy.ts",
        "Checking clampRate vs account quota",
        "Comparing burst to rate",
    ],
    "demo-sub-console": [
        "Editing ThrottleApply.tsx",
        "Measuring Apply + alarm chip",
        "Aligning banner height",
    ],
    "demo-sub-alarms": [
        "Comparing alarm write vs burst chip",
        "Scheduling mid-window against live CloudWatch",
        "Checking chip collision",
    ],
};

export function seedDemoSubagents() {
    resetSubagents();
    upsertSubagent({
        id: "demo-sub-policy",
        title: "Usage-plan policy",
        agent: "Usage-plan policy",
        model: "auto",
        activity: "Reviewing applyUsagePlan...",
        task: "Single write for rate + burst + quota without clipping the stage picker",
        status: "running",
        phase: "reviewing",
        reads: [
            { path: "services/apigw/ThrottlePolicy.ts", start: 88, end: 180 },
            { path: "services/apigw/policy/clamp.ts", start: 1, end: 40 },
        ],
        tokens: 84000,
        truncated: true,
        parentId: "__demo_chat__",
        transcript: [
            "<think>Rate, burst, and the alarm have to share one write or Apply jumps when CloudWatch patches late.</think>",
            "<status>Reviewing applyUsagePlan...</status>",
            "<cat start=\"88\" end=\"180\">services/apigw/ThrottlePolicy.ts</cat>",
            "<cat start=\"1\" end=\"40\">services/apigw/policy/clamp.ts</cat>",
            "<search>applyUsagePlan burst clampRate</search>",
        ].join("\n"),
        startedAt: Date.now() - 11 * 60 * 1000,
    });
    upsertSubagent({
        id: "demo-sub-console",
        title: "Console Apply",
        agent: "Console Apply",
        model: "anthropic/claude-sonnet-4",
        activity: "Editing ThrottleApply.tsx",
        task: "Apply + alarm chip share one measure; banner must not jump",
        status: "running",
        phase: "editing",
        parentId: "__demo_chat__",
        transcript: [
            "<think>Apply and the alarm chip must share the same measure or the banner jumps after paint.</think>",
            "<status>Editing ThrottleApply.tsx</status>",
            "<cat start=\"1\" end=\"160\">services/apigw-console/ThrottleApply.tsx</cat>",
            "<edit file=\"services/apigw-console/ThrottleApply.tsx\">",
            "<original>variant: \"ghost\"</original>",
            "<replacement>variant: \"solid\"</replacement>",
            "</edit>",
        ].join("\n"),
        startedAt: Date.now() - 4 * 60 * 1000,
    });
    upsertSubagent({
        id: "demo-sub-alarms",
        title: "CloudWatch alarms",
        agent: "CloudWatch alarms",
        model: "openai/gpt-5",
        activity: "Comparing alarm write vs burst chip",
        task: "Alarm write must not collide with burst chip or live CW attach",
        status: "running",
        phase: "working",
        parentId: "__demo_chat__",
        transcript: [
            "<think>Alarm, burst chip, and live CloudWatch share the same vertical budget.</think>",
            "<status>Comparing alarm write vs burst chip</status>",
            "<cat start=\"40\" end=\"190\">services/apigw/CloudWatchAlarm.ts</cat>",
            "<cat start=\"12\" end=\"88\">services/apigw-console/AlarmChip.tsx</cat>",
            "<grep>nextWindow</grep>",
        ].join("\n"),
        startedAt: Date.now() - 2 * 60 * 1000,
    });
    let tick = 0;
    demoTimer = setInterval(() => {
        tick += 1;
        for (const [id, lines] of Object.entries(DEMO_ACTIVITY)) {
            const existing = cards.find((c) => c.id === id);
            if (!existing) continue;
            upsertSubagent({
                ...existing,
                activity: lines[tick % lines.length]!,
                status: "running",
            });
        }
    }, 4500);
}

export function syncSubagentsFromChunks(
    chunks: Array<{
        type?: string;
        file?: string;
        query?: string;
        command?: string;
        content?: string;
        commandStatus?: string;
        isGenerating?: boolean;
    }>,
    generating: boolean,
) {
    const seen = new Set<string>();
    for (const chunk of chunks) {
        if (chunk.type !== "subagent" && chunk.type !== "subagent_ref") continue;
        const id = chunk.file || chunk.query || chunk.content || `sub-${cards.length}`;
        seen.add(id);
        const raw = (chunk.commandStatus || "").toLowerCase();
        const status: SubagentStatus =
            raw === "error" || raw === "failed"
                ? "error"
                : raw === "done" || raw === "completed"
                  ? "done"
                  : raw === "pending"
                    ? "pending"
                    : raw === "running" || chunk.isGenerating || generating
                      ? "running"
                      : "done";
        const existing = cards.find((c) => c.id === id);
        upsertSubagent({
            id,
            title: chunk.query || chunk.file || existing?.title || "Subagent",
            agent: chunk.query,
            model: chunk.command,
            activity:
                (chunk.type === "subagent" ? existing?.activity : chunk.content)
                || existing?.activity
                || "Working…",
            task: chunk.type === "subagent_ref" ? chunk.content : existing?.task,
            transcript: chunk.type === "subagent" ? chunk.content : existing?.transcript,
            parentId: parentConversationId ?? existing?.parentId,
            status,
        });
    }
    if (!generating) {
        cards = cards.map((c) =>
            seen.has(c.id) || c.status === "done" || c.status === "error"
                ? c
                : { ...c, status: "done" as const, updatedAt: Date.now() },
        );
        emit();
    }
}
