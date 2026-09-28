"use client";

import { commands } from "@/lib/backend/commands";

let active = false;
const listeners = new Set<() => void>();

function emit() {
    for (const l of listeners) l();
}

export function subscribeIncognito(cb: () => void) {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
}

export function isIncognitoChat(): boolean {
    return active;
}

export async function setIncognitoChat(enabled: boolean): Promise<void> {
    active = enabled;
    emit();
    try {
        await commands.setChatIncognito(enabled);
        if (enabled) {
            const id = await commands.getCurrentConversationId();
            if (id) await purgeIncognitoConversation(id);
        }
    } catch {
        /* ignore */
    }
    window.dispatchEvent(
        new CustomEvent("shape-chat-incognito", { detail: { enabled } }),
    );
}

export async function syncIncognitoFromBackend(): Promise<void> {
    try {
        const enabled = await commands.getChatIncognito();
        if (enabled !== active) {
            active = enabled;
            emit();
        }
    } catch {
        /* ignore */
    }
}

export async function purgeIncognitoConversation(id: string): Promise<void> {
    if (!id) return;
    try {
        await commands.deleteConversation(id);
    } catch {
        /* draft / already gone */
    }
}
