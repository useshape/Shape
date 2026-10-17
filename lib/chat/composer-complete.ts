const STORAGE_KEY = "shape-composer-prompts";
const MAX_PROMPTS = 40;

function readStore(storage: Storage): string[] {
    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 1);
    } catch {
        return [];
    }
}

export function loadComposerPrompts(storage: Storage = localStorage): string[] {
    return readStore(storage);
}

export function rememberComposerPrompt(text: string, storage: Storage = localStorage): void {
    const value = text.trim();
    if (value.length < 2) return;
    const next = [value, ...readStore(storage).filter((item) => item !== value)].slice(0, MAX_PROMPTS);
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function unfinishedToken(input: string): boolean {
    return /(?:^|\s)[@/][\w./:-]*$/.test(input);
}

/** Faded suffix for the composer. Empty when there is no single local match. */
export function composerGhost(input: string, caret: number, prompts: readonly string[]): string {
    if (!input || caret !== input.length || input.includes("\n")) return "";
    if (input.trim().length < 2 || unfinishedToken(input)) return "";
    const lower = input.toLowerCase();
    let best = "";
    for (const prompt of prompts) {
        if (prompt.length <= input.length) continue;
        if (!prompt.toLowerCase().startsWith(lower)) continue;
        const rest = prompt.slice(input.length).split("\n")[0] ?? "";
        if (!rest) continue;
        if (!best || rest.length < best.length) best = rest;
    }
    if (best) return best;

    const word = input.match(/[^\s@/]{2,}$/);
    if (!word) return "";
    const typed = word[0];
    const typedLower = typed.toLowerCase();
    const rests = new Set<string>();
    for (const prompt of prompts) {
        for (const part of prompt.split(/\s+/)) {
            if (part.length <= typed.length) continue;
            if (!part.toLowerCase().startsWith(typedLower)) continue;
            rests.add(part.slice(typed.length));
        }
    }
    if (rests.size !== 1) return "";
    return [...rests][0] ?? "";
}
