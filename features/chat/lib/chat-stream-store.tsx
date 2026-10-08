"use client";

import React from "react";
import { listen } from "@tauri-apps/api/event";
import { commands } from "@/lib/backend";
import type { ChatMessage } from "@/lib/backend/types";
import { setChatGenerating } from "./generating-chats";
import { isDemoChatPinned } from "./demo-chat";
import { NEW_CHAT_TAB_ID } from "../ui/shell/tabs";
import { upsertTaggedBlockInContent } from "./upsert-stream-blocks";
function isForeignConversation(id?: string | null) {
    return Boolean(id && id.startsWith("mw-worker-"));
}

const TOOL_LABELS: Record<string, string> = {
    read_file: "Reading file",
    list_dir: "Listing directory",
    grep: "Searching",
    search_files: "Finding files",
    search_codebase: "Searching codebase",
    codebase_overview: "Mapping codebase",
    edit_file: "Editing file",
    run_terminal: "Running command",
    wait: "Waiting",
    read_terminal: "Reading terminal",
    list_terminals: "Listing terminals",
    inspect_runtime: "Inspecting page",
    ask_user: "Asking a question",
    render_design_previews: "Creating preview",
    update_todos: "Updating todos",
    save_plan: "Saving plan",
};

/** Explicit turn phase driven by Rust events — keeps chrome from lying. */
export type TurnPhase =
    | "idle"
    | "thinking"
    | "tool"
    | "awaiting_approval"
    | "running_command"
    | "editing"
    | "completed"
    | "failed"
    | "cancelled";

export type ChatStreamState = {
    isLoading: boolean;
    messages: ChatMessage[];
    activityLabel: string | null;
    turnPhase: TurnPhase;
    turnId: string | null;
    sendError: string | null;
    /** Older turns were folded into a model-facing summary (Cursor-style). */
    contextSummarized: boolean;
};

type LiveTurn = {
    conversationId: string | null;
    turnId: string | null;
    messages: ChatMessage[];
    activityLabel: string | null;
    turnPhase: TurnPhase;
};

type ChatStreamContextValue = ChatStreamState & {
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    setSendError: React.Dispatch<React.SetStateAction<string | null>>;
    setContextSummarized: React.Dispatch<React.SetStateAction<boolean>>;
    syncFromBackend: () => Promise<void>;
    appendUserOptimistic: (userMsg: string) => void;
    /** Keep the generating chat mounted in the background when the view changes. */
    setViewingConversation: (id: string | null) => void;
    /** Restore the in-flight chat without reloading from disk. */
    resumeLiveConversation: (id: string | null) => boolean;
    /** Instantly drop the live-turn spinner so Stop does not wait on the stream. */
    stopLiveTurn: () => void;
    /** Leave a running turn in the background and show an empty draft. */
    startDraftChat: () => void;
};

const defaultState: ChatStreamState = {
    isLoading: false,
    messages: [],
    activityLabel: null,
    turnPhase: "idle",
    turnId: null,
    sendError: null,
    contextSummarized: false,
};

const ChatStreamContext = React.createContext<ChatStreamContextValue | null>(null);

function appendAssistantChunk(prev: ChatMessage[], chunk: string): ChatMessage[] {
    const latest = prev[prev.length - 1];
    if (latest && latest.role === "assistant") {
        const updated = [...prev];
        updated[updated.length - 1] = {
            ...latest,
            content: upsertTaggedBlockInContent(latest.content, chunk),
        };
        return updated;
    }
    return [
        ...prev,
        { role: "assistant", content: chunk, timestamp: Date.now() / 1000 },
    ];
}

function phaseFromTool(tool: string | undefined): TurnPhase {
    if (tool === "run_terminal") return "running_command";
    if (tool === "edit_file" || tool === "create_file") return "editing";
    return "tool";
}

