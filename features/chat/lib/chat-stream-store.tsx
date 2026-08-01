"use client";

import React from "react";
import { listen } from "@tauri-apps/api/event";
import { commands } from "@/lib/backend";
import type { ChatMessage } from "@/lib/backend/types";

const TOOL_LABELS: Record<string, string> = {
    read_file: "Reading file",
    list_dir: "Listing directory",
    grep: "Searching",
    search_files: "Finding files",
    search_codebase: "Searching codebase",
    edit_file: "Editing file",
    run_terminal: "Running command",
    wait: "Waiting",
    read_terminal: "Reading terminal",
    list_terminals: "Listing terminals",
    render_design_previews: "Creating preview",
    update_todos: "Updating todos",
    save_plan: "Saving plan",
};

export type ChatStreamState = {
    isLoading: boolean;
    messages: ChatMessage[];
    activityLabel: string | null;
    turnId: string | null;
    sendError: string | null;
    /** Older turns were folded into a model-facing summary (Cursor-style). */
    contextSummarized: boolean;
};

type ChatStreamContextValue = ChatStreamState & {
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    setSendError: React.Dispatch<React.SetStateAction<string | null>>;
    setContextSummarized: React.Dispatch<React.SetStateAction<boolean>>;
    syncFromBackend: () => Promise<void>;
    appendUserOptimistic: (userMsg: string) => void;
};

const defaultState: ChatStreamState = {
    isLoading: false,
    messages: [],
    activityLabel: null,
    turnId: null,
    sendError: null,
    contextSummarized: false,
};

const ChatStreamContext = React.createContext<ChatStreamContextValue | null>(null);

