import { commands } from "@/lib/backend";
import { joinPath, toFsPath } from "@/lib/path-utils";
import {
    COMMENTS_FILE,
    commentsForFile,
    emptyCommentStore,
    parseCommentStore,
    removeComment,
    serializeCommentStore,
    toProjectRelative,
    upsertComment,
    type CommentFileStore,
    type FileComment,
} from "@/lib/editor-comments";

const cache = new Map<string, CommentFileStore>();
let writeChain: Promise<void> = Promise.resolve();

function projectKey(projectPath: string): string {
    return toFsPath(projectPath);
}

function commentsFsPath(projectPath: string): string {
    return toFsPath(joinPath(projectPath, COMMENTS_FILE));
}

async function readStore(projectPath: string): Promise<CommentFileStore> {
    const key = projectKey(projectPath);
    const hit = cache.get(key);
    if (hit) return hit;
    try {
        const raw = await commands.readFile(commentsFsPath(projectPath));
        const store = parseCommentStore(raw);
        cache.set(key, store);
        return store;
    } catch {
        const store = emptyCommentStore();
        cache.set(key, store);
        return store;
    }
}

async function writeStore(projectPath: string, store: CommentFileStore): Promise<void> {
    const key = projectKey(projectPath);
    cache.set(key, store);
    const path = commentsFsPath(projectPath);
    const dir = toFsPath(joinPath(projectPath, ".shape"));
    const run = async () => {
        try {
            await commands.createDir(dir);
        } catch {
            /* exists */
        }
        await commands.saveFile(path, serializeCommentStore(store));
    };
    const pending = writeChain.then(run, run);
    writeChain = pending.catch(() => undefined);
    await pending;
}

export async function listCommentsForFile(
    projectPath: string,
    filePath: string,
): Promise<FileComment[]> {
    const store = await readStore(projectPath);
    return commentsForFile(store, toProjectRelative(filePath, projectPath));
}

export async function listProjectComments(projectPath: string): Promise<FileComment[]> {
    const store = await readStore(projectPath);
    return [...store.comments].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveFileComment(
    projectPath: string,
    comment: FileComment,
): Promise<FileComment[]> {
    const relative = toProjectRelative(comment.file, projectPath) || comment.file;
    const store = await readStore(projectPath);
    const next = upsertComment(store, {
        ...comment,
        file: relative,
        updatedAt: Date.now(),
    });
    await writeStore(projectPath, next);
    return commentsForFile(next, relative);
}

export async function deleteFileComment(
    projectPath: string,
    filePath: string,
    id: string,
): Promise<FileComment[]> {
    const relative = toProjectRelative(filePath, projectPath);
    const store = await readStore(projectPath);
    const next = removeComment(store, id);
    await writeStore(projectPath, next);
    return commentsForFile(next, relative);
}

export async function persistCommentLines(
    projectPath: string,
    filePath: string,
    updates: Array<{ id: string; line: number; snippet: string }>,
): Promise<void> {
    if (updates.length === 0) return;
    const relative = toProjectRelative(filePath, projectPath);
    const store = await readStore(projectPath);
    let changed = false;
    const comments = store.comments.map((c) => {
        if (c.file.toLowerCase() !== relative.toLowerCase()) return c;
        const hit = updates.find((u) => u.id === c.id);
        if (!hit) return c;
        if (hit.line === c.line && hit.snippet === c.snippet) return c;
        changed = true;
        return { ...c, line: hit.line, snippet: hit.snippet, updatedAt: c.updatedAt };
    });
    if (!changed) return;
    await writeStore(projectPath, { version: store.version, comments });
}

export function invalidateCommentStore(projectPath?: string) {
    if (!projectPath) {
        cache.clear();
        return;
    }
    cache.delete(projectKey(projectPath));
}
