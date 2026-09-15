export type SubagentStatus = "pending" | "running" | "done" | "error";
export type SubagentPhase = "reviewing" | "editing" | "working";
export type SubagentRead = { path: string; start?: number; end?: number };

export type SubagentCard = {
    id: string;
    title: string;
    agent?: string;
    model?: string;
    activity: string;
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
const listeners = new Set<Listener>();

function emit() {
    for (const l of listeners) l();
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

export function resetSubagents() {
    cards = [];
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

let demoTimer: ReturnType<typeof setTimeout> | null = null;

export function seedDemoSubagents() {
    if (demoTimer) {
        clearTimeout(demoTimer);
        demoTimer = null;
    }
    resetSubagents();
    upsertSubagent({
        id: "demo-sub-player",
        title: "Watch-page player",
        agent: "Watch-page player",
        model: "auto",
        activity: "Reviewing changes...",
        status: "running",
        phase: "reviewing",
        reads: [
            { path: "youtube/watch/player/WatchPlayer.ts", start: 301, end: 561 },
            { path: "youtube/watch/layout/TheaterLayout.ts", start: 12, end: 188 },
        ],
        tokens: 84000,
        truncated: true,
        startedAt: Date.now() - 11 * 60 * 1000,
    });
    upsertSubagent({
        id: "demo-sub-comments",
        title: "Comments density",
        agent: "Comments density",
        model: "anthropic/claude-sonnet-4",
        activity: "Editing CommentThread.tsx",
        status: "running",
        phase: "editing",
        startedAt: Date.now() - 4 * 60 * 1000,
    });
    upsertSubagent({
        id: "demo-sub-ads",
        title: "Midroll scheduler",
        agent: "Midroll scheduler",
        model: "openai/gpt-5",
        activity: "Comparing Super Thanks chip vs ad pod",
        status: "running",
        phase: "working",
        startedAt: Date.now() - 2 * 60 * 1000,
    });
    demoTimer = setTimeout(() => {
        upsertSubagent({
            id: "demo-sub-player",
            title: "Watch-page player",
            activity: "Done: theater + dense two-column without clipping controls",
            status: "done",
            phase: "working",
            truncated: false,
        });
        upsertSubagent({
            id: "demo-sub-comments",
            title: "Comments density",
            activity: "Done: sort + live chat share one measure pass",
            status: "done",
            phase: "working",
        });
        upsertSubagent({
            id: "demo-sub-ads",
            title: "Midroll scheduler",
            activity: "Done: Super Thanks chip stays above the ad pod",
            status: "done",
            phase: "working",
        });
        demoTimer = null;
    }, 8000);
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
        upsertSubagent({
            id,
            title: chunk.query || chunk.file || "Subagent",
            agent: chunk.query,
            model: chunk.command,
            activity: chunk.content || "Working…",
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