export function ChatStreamProvider({ children }: { children: React.ReactNode }) {
    const [isLoading, setIsLoading] = React.useState(defaultState.isLoading);
    const [messages, setMessages] = React.useState<ChatMessage[]>(defaultState.messages);
    const [activityLabel, setActivityLabel] = React.useState<string | null>(null);
    const [turnId, setTurnId] = React.useState<string | null>(null);
    const [sendError, setSendError] = React.useState<string | null>(null);
    const [contextSummarized, setContextSummarized] = React.useState(false);
    const streamConversationIdRef = React.useRef<string | null>(null);
    const turnIdRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        turnIdRef.current = turnId;
    }, [turnId]);

    const syncFromBackend = React.useCallback(async () => {
        try {
            const [history, gen, convId] = await Promise.all([
                commands.getChatHistory(),
                commands.getChatGenerationState(),
                commands.getCurrentConversationId().catch(() => null),
            ]);
            setMessages(history);
            streamConversationIdRef.current = convId ?? null;
            // Only show loading for the conversation we're viewing - background
            // turns keep running without hijacking this chat's UI.
            const viewingThisTurn =
                !!gen.isGenerating
                && (!!gen.conversationId
                    ? gen.conversationId === (convId ?? null)
                    : !convId);
            setIsLoading(viewingThisTurn);
            turnIdRef.current = viewingThisTurn ? (gen.turnId ?? null) : null;
            setTurnId(viewingThisTurn ? (gen.turnId ?? null) : null);
            setActivityLabel(viewingThisTurn ? (gen.activityLabel ?? null) : null);
        } catch (err) {
            console.error("Failed to sync chat stream:", err);
        }
    }, []);

    const appendUserOptimistic = React.useCallback((userMsg: string) => {
        const optimisticTs = Date.now() / 1000;
        setMessages((prev) => [
            ...prev,
            { role: "user", content: userMsg, timestamp: optimisticTs },
            { role: "assistant", content: "", timestamp: optimisticTs + 0.001 },
        ]);
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

        const acceptsStream = (payload?: { turnId?: string; conversationId?: string }) => {
            if (!payload) return true;
            if (payload.turnId) {
                // Reject orphaned tokens after sync/switch cleared the active turn.
                if (!turnIdRef.current || payload.turnId !== turnIdRef.current) {
                    return false;
                }
            }
            if (payload.conversationId) {
                if (streamConversationIdRef.current !== payload.conversationId) {
                    return false;
                }
            }
            return true;
        };

        register(
            listen<{ turnId?: string; conversationId?: string }>("chat_started", (event) => {
                const tid = event.payload?.turnId ?? null;
                const convId = event.payload?.conversationId ?? null;
                // A new turn always belongs to the chat that started it - adopt it
                // if we're viewing that conversation (or a draft that just got an id).
                const viewing =
                    !streamConversationIdRef.current
                    || !convId
                    || streamConversationIdRef.current === convId;
                if (!viewing) return;
                turnIdRef.current = tid;
                streamConversationIdRef.current = convId ?? streamConversationIdRef.current;
                setIsLoading(true);
                setSendError(null);
                setTurnId(tid);
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
                    if (!acceptsStream(meta)) return;
                    setIsLoading(true);
                    setMessages((prev) => {
                        const latest = prev[prev.length - 1];
                        if (latest && latest.role === "assistant") {
                            const updated = [...prev];
                            updated[updated.length - 1] = {
                                ...latest,
                                content: latest.content + chunk,
                            };
                            return updated;
                        }
                        return [
                            ...prev,
                            {
                                role: "assistant",
                                content: chunk,
                                timestamp: Date.now() / 1000,
                            },
                        ];
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
                };
                model?: string;
                error?: string;
                conversationId?: string;
                turnId?: string;
            }>("chat_complete", (event) => {
                const { stats, model, error, conversationId, turnId: completeTurnId } =
                    event.payload ?? {};
                const forThisView = acceptsStream({
                    conversationId,
                    turnId: completeTurnId,
                });
                if (!forThisView) {
                    // Background chat finished - in-app toast; OS toast only when unfocused.
                    if (!error) {
                        void import("@/features/notifications").then(({ notify }) => {
                            notify.info("Shape", "Generation finished");
                        });
                        if (document.hidden || !document.hasFocus()) {
                            void import("@/lib/desktop-notifications").then(({ showDesktopNotification }) =>
                                showDesktopNotification(
                                    "generationComplete",
                                    "Shape",
                                    "Generation finished",
                                ),
                            );
                        }
                    }
                    return;
                }
                setIsLoading(false);
                setActivityLabel(null);
                turnIdRef.current = null;
                setTurnId(null);
                // Keep streamConversationIdRef as the viewing conversation.
                if (error && error !== "Cancelled") {
                    setSendError(error);
                    void import("@/features/notifications").then(({ notify }) => {
                        notify.error("Chat", error);
                    });
                } else if (!error && (document.hidden || !document.hasFocus())) {
                    void import("@/lib/desktop-notifications").then(({ showDesktopNotification }) =>
                        showDesktopNotification(
                            "generationComplete",
                            "Shape",
                            "Generation finished",
                        ),
                    );
                }
                // Cancelled turns are persisted server-side — resync so Stop
                // doesn't leave a wiped/empty assistant bubble.
                if (error === "Cancelled") {
                    void syncFromBackend();
                    return;
                }
                setMessages((prev) => {
                    const latest = prev[prev.length - 1];
                    if (!latest || latest.role !== "assistant") return prev;
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                        ...latest,
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

        register(
            listen<{
                id?: string;
                command?: string;
                reason?: string;
                safety?: string;
            }>("agent-command-pending", (event) => {
                const cmd = event.payload?.command?.trim() || "Command";
                const reason = event.payload?.reason?.trim();
                if (turnIdRef.current) {
                    setActivityLabel("Waiting for approval");
                }
                // Prefer in-app toast; OS toasts on Windows look like PowerShell and
                // are reserved for when the app is in the background.
                const body = reason ? `${cmd}: ${reason}` : cmd;
                void import("@/features/notifications").then(({ notify }) => {
                    notify.warning("Approval required", body);
                });
                if (document.hidden || !document.hasFocus()) {
                    void import("@/lib/desktop-notifications").then(({ showDesktopNotification }) =>
                        showDesktopNotification("approvalRequired", "Approval required", body),
                    );
                }
            }),
        );

        register(
            listen<{ phase?: string; tool?: string; label?: string }>("chat_status", (event) => {
                // Ignore status from a background turn while viewing another chat.
                if (!turnIdRef.current) return;
                const { phase, tool, label } = event.payload ?? {};
                setIsLoading(true);
                setActivityLabel((prev) => {
                    if (prev === "Waiting for approval") {
                        // Stay until the turn leaves the terminal tool phase.
                        if (phase === "tool" && (!tool || tool === "run_terminal")) return prev;
                    }
                    if (label && label.trim()) return label.trim();
                    if (phase === "tool" && tool) {
                        const pretty = TOOL_LABELS[tool] ?? tool.replace(/_/g, " ");
                        return pretty.charAt(0).toUpperCase() + pretty.slice(1);
                    }
                    return null;
                });
            }),
        );

        register(
            listen<{ conversationId?: string }>("chat_context_summarized", (event) => {
                const convId = event.payload?.conversationId ?? null;
                if (
                    convId
                    && streamConversationIdRef.current
                    && streamConversationIdRef.current !== convId
                ) {
                    return;
                }
                setContextSummarized(true);
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
        turnId,
        sendError,
        contextSummarized,
        setMessages,
        setSendError,
        setContextSummarized,
        syncFromBackend,
        appendUserOptimistic,
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
