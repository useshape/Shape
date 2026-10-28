import { NEW_CHAT_TAB_ID } from "@/features/chat/ui/shell/tabs";

type NavListener = () => void;

let stack: string[] = [];
let index = -1;
let viewing = "";
const listeners = new Set<NavListener>();

function emit() {
    for (const listener of listeners) listener();
}

export type ChatNavState = {
    canBack: boolean;
    canForward: boolean;
};

const IDLE_NAV: ChatNavState = { canBack: false, canForward: false };
let snapshot: ChatNavState = IDLE_NAV;

function publish() {
    const onStack = index >= 0 && viewing === stack[index];
    const next: ChatNavState = {
        canBack: (viewing !== stack[index] && index >= 0) || index > 0,
        canForward: onStack && index < stack.length - 1,
    };
    if (snapshot.canBack === next.canBack && snapshot.canForward === next.canForward) return;
    snapshot = next;
    emit();
}

export function getChatNav(): ChatNavState {
    return snapshot;
}

export function subscribeChatNav(listener: NavListener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function load(id: string) {
    window.dispatchEvent(new CustomEvent("shape-chat-load", { detail: { id } }));
}

export function chatNavBack() {
    if (viewing !== stack[index] && index >= 0) {
        load(stack[index]!);
        return;
    }
    if (index <= 0) return;
    index -= 1;
    publish();
    load(stack[index]!);
}

export function chatNavForward() {
    if (viewing !== stack[index] || index >= stack.length - 1) return;
    index += 1;
    publish();
    load(stack[index]!);
}

let installed = false;

export function ensureChatNav() {
    if (installed || typeof window === "undefined") return;
    installed = true;
    window.addEventListener("shape-chat-active", (event) => {
        const id = (event as CustomEvent<{ id?: string }>).detail?.id ?? "";
        viewing = id;
        if (!id || id === NEW_CHAT_TAB_ID) {
            publish();
            return;
        }
        if (stack[index] === id) {
            publish();
            return;
        }
        stack = stack.slice(0, index + 1);
        stack.push(id);
        if (stack.length > 50) stack = stack.slice(-50);
        index = stack.length - 1;
        publish();
    });
}
