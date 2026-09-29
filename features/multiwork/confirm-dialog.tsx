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

type Pending = {
    resolve: (ok: boolean) => void;
};

let pending: Pending | null = null;
const listeners = new Set<() => void>();

function notify() {
    for (const l of listeners) l();
}

/** Confirm before the first Multiwork send (delegates to several agents). */
export function confirmMultiworkStart(): Promise<boolean> {
    return new Promise((resolve) => {
        pending = { resolve };
        notify();
    });
}

export function MultiworkConfirmDialog() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const sync = () => setOpen(pending != null);
        listeners.add(sync);
        sync();
        return () => {
            listeners.delete(sync);
        };
    }, []);

    const finish = (ok: boolean) => {
        const p = pending;
        pending = null;
        setOpen(false);
        notify();
        p?.resolve(ok);
    };

    return (
        <AlertDialog open={open} onOpenChange={(v) => { if (!v) finish(false); }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Start Multiwork?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Shape will split this into tasks for several agents. They can
                        edit files and talk to each other. You can stop the office anytime.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogBody />
                <AlertDialogFooter>
                    <AlertDialogCancel asChild>
                        <Button type="button" variant="secondary" size="sm" onClick={() => finish(false)}>
                            Cancel
                        </Button>
                    </AlertDialogCancel>
                    <AlertDialogAction asChild>
                        <Button type="button" size="sm" onClick={() => finish(true)}>
                            Start
                        </Button>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
