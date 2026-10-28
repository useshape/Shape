/** A view that is not a real conversation yet. Tokens for the send in progress belong here. */
export function isPlaceholderView(id: string | null | undefined) {
    if (!id) return true;
    return id === "__draft__" || id === "__pending__" || id.startsWith("__switching__");
}

/** Whether a live turn should paint into the open thread. A draft only keeps its own pending send. */
export function streamVisibleToView(
    viewingId: string | null | undefined,
    liveConversationId: string | null | undefined,
    key: string,
    pendingKey = "__pending__",
) {
    return (
        viewingId === liveConversationId ||
        (isPlaceholderView(viewingId) && (key === pendingKey || isPlaceholderView(liveConversationId)))
    );
}

/** Which in-flight turn an event may update. Unscoped events never jump chats. */
export function resolveLiveTurnKey(
    conversationId: string | null | undefined,
    keys: Iterable<string>,
    viewingId: string | null,
    pendingKey = "__pending__",
): string | null {
    const live = new Set(keys);
    const named = conversationId?.trim() || "";
    if (named) {
        if (live.has(named)) return named;
        if (live.has(pendingKey)) return pendingKey;
        return null;
    }
    if (live.size !== 1) return null;
    const only = live.values().next().value as string | undefined;
    if (!only) return null;
    if (only === pendingKey) return only;
    if (viewingId && viewingId === only) return only;
    return null;
}
