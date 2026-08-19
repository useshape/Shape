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
    turnPhase: "idle",
    turnId: null,
    sendError: null,
    contextSummarized: false,
};

const ChatStreamContext = React.createContext<ChatStreamContextValue | null>(null);

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
            setTurnPhase(viewingThisTurn ? "thinking" : "idle");
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
                setTurnPhase("thinking");
                setActivityLabel("Thinking");
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
                if (!error && stats) {
                    void import("@/lib/last-turn-usage").then(({ setLastTurnUsage }) => {
                        setLastTurnUsage({
                            tokens: stats.tokens ?? ((stats.inputTokens ?? 0) + (stats.outputTokens ?? 0)),
                            creditsCharged: stats.creditsCharged ?? 0,
                            usedAuto: stats.usedAuto,
                        });
                    });
                }
                const forThisView = acceptsStream({
                    conversationId,
                    turnId: completeTurnId,
                });
                if (!forThisView) {
                    // Background chat finished — OS when unfocused, in-app toast when focused. Never both.
                    if (!error) {
                        const background = document.hidden || !document.hasFocus();
                        if (background) {
                            void import("@/lib/desktop-notifications").then(({ showDesktopNotification }) =>
                                showDesktopNotification(
                                    "generationComplete",
                                    "Shape",
                                    "Generation finished",
                                ),
                            );
                        } else {
                            void import("@/features/notifications").then(({ notify }) => {
                                notify.info("Shape", "Generation finished");
                            });
                        }
                    }
                    return;
                }
                setIsLoading(false);
                setActivityLabel(null);
                setTurnPhase(
                    error === "Cancelled" ? "cancelled" : error ? "failed" : "completed",
                );
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

        // Approval alerts: OS notification only when unfocused. Focused window
        // already has in-chat approval cards — no sticky in-app toasts.
        const notifiedApprovalIds = new Set<string>();
        const notifyApprovalOsOnly = (id: string | undefined, title: string, body: string) => {
            const key = id?.trim() || `${title}:${body}`;
            if (notifiedApprovalIds.has(key)) return;
            notifiedApprovalIds.add(key);
            if (document.hidden || !document.hasFocus()) {
                void import("@/lib/desktop-notifications").then(({ showDesktopNotification }) =>
                    showDesktopNotification("approvalRequired", title, body),
                );
            }
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
                if (turnIdRef.current) {
                    setTurnPhase("awaiting_approval");
                    setActivityLabel("Waiting for approval");
                }
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
                if (turnIdRef.current) {
                    setTurnPhase("awaiting_approval");
                    setActivityLabel("Waiting for edit approval");
                }
                notifyApprovalOsOnly(
                    event.payload?.id,
                    "Edit approval required",
                    reason ? `${file}: ${reason}` : file,
                );
            }),
        );

        // Clear sticky approval labels once the user resolves the gate.
        register(
            listen<{ id?: string; approved?: boolean }>("agent-command-resolved", () => {
                if (!turnIdRef.current) return;
                setTurnPhase("running_command");
                setActivityLabel("Running command");
            }),
        );
        register(
            listen<{ id?: string; approved?: boolean }>("agent-edit-resolved", () => {
                if (!turnIdRef.current) return;
                setTurnPhase("editing");
                setActivityLabel("Editing file");
            }),
        );

        register(
            listen<{ phase?: string; tool?: string; label?: string }>("chat_status", (event) => {
                // Ignore status from a background turn while viewing another chat.
                if (!turnIdRef.current) return;
                const { phase, tool, label } = event.payload ?? {};
                setIsLoading(true);
                if (phase === "approval") {
                    setTurnPhase("awaiting_approval");
                    setActivityLabel(label?.trim() || "Waiting for approval");
                    return;
                }
                if (phase === "model") {
                    setTurnPhase("thinking");
                    setActivityLabel(label?.trim() || "Thinking");
                    return;
                }
                if (phase === "tool") {
                    const next = phaseFromTool(tool);
                    setTurnPhase(next);
                    setActivityLabel(labelForPhase(next, tool, label));
                    return;
                }
                if (label && label.trim()) {
                    setActivityLabel(label.trim());
                }
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
                setActivityLabel("Summarizing context");
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
