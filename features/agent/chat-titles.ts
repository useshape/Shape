type Listener = () => void;

let titles = new Map<string, string>();
let revision = 0;
const listeners = new Set<Listener>();

export function publishChatTitles(list: { id: string; title?: string | null }[]) {
    const next = new Map(titles);
    for (const item of list) next.set(item.id, item.title?.trim() || "Chat");
    titles = next;
    revision += 1;
    listeners.forEach((listener) => listener());
}

export function chatTitle(id: string) {
    return titles.get(id) || "Chat";
}

export function subscribeChatTitles(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function chatTitlesRevision() {
    return revision;
}
