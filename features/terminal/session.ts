/**
 * Shared terminal session registration (used by the always-mounted DevRunHost
 * and the Terminal UI). Keeps background Run tabs available when the panel is closed.
 */

type TerminalShell = "powershell" | "pwsh" | "cmd" | "gitbash" | "wsl" | "ai";
type TerminalGroupId = "left" | "right";

export type TerminalTab = {
    id: string;
    title: string;
    shell: TerminalShell;
    cwd: string;
    boundPtyId?: number;
    group: TerminalGroupId;
};

type Instance = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    term: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fitAddon: any;
    ptyId: number;
    unlistenOutput: () => void;
};

const MAX_SCROLLBACK_CHARS = 400_000;

function createTabId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 11);
}

class TerminalSessionStore {
    tabs: TerminalTab[] = [];
    activeProjectTabs: Record<string, string | null> = {};
    activeSecondaryTabs: Record<string, string | null> = {};
    focusedGroup: Record<string, TerminalGroupId> = {};
    instances = new Map<string, Instance>();
    /** Output captured while no xterm is attached (background Run). */
    ptyScrollback = new Map<number, string>();
    listeners = new Set<() => void>();

    subscribe(l: () => void): () => void {
        this.listeners.add(l);
        return () => this.listeners.delete(l);
    }
    notify() {
        this.listeners.forEach((l) => l());
    }
    setTabs(u: (p: TerminalTab[]) => TerminalTab[]) {
        this.tabs = u(this.tabs).map((t) => ({ ...t, group: t.group ?? "left" }));
        this.notify();
    }
    setActive(cwd: string, id: string | null) {
        this.activeProjectTabs = { ...this.activeProjectTabs, [cwd]: id };
        this.notify();
    }
    setSecondaryActive(cwd: string, id: string | null) {
        this.activeSecondaryTabs = { ...this.activeSecondaryTabs, [cwd]: id };
        this.notify();
    }
    setFocusedGroup(cwd: string, group: TerminalGroupId) {
        this.focusedGroup = { ...this.focusedGroup, [cwd]: group };
        this.notify();
    }

    appendPtyOutput(ptyId: number, data: string) {
        const prev = this.ptyScrollback.get(ptyId) ?? "";
        let next = prev + data;
        if (next.length > MAX_SCROLLBACK_CHARS) {
            next = next.slice(next.length - MAX_SCROLLBACK_CHARS);
        }
        this.ptyScrollback.set(ptyId, next);
        // Live-attached xterms write via their own listeners; nothing else to notify.
    }

    takePtyScrollback(ptyId: number): string {
        return this.ptyScrollback.get(ptyId) ?? "";
    }

    clearPtyScrollback(ptyId: number) {
        this.ptyScrollback.delete(ptyId);
    }
}

/** Singleton — Terminal UI and DevRunHost share this. */
export const terminalSessionStore = new TerminalSessionStore();

export function registerBoundTerminalTab(opts: {
    title: string;
    cwd: string;
    shell: TerminalShell;
    boundPtyId: number;
}): string {
    const existing = terminalSessionStore.tabs.find(
        (t) => t.boundPtyId === opts.boundPtyId && t.cwd === opts.cwd,
    );
    if (existing) {
        terminalSessionStore.setActive(opts.cwd, existing.id);
        return existing.id;
    }
    const id = createTabId();
    terminalSessionStore.setTabs((tabs) => [
        ...tabs,
        {
            id,
            title: opts.title,
            shell: opts.shell,
            cwd: opts.cwd,
            boundPtyId: opts.boundPtyId,
            group: "left",
        },
    ]);
    terminalSessionStore.setActive(opts.cwd, id);
    return id;
}

export function findActiveRunTab(cwd: string): TerminalTab | undefined {
    return terminalSessionStore.tabs.find(
        (t) => t.cwd === cwd && typeof t.boundPtyId === "number" && t.title.startsWith("Run:"),
    );
}
