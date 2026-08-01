import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commands } from "@/lib/backend";
import { notify } from "@/features/notifications";

// ── CREATE BRANCH INLINE ──
export function CreateBranchFromCommitInline({ hash, repoPath, onDone, onCancel }: {
    hash: string; repoPath: string; onDone: () => void; onCancel: () => void;
}) {
    const [name, setName] = useState(`branch-from-${hash.slice(0, 7)}`);
    const [creating, setCreating] = useState(false);

    const doCreate = async () => {
        if (!name.trim()) return;
        setCreating(true);
        try {
            await commands.gitCreateBranchFromCommit(repoPath, name.trim(), hash);
            notify.success("Git", `Branch "${name.trim()}" created from ${hash.slice(0, 7)}`);
            onDone();
        } catch (e) {
            notify.error("Git Error", String(e));
            setCreating(false);
        }
    };

    return (
        <div className="flex flex-col gap-1 px-1.5 py-1 min-w-[220px]" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
            <span className="text-md text-text-primary">New branch name</span>
            <Input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); doCreate(); }
                    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
                }}
                disabled={creating}
                spellCheck={false}
            />
            <div className="flex gap-1">
                <Button
                    className="w-full"
                    size="sm"
                    onClick={doCreate}
                    disabled={creating || !name.trim()}
                >
                    {creating ? "Creating..." : "Create"}
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={onCancel}
                    disabled={creating}
                >
                    Cancel
                </Button>
            </div>
        </div>
    );
}
