"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogBody,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getSettings, updateSettingSection } from "@/lib/settings";

type PendingRestore = {
    index: number;
    resolve: (ok: boolean) => void;
};

let pending: PendingRestore | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
    for (const l of listeners) l();
}

/** Ask before restoreCheckpoint when it will roll back file edits. */
export function confirmRestoreCheckpoint(index: number): Promise<boolean> {
    if (getSettings().privacy.skipCheckpointRestoreConfirm) {
        return Promise.resolve(true);
    }
    return new Promise((resolve) => {
        pending = { index, resolve };
        notifyListeners();
    });
}

export function CheckpointRestoreDialog() {
    const [open, setOpen] = useState(false);
    const [dontAsk, setDontAsk] = useState(false);

    useEffect(() => {
        const sync = () => setOpen(pending != null);
        listeners.add(sync);
        sync();
        return () => {
            listeners.delete(sync);
        };
    }, []);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                finish(true);
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open, dontAsk]);

    const finish = (ok: boolean) => {
        if (ok && dontAsk) {
            updateSettingSection("privacy", { skipCheckpointRestoreConfirm: true });
        }
        const p = pending;
        pending = null;
        setOpen(false);
        setDontAsk(false);
        notifyListeners();
        p?.resolve(ok);
    };

    return (
        <AlertDialog open={open} onOpenChange={(v) => { if (!v) finish(false); }}>
            <AlertDialogContent sizeClassName="max-w-[380px]">
                <AlertDialogHeader>
                    <AlertDialogTitle>Discard all changes up to this checkpoint?</AlertDialogTitle>
                    <AlertDialogDescription>You can always undo this later.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogBody>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-text-secondary">
                        <input
                            type="checkbox"
                            checked={dontAsk}
                            onChange={(e) => setDontAsk(e.target.checked)}
                            className="size-3.5 rounded border border-border-subtle bg-input-bg accent-accent"
                        />
                        Don&apos;t ask again
                    </label>
                </AlertDialogBody>
                <AlertDialogFooter>
                    <AlertDialogCancel asChild>
                        <Button type="button" variant="ghost" size="sm" onClick={() => finish(false)}>
                            Cancel
                            <span className="ml-1.5 text-xs text-text-muted">(esc)</span>
                        </Button>
                    </AlertDialogCancel>
                    <AlertDialogAction asChild>
                        <Button type="button" variant="default" size="sm" onClick={() => finish(true)}>
                            Continue
                            <kbd className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded px-1 py-px font-sans text-xs leading-none text-text-foreground">
                                ↵
                            </kbd>
                        </Button>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
