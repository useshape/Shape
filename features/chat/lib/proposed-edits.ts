type ProposedEdit = {
    original: string;
    replacement: string;
    /** Content before the first unresolved AI edit (reject/undo target). */
    baseline: string;
    id: string;
};

type ResolvedEntry = {
    status: "applied" | "rejected";
    contentHash?: string;
};

const RESOLVED_FILES_KEY = "shape-resolved-files";

let proposedEdits: Record<string, ProposedEdit> = {};
let currentConversationId: string | null = null;

function normalize(p: string): string {
    return p.replace(/\\/g, "/").toLowerCase();
}

function pathsMatch(a: string, b: string): boolean {
    const na = normalize(a);
    const nb = normalize(b);
    if (na === nb) return true;
    return na.endsWith("/" + nb) || nb.endsWith("/" + na) || na.endsWith(nb) || nb.endsWith(na);
}

/** Fingerprint for matching an accepted/rejected edit payload. */
export function editContentHash(replacement: string): string {
    const s = replacement.replace(/\r\n/g, "\n");
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return `${s.length}:${h.toString(36)}`;
}

export function setCurrentConversationId(id: string | null) {
    if (currentConversationId !== id) {
        proposedEdits = {};
    }
    currentConversationId = id;
}

export function getCurrentConversationId(): string | null {
    return currentConversationId;
}

function loadResolvedFilesStore(): Record<string, Record<string, ResolvedEntry | "applied" | "rejected">> {
    try {
        const stored = localStorage.getItem(RESOLVED_FILES_KEY);
        if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return {};
}

function saveResolvedFilesStore(
    store: Record<string, Record<string, ResolvedEntry | "applied" | "rejected">>,
) {
    try {
        localStorage.setItem(RESOLVED_FILES_KEY, JSON.stringify(store));
    } catch { /* ignore */ }
}

function normalizeEntry(
    raw: ResolvedEntry | "applied" | "rejected" | undefined,
): ResolvedEntry | null {
    if (!raw) return null;
    if (raw === "applied" || raw === "rejected") return { status: raw };
    if (raw.status === "applied" || raw.status === "rejected") return raw;
    return null;
}

export function markFileResolved(
    conversationId: string,
    file: string,
    status: "applied" | "rejected",
    replacement?: string,
) {
    const store = loadResolvedFilesStore();
    if (!store[conversationId]) store[conversationId] = {};
    store[conversationId][normalize(file)] = {
        status,
        contentHash: replacement !== undefined ? editContentHash(replacement) : undefined,
    };
    saveResolvedFilesStore(store);
    clearProposedEdit(file);
}

export function clearFileResolved(conversationId: string, file: string) {
    const store = loadResolvedFilesStore();
    const conv = store[conversationId];
    if (!conv) return;
    const n = normalize(file);
    delete conv[n];
    for (const key of Object.keys(conv)) {
        if (pathsMatch(key, n)) delete conv[key];
    }
    saveResolvedFilesStore(store);
}

/** Resolved content hash for a file, if any (used to slice pending edit chains). */
export function getResolvedContentHash(
    conversationId: string | null,
    file: string,
): string | undefined {
    if (!conversationId) return undefined;
    const store = loadResolvedFilesStore();
    const conv = store[conversationId];
    if (!conv) return undefined;
    const n = normalize(file);
    const direct = normalizeEntry(conv[n]);
    if (direct?.contentHash) return direct.contentHash;
    for (const [key, val] of Object.entries(conv)) {
        if (!pathsMatch(key, n)) continue;
        const e = normalizeEntry(val);
        if (e?.contentHash) return e.contentHash;
    }
    return undefined;
}

export function isFileResolved(
    conversationId: string | null,
    file: string,
    currentReplacement?: string,
): boolean {
    if (!conversationId) return false;
    const store = loadResolvedFilesStore();
    const convResolved = store[conversationId];
    if (!convResolved) return false;
    const normalizedFile = normalize(file);

    const check = (entry: ResolvedEntry | "applied" | "rejected" | undefined) => {
        const e = normalizeEntry(entry);
        if (!e) return false;
        if (
            currentReplacement !== undefined
            && e.contentHash
            && editContentHash(currentReplacement) !== e.contentHash
        ) {
            return false;
        }
        return true;
    };

    if (check(convResolved[normalizedFile])) return true;
    for (const [key, val] of Object.entries(convResolved)) {
        if (pathsMatch(key, normalizedFile) && check(val)) return true;
    }
    return false;
}

export function getResolvedFiles(conversationId: string | null): Record<string, "applied" | "rejected"> {
    if (!conversationId) return {};
    const raw = loadResolvedFilesStore()[conversationId] || {};
    const out: Record<string, "applied" | "rejected"> = {};
    for (const [k, v] of Object.entries(raw)) {
        const e = normalizeEntry(v);
        if (e) out[k] = e.status;
    }
    return out;
}

export function setProposedEdit(path: string, edit: ProposedEdit) {
    if (currentConversationId && isFileResolved(currentConversationId, path, edit.replacement)) {
        return;
    }
    const normalizedPath = normalize(path);
    proposedEdits[normalizedPath] = {
        ...edit,
        baseline: edit.baseline ?? edit.original,
    };
    window.dispatchEvent(new CustomEvent("shape-proposed-edits-changed", {
        detail: { path: normalizedPath },
    }));
}

export function getProposedEdit(path: string): ProposedEdit | null {
    const n = normalize(path);
    if (proposedEdits[n]) return proposedEdits[n];
    for (const [key, value] of Object.entries(proposedEdits)) {
        if (pathsMatch(n, key)) {
            return value;
        }
    }
    return null;
}

export function clearProposedEdit(path: string) {
    const n = normalize(path);
    delete proposedEdits[n];
    for (const key of Object.keys(proposedEdits)) {
        if (pathsMatch(n, key)) {
            delete proposedEdits[key];
        }
    }
    window.dispatchEvent(new CustomEvent("shape-proposed-edits-changed", {
        detail: { path: n },
    }));
}

export function clearAllProposedEdits() {
    proposedEdits = {};
    window.dispatchEvent(new CustomEvent("shape-proposed-edits-changed", {
        detail: { all: true },
    }));
}

export function getAllProposedEdits(): Record<string, ProposedEdit> {
    return { ...proposedEdits };
}

export function isFileResolvedForCurrentConversation(
    file: string,
    currentReplacement?: string,
): boolean {
    return isFileResolved(currentConversationId, file, currentReplacement);
}

/** @deprecated Use isFileResolved instead - kept for gradual migration */
export function loadEditStatuses(): Record<string, "applied" | "rejected"> {
    return {};
}

/** @deprecated No longer persisted */
export function saveEditStatuses(_statuses: Record<string, "applied" | "rejected">) {
    // no-op: resolvedFiles is the single source of truth
}

/** @deprecated No longer used */
export function clearEditStatuses() {
    // no-op
}
