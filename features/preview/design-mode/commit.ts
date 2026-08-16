import { applyEditsToProject, revertSourceWrites } from "./apply-to-source";

export { abortDesignApply } from "./apply-to-source";
import { designLog } from "./log";
import type { DesignPendingEdit } from "./types";

export type DesignRevertEntry = { path: string; previous: string };

const stack: DesignRevertEntry[][] = [];
const listeners = new Set<() => void>();
let queue: Promise<unknown> = Promise.resolve();

function emit() {
    for (const listener of listeners) listener();
}

export function subscribeDesignRevert(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function designRevertDepth() {
    return stack.length;
}

export async function commitDesignEdits(projectPath: string, edits: DesignPendingEdit[]) {
    const run = async () => {
        designLog("INFO", "apply", {
            count: edits.length,
            items: edits.map((e) => ({
                label: e.label,
                tag: e.tag,
                keys: Object.keys(e.styles),
                className: e.className,
                source: e.source
                    ? {
                          file: `${e.source.fileName.split(/[/\\]/).pop()}:${e.source.lineNumber}`,
                          mapped: e.source.mapped ?? false,
                          generated: e.source.generated?.fileName?.split(/[/\\]/).pop() ?? null,
                      }
                    : null,
            })),
        });
        const result = await applyEditsToProject(projectPath, edits, "element");
        if (result.reverts.length) {
            stack.push(result.reverts);
            emit();
        }
        if (result.errors.length && result.files.length) {
            designLog("WARN", "apply partial", { errors: result.errors, files: result.files });
        } else if (result.errors.length) {
            designLog("ERROR", "apply failed", { errors: result.errors, files: result.files });
        } else {
            designLog("INFO", "apply ok", { files: result.files.map((f) => f.split(/[/\\]/).pop()) });
        }
        return result;
    };
    const next = queue.then(run, run);
    queue = next.then(
        () => undefined,
        () => undefined,
    );
    return next;
}

export async function commitDesignEdit(projectPath: string, edit: DesignPendingEdit) {
    return commitDesignEdits(projectPath, [edit]);
}

export async function revertLastDesignCommit() {
    const last = stack.pop();
    emit();
    if (!last?.length) {
        designLog("WARN", "revert skipped; nothing to restore");
        return { ok: false as const, error: "Nothing to revert." };
    }
    designLog("INFO", "revert", { files: last.map((e) => e.path.split(/[/\\]/).pop()) });
    const err = await revertSourceWrites(last);
    if (err) {
        stack.push(last);
        emit();
        designLog("ERROR", "revert failed", { error: err });
        return { ok: false as const, error: err };
    }
    return { ok: true as const };
}
