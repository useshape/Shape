import { abortDesignApply, applyEditsToProject } from "./apply/commit-edits";
import { revertSourceWrites } from "./apply/source-files";
import { beginDesignOp, designLog, summarizePendingEdit } from "./log";
import type { DesignPendingEdit } from "./types";

export { abortDesignApply };

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

const APPLY_BUDGET_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            onTimeout();
            reject(new Error("Apply timed out. Try applying fewer edits."));
        }, ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (err) => {
                clearTimeout(timer);
                reject(err);
            },
        );
    });
}

export async function commitDesignEdits(
    projectPath: string,
    edits: DesignPendingEdit[],
    scope: "element" | "component" = "element",
) {
    const run = async () => {
        const op = beginDesignOp("apply", {
            count: edits.length,
            scope,
            project: projectPath.split(/[/\\]/).pop(),
            edits: edits.map(summarizePendingEdit),
            tip: "If this fails, paste the whole block from shape/design through end into chat",
        });
        try {
            const result = await applyEditsToProject(projectPath, edits, scope);
            if (result.reverts.length) {
                stack.push(result.reverts);
                emit();
            }
            const files = result.files.map((f) => f.split(/[/\\]/).pop());
            if (result.errors.length && result.files.length) {
                op.warn("apply:partial", {
                    why: "Some edits wrote to disk; others failed",
                    errors: result.errors,
                    files,
                    appliedIds: result.appliedIds,
                    failedIds: result.failedIds,
                });
                op.done({ outcome: "partial", files, errors: result.errors });
            } else if (result.errors.length) {
                op.fail({
                    why: result.errors[0] ?? "Apply failed",
                    errors: result.errors,
                    files,
                    failedIds: result.failedIds,
                });
            } else if (!result.appliedIds.length) {
                op.fail({
                    why: "Nothing was written to source",
                    errors: result.errors,
                    files,
                });
            } else {
                op.done({ outcome: "ok", files, appliedIds: result.appliedIds });
            }
            return result;
        } catch (err) {
            op.fail({
                why: err instanceof Error ? err.message : String(err),
                error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
            });
            throw err;
        }
    };
    const budgeted = () =>
        withTimeout(run(), APPLY_BUDGET_MS, () => {
            abortDesignApply();
            designLog("ERROR", "apply:timeout", {
                count: edits.length,
                why: "Apply exceeded budget; aborted in-flight writes",
                budgetMs: APPLY_BUDGET_MS,
            });
        });
    const next = queue.then(budgeted, budgeted);
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
        designLog("WARN", "revert:skipped", { why: "Nothing to restore" });
        return { ok: false as const, error: "Nothing to revert." };
    }
    const op = beginDesignOp("revert", {
        files: last.map((e) => e.path.split(/[/\\]/).pop()),
    });
    const err = await revertSourceWrites(last);
    if (err) {
        stack.push(last);
        emit();
        op.fail({ why: err });
        return { ok: false as const, error: err };
    }
    op.done();
    return { ok: true as const };
}
