"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogBody,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { commands } from "@/lib/backend";
import { isWorkspaceTrusted, trustWorkspace } from "@/lib/workspace-trust";

type WorkspaceTrustDialogProps = {
    path: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function WorkspaceTrustDialog({ path, open, onOpenChange }: WorkspaceTrustDialogProps) {
    const folderName = path?.split(/[/\\]/).filter(Boolean).pop() ?? "this folder";

    const handleTrust = async () => {
        if (!path) return;
        trustWorkspace(path);
        await commands.setWorkspaceTrusted(path, true);
        onOpenChange(false);
    };

    const handleRestrict = async () => {
        if (!path) return;
        await commands.setWorkspaceTrusted(path, false);
        onOpenChange(false);
    };

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent sizeClassName="max-w-[460px]">
                <AlertDialogHeader>
                    <AlertDialogTitle>Trust &quot;{folderName}&quot;?</AlertDialogTitle>
                </AlertDialogHeader>
                <AlertDialogBody className="space-y-2">
                    <AlertDialogDescription className="leading-relaxed">
                        This folder can run code via the agent, language servers, ESLint, and project rules.
                        Only trust repositories you recognize.
                    </AlertDialogDescription>
                    {path && isWorkspaceTrusted(path) ? null : (
                        <p className="text-xs text-text-muted">
                            Restricted mode still lets you browse files; agent shell, writes, LSP, and lint stay off until you trust.
                        </p>
                    )}
                </AlertDialogBody>
                <AlertDialogFooter>
                    <Button variant="ghost" size="sm" onClick={() => void handleRestrict()}>
                        Browse only
                    </Button>
                    <AlertDialogAction asChild>
                        <Button variant="default" size="sm" onClick={() => void handleTrust()}>
                            Trust folder
                        </Button>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export function WorkspaceTrustHost() {
    const [path, setPath] = React.useState<string | null>(null);
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
        const onProject = (e: Event) => {
            const next = (e as CustomEvent<{ path: string | null }>).detail?.path ?? null;
            if (!next) {
                setOpen(false);
                setPath(null);
                return;
            }
            setPath(next);
            if (isWorkspaceTrusted(next)) {
                void commands.setWorkspaceTrusted(next, true);
                setOpen(false);
            } else {
                void commands.setWorkspaceTrusted(next, false);
                setOpen(true);
            }
        };

        window.addEventListener("shape-workspace-opened", onProject as EventListener);
        return () => window.removeEventListener("shape-workspace-opened", onProject as EventListener);
    }, []);

    return <WorkspaceTrustDialog path={path} open={open} onOpenChange={setOpen} />;
}
