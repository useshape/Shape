"use client";

import React from "react";
import { listen } from "@tauri-apps/api/event";
import { commands, Conversation, useProjectState } from "@/lib/backend";
import { useChatStream } from "./chat-stream-store";
import { NEW_CHAT_TAB_ID, DEMO_CHAT_TAB_ID, isEphemeralChatTabId, type ChatTab } from "../ui/shell/tabs";
import { openChatHistoryMenu } from "../ui/shell/history";
import { parseMessageContent, type Chunk } from "../ui/md/renderer";
import {
    setProposedEdit,
    getProposedEdit,
    clearProposedEdit,
    clearAllProposedEdits,
    setCurrentConversationId,
    markFileResolved,
    isFileResolved,
    getResolvedFiles,
    getResolvedContentHash,
    editContentHash,
    pathsEqual,
} from "./proposed-edits";
import {
    resolveChatFilePath,
    syncProposedEditsFromMessages,
    groupChatMessages,
} from "./chat-session-utils";
import { getSettings, hasByokApiKeys } from "@/lib/settings";
import { getVisibleModels, resolveChatModels } from "@/lib/models";
import { getCatalogModels } from "@/lib/catalog-store";
import { useShapeAuth } from "@/lib/cloud/store";
import { notify } from "@/features/notifications";
import { captureTelemetry, captureTelemetryError } from "@/lib/telemetry";
import { messageLengthBucket } from "@/lib/telemetry/sanitize";
import { buildMessageWithMentions, type SelectionSnapshot } from "@/lib/chat-mentions";
import { buildPlanBuildMessage } from "@/lib/shape-continue-action";
import { isolatePlanBranch } from "@/lib/plan-branch";
import { loadProjectRules } from "@/lib/project-rules";
import { isWorkspaceTrusted } from "@/lib/workspace-trust";
import { clearAllDesignPreviewSessions } from "@/lib/agent-preview/store";
import {
    createPendingAttachment,
    processAttachment,
    type ComposerAttachment,
} from "@/features/chat/ui/composer/attachments";

function chatTabsStorageKey(projectPath: string | null | undefined) {
    const norm = (projectPath || "").replace(/\\/g, "/").toLowerCase();
    return `shape-chat-open-tabs:${norm || "__none__"}`;
}

function readPersistedChatTabs(projectPath: string | null | undefined): {
    tabs: ChatTab[];
    activeId: string;
} | null {
    try {
        const raw = localStorage.getItem(chatTabsStorageKey(projectPath));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { tabs?: ChatTab[]; activeId?: string };
        if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return null;
        const tabs = parsed.tabs.filter(
            (t) => t && typeof t.id === "string" && typeof t.title === "string",
        );
        if (tabs.length === 0) return null;
        const activeId =
            typeof parsed.activeId === "string"
            && tabs.some((t) => t.id === parsed.activeId)
                ? parsed.activeId
                : tabs[0]!.id;
        return { tabs, activeId };
    } catch {
        return null;
    }
}

function writePersistedChatTabs(
    projectPath: string | null | undefined,
    tabs: ChatTab[],
    activeId: string,
) {
    try {
        const persistable = tabs.filter(
            (t) => !isEphemeralChatTabId(t.id) || t.id === NEW_CHAT_TAB_ID || t.id === DEMO_CHAT_TAB_ID,
        );
        const nextActive = isEphemeralChatTabId(activeId) && activeId !== NEW_CHAT_TAB_ID
            ? (persistable[0]?.id ?? NEW_CHAT_TAB_ID)
            : activeId;
        localStorage.setItem(
            chatTabsStorageKey(projectPath),
            JSON.stringify({ tabs: persistable, activeId: nextActive }),
        );
    } catch {
        /* ignore */
    }
}

