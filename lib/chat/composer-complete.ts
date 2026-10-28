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

function browserStorage(): Storage | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

export function loadComposerPrompts(storage?: Storage): string[] {
    const store = storage ?? browserStorage();
    if (!store) return [];
    return readStore(store);
}

export function rememberComposerPrompt(text: string, storage?: Storage): void {
    const store = storage ?? browserStorage();
    if (!store) return;
    const value = text.trim();
    if (value.length < 2) return;
    const next = [value, ...readStore(store).filter((item) => item !== value)].slice(0, MAX_PROMPTS);
    store.setItem(STORAGE_KEY, JSON.stringify(next));
}

function unfinishedToken(input: string): boolean {
    return /(?:^|\s)[@/][\w./:-]*$/.test(input);
}

/** Faded suffix for the composer. Empty when there is no single local match. */
export function composerGhost(input: string, caret: number, prompts: readonly string[]): string {
    if (!input || caret !== input.length || input.includes("\n")) return "";
    if (input.trim().length < 2 || unfinishedToken(input)) return "";
    const lower = input.toLowerCase();
    const full: string[] = [];
    for (const prompt of prompts) {
        if (prompt.length <= input.length) continue;
        if (!prompt.toLowerCase().startsWith(lower)) continue;
        const rest = prompt.slice(input.length).split("\n")[0] ?? "";
        if (rest) full.push(rest);
    }
    if (full.length === 1) return full[0]!;
    if (full.length > 1) {
        const shared = full.reduce((prefix, rest) => {
            let i = 0;
            while (i < prefix.length && i < rest.length && prefix[i] === rest[i]) i++;
            return prefix.slice(0, i);
        });
        if (shared.trim()) return shared;
    }
    const phrase = phraseGhost(input);
    if (phrase) return phrase;

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

const PHRASES = [
    "can you show me ",
    "how do I ",
    "what is a good ",
    "fix the bug in ",
    "explain this error ",
    "write a test for ",
    "summarize this ",
    "why is this ",
];

const MISSPELL: Record<string, string> = {
    resturant: "restaurant",
    restaraunt: "restaurant",
    recieve: "receive",
    seperate: "separate",
    definately: "definitely",
    occured: "occurred",
    wierd: "weird",
    teh: "the",
    taht: "that",
    becuase: "because",
    untill: "until",
    wich: "which",
    thier: "their",
    enviroment: "environment",
    langauge: "language",
    fucntion: "function",
    funciton: "function",
    retrun: "return",
    lenght: "length",
    widht: "width",
    heigth: "height",
    mesage: "message",
    responce: "response",
    genereted: "generated",
    generatd: "generated",
    adress: "address",
    comming: "coming",
    sucess: "success",
    sucessful: "successful",
};

const DICTIONARY = [
    "restaurant", "message", "response", "generated", "function", "return", "length", "width",
    "height", "address", "because", "separate", "definitely", "receive", "environment", "language",
    "button", "panel", "folder", "image", "images", "search", "explain", "summary", "error",
    "project", "branch", "commit", "review", "question", "answer", "please", "thanks", "today",
    "tomorrow", "schedule", "calendar", "email", "budget", "neighborhood", "reservation",
].join(" ");

const WORD_SET = new Set(DICTIONARY.split(" "));

function matchCase(typed: string, word: string): string {
    if (typed[0] && typed[0] === typed[0].toUpperCase()) return word[0]!.toUpperCase() + word.slice(1);
    return word;
}

function editDistance(a: string, b: string): number {
    if (Math.abs(a.length - b.length) > 2) return 3;
    const rows = a.length + 1;
    const cols = b.length + 1;
    const dp = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
    for (let i = 0; i < rows; i++) dp[i]![0] = i;
    for (let j = 0; j < cols; j++) dp[0]![j] = j;
    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
        }
    }
    return dp[a.length]![b.length]!;
}

function phraseGhost(input: string): string {
    if (input.trim().length < 4) return "";
    const lower = input.toLowerCase();
    const hits = PHRASES.filter((phrase) => phrase.startsWith(lower) && phrase.length > input.length);
    if (hits.length !== 1) return "";
    return hits[0]!.slice(input.length);
}

/** Correct the last word when it is a known misspelling or one edit from a real word. */
export function composerSpell(input: string, caret: number): { start: number; word: string } | null {
    if (!input || caret !== input.length || input.includes("\n")) return null;
    const match = input.match(/[A-Za-z]{4,}$/);
    if (!match?.[0]) return null;
    const typed = match[0];
    const lower = typed.toLowerCase();
    if (WORD_SET.has(lower)) return null;
    const mapped = MISSPELL[lower];
    if (mapped) return { start: input.length - typed.length, word: matchCase(typed, mapped) };
    let found = "";
    for (const word of WORD_SET) {
        if (word[0] !== lower[0]) continue;
        if (Math.abs(word.length - lower.length) > 2) continue;
        if (editDistance(lower, word) > 1) continue;
        if (found) return null;
        found = word;
    }
    if (!found) return null;
    return { start: input.length - typed.length, word: matchCase(typed, found) };
}
