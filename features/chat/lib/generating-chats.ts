"use client";

import { useEffect, useSyncExternalStore } from "react";

const generatingIds = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
    for (const l of listeners) l();
}

/** Mark a chat tab/conversation as currently generating (or clear it). */
export function setChatGenerating(chatId: string | null | undefined, generating: boolean) {
    if (!chatId) return;
    const before = generatingIds.has(chatId);
    if (generating) generatingIds.add(chatId);
    else generatingIds.delete(chatId);
    if (before !== generatingIds.has(chatId)) {
        emit();
        window.dispatchEvent(
            new CustomEvent("shape-chat-generating", {
                detail: { id: chatId, generating },
            }),
        );
    }
}

function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
}

function getSnapshot() {
    return generatingIds;
}

/** Reactive set of chat IDs that are currently streaming. */
export function useGeneratingChatIds(): ReadonlySet<string> {
    return useSyncExternalStore(
        subscribe,
        getSnapshot,
        () => generatingIds,
    );
}

export function useIsChatGenerating(chatId: string | null | undefined): boolean {
    const ids = useGeneratingChatIds();
    if (!chatId) return false;
    return ids.has(chatId);
}

/** Keep the active chat's generating flag in sync with session loading. */
export function useSyncChatGenerating(
    chatId: string | null | undefined,
    isLoading: boolean,
) {
    useEffect(() => {
        if (!chatId) return;
        setChatGenerating(chatId, isLoading);
        return () => setChatGenerating(chatId, false);
    }, [chatId, isLoading]);
}