export function useChatSession() {
    const [uploadedFiles, setUploadedFiles] = React.useState<ComposerAttachment[]>([]);

    const addUploadedFiles = React.useCallback((files: File[]) => {
        if (files.length === 0) return;
        const pending = files.map(createPendingAttachment);
        setUploadedFiles((prev) => [...prev, ...pending]);
        for (const att of pending) {
            void processAttachment(att).then((ready) => {
                setUploadedFiles((prev) => prev.map((a) => (a.id === ready.id ? ready : a)));
            });
        }
    }, []);
    const [inputValue, setInputValue] = React.useState(() => {
        try {
            return localStorage.getItem("shape-chat-input") || "";
        } catch {
            return "";
        }
    });
    const [messageQueue, setMessageQueue] = React.useState<{ id: string; content: string }[]>([]);
    const messageQueueRef = React.useRef(messageQueue);
    messageQueueRef.current = messageQueue;
    const editingQueueIdRef = React.useRef<string | null>(null);
    const {
        messages,
        setMessages,
        isLoading,
        activityLabel,
        sendError,
        setSendError,
        contextSummarized,
        setContextSummarized,
        syncFromBackend,
        appendUserOptimistic,
        setViewingConversation,
        resumeLiveConversation,
        stopLiveTurn,
    } = useChatStream();
    const [recentConvs, setRecentConvs] = React.useState<Conversation[]>([]);
    const [chatTitle, setChatTitle] = React.useState<string>("New Chat");
    const [openChatTabs, setOpenChatTabs] = React.useState<ChatTab[]>([
        { id: NEW_CHAT_TAB_ID, title: "New Chat" },
        { id: DEMO_CHAT_TAB_ID, title: "Demo", models: ["auto"] },
    ]);
    const [activeChatTabId, setActiveChatTabId] = React.useState<string>(NEW_CHAT_TAB_ID);
    const [selectedModel, setSelectedModel] = React.useState("auto");
    const [selectedMode, setSelectedMode] = React.useState("Code");
    const [reasoningEffort, setReasoningEffort] = React.useState<"low" | "high" | "ultra" | "max">("low");
    const [fastMode, setFastMode] = React.useState(true);
    const tabsHydratedForRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        setSelectedMode((mode) =>
            mode === "Debug" || mode === "Security"
                ? "Review"
                : mode === "Design"
                  ? "Visual"
                  : mode,
        );
    }, []);
    const [conversationId, setConversationId] = React.useState<string | null>(null);

    const syncOpenTabs = React.useCallback((convId: string | null, title: string) => {
        if (!convId) {
            setActiveChatTabId(NEW_CHAT_TAB_ID);
            setOpenChatTabs((prev) => {
                const hasDraft = prev.some((tab) => tab.id === NEW_CHAT_TAB_ID);
                if (hasDraft) {
                    return prev.map((tab) =>
                        tab.id === NEW_CHAT_TAB_ID ? { ...tab, title: title || "New Chat" } : tab,
                    );
                }
                return [{ id: NEW_CHAT_TAB_ID, title: title || "New Chat" }, ...prev];
            });
            return;
        }

        setActiveChatTabId(convId);
        setOpenChatTabs((prev) => {
            const withoutDraft = prev.filter((tab) => tab.id !== NEW_CHAT_TAB_ID);
            const existing = withoutDraft.find((tab) => tab.id === convId);
            if (existing) {
                return withoutDraft.map((tab) =>
                    tab.id === convId ? { ...tab, title: title || tab.title } : tab,
                );
            }
            return [...withoutDraft, { id: convId, title: title || "Chat" }];
        });
    }, []);

    const [resolvedFiles, setResolvedFiles] = React.useState<Set<string>>(() => new Set());
    /** Bumped on every Keep/Undo so pendingEdits recomputes after localStorage resolve. */
    const [resolveRevision, setResolveRevision] = React.useState(0);

    const { project_path } = useProjectState();
    const shapeAuth = useShapeAuth();
    const [tabsReady, setTabsReady] = React.useState(false);

    // Restore open chat tabs per repo so switching projects keeps your session strip.
    React.useEffect(() => {
        let cancelled = false;
        setTabsReady(false);
        const key = chatTabsStorageKey(project_path);
        tabsHydratedForRef.current = key;

        void (async () => {
            const persisted = readPersistedChatTabs(project_path);
            if (persisted) {
                const tabs = [...persisted.tabs];
                if (!tabs.some((t) => t.id === DEMO_CHAT_TAB_ID)) {
                    tabs.push({ id: DEMO_CHAT_TAB_ID, title: "Watch page density", models: ["auto"] });
                }
                if (!tabs.some((t) => t.id === NEW_CHAT_TAB_ID)) {
                    tabs.unshift({ id: NEW_CHAT_TAB_ID, title: "New Chat" });
                }
                setOpenChatTabs(tabs);
                setActiveChatTabId(persisted.activeId);
                if (persisted.activeId !== NEW_CHAT_TAB_ID && !isEphemeralChatTabId(persisted.activeId)) {
                    try {
                        await commands.loadConversation(
                            persisted.activeId,
                            project_path ?? undefined,
                        );
                        if (!cancelled) {
                            clearAllDesignPreviewSessions();
                            setContextSummarized(false);
                        }
                    } catch (err) {
                        // Ephemeral / deleted tabs — fall back to a draft quietly.
                        if (!cancelled) {
                            setOpenChatTabs([
                                { id: NEW_CHAT_TAB_ID, title: "New Chat" },
                                { id: DEMO_CHAT_TAB_ID, title: "Demo", models: ["auto"] },
                            ]);
                            setActiveChatTabId(NEW_CHAT_TAB_ID);
                        }
                    }
                } else if (persisted.activeId === DEMO_CHAT_TAB_ID) {
                    // Demo is in-memory only — rebuild if the tab was persisted.
                    const { buildDemoChatMessages } = await import("./demo-chat");
                    if (!cancelled) {
                        setMessages(buildDemoChatMessages());
                        void import("@/features/agent/subagents/store").then(({ seedDemoSubagents }) => {
                            seedDemoSubagents();
                        });
                        setOpenChatTabs((prev) => {
                            if (prev.some((t) => t.id === DEMO_CHAT_TAB_ID)) return prev;
                            return [...prev, { id: DEMO_CHAT_TAB_ID, title: "Demo", models: ["auto"] }];
                        });
                        setActiveChatTabId(DEMO_CHAT_TAB_ID);
                    }
                }
            } else {
                setOpenChatTabs([
                    { id: NEW_CHAT_TAB_ID, title: "New Chat" },
                    { id: DEMO_CHAT_TAB_ID, title: "Demo", models: ["auto"] },
                ]);
                setActiveChatTabId(NEW_CHAT_TAB_ID);
            }
            if (!cancelled) setTabsReady(true);
        })();

        return () => {
            cancelled = true;
        };
    }, [project_path, setContextSummarized]);

    React.useEffect(() => {
        if (!tabsReady) return;
        writePersistedChatTabs(project_path, openChatTabs, activeChatTabId);
    }, [tabsReady, project_path, openChatTabs, activeChatTabId]);

    React.useEffect(() => {
        window.dispatchEvent(
            new CustomEvent("shape-chat-active", { detail: { id: activeChatTabId } }),
        );
    }, [activeChatTabId]);

    React.useEffect(() => {
        const models = [
            ...new Set(
                messages
                    .filter((m) => m.role === "assistant" && m.model)
                    .map((m) => m.model as string)
                    .slice(-4),
            ),
        ];
        setOpenChatTabs((prev) =>
            prev.map((tab) => {
                if (tab.id !== activeChatTabId) return tab;
                const same =
                    (tab.models?.length ?? 0) === models.length
                    && (tab.models ?? []).every((m, i) => m === models[i]);
                return same ? tab : { ...tab, models };
            }),
        );
    }, [messages, activeChatTabId]);

    // Latest editor selection, kept live by editor-view.tsx so an `@selection`
    // mention in the message always resolves against what's selected right now.
    const selectionContextRef = React.useRef<SelectionSnapshot | null>(null);
    React.useEffect(() => {
        const handleSelection = (e: Event) => {
            const detail = (e as CustomEvent<SelectionSnapshot | null>).detail;
            selectionContextRef.current = detail ?? null;
        };
        window.addEventListener("shape-editor-selection", handleSelection as EventListener);
        return () => window.removeEventListener("shape-editor-selection", handleSelection as EventListener);
    }, []);

    const isEditResolved = React.useCallback(
        (editFile: string, replacement?: string) => {
            if (conversationId) {
                return isFileResolved(conversationId, editFile, replacement);
            }
            // Before a conversation id exists, fall back to the session Set.
            if (replacement !== undefined) return false;
            for (const r of resolvedFiles) {
                if (pathsEqual(r, editFile)) return true;
            }
            return false;
        },
        [resolvedFiles, conversationId],
    );

    const markEditResolved = React.useCallback(
        async (file: string, status: "applied" | "rejected", replacement?: string) => {
            const n = file.replace(/\\/g, "/").toLowerCase();
            setResolvedFiles((prev) => {
                const s = new Set(prev);
                s.add(n);
                return s;
            });
            let convId = conversationId;
            if (!convId) {
                convId = await commands.getCurrentConversationId();
                if (convId) {
                    setConversationId(convId);
                    setCurrentConversationId(convId);
                }
            }
            if (convId) {
                markFileResolved(convId, file, status, replacement);
            }
            setResolveRevision((v) => v + 1);
        },
        [conversationId],
    );

    const pendingEdits = React.useMemo(() => {
        type Pending = {
            id: string;
            file: string;
            baseline: string;
            original: string;
            replacement: string;
        };

        type Step = { id: string; file: string; original: string; replacement: string };
        const stepsByFile = new Map<string, Step[]>();

        const isReviewableEdit = (c: Chunk): c is Chunk & { file: string } => {
            if (!c.file) return false;
            if (c.type === "edit") return true;
            // Applied edits under require-edit-approval land as edit_pending status=applied.
            if (c.type === "edit_pending" && (c.commandStatus === "applied" || c.commandStatus === "approved")) {
                return true;
            }
            return false;
        };

        messages.forEach((m, msgIdx) => {
            if (m.role !== "assistant") return;
            const chunks = parseMessageContent(m.content);
            const editsInMsg = chunks.filter(isReviewableEdit);

            editsInMsg.forEach((e, editIdx) => {
                const list = stepsByFile.get(e.file) || [];
                list.push({
                    id: `msg-${msgIdx}-${editIdx}-${e.file}`,
                    file: e.file,
                    original: e.original || "",
                    replacement: e.replacement || "",
                });
                stepsByFile.set(e.file, list);
            });
        });

        const edits: Pending[] = [];
        stepsByFile.forEach((steps, file) => {
            // Session Set covers the no-conversationId fallback and immediate Keep/Undo.
            if (!conversationId) {
                const n = file.replace(/\\/g, "/").toLowerCase();
                if ([...resolvedFiles].some((r) => pathsEqual(r, n))) return;
            }

            const resolvedHash = getResolvedContentHash(conversationId, file);
            let startIdx = 0;
            if (resolvedHash) {
                let lastResolved = -1;
                for (let i = 0; i < steps.length; i++) {
                    if (editContentHash(steps[i].replacement) === resolvedHash) {
                        lastResolved = i;
                    }
                }
                if (lastResolved >= 0) {
                    if (lastResolved === steps.length - 1) return;
                    startIdx = lastResolved + 1;
                } else if (isFileResolved(conversationId, file, steps[steps.length - 1]?.replacement)) {
                    return;
                } else if (isFileResolved(conversationId, file)) {
                    startIdx = Math.max(0, steps.length - 1);
                }
            } else if (isFileResolved(conversationId, file, steps[steps.length - 1]?.replacement)) {
                return;
            } else if (isFileResolved(conversationId, file)) {
                return;
            }

            const chain = steps.slice(startIdx);
            if (chain.length === 0) return;
            const latest = chain[chain.length - 1];
            edits.push({
                id: latest.id,
                file,
                baseline: chain[0].original,
                original: latest.original,
                replacement: latest.replacement,
            });
        });

        return edits;
        // resolveRevision forces recompute after Keep/Undo writes localStorage.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, conversationId, resolvedFiles, resolveRevision]);

    React.useEffect(() => {
        pendingEdits.forEach((edit) => {
            if (conversationId && isFileResolved(conversationId, edit.file, edit.replacement)) {
                clearProposedEdit(edit.file);
                return;
            }
            if (!conversationId && [...resolvedFiles].some((r) => pathsEqual(r, edit.file))) {
                clearProposedEdit(edit.file);
                return;
            }
            const existing = getProposedEdit(edit.file);
            if (
                !existing
                || existing.original !== edit.original
                || existing.replacement !== edit.replacement
                || existing.baseline !== edit.baseline
            ) {
                setProposedEdit(edit.file, {
                    original: edit.original,
                    replacement: edit.replacement,
                    baseline: edit.baseline,
                    id: edit.id,
                });
            }
        });
    }, [pendingEdits, conversationId, resolvedFiles]);

    const handleAcceptAll = async () => {
        for (const edit of pendingEdits) {
            await markEditResolved(edit.file, "applied", edit.replacement);
            const resolved = resolveChatFilePath(edit.file, project_path);
            window.dispatchEvent(
                new CustomEvent("shape-dismiss-diff", {
                    detail: { path: resolved, rawPath: edit.file },
                }),
            );
        }
    };

    const handleRejectAll = async () => {
        const failures: string[] = [];
        for (const edit of pendingEdits) {
            const resolved = resolveChatFilePath(edit.file, project_path);
            try {
                await commands.applyFileEdit(resolved, "", edit.baseline);
            } catch (e) {
                console.error("Failed to revert edit for", edit.file, e);
                failures.push(edit.file.split(/[\\/]/).pop() || edit.file);
            }
            await markEditResolved(edit.file, "rejected", edit.replacement);
            window.dispatchEvent(
                new CustomEvent("shape-dismiss-diff", {
                    detail: { path: resolved, rawPath: edit.file },
                }),
            );
        }
        if (failures.length > 0) {
            notify.error(
                "Undo failed",
                `Could not restore ${failures.length === 1 ? failures[0] : `${failures.length} files`}.`,
            );
        }
    };

    const handleAcceptEdit = async (editId: string) => {
        const edit = pendingEdits.find((e) => e.id === editId);
        if (!edit) return;
        await markEditResolved(edit.file, "applied", edit.replacement);
        const resolved = resolveChatFilePath(edit.file, project_path);
        window.dispatchEvent(
            new CustomEvent("shape-dismiss-diff", {
                detail: { path: resolved, rawPath: edit.file },
            }),
        );
    };

    const handleRejectEdit = async (editId: string) => {
        const edit = pendingEdits.find((e) => e.id === editId);
        if (!edit) return;
        const resolved = resolveChatFilePath(edit.file, project_path);
        try {
            await commands.applyFileEdit(resolved, "", edit.baseline);
        } catch (e) {
            console.error("Failed to revert edit for", edit.file, e);
            notify.error(
                "Undo failed",
                `Could not restore ${edit.file.split(/[\\/]/).pop() || edit.file}.`,
            );
        }
        await markEditResolved(edit.file, "rejected", edit.replacement);
        window.dispatchEvent(
            new CustomEvent("shape-dismiss-diff", {
                detail: { path: resolved, rawPath: edit.file },
            }),
        );
    };

    const prevPendingCountRef = React.useRef(0);
    React.useEffect(() => {
        if (!getSettings().ai.autoApplyEdits) {
            prevPendingCountRef.current = pendingEdits.length;
            return;
        }
        if (pendingEdits.length > prevPendingCountRef.current) {
            const newEdits = pendingEdits.slice(prevPendingCountRef.current);
            for (const edit of newEdits) {
                void handleAcceptEdit(edit.id);
            }
        }
        prevPendingCountRef.current = pendingEdits.length;
    }, [pendingEdits, handleAcceptEdit]);

    const isLoadingRef = React.useRef(false);
    React.useEffect(() => {
        isLoadingRef.current = isLoading;
    }, [isLoading]);

    const activeChatTabIdRef = React.useRef(activeChatTabId);
    React.useEffect(() => {
        activeChatTabIdRef.current = activeChatTabId;
    }, [activeChatTabId]);

    const refreshMetadata = React.useCallback(async () => {
        try {
            const convs = await commands.getConversations(project_path ?? undefined);
            const title = await commands.getChatTitle();
            const convId = await commands.getCurrentConversationId();
            setRecentConvs(convs);
            setChatTitle(title);
            setConversationId(convId);
            setCurrentConversationId(convId);
            syncOpenTabs(convId, title);
        } catch (err) {
            console.error("Failed to refresh chat metadata:", err);
        }
    }, [project_path, syncOpenTabs]);

    const conversationIdRef = React.useRef(conversationId);
    React.useEffect(() => {
        conversationIdRef.current = conversationId;
    }, [conversationId]);

    const refreshHistory = React.useCallback(
        async (reloadConversation = false) => {
            if (isLoadingRef.current && !reloadConversation) {
                await syncFromBackend();
                await refreshMetadata();
                return;
            }
            try {
                const convs = await commands.getConversations(project_path ?? undefined);
                const title = await commands.getChatTitle();
                const convId = await commands.getCurrentConversationId();

                setRecentConvs(convs);
                setChatTitle(title);
                setConversationId(convId);
                setCurrentConversationId(convId);
                syncOpenTabs(convId, title);

                await syncFromBackend();
                const currentHistory = await commands.getChatHistory();
                syncProposedEditsFromMessages(currentHistory, convId);

                if (convId) {
                    const persisted = getResolvedFiles(convId);
                    setResolvedFiles(new Set(Object.keys(persisted)));
                }
            } catch (err) {
                console.error("Failed to load chat history:", err);
            }
        },
        [project_path, refreshMetadata, syncFromBackend, syncOpenTabs],
    );

    React.useEffect(() => {
        if (!tabsReady) return;
        void refreshHistory();
    }, [tabsReady, refreshHistory]);

    React.useEffect(() => {
        if (project_path) {
            void captureTelemetry("project_opened");
        }
    }, [project_path]);

    React.useEffect(() => {
        void syncFromBackend();
    }, [syncFromBackend]);

    React.useEffect(() => {
        const handleRefresh = () => refreshHistory(true);
        window.addEventListener("shape-chat-refresh", handleRefresh);
        return () => window.removeEventListener("shape-chat-refresh", handleRefresh);
    }, [refreshHistory]);

    React.useEffect(() => {
        const handleEditorEditAction = (e: Event) => {
            const custom = e as CustomEvent<{
                path: string;
                action: "applied" | "rejected";
                replacement?: string;
            }>;
            if (!custom.detail) return;
            const { path, action } = custom.detail;
            const proposed = getProposedEdit(path);
            const replacement = custom.detail.replacement ?? proposed?.replacement;
            const n = path.replace(/\\/g, "/").toLowerCase();
            setResolvedFiles((prev) => {
                const s = new Set(prev);
                s.add(n);
                return s;
            });
            const convId = conversationIdRef.current;
            if (convId) {
                markFileResolved(convId, path, action, replacement);
            }
            clearProposedEdit(path);
        };
        window.addEventListener("shape-editor-edit-action", handleEditorEditAction as EventListener);
        return () =>
            window.removeEventListener("shape-editor-edit-action", handleEditorEditAction as EventListener);
    }, []);

    const inputValueRef = React.useRef(inputValue);
    React.useEffect(() => {
        inputValueRef.current = inputValue;
    }, [inputValue]);

    React.useEffect(() => {
        const persist = () => {
            try {
                localStorage.setItem("shape-chat-input", inputValueRef.current);
            } catch {
                /* ignore */
            }
        };
        // Keep draft durable across blur / close even if last keystroke missed storage.
        window.addEventListener("pagehide", persist);
        window.addEventListener("beforeunload", persist);
        const onVis = () => {
            if (document.visibilityState === "hidden") persist();
        };
        document.addEventListener("visibilitychange", onVis);
        return () => {
            window.removeEventListener("pagehide", persist);
            window.removeEventListener("beforeunload", persist);
            document.removeEventListener("visibilitychange", onVis);
        };
    }, []);

    // Cycle Chat Mode via global keybinding registry (see config/keybindings.json).
    React.useEffect(() => {
        const onCycle = () => {
            setSelectedMode((prev) => {
                if (prev === "Code") return "Ask";
                if (prev === "Ask") return "Plan";
                return "Code";
            });
        };
        window.addEventListener("shape-chat-cycle-mode", onCycle);
        return () => window.removeEventListener("shape-chat-cycle-mode", onCycle);
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setInputValue(val);
        const editingId = editingQueueIdRef.current;
        if (editingId) {
            setMessageQueue((prev) =>
                prev.map((m) => (m.id === editingId ? { ...m, content: val } : m)),
            );
        }
        try {
            localStorage.setItem("shape-chat-input", val);
        } catch {
            /* ignore */
        }
        if (sendError) setSendError(null);
    };

    const handleSendMessageRef = React.useRef<(overrideContent?: string) => Promise<boolean>>(async () => false);
    const handleNewChatRef = React.useRef<() => Promise<void>>(async () => {});
    const sendingInFlightRef = React.useRef(false);

    const handleSendMessage = async (overrideContent?: string): Promise<boolean> => {
        const messageContent = typeof overrideContent === "string" ? overrideContent : inputValue;
        const fromQueue = typeof overrideContent === "string";

        if (!fromQueue && isLoading) {
            if (!messageContent.trim() && uploadedFiles.length === 0) return false;
            if (uploadedFiles.length > 0) return false;
            const editingId = editingQueueIdRef.current;
            if (editingId) {
                setMessageQueue((prev) =>
                    prev.map((m) =>
                        m.id === editingId ? { ...m, content: messageContent.trim() } : m,
                    ),
                );
                setInputValue("");
                editingQueueIdRef.current = null;
                try {
                    localStorage.removeItem("shape-chat-input");
                } catch {
                    /* ignore */
                }
                return true;
            }
            const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            setMessageQueue((prev) => [...prev, { id, content: messageContent.trim() }]);
            setInputValue("");
            try {
                localStorage.removeItem("shape-chat-input");
            } catch {
                /* ignore */
            }
            return true;
        }

        if (
            (!messageContent.trim() && uploadedFiles.length === 0) ||
            isLoading ||
            sendingInFlightRef.current
        ) {
            return false;
        }
        if (uploadedFiles.some((a) => a.status === "processing")) {
            return false;
        }

        sendingInFlightRef.current = true;

        let userMsg = messageContent;
        setInputValue("");
        editingQueueIdRef.current = null;
        try {
            localStorage.removeItem("shape-chat-input");
        } catch {
            /* ignore */
        }
        setSendError(null);
        appendUserOptimistic(userMsg);

        try {
            if ((!shapeAuth.loggedIn || !shapeAuth.accessToken) && !hasByokApiKeys()) {
                setSendError(
                    "Sign in to Shape, or add an OpenRouter / OpenAI API key in Settings → AI.",
                );
                setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant" && !last.content.trim()) {
                        return prev.slice(0, -1);
                    }
                    return prev;
                });
                return false;
            }

            const token = shapeAuth.accessToken ?? undefined;
            const ai = getSettings().ai;
            const byok = {
                openRouterApiKey: ai.openRouterApiKey.trim() || null,
                openaiApiKey: ai.openaiApiKey.trim() || null,
            };
            await commands.setByokKeys(byok.openRouterApiKey, byok.openaiApiKey).catch(() => {});
            const attachmentBlocks: string[] = [];

            for (const att of uploadedFiles) {
                if (att.status !== "ready") continue;
                const ext = att.name.split(".").pop()?.toLowerCase() || "";
                const CODE_LIKE_EXT = new Set([
                    "ts", "tsx", "js", "jsx", "rs", "py", "go", "java", "c", "cpp", "h", "hpp",
                    "css", "scss", "less", "html", "xml", "svg", "json", "toml", "yaml", "yml",
                    "md", "mdx", "sh", "bat", "ps1", "rb", "php", "swift", "kt", "kts", "dart",
                    "lua", "r", "sql", "graphql", "gql", "proto", "txt", "log", "csv", "lock",
                    "env", "ini", "cfg", "conf",
                ]);
                const BINARY_ASSET_EXT = new Set([
                    "ttf", "otf", "woff", "woff2", "eot", "ico", "icns", "pdf",
                ]);

                if (att.kind === "image" && att.dataUrl) {
                    attachmentBlocks.push(
                        `<attached_image name="${att.name}" type="${att.mimeType}" size="${att.size}">${att.dataUrl}</attached_image>`,
                    );
                } else if (att.kind === "audio") {
                    attachmentBlocks.push(
                        `<attached_file name="${att.name}" type="${att.mimeType || "audio"}" size="${att.size}">\n[Audio file attached — playback in UI; transcription not available in this turn.]\n</attached_file>`,
                    );
                } else {
                    const isTextLike =
                        att.mimeType.startsWith("text/") ||
                        CODE_LIKE_EXT.has(ext) ||
                        ["svg", "json", "xml", "md", "mdx"].includes(ext);

                    if (isTextLike) {
                        const text = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result as string);
                            reader.onerror = reject;
                            reader.readAsText(att.file);
                        });

                        const maxChars = 20000;
                        const content =
                            text.length > maxChars
                                ? text.slice(0, maxChars) + `\n... [truncated, ${text.length} chars total]`
                                : text;

                        attachmentBlocks.push(
                            `<attached_file name="${att.name}" type="${att.mimeType || "text/plain"}" size="${att.size}">\n${content}\n</attached_file>`,
                        );
                    } else if (BINARY_ASSET_EXT.has(ext) || att.mimeType.startsWith("font/")) {
                        // Usable binary — instruct the agent to write/use the file, not just describe it.
                        const dataUrl = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result as string);
                            reader.onerror = reject;
                            reader.readAsDataURL(att.file);
                        });
                        const maxBytes = 2_500_000;
                        if (att.size <= maxBytes) {
                            attachmentBlocks.push(
                                `<attached_asset name="${att.name}" type="${att.mimeType || "application/octet-stream"}" size="${att.size}" usable="true">\n` +
                                    `When the user asks to use this file (e.g. apply a font, add an icon), write it into the project from this data URL and wire it up — do not only describe it.\n` +
                                    `${dataUrl}\n` +
                                    `</attached_asset>`,
                            );
                        } else {
                            attachmentBlocks.push(
                                `<attached_file name="${att.name}" type="${att.mimeType || "application/octet-stream"}" size="${att.size}">\n[Binary asset too large to inline (${att.size} bytes). Ask the user for a path in the repo, or copy it locally.]\n</attached_file>`,
                            );
                        }
                    }
                }
            }

            if (attachmentBlocks.length > 0) {
                const attachmentContext = attachmentBlocks.join("\n\n");
                userMsg = `${attachmentContext}\n\n${userMsg}`;
                setMessages((prev) => {
                    const userIdx = prev.length - 2;
                    if (userIdx < 0 || prev[userIdx]?.role !== "user") return prev;
                    const updated = [...prev];
                    updated[userIdx] = { ...updated[userIdx], content: userMsg };
                    return updated;
                });
            }

            setUploadedFiles([]);

            const attachmentKinds = [
                ...new Set(
                    uploadedFiles.map((f) => {
                        if (f.kind === "image") return "image";
                        if (f.kind === "audio") return "audio";
                        if (f.mimeType.startsWith("text/")) return "text";
                        return "file";
                    }),
                ),
            ];

            void captureTelemetry("chat_message_sent", {
                mode: selectedMode,
                model: selectedModel,
                message_length_bucket: messageLengthBucket(userMsg.length),
                attachment_count: uploadedFiles.length,
                attachment_kinds: attachmentKinds,
            });

            const settings = getSettings();
            const expandedMessage = await buildMessageWithMentions(
                userMsg,
                project_path ?? null,
                selectionContextRef.current,
            );
            const projectRules = isWorkspaceTrusted(project_path)
                ? await loadProjectRules(project_path ?? null)
                : "";
            const mergedRules = [settings.ai.customRules, projectRules].filter(Boolean).join("\n\n") || undefined;

            await commands.sendChatMessage(
                expandedMessage,
                selectedModel,
                selectedMode,
                mergedRules,
                token,
                undefined,
                selectedMode === "Review" ? settings.ai.reviewAdversarialEnabled : undefined,
                {
                    autoRunMode: settings.ai.autoRunMode,
                    requireEditApproval: settings.ai.requireEditApproval,
                    protectDestructiveGit: settings.ai.protectDestructiveGit,
                    pluginApprovalDefault: settings.ai.pluginApprovalDefault ?? "ask",
                    pluginApprovals: settings.ai.pluginApprovals,
                    pluginDisabledActions: settings.ai.pluginDisabledActions,
                },
                reasoningEffort,
                fastMode ? "priority" : null,
                byok,
            );
            await refreshMetadata();
            return true;
        } catch (err) {
            console.error("Failed to send message:", err);
            void captureTelemetryError(err, {
                feature: "chat_send",
                mode: selectedMode,
                model: selectedModel,
            });
            const errMsg = err instanceof Error ? err.message : String(err);
            setSendError(errMsg);
            setMessages((prev) => {
                if (prev.length < 1) return prev;
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && !last.content.trim()) {
                    return prev.slice(0, -1);
                }
                return prev;
            });
            return false;
        } finally {
            sendingInFlightRef.current = false;
        }
    };

    React.useEffect(() => {
        handleSendMessageRef.current = handleSendMessage;
    });

    React.useEffect(() => {
        if (isLoading) return;
        const q = messageQueueRef.current;
        if (q.length === 0) return;
        const [next, ...rest] = q;
        setMessageQueue(rest);
        void handleSendMessageRef.current(next.content);
    }, [isLoading]);

    const handleEditQueuedMessage = React.useCallback((id: string) => {
        setMessageQueue((prev) => {
            const item = prev.find((m) => m.id === id);
            if (item) {
                setInputValue(item.content);
                editingQueueIdRef.current = id;
                try {
                    localStorage.setItem("shape-chat-input", item.content);
                } catch {
                    /* ignore */
                }
            }
            return prev;
        });
    }, []);

    const handleRemoveQueuedMessage = React.useCallback((id: string) => {
        if (editingQueueIdRef.current === id) {
            editingQueueIdRef.current = null;
            setInputValue("");
            try {
                localStorage.removeItem("shape-chat-input");
            } catch {
                /* ignore */
            }
        }
        setMessageQueue((prev) => prev.filter((m) => m.id !== id));
    }, []);

    const handleUpdateQueuedMessage = React.useCallback((id: string, content: string) => {
        setMessageQueue((prev) =>
            prev.map((m) => (m.id === id ? { ...m, content: content.trim() } : m)),
        );
    }, []);

    React.useEffect(() => {
        const handleBuildPlan = (e: Event) => {
            const custom = e as CustomEvent<{ path: string; title?: string }>;
            if (!custom.detail?.path) return;
            if (isLoadingRef.current) return;
            setSelectedMode("Code");
            void (async () => {
                const branch = await isolatePlanBranch(project_path, custom.detail.title);
                const extra = branch
                    ? `\n\nStay on git branch \`${branch}\`. Keep this work isolated there.`
                    : "";
                void handleSendMessageRef.current(
                    `${buildPlanBuildMessage(custom.detail.path, custom.detail.title)}${extra}`,
                );
            })();
        };
        window.addEventListener("shape-build-plan", handleBuildPlan);
        return () => window.removeEventListener("shape-build-plan", handleBuildPlan);
    }, [project_path]);

    React.useEffect(() => {
        const handleInsertPrompt = (e: Event) => {
            const detail = (e as CustomEvent<{ prompt?: string; send?: boolean }>).detail;
            if (!detail?.prompt) return;
            setInputValue(detail.prompt);
            try {
                localStorage.setItem("shape-chat-input", detail.prompt);
            } catch {
                /* ignore */
            }
            window.dispatchEvent(
                new CustomEvent("shape-layout-toggle", { detail: { id: "secondary-sidebar", value: true } }),
            );
            if (detail.send) {
                void handleSendMessageRef.current(detail.prompt);
            }
        };
        window.addEventListener("shape-chat-insert-prompt", handleInsertPrompt as EventListener);
        return () =>
            window.removeEventListener("shape-chat-insert-prompt", handleInsertPrompt as EventListener);
    }, []);

    const messagesRef = React.useRef(messages);
    React.useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    const messagesEndRef = React.useRef<HTMLDivElement>(null);
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);
    const [scrolledFromTop, setScrolledFromTop] = React.useState(false);
    const [scrolledFromBottom, setScrolledFromBottom] = React.useState(false);
    const isNearBottomRef = React.useRef(true);

    const handleRestore = React.useCallback(
        async (msgIdx: number) => {
            try {
                const msg = messagesRef.current[msgIdx];
                if (!msg || msg.role !== "user") return;

                const { confirmRestoreCheckpoint } = await import(
                    "@/features/chat/ui/shell/checkpoint-restore-dialog"
                );
                if (!(await confirmRestoreCheckpoint(msgIdx))) return;

                // Reverting the sole user turn empties the thread — drop the chat,
                // but keep the restored message in the composer on home.
                const soleUserTurn =
                    msgIdx === 0
                    && messagesRef.current.filter((m) => m.role === "user").length === 1;
                if (soleUserTurn) {
                    const {
                        parseUserAttachments,
                        attachmentsToComposer,
                    } = await import("@/features/chat/lib/user-attachments");
                    const parsed = parseUserAttachments(msg.content);
                    const files = await attachmentsToComposer(parsed.attachments);

                    await commands.restoreCheckpoint(msgIdx);
                    clearAllDesignPreviewSessions();
                    const convId = conversationIdRef.current;
                    if (convId) {
                        try {
                            await commands.deleteConversation(convId);
                        } catch {
                            /* draft / already gone */
                        }
                    }
                    await handleNewChatRef.current();
                    setInputValue(parsed.text);
                    setUploadedFiles(files);
                    try {
                        localStorage.setItem("shape-chat-input", parsed.text);
                    } catch {
                        /* ignore */
                    }
                    return;
                }

                const {
                    parseUserAttachments,
                    attachmentsToComposer,
                } = await import("@/features/chat/lib/user-attachments");
                const parsed = parseUserAttachments(msg.content);

                await commands.restoreCheckpoint(msgIdx);
                clearAllDesignPreviewSessions();
                setInputValue(parsed.text);
                setUploadedFiles(await attachmentsToComposer(parsed.attachments));
                try {
                    localStorage.setItem("shape-chat-input", parsed.text);
                } catch {
                    /* ignore */
                }
                await refreshHistory();
                setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                }, 100);
            } catch (err) {
                console.error("Failed to restore checkpoint:", err);
            }
        },
        [refreshHistory],
    );

    const handleRedo = React.useCallback(
        async (msgIdx: number) => {
            try {
                const msgs = messagesRef.current;
                let userMsgIdx = -1;
                for (let i = msgIdx; i >= 0; i--) {
                    if (msgs[i].role === "user") {
                        userMsgIdx = i;
                        break;
                    }
                }

                if (userMsgIdx === -1) return;

                const userContent = msgs[userMsgIdx].content;
                // restore_checkpoint cancels any in-flight turn; wait until the
                // slot is free so the resent message is not silently dropped.
                await commands.restoreCheckpoint(userMsgIdx);
                clearAllDesignPreviewSessions();
                for (let i = 0; i < 40; i++) {
                    const gen = await commands.getChatGenerationState();
                    if (!gen.isGenerating) break;
                    await new Promise((r) => setTimeout(r, 50));
                }
                await refreshHistory();
                await handleSendMessageRef.current(userContent);
            } catch (err) {
                console.error("Failed to redo message:", err);
            }
        },
        [refreshHistory],
    );

    React.useEffect(() => {
        const ai = getSettings().ai;
        const keyed = resolveChatModels(getCatalogModels(), {
            openaiKey: Boolean(ai.openaiApiKey.trim()),
            openRouterKey: Boolean(ai.openRouterApiKey.trim()),
            signedIn: Boolean(shapeAuth.loggedIn && !shapeAuth.offline),
        });
        const visible = getVisibleModels(keyed, ai.enabledModels);
        if (visible.some((m) => m.id === ai.defaultModel)) {
            setSelectedModel(ai.defaultModel);
        } else if (visible.length > 0) {
            setSelectedModel(visible[0].id);
        }
    }, []);

    React.useEffect(() => {
        let disposed = false;
        let unlisten: (() => void) | undefined;
        void import("@tauri-apps/api/event").then(({ listen }) => {
            void listen<{ path?: string }>("shape-design-preview-close", (event) => {
                const path = event.payload?.path;
                if (!path) return;
                void commands.closeFile(path).catch(() => { /* already closed */ });
            }).then((fn) => {
                if (disposed) fn();
                else unlisten = fn;
            });
        });
        return () => {
            disposed = true;
            unlisten?.();
        };
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

        register(
            listen<{ title?: string; conversationId?: string }>("chat_title", (event) => {
                const title = event.payload?.title?.trim();
                const convId = event.payload?.conversationId?.trim();
                if (!title || !convId) return;
                syncOpenTabs(convId, title);
                window.dispatchEvent(new CustomEvent("shape-chats-changed"));
                const current = conversationIdRef.current;
                // Never steal a background chat's id/title onto an idle New Chat draft.
                if (current && current !== convId) return;
                if (!current && !isLoadingRef.current) return;
                setChatTitle(title);
                setConversationId(convId);
                setCurrentConversationId(convId);
            }),
        );

        return () => {
            disposed = true;
            unlisteners.forEach((fn) => fn());
        };
    }, [syncOpenTabs]);

    const handleNewChat = async () => {
        try {
            // Do not stop background generation; only the Stop button cancels.
            setViewingConversation(null);
            await commands.newChat();
            void captureTelemetry("chat_new");
            clearAllDesignPreviewSessions();
            setSendError(null);
            setMessages([]);
            setContextSummarized(false);
            void import("@/features/agent/subagents/store").then(({ resetSubagents }) => {
                resetSubagents();
            });
            setChatTitle("New Chat");
            setConversationId(null);
            setResolvedFiles(new Set());
            clearAllProposedEdits();
            setOpenChatTabs((prev) => {
                const others = prev.filter((tab) => tab.id !== NEW_CHAT_TAB_ID);
                return [{ id: NEW_CHAT_TAB_ID, title: "New Chat" }, ...others];
            });
            setActiveChatTabId(NEW_CHAT_TAB_ID);
            await refreshHistory(true);
        } catch (err) {
            console.error("Failed to start new chat:", err);
        }
    };

    React.useEffect(() => {
        handleNewChatRef.current = handleNewChat;
    });

    const handleSelectChatTab = async (tabId: string) => {
        if (tabId === activeChatTabId) return;
        setSendError(null);
        if (tabId === NEW_CHAT_TAB_ID) {
            await handleNewChat();
            return;
        }
        if (tabId === DEMO_CHAT_TAB_ID) {
            window.dispatchEvent(new CustomEvent("shape-demo-chat"));
            return;
        }
        if (resumeLiveConversation(tabId)) {
            setConversationId(tabId);
            setCurrentConversationId(tabId);
            const conv = recentConvs.find((c) => c.id === tabId);
            syncOpenTabs(tabId, conv?.title || "Chat");
            return;
        }
        try {
            const conv = recentConvs.find((c) => c.id === tabId);
            setViewingConversation(tabId);
            await commands.loadConversation(tabId, conv?.project_path ?? project_path);
            clearAllDesignPreviewSessions();
            setContextSummarized(false);
            await refreshHistory(true);
        } catch (err) {
            console.error("Failed to switch chat tab:", err);
        }
    };

    const handleCloseChatTab = async (tabId: string) => {
        const remaining = openChatTabs.filter((tab) => tab.id !== tabId);
        if (remaining.length === 0) {
            setOpenChatTabs([
                { id: NEW_CHAT_TAB_ID, title: "New Chat" },
                { id: DEMO_CHAT_TAB_ID, title: "Demo", models: ["auto"] },
            ]);
            setActiveChatTabId(NEW_CHAT_TAB_ID);
            setMessages([]);
            setConversationId(null);
            setChatTitle("New Chat");
            window.dispatchEvent(
                new CustomEvent("shape-layout-toggle", {
                    detail: { id: "secondary-sidebar", value: false },
                }),
            );
            return;
        }
        setOpenChatTabs(remaining);
        if (tabId === activeChatTabId) {
            const next = remaining[remaining.length - 1];
            await handleSelectChatTab(next.id);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleScroll = React.useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const threshold = 150;
        isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
        setScrolledFromTop(el.scrollTop > 4);
        setScrolledFromBottom(!isNearBottomRef.current);
    }, []);

    React.useEffect(() => {
        if (isNearBottomRef.current) {
            messagesEndRef.current?.scrollIntoView({
                behavior: isLoading ? "auto" : "smooth",
            });
        }
        // Keep top-fade in sync after programmatic scroll (scroll events can lag).
        const el = scrollContainerRef.current;
        if (el) {
            setScrolledFromTop(el.scrollTop > 4);
            setScrolledFromBottom(
                el.scrollHeight - el.scrollTop - el.clientHeight >= 150,
            );
        }
    }, [messages, isLoading]);

    const handleLoadConversation = React.useCallback(
        async (id: string, options?: { force?: boolean }) => {
            const isSameConversation = id === conversationIdRef.current;
            const hasVisibleMessages = messagesRef.current.length > 0;
            if (resumeLiveConversation(id)) {
                setConversationId(id);
                setCurrentConversationId(id);
                const liveConv = recentConvs.find((c) => c.id === id);
                syncOpenTabs(id, liveConv?.title || "Chat");
                return;
            }
            if (!options?.force && isSameConversation && hasVisibleMessages) return;

            const conv =
                recentConvs.find((c) => c.id === id)
                ?? (project_path
                    ? null
                    : (await commands.getConversations()).find((c) => c.id === id));

            try {
                setViewingConversation(id);
                await commands.loadConversation(id, conv?.project_path ?? project_path);
                clearAllDesignPreviewSessions();
                setContextSummarized(false);
                const history = await commands.getChatHistory();
                setMessages(history);
                await refreshHistory(true);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                if (!message.includes("Conversation not found")) {
                    console.error("Failed to load conversation:", err);
                }
                await refreshMetadata();
            }
        },
        [refreshHistory, recentConvs, project_path, refreshMetadata, setMessages, setContextSummarized, resumeLiveConversation, setViewingConversation, syncOpenTabs],
    );

    React.useEffect(() => {
        const onLoad = (e: Event) => {
            const id = (e as CustomEvent<{ id?: string }>).detail?.id;
            if (!id) return;
            void handleLoadConversation(id, { force: true });
        };
        window.addEventListener("shape-chat-load", onLoad as EventListener);
        return () => window.removeEventListener("shape-chat-load", onLoad as EventListener);
    }, [handleLoadConversation]);

    React.useEffect(() => {
        const onDemo = () => {
            void (async () => {
                const { buildDemoChatMessages } = await import("./demo-chat");
                const demo = buildDemoChatMessages();
                setMessages(demo);
                void import("@/features/agent/subagents/store").then(({ seedDemoSubagents }) => {
                    seedDemoSubagents();
                });
                window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "agents" }));
                setInputValue("");
                setSendError(null);
                setOpenChatTabs((prev) => {
                    if (prev.some((t) => t.id === DEMO_CHAT_TAB_ID)) {
                        return prev.map((t) =>
                            t.id === DEMO_CHAT_TAB_ID ? { ...t, title: "Demo", models: ["auto"] } : t,
                        );
                    }
                    return [
                        ...prev.filter((t) => t.id !== NEW_CHAT_TAB_ID),
                        { id: DEMO_CHAT_TAB_ID, title: "Demo", models: ["auto"] },
                    ];
                });
                setActiveChatTabId(DEMO_CHAT_TAB_ID);
                setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                }, 50);
            })();
        };
        window.addEventListener("shape-demo-chat", onDemo);
        return () => window.removeEventListener("shape-demo-chat", onDemo);
    }, []);

    const handleViewAllHistory = React.useCallback(() => {
        openChatHistoryMenu();
    }, []);

    const stoppingRef = React.useRef(false);

    React.useEffect(() => {
        if (!isLoading) {
            stoppingRef.current = false;
        }
    }, [isLoading]);

    const handleStopMessage = async () => {
        if (stoppingRef.current) return;
        stoppingRef.current = true;
        stopLiveTurn();
        try {
            const convId = conversationIdRef.current;
            await commands.stopChatMessage();
            if (convId) {
                const { setChatGenerating } = await import("@/features/chat/lib/generating-chats");
                setChatGenerating(convId, false);
            }
            void captureTelemetry("chat_stopped", {
                mode: selectedMode,
                model: selectedModel,
            });
        } catch (e) {
            console.error("Failed to stop:", e);
            stoppingRef.current = false;
        }
    };

    const messageGroups = groupChatMessages(messages);

    return {
        messages,
        isLoading,
        activityLabel,
        sendError,
        setSendError,
        contextSummarized,
        inputValue,
        setInputValue,
        uploadedFiles,
        setUploadedFiles,
        addUploadedFiles,
        selectedModel,
        setSelectedModel,
        selectedMode,
        setSelectedMode,
        reasoningEffort,
        setReasoningEffort,
        fastMode,
        setFastMode,
        chatTitle,
        conversationId,
        recentConvs,
        pendingEdits,
        project_path,
        openChatTabs,
        activeChatTabId,
        messagesEndRef,
        scrollContainerRef,
        handleScroll,
        scrolledFromTop,
        scrolledFromBottom,
        isEditResolved,
        handleAcceptAll,
        handleRejectAll,
        handleAcceptEdit,
        handleRejectEdit,
        handleInputChange,
        handleSendMessage,
        handleKeyDown,
        handleNewChat,
        handleSelectChatTab,
        handleCloseChatTab,
        handleLoadConversation,
        handleViewAllHistory,
        handleRedo,
        handleRestore,
        handleStopMessage,
        messageGroups,
        refreshHistory,
        messageQueue,
        handleEditQueuedMessage,
        handleRemoveQueuedMessage,
        handleUpdateQueuedMessage,
    };
}
