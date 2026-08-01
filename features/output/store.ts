import { useSyncExternalStore } from "react";

export type OutputChannel = "LSP" | "ESLint" | "Debug" | "Build" | "Tests" | "Deploy";

export type OutputLine = {
    timestamp: number;
    text: string;
    level?: "info" | "warn" | "error";
};

const CHANNELS: OutputChannel[] = ["LSP", "ESLint", "Debug", "Build", "Tests", "Deploy"];
const MAX_LINES = 2000;

type StoreState = {
    activeChannel: OutputChannel;
    buffers: Record<OutputChannel, OutputLine[]>;
};

let state: StoreState = {
    activeChannel: "LSP",
    buffers: {
        LSP: [],
        ESLint: [],
        Debug: [],
        Build: [],
        Tests: [],
        Deploy: [],
    },
};

const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot(): StoreState {
    return state;
}

export function useOutputStore() {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setActiveOutputChannel(channel: OutputChannel) {
    state = { ...state, activeChannel: channel };
    emit();
}

export function appendOutput(
    channel: OutputChannel,
    text: string,
    level: OutputLine["level"] = "info"
) {
    const lines = text.split(/\r?\n/).filter((l, i, arr) => l.length > 0 || i < arr.length - 1);
    const entries: OutputLine[] = lines.map((line) => ({
        timestamp: Date.now(),
        text: line,
        level,
    }));

    const existing = state.buffers[channel];
    const merged = [...existing, ...entries];
    const trimmed = merged.length > MAX_LINES ? merged.slice(merged.length - MAX_LINES) : merged;

    state = {
        ...state,
        buffers: {
            ...state.buffers,
            [channel]: trimmed,
        },
    };
    emit();
}

export function clearOutput(channel?: OutputChannel) {
    if (channel) {
        state = {
            ...state,
            buffers: { ...state.buffers, [channel]: [] },
        };
    } else {
        const cleared = {} as Record<OutputChannel, OutputLine[]>;
        for (const ch of CHANNELS) cleared[ch] = [];
        state = { ...state, buffers: cleared };
    }
    emit();
}

export function getOutputChannels(): OutputChannel[] {
    return CHANNELS;
}

if (typeof window !== "undefined") {
    window.addEventListener("shape-output-append", (e) => {
        const detail = (e as CustomEvent<{ channel: OutputChannel; text: string; level?: OutputLine["level"] }>).detail;
        if (detail?.channel && detail.text) {
            appendOutput(detail.channel, detail.text, detail.level);
        }
    });
}
