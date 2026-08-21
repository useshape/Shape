import { normalizePath } from "@/lib/path-utils";

export const COMMENT_STORE_VERSION = 1;
export const COMMENTS_FILE = ".shape/comments.json";

export type CommentTag =
    | { kind: "file"; path: string; label: string }
    | { kind: "person"; name: string; email?: string; login?: string; avatarUrl?: string }
    | { kind: "url"; href: string; label: string };

export type FileComment = {
    id: string;
    file: string;
    line: number;
    snippet: string;
    body: string;
    tags: CommentTag[];
    createdAt: number;
    updatedAt: number;
};

export type CommentFileStore = {
    version: number;
    comments: FileComment[];
};

export function emptyCommentStore(): CommentFileStore {
    return { version: COMMENT_STORE_VERSION, comments: [] };
}

export function newCommentId(): string {
    return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function snippetOfLine(line: string): string {
    return line.trim().slice(0, 80);
}

export function toProjectRelative(filePath: string, projectPath: string): string {
    const file = normalizePath(filePath);
    const project = normalizePath(projectPath).replace(/\/$/, "");
    const fileLower = file.toLowerCase();
    const projectLower = project.toLowerCase();
    if (fileLower === projectLower) return "";
    if (fileLower.startsWith(`${projectLower}/`)) {
        return file.slice(project.length + 1);
    }
    return file;
}

export function parseCommentStore(raw: string): CommentFileStore {
    try {
        const parsed = JSON.parse(raw) as Partial<CommentFileStore>;
        if (!parsed || !Array.isArray(parsed.comments)) return emptyCommentStore();
        const comments: FileComment[] = [];
        for (const item of parsed.comments) {
            const next = normalizeComment(item);
            if (next) comments.push(next);
        }
        return { version: COMMENT_STORE_VERSION, comments };
    } catch {
        return emptyCommentStore();
    }
}

export function serializeCommentStore(store: CommentFileStore): string {
    return `${JSON.stringify(
        {
            version: COMMENT_STORE_VERSION,
            comments: store.comments,
        },
        null,
        2,
    )}\n`;
}

export function commentsForFile(store: CommentFileStore, relativeFile: string): FileComment[] {
    const key = normalizePath(relativeFile).toLowerCase();
    return store.comments
        .filter((c) => normalizePath(c.file).toLowerCase() === key)
        .slice()
        .sort((a, b) => a.line - b.line || a.createdAt - b.createdAt);
}

export function upsertComment(store: CommentFileStore, comment: FileComment): CommentFileStore {
    const idx = store.comments.findIndex((c) => c.id === comment.id);
    const comments = store.comments.slice();
    if (idx >= 0) comments[idx] = comment;
    else comments.push(comment);
    return { version: COMMENT_STORE_VERSION, comments };
}

export function removeComment(store: CommentFileStore, id: string): CommentFileStore {
    return {
        version: COMMENT_STORE_VERSION,
        comments: store.comments.filter((c) => c.id !== id),
    };
}

/** Find the current line for a comment after the file has been edited. */
export function reanchorLine(comment: FileComment, lines: string[]): number {
    if (lines.length === 0) return 1;
    const fallback = Math.min(Math.max(comment.line, 1), lines.length);
    const want = comment.snippet.trim();
    if (!want) return fallback;

    const at = fallback - 1;
    if (lineMatchesSnippet(lines[at], want)) return fallback;

    const radius = 80;
    for (let d = 1; d <= radius; d++) {
        const before = at - d;
        const after = at + d;
        if (before >= 0 && lineMatchesSnippet(lines[before], want)) return before + 1;
        if (after < lines.length && lineMatchesSnippet(lines[after], want)) return after + 1;
    }
    return fallback;
}

export function looksLikeUrl(query: string): boolean {
    const q = query.trim();
    if (!q || /\s/.test(q)) return false;
    return /^(https?:\/\/|www\.)/i.test(q) || /^[a-z0-9-]+(\.[a-z0-9-]+)+([/:?#].*)?$/i.test(q);
}

export function normalizeHref(query: string): string {
    const q = query.trim();
    if (/^https?:\/\//i.test(q)) return q;
    return `https://${q}`;
}

export function hostnameLabel(href: string): string {
    try {
        const host = new URL(href).hostname.replace(/^www\./i, "");
        return host || href;
    } catch {
        return href.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    }
}

export function remoteUrlToHttps(remote: string): string | null {
    const trimmed = remote.trim();
    if (!trimmed) return null;
    const gitSsh = trimmed.match(/^git@([^:]+):(.+?)(?:\.git)?$/i);
    if (gitSsh) return `https://${gitSsh[1]}/${gitSsh[2].replace(/\.git$/i, "")}`;
    if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\.git$/i, "");
    return null;
}

export function parseGithubRepo(remoteOrUrl: string): { owner: string; repo: string } | null {
    const href = remoteUrlToHttps(remoteOrUrl) || remoteOrUrl;
    const m = href.match(/github\.com[:/]+([^/]+)\/([^/#?]+)/i);
    if (!m) return null;
    return { owner: m[1], repo: m[2].replace(/\.git$/i, "") };
}

export function commentTagToken(tag: CommentTag): string {
    if (tag.kind === "person") return `@${(tag.login || tag.name).replace(/\s+/g, "")}`;
    if (tag.kind === "file") return `@${tag.path}`;
    return tag.href;
}

export function tagsFromCommentBody(
    body: string,
    people: Array<{ name: string; email?: string; login?: string; avatarUrl?: string }> = [],
): CommentTag[] {
    const tags: CommentTag[] = [];
    const seen = new Set<string>();
    const add = (tag: CommentTag) => {
        const token = commentTagToken(tag);
        if (seen.has(token)) return;
        seen.add(token);
        tags.push(tag);
    };
    for (const match of body.matchAll(/https?:\/\/[^\s]+/g)) {
        add({ kind: "url", href: match[0], label: hostnameLabel(match[0]) });
    }
    for (const match of body.matchAll(/@([^\s]+)/g)) {
        const raw = match[1];
        const key = raw.toLowerCase();
        const person = people.find((p) => {
            const login = (p.login || "").toLowerCase();
            const name = p.name.replace(/\s+/g, "").toLowerCase();
            return login === key || name === key || `@${login}` === `@${key}`;
        });
        if (person) {
            add({
                kind: "person",
                name: person.name,
                email: person.email,
                login: person.login,
                avatarUrl: person.avatarUrl,
            });
            continue;
        }
        if (raw.includes("/") || /\.[a-z0-9]+$/i.test(raw)) {
            add({ kind: "file", path: raw, label: raw.split("/").pop() || raw });
        }
    }
    return tags;
}

export function formatCommentTime(ms: number, now = Date.now()): string {
    const diff = Math.max(0, now - ms);
    if (diff < 45_000) return "just now";
    if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m`;
    if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))}h`;
    if (diff < 30 * 86_400_000) return `${Math.max(1, Math.floor(diff / 86_400_000))}d`;
    return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function lineMatchesSnippet(line: string, snippet: string): boolean {
    const trimmed = line.trim();
    return trimmed === snippet || trimmed.startsWith(snippet) || trimmed.includes(snippet);
}

function normalizeComment(raw: unknown): FileComment | null {
    if (!raw || typeof raw !== "object") return null;
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== "string" || typeof c.file !== "string") return null;
    const line = Number(c.line);
    if (!Number.isFinite(line) || line < 1) return null;
    return {
        id: c.id,
        file: normalizePath(c.file),
        line: Math.floor(line),
        snippet: typeof c.snippet === "string" ? c.snippet : "",
        body: typeof c.body === "string" ? c.body : "",
        tags: Array.isArray(c.tags) ? c.tags.map(normalizeTag).filter((t): t is CommentTag => t !== null) : [],
        createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
        updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : Date.now(),
    };
}

function normalizeTag(raw: unknown): CommentTag | null {
    if (!raw || typeof raw !== "object") return null;
    const t = raw as Record<string, unknown>;
    if (t.kind === "file" && typeof t.path === "string") {
        const path = normalizePath(t.path);
        return { kind: "file", path, label: typeof t.label === "string" ? t.label : path.split("/").pop() || path };
    }
    if (t.kind === "person" && typeof t.name === "string") {
        return {
            kind: "person",
            name: t.name,
            email: typeof t.email === "string" ? t.email : undefined,
            login: typeof t.login === "string" ? t.login : undefined,
            avatarUrl: typeof t.avatarUrl === "string" ? t.avatarUrl : undefined,
        };
    }
    if (t.kind === "url" && typeof t.href === "string") {
        return {
            kind: "url",
            href: t.href,
            label: typeof t.label === "string" ? t.label : hostnameLabel(t.href),
        };
    }
    return null;
}
