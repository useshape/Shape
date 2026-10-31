type Crumb = { id: string | null; title: string };

let crumb: Crumb = { id: null, title: "New chat" };
const listeners = new Set<() => void>();

export function publishChatCrumb(next: Crumb) {
    if (crumb.id === next.id && crumb.title === next.title) return;
    crumb = next;
    for (const listener of listeners) listener();
}

export function getChatCrumb(): Crumb {
    return crumb;
}

export function subscribeChatCrumb(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