function labelForPhase(phase: TurnPhase, tool?: string, label?: string): string | null {
    if (label?.trim()) return label.trim();
    switch (phase) {
        case "thinking":
            return "Thinking";
        case "awaiting_approval":
            return "Waiting for approval";
        case "running_command":
            return "Running command";
        case "editing":
            return "Editing file";
        case "tool":
            if (tool) {
                const pretty = TOOL_LABELS[tool] ?? tool.replace(/_/g, " ");
                return pretty.charAt(0).toUpperCase() + pretty.slice(1);
            }
            return "Working";
        default:
            return null;
    }
}

export function ChatStreamProvider({ children }: { children: React.ReactNode }) {
    const [isLoading, setIsLoading] = React.useState(defaultState.isLoading);
    const [messages, setMessages] = React.useState<ChatMessage[]>(defaultState.messages);
    const [activityLabel, setActivityLabel] = React.useState<string | null>(null);
    const [turnPhase, setTurnPhase] = React.useState<TurnPhase>("idle");
    const [turnId, setTurnId] = React.useState<string | null>(null);
    const [sendError, setSendError] = React.useState<string | null>(null);
    const [contextSummarized, setContextSummarized] = React.useState(false);
    const viewingIdRef = React.useRef<string | null>(null);
    const liveTurnsRef = React.useRef<Map<string, LiveTurn>>(new Map());
    const messagesRef = React.useRef<ChatMessage[]>(messages);
    const turnIdRef = React.useRef<string | null>(null);
    const ignoredIdsRef = React.useRef<Set<string>>(new Set());
    const PENDING_KEY = "__pending__";

    React.useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    React.useEffect(() => {
        turnIdRef.current = turnId;
    }, [turnId]);

    const liveForView = React.useCallback(() => {
        const id = viewingIdRef.current;
        if (id) return liveTurnsRef.current.get(id) ?? null;
        return liveTurnsRef.current.get(PENDING_KEY) ?? null;
    }, []);

    const applyLive = React.useCallback((live: LiveTurn) => {
        turnIdRef.current = live.turnId;
        setMessages(live.messages);
        setIsLoading(true);
        setTurnId(live.turnId);
        setActivityLabel(live.activityLabel);
        setTurnPhase(live.turnPhase);
    }, []);

    const setViewingConversation = React.useCallback((id: string | null) => {
        viewingIdRef.current = id;
        const live = id
            ? liveTurnsRef.current.get(id) ?? null
            : liveTurnsRef.current.get(PENDING_KEY) ?? null;
        if (live) {
            applyLive(live);
            return;
        }
        turnIdRef.current = null;
        setIsLoading(false);
        setTurnId(null);
        setActivityLabel(null);
        setTurnPhase("idle");
    }, [applyLive]);

    const resumeLiveConversation = React.useCallback((id: string | null) => {
        if (!id) return false;
        const live = liveTurnsRef.current.get(id);
        if (!live) return false;
        viewingIdRef.current = id;
        applyLive(live);
        return true;
    }, [applyLive]);

    const syncFromBackend = React.useCallback(async () => {
        if (isDemoChatPinned()) return;
        try {
            const [history, gen, convId] = await Promise.all([
                commands.getChatHistory(),
                commands.getChatGenerationState(),
                commands.getCurrentConversationId().catch(() => null),
            ]);
            if (isDemoChatPinned()) return;
            viewingIdRef.current = convId ?? null;

            if (gen.isGenerating && gen.conversationId && !ignoredIdsRef.current.has(gen.conversationId)) {
                const liveId = gen.conversationId;
                const existing = liveTurnsRef.current.get(liveId);
                liveTurnsRef.current.set(liveId, {
                    conversationId: liveId,
                    turnId: gen.turnId ?? existing?.turnId ?? null,
                    messages: viewingIdRef.current === liveId ? history : (existing?.messages ?? history),
                    activityLabel: gen.activityLabel ?? existing?.activityLabel ?? "Thinking",
                    turnPhase: existing?.turnPhase ?? "thinking",
                });
            }

            const shown = liveForView();
            if (shown) {
                applyLive(shown);
                return;
            }

            setMessages(history);
            setIsLoading(false);
            turnIdRef.current = null;
            setTurnId(null);
            setActivityLabel(null);
            setTurnPhase("idle");
        } catch (err) {
            console.error("Failed to sync chat stream:", err);
        }
    }, [applyLive, liveForView]);

    const startDraftChat = React.useCallback(() => {
        viewingIdRef.current = "__draft__";
        turnIdRef.current = null;
        setIsLoading(false);
        setMessages([]);
        setActivityLabel(null);
        setTurnPhase("idle");
        setTurnId(null);
    }, []);

    const stopLiveTurn = React.useCallback(() => {
        const id = viewingIdRef.current;
        if (id) {
            ignoredIdsRef.current.add(id);
            liveTurnsRef.current.delete(id);
        } else {
            liveTurnsRef.current.delete(PENDING_KEY);
        }
        turnIdRef.current = null;
        setIsLoading(false);
        setActivityLabel(null);
        setTurnPhase("cancelled");
        setTurnId(null);
    }, []);

    const appendUserOptimistic = React.useCallback((userMsg: string) => {
        const optimisticTs = Date.now() / 1000;
        const next = [
            ...messagesRef.current,
            { role: "user" as const, content: userMsg, timestamp: optimisticTs },
            { role: "assistant" as const, content: "", timestamp: optimisticTs + 0.001 },
        ];
        const key = viewingIdRef.current || PENDING_KEY;
        ignoredIdsRef.current.delete(key);
        liveTurnsRef.current.set(key, {
            conversationId: viewingIdRef.current,
            turnId: null,
            messages: next,
            activityLabel: "Thinking",
            turnPhase: "thinking",
        });
        setMessages(next);
        setIsLoading(true);
        setTurnPhase("thinking");
        setActivityLabel("Thinking");
    }, []);

    React.useEffect(() => {
        let disposed = false;
        const unlisteners: (() => void)[] = [];
        const register = (promise: Promise<() => void>) => {
            void promise.then((fn) => {
                if (disposed) fn();
                else unlisteners.push(fn);
            });
        };

        const finishedTurns = new Set<string>();

        const resolveLiveKey = (conversationId?: string | null) => {
            if (conversationId && liveTurnsRef.current.has(conversationId)) return conversationId;
            const viewing = viewingIdRef.current;
            if (viewing && liveTurnsRef.current.has(viewing)) return viewing;
            if (liveTurnsRef.current.has(PENDING_KEY)) return PENDING_KEY;
            if (liveTurnsRef.current.size === 1) {
                return liveTurnsRef.current.keys().next().value ?? null;
            }
            return conversationId || null;
        };

        const patchLive = (conversationId: string | null | undefined, update: (live: LiveTurn) => void) => {
            const key = resolveLiveKey(conversationId);
            if (!key || ignoredIdsRef.current.has(key)) return;
            const live = liveTurnsRef.current.get(key);
            if (!live) return;
            update(live);
            const shown =
                (viewingIdRef.current && viewingIdRef.current === live.conversationId) ||
                (!viewingIdRef.current && key === PENDING_KEY);
            if (shown) {
                setMessages(live.messages);
                setIsLoading(true);
                setActivityLabel(live.activityLabel);
                setTurnPhase(live.turnPhase);
                setTurnId(live.turnId);
            }
        };

        register(
            listen<{
                turnId?: string;
                conversationId?: string;
                model?: string;
                usedAuto?: boolean;
            }>("chat_started", (event) => {
                const tid = event.payload?.turnId ?? null;
                const convId = event.payload?.conversationId ?? null;
                if (isForeignConversation(convId)) return;
                const startedModel = event.payload?.model;
                const usedAuto = event.payload?.usedAuto;
                if (convId) {
                    setChatGenerating(convId, true);
                    setChatGenerating(NEW_CHAT_TAB_ID, false);
                    ignoredIdsRef.current.delete(convId);
                }
                const pending = liveTurnsRef.current.get(PENDING_KEY);
                const existing = (convId && liveTurnsRef.current.get(convId)) || pending;
                let snapshot = existing?.messages ?? messagesRef.current;
                if (startedModel) {
                    const latest = snapshot[snapshot.length - 1];
                    if (latest?.role === "assistant") {
                        snapshot = [
                            ...snapshot.slice(0, -1),
                            {
                                ...latest,
                                model: startedModel,
                                stats: {
                                    ...latest.stats,
                                    usedAuto: usedAuto ?? latest.stats?.usedAuto,
                                },
                            },
                        ];
                    }
                }
                const key = convId || PENDING_KEY;
                liveTurnsRef.current.delete(PENDING_KEY);
                liveTurnsRef.current.set(key, {
                    conversationId: convId,
                    turnId: tid,
                    messages: snapshot,
                    activityLabel: "Thinking",
                    turnPhase: "thinking",
                });
                const stayOnThisTurn = !viewingIdRef.current || viewingIdRef.current === convId;
                if (stayOnThisTurn) {
                    viewingIdRef.current = convId;
                    turnIdRef.current = tid;
                    setIsLoading(true);
                    setSendError(null);
                    setTurnId(tid);
                    setTurnPhase("thinking");
                    setActivityLabel("Thinking");
                    setMessages(snapshot);
                }
            }),
        );

        register(
            listen<string | { chunk?: string; turnId?: string; conversationId?: string }>(
                "chat_token",
                (event) => {
                    const raw = event.payload;
                    const chunk =
                        typeof raw === "string" ? raw : typeof raw?.chunk === "string" ? raw.chunk : "";
                    if (!chunk) return;
                    const meta = typeof raw === "string" ? undefined : raw;
                    if (isForeignConversation(meta?.conversationId)) return;
                    if (meta?.turnId && finishedTurns.has(meta.turnId)) return;
                    const convId = meta?.conversationId ?? viewingIdRef.current;
                    if (convId && ignoredIdsRef.current.has(convId)) return;
                    const key = convId || PENDING_KEY;
                    if (!liveTurnsRef.current.has(key)) {
                        const pending = liveTurnsRef.current.get(PENDING_KEY);
                        if (pending && key !== PENDING_KEY) {
                            liveTurnsRef.current.delete(PENDING_KEY);
                            pending.conversationId = convId;
                            pending.turnId = meta?.turnId ?? pending.turnId;
                            liveTurnsRef.current.set(key, pending);
                        } else {
                            liveTurnsRef.current.set(key, {
                                conversationId: convId,
                                turnId: meta?.turnId ?? null,
                                messages: viewingIdRef.current === convId ? messagesRef.current : [],
                                activityLabel: "Thinking",
                                turnPhase: "thinking",
                            });
                        }
                    }
                    patchLive(convId, (live) => {
                        if (meta?.turnId) live.turnId = meta.turnId;
                        live.messages = appendAssistantChunk(live.messages, chunk);
                    });
                },
            ),
        );

        register(
            listen<{
                stats?: {
                    timeMs?: number;
                    cost?: number;
                    tokens?: number;
                    inputTokens?: number;
                    outputTokens?: number;
                    creditsCharged?: number;
                    usedAuto?: boolean;
                    autoPercent?: number;
                    reasoningEffort?: string;
                    mode?: string;
                    latencyMs?: number;
                    contextBreakdown?: Record<string, number> | null;
                };
                model?: string;
                error?: string;
                conversationId?: string;
                turnId?: string;
                content?: string;
            }>("chat_complete", (event) => {
                const { stats, model, error, conversationId, content, turnId } =
                    event.payload ?? {};
                if (isForeignConversation(conversationId)) return;
                if (turnId) finishedTurns.add(turnId);
                if (!error && stats) {
                    void import("@/lib/cloud/store").then(({ refreshShapeAuth }) => {
                        void refreshShapeAuth();
                    });
                    void import("@/lib/chat/last-turn-usage").then(({ setLastTurnUsage }) => {
                        setLastTurnUsage({
                            tokens: stats.tokens ?? ((stats.inputTokens ?? 0) + (stats.outputTokens ?? 0)),
                            inputTokens: stats.inputTokens,
                            creditsCharged: stats.creditsCharged ?? 0,
                            usedAuto: stats.usedAuto,
                        });
                    });
                }
                if (conversationId) {
                    setChatGenerating(conversationId, false);
                    ignoredIdsRef.current.delete(conversationId);
                    liveTurnsRef.current.delete(conversationId);
                } else {
                    liveTurnsRef.current.delete(PENDING_KEY);
                }
                setChatGenerating(NEW_CHAT_TAB_ID, false);
                const shown = !!conversationId && viewingIdRef.current === conversationId;
                if (!shown) {
                    if (conversationId) {
                        void import("@/lib/sidebar/chat-list-meta").then(({ markChatUnread }) => {
                            markChatUnread(conversationId);
                        });
                    }
                    if (!error) {
                        void import("@/lib/notifications/desktop").then(({ showDesktopNotification }) =>
                            showDesktopNotification("generationComplete", "Shape", "Generation finished"),
                        );
                    }
                    return;
                }
                turnIdRef.current = null;
                setIsLoading(false);
                setActivityLabel(null);
                setTurnPhase(
                    error === "Cancelled" ? "cancelled" : error ? "failed" : "completed",
                );
                setTurnId(null);
                if (error && error !== "Cancelled") {
                    setSendError(error);
                } else if (!error) {
                    void import("@/lib/notifications/desktop").then(({ showDesktopNotification }) =>
                        showDesktopNotification("generationComplete", "Shape", "Generation finished"),
                    );
                }
                // Cancelled turns are persisted server-side — resync so Stop
                // doesn't leave a wiped/empty assistant bubble.
                if (error === "Cancelled") {
                    void (async () => {
                        try {
                            const history = await commands.getChatHistory();
                            if (!viewingIdRef.current || viewingIdRef.current === conversationId) {
                                setMessages(history);
                                setIsLoading(false);
                                setActivityLabel(null);
                            }
                        } catch {
                            /* ignore */
                        }
                    })();
                    return;
                }
                setMessages((prev) => {
                    const latest = prev[prev.length - 1];
                    if (!latest || latest.role !== "assistant") return prev;
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                        ...latest,
                        content: typeof content === "string" && content.length > 0 ? content : latest.content,
                        stats: stats ?? latest.stats,
                        model: model ?? latest.model,
                    };
                    // After applying a chosen design concept, remove the temp React sandbox.
                    const priorUser = prev
                        .slice(0, -1)
                        .reverse()
                        .find((m) => m.role === "user");
                    if (
                        !error &&
                        (priorUser?.content?.includes("Selected design concept") ||
                            priorUser?.content?.includes('<shape_action type="design_selected"'))
                    ) {
                        void commands.cleanupDesignSandbox();
                    }
                    return updated;
                });
            }),
        );

        // Approval alerts: OS notification only when unfocused. Focused window
        // already has in-chat approval cards — no sticky in-app toasts.
        const notifiedApprovalIds = new Set<string>();
        const notifyApprovalOsOnly = (id: string | undefined, title: string, body: string) => {
            const key = id?.trim() || `${title}:${body}`;
            if (notifiedApprovalIds.has(key)) return;
            notifiedApprovalIds.add(key);
            void import("@/lib/notifications/desktop").then(({ showDesktopNotification }) =>
                showDesktopNotification("approvalRequired", title, body),
            );
        };

        register(
            listen<{
                id?: string;
                command?: string;
                reason?: string;
                safety?: string;
            }>("agent-command-pending", (event) => {
                const cmd = event.payload?.command?.trim() || "Command";
                const reason = event.payload?.reason?.trim();
                patchLive(undefined, (live) => {
                    live.turnPhase = "awaiting_approval";
                    live.activityLabel = "Waiting for approval";
                });
                notifyApprovalOsOnly(
                    event.payload?.id,
                    "Approval required",
                    reason ? `${cmd}: ${reason}` : cmd,
                );
            }),
        );

        register(
            listen<{
                id?: string;
                file?: string;
                reason?: string;
            }>("agent-edit-pending", (event) => {
                const file = event.payload?.file?.trim() || "file";
                const reason = event.payload?.reason?.trim();
                patchLive(undefined, (live) => {
                    live.turnPhase = "awaiting_approval";
                    live.activityLabel = "Waiting for edit approval";
                });
                notifyApprovalOsOnly(
                    event.payload?.id,
                    "Edit approval required",
                    reason ? `${file}: ${reason}` : file,
                );
            }),
        );

        register(
            listen<{ id?: string }>("agent-ask-pending", () => {
                patchLive(undefined, (live) => {
                    live.turnPhase = "awaiting_approval";
                    live.activityLabel = "Waiting for your answers";
                });
            }),
        );

        // Clear sticky approval labels once the user resolves the gate.
        register(
            listen<{ id?: string; approved?: boolean }>("agent-command-resolved", () => {
                patchLive(undefined, (live) => {
                    live.turnPhase = "running_command";
                    live.activityLabel = "Running command";
                });
            }),
        );
        register(
            listen<{ id?: string; approved?: boolean }>("agent-edit-resolved", () => {
                patchLive(undefined, (live) => {
                    live.turnPhase = "editing";
                    live.activityLabel = "Editing file";
                });
            }),
        );

        register(
            listen<{ phase?: string; tool?: string; label?: string }>("chat_status", (event) => {
                const { phase, tool, label } = event.payload ?? {};
                let nextPhase: TurnPhase | null = null;
                let nextLabel: string | null = null;
                if (phase === "approval") {
                    nextPhase = "awaiting_approval";
                    nextLabel = label?.trim() || "Waiting for approval";
                } else if (phase === "model") {
                    nextPhase = "thinking";
                    nextLabel = label?.trim() || "Thinking";
                } else if (phase === "tool") {
                    nextPhase = phaseFromTool(tool);
                    nextLabel = labelForPhase(nextPhase, tool, label);
                } else if (label?.trim()) {
                    nextLabel = label.trim();
                }
                if (!nextPhase && !nextLabel) return;
                patchLive(undefined, (live) => {
                    if (nextPhase) live.turnPhase = nextPhase;
                    if (nextLabel) live.activityLabel = nextLabel;
                });
            }),
        );

        register(
            listen<{ conversationId?: string }>("chat_context_summarized", (event) => {
                const convId = event.payload?.conversationId ?? null;
                patchLive(convId, (liveTurn) => {
                    liveTurn.activityLabel = "Summarizing context";
                });
                if (!convId || viewingIdRef.current === convId) setContextSummarized(true);
            }),
        );

        void syncFromBackend();

        return () => {
            disposed = true;
            unlisteners.forEach((fn) => fn());
        };
    }, [syncFromBackend]);

    const value: ChatStreamContextValue = {
        isLoading,
        messages,
        activityLabel,
        turnPhase,
        turnId,
        sendError,
        contextSummarized,
        setMessages,
        setSendError,
        setContextSummarized,
        syncFromBackend,
        appendUserOptimistic,
        setViewingConversation,
        resumeLiveConversation,
        stopLiveTurn,
        startDraftChat,
    };

    return (
        <ChatStreamContext.Provider value={value}>{children}</ChatStreamContext.Provider>
    );
}

export function useChatStream() {
    const ctx = React.useContext(ChatStreamContext);
    if (!ctx) {
        throw new Error("useChatStream must be used within ChatStreamProvider");
    }
    return ctx;
}

/** Safe variant for editor surfaces that may render outside ChatStreamProvider (e.g. popout). */
export function useChatStreamOptional(): ChatStreamState {
    const ctx = React.useContext(ChatStreamContext);
    return ctx ?? defaultState;
}
