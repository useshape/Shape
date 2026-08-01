"use client";

import React from "react";
import { listen } from "@tauri-apps/api/event";
import { commands, Conversation, useProjectState } from "@/lib/backend";
import { useChatStream } from "./chat-stream-store";
import { NEW_CHAT_TAB_ID, type ChatTab } from "../ui/shell/tabs";
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
} from "./proposed-edits";
import {
    resolveChatFilePath,
    syncProposedEditsFromMessages,
    groupChatMessages,
} from "./chat-session-utils";
import { getSettings } from "@/lib/settings";
import { getVisibleModels } from "@/lib/models";
import { getCatalogModels } from "@/lib/catalog-store";
import { useShapeAuth } from "@/lib/shape-auth/store";
import { captureTelemetry, captureTelemetryError } from "@/lib/telemetry";
import { messageLengthBucket } from "@/lib/telemetry-sanitize";
import { buildMessageWithMentions, type SelectionSnapshot } from "@/lib/chat-mentions";
import { buildPlanBuildMessage } from "@/lib/shape-continue-action";
import { loadProjectRules } from "@/lib/project-rules";
import { isWorkspaceTrusted } from "@/lib/workspace-trust";
import { clearAllDesignPreviewSessions } from "@/lib/design-preview-store";

export function useChatSession() {
    const [uploadedFiles, setUploadedFiles] = React.useState<File[]>([]);
    const [inputValue, setInputValue] = React.useState(() => {
        try {
            return localStorage.getItem("shape-chat-input") || "";
        } catch {
            return "";
        }
    });
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
    } = useChatStream();
    const [recentConvs, setRecentConvs] = React.useState<Conversation[]>([]);
    const [chatTitle, setChatTitle] = React.useState<string>("New Chat");
    const [openChatTabs, setOpenChatTabs] = React.useState<ChatTab[]>([
        { id: NEW_CHAT_TAB_ID, title: "New Chat" },
    ]);
    const [activeChatTabId, setActiveChatTabId] = React.useState<string>(NEW_CHAT_TAB_ID);
    const [selectedModel, setSelectedModel] = React.useState("auto");
    const [selectedMode, setSelectedMode] = React.useState("Code");

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

    const { project_path } = useProjectState();
    const shapeAuth = useShapeAuth();

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
            const n = editFile.replace(/\\/g, "/").toLowerCase();
            for (const r of resolvedFiles) {
                if (r === n || n.endsWith("/" + r) || r.endsWith("/" + n) || n.endsWith(r) || r.endsWith(n))
                    return true;
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

        messages.forEach((m, msgIdx) => {
            if (m.role !== "assistant") return;
            const chunks = parseMessageContent(m.content);
            const editsInMsg = chunks.filter(
                (c): c is Chunk & { file: string } => c.type === "edit" && !!c.file,
            );

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
    }, [messages, conversationId]);

    React.useEffect(() => {
        if (pendingEdits.length === 0) return;
        setResolvedFiles((prev) => {
            let changed = false;
            const next = new Set(prev);
            for (const edit of pendingEdits) {
                const n = edit.file.replace(/\\/g, "/").toLowerCase();
                for (const r of [...next]) {
                    if (
                        r === n
                        || n.endsWith("/" + r)
                        || r.endsWith("/" + n)
                        || n.endsWith(r)
                        || r.endsWith(n)
                    ) {
                        next.delete(r);
                        changed = true;
                    }
                }
            }
            return changed ? next : prev;
        });
    }, [pendingEdits]);

    React.useEffect(() => {
        pendingEdits.forEach((edit) => {
            if (conversationId && isFileResolved(conversationId, edit.file, edit.replacement)) {
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
    }, [pendingEdits, conversationId]);

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
        for (const edit of pendingEdits) {
            const resolved = resolveChatFilePath(edit.file, project_path);
            try {
                await commands.applyFileEdit(resolved, "", edit.baseline);
            } catch (e) {
                console.error("Failed to revert edit for", edit.file, e);
            }
            await markEditResolved(edit.file, "rejected", edit.replacement);
            window.dispatchEvent(
                new CustomEvent("shape-dismiss-diff", {
                    detail: { path: resolved, rawPath: edit.file },
                }),
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
        refreshHistory();
    }, [refreshHistory]);

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

    React.useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === ".") {
                e.preventDefault();
                setSelectedMode((prev) => {
                    if (prev === "Code") return "Ask";
                    if (prev === "Ask") return "Plan";
                    return "Code";
                });
            }
        };
        window.addEventListener("keydown", handleGlobalKeyDown);
        return () => window.removeEventListener("keydown", handleGlobalKeyDown);
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setInputValue(val);
        try {
            localStorage.setItem("shape-chat-input", val);
        } catch {
            /* ignore */
        }
        if (sendError) setSendError(null);
    };

    const handleSendMessageRef = React.useRef<(overrideContent?: string) => Promise<boolean>>(async () => false);
    const sendingInFlightRef = React.useRef(false);

    const handleSendMessage = async (overrideContent?: string): Promise<boolean> => {
        const messageContent = typeof overrideContent === "string" ? overrideContent : inputValue;
        if ((!messageContent.trim() && uploadedFiles.length === 0) || isLoading || sendingInFlightRef.current) {
            return false;
        }

        sendingInFlightRef.current = true;

        let userMsg = messageContent;
        setInputValue("");
        try {
            localStorage.removeItem("shape-chat-input");
        } catch {
            /* ignore */
        }
        setSendError(null);
        appendUserOptimistic(userMsg);

        try {
            if (!shapeAuth.loggedIn || !shapeAuth.accessToken) {
                setSendError("Sign in to Shape to use AI chat.");
                setMessages((prev) => prev.slice(0, -2));
                return false;
            }

            const token = shapeAuth.accessToken;
            const attachmentBlocks: string[] = [];

            for (const file of uploadedFiles) {
                const ext = file.name.split(".").pop()?.toLowerCase() || "";
                const VISION_SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
                const isVisionImage =
                    VISION_SUPPORTED_TYPES.includes(file.type) ||
                    ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
                const isAutoModel =
                    selectedModel === "auto" || selectedModel.startsWith("auto/");

                const CODE_LIKE_EXT = new Set([
                    "ts", "tsx", "js", "jsx", "rs", "py", "go", "java", "c", "cpp", "h", "hpp",
                    "css", "scss", "less", "html", "xml", "svg", "json", "toml", "yaml", "yml",
                    "md", "mdx", "sh", "bat", "ps1", "rb", "php", "swift", "kt", "kts", "dart",
                    "lua", "r", "sql", "graphql", "gql", "proto", "txt", "log", "csv", "lock",
                    "env", "ini", "cfg", "conf",
                ]);

                if (isVisionImage && !isAutoModel) {
                    const base64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });

                    let standardizedBase64 = base64;
                    if (base64.startsWith("data:image/jpg;base64,")) {
                        standardizedBase64 = base64.replace(
                            "data:image/jpg;base64,",
                            "data:image/jpeg;base64,",
                        );
                    }

                    attachmentBlocks.push(
                        `<attached_image name="${file.name}" type="${file.type}" size="${file.size}">${standardizedBase64}</attached_image>`,
                    );
                } else {
                    const isTextLike =
                        file.type.startsWith("text/") ||
                        CODE_LIKE_EXT.has(ext) ||
                        ["svg", "json", "xml", "md", "mdx"].includes(ext);

                    if (isVisionImage && isAutoModel) {
                        attachmentBlocks.push(
                            `<attached_file name="${file.name}" type="text/plain" size="${file.size}">\n[Image attachment omitted on Auto — switch to a vision-capable model to analyze images.]\n</attached_file>`,
                        );
                    } else if (isTextLike) {
                        const text = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result as string);
                            reader.onerror = reject;
                            reader.readAsText(file);
                        });

                        const maxChars = 20000;
                        const content =
                            text.length > maxChars
                                ? text.slice(0, maxChars) + `\n... [truncated, ${text.length} chars total]`
                                : text;

                        attachmentBlocks.push(
                            `<attached_file name="${file.name}" type="${file.type || "text/plain"}" size="${file.size}">\n${content}\n</attached_file>`,
                        );
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
                        if (f.type.startsWith("image/")) return "image";
                        if (f.type.startsWith("text/")) return "text";
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
                settings.ai.customSystemPrompt || undefined,
                mergedRules,
                token,
                undefined,
                selectedMode === "Review" ? settings.ai.reviewAdversarialEnabled : undefined,
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
                if (prev.length < 2) return prev;
                const last = prev[prev.length - 1];
                const prevUser = prev[prev.length - 2];
                if (last?.role === "assistant" && prevUser?.role === "user") {
                    return prev.slice(0, -2);
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
        const handleBuildPlan = (e: Event) => {
            const custom = e as CustomEvent<{ path: string; title?: string }>;
            if (!custom.detail?.path) return;
            if (isLoadingRef.current) return;
            setSelectedMode("Code");
            void handleSendMessageRef.current(
                buildPlanBuildMessage(custom.detail.path, custom.detail.title),
            );
        };
        window.addEventListener("shape-build-plan", handleBuildPlan);
        return () => window.removeEventListener("shape-build-plan", handleBuildPlan);
    }, []);

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
    const isNearBottomRef = React.useRef(true);

    const handleRestore = React.useCallback(
        async (msgIdx: number) => {
            try {
                const msg = messagesRef.current[msgIdx];
                if (!msg || msg.role !== "user") return;

                await commands.restoreCheckpoint(msgIdx);
                clearAllDesignPreviewSessions();
                setInputValue(msg.content);
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
        const defaultModel = getSettings().ai.defaultModel;
        const visible = getVisibleModels(getCatalogModels(), getSettings().ai.enabledModels);
        if (visible.some((m) => m.id === defaultModel)) {
            setSelectedModel(defaultModel);
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
            await commands.newChat();
            void captureTelemetry("chat_new");
            clearAllDesignPreviewSessions();
            setSendError(null);
            setMessages([]);
            setContextSummarized(false);
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

    const handleSelectChatTab = async (tabId: string) => {
        if (tabId === activeChatTabId) return;
        setSendError(null);
        if (tabId === NEW_CHAT_TAB_ID) {
            await handleNewChat();
            return;
        }
        try {
            const conv = recentConvs.find((c) => c.id === tabId);
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
            setOpenChatTabs([{ id: NEW_CHAT_TAB_ID, title: "New Chat" }]);
            await handleNewChat();
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
    }, []);

    React.useEffect(() => {
        if (isNearBottomRef.current) {
            messagesEndRef.current?.scrollIntoView({
                behavior: isLoading ? "auto" : "smooth",
            });
        }
        // Keep top-fade in sync after programmatic scroll (scroll events can lag).
        const el = scrollContainerRef.current;
        if (el) setScrolledFromTop(el.scrollTop > 4);
    }, [messages, isLoading]);

    const handleLoadConversation = React.useCallback(
        async (id: string, options?: { force?: boolean }) => {
            const isSameConversation = id === conversationIdRef.current;
            const hasVisibleMessages = messagesRef.current.length > 0;
            if (!options?.force && isSameConversation && hasVisibleMessages) return;

            const conv =
                recentConvs.find((c) => c.id === id)
                ?? (project_path
                    ? null
                    : (await commands.getConversations()).find((c) => c.id === id));

            try {
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
        [refreshHistory, recentConvs, project_path, refreshMetadata, setMessages, setContextSummarized],
    );

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
        try {
            await commands.stopChatMessage();
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
        selectedModel,
        setSelectedModel,
        selectedMode,
        setSelectedMode,
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
    };
}
