"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogBody,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { commands, useProjectState } from "@/lib/backend";
import { cleanPath, getRepoName } from "@/lib/workspace/repo-history";
import {
    shouldPromptWorkspaceTrust,
    trustWorkspace,
    untrustWorkspace,
} from "@/lib/workspace/trust";

export function TrustFolderHost() {
    const { project_path } = useProjectState();
    const [path, setPath] = useState<string | null>(null);

    useEffect(() => {
        if (!project_path || !shouldPromptWorkspaceTrust(project_path)) {
            setPath(null);
            return;
        }
        setPath(project_path);
    }, [project_path]);

    useEffect(() => {
        const onTrusted = (event: Event) => {
            const next = (event as CustomEvent<{ path?: string }>).detail?.path;
            if (next && path && next.replace(/\\/g, "/").toLowerCase() === path.replace(/\\/g, "/").toLowerCase()) {
                setPath(null);
            }
        };
        window.addEventListener("shape-workspace-trusted", onTrusted as EventListener);
        return () => window.removeEventListener("shape-workspace-trusted", onTrusted as EventListener);
    }, [path]);

    const open = Boolean(path);

    const dismissRestricted = () => {
        if (!path) return;
        untrustWorkspace(path);
        void commands.setWorkspaceTrusted(path, false);
        setPath(null);
    };

    const trust = () => {
        if (!path) return;
        trustWorkspace(path);
        void commands.setWorkspaceTrusted(path, true);
        setPath(null);
    };

    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                if (!next) dismissRestricted();
            }}
        >
            <AlertDialogContent sizeClassName="max-w-md">
                <AlertDialogHeader>
                    <AlertDialogTitle>Do you trust this folder?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Shape can run commands and edit files here. Only trust folders you know.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogBody>
                    {path ? (
                        <p className="rounded-lg bg-panel-hover px-3 py-2 text-sm text-text-primary">
                            <span className="block font-medium">{getRepoName(path)}</span>
                            <span className="mt-0.5 block truncate text-text-muted">{cleanPath(path)}</span>
                        </p>
                    ) : null}
                    <p className="text-sm text-text-secondary">
                        If you don&apos;t trust this folder, Shape can still open it, but the agent
                        won&apos;t run commands or change files.
                    </p>
                </AlertDialogBody>
                <AlertDialogFooter>
                    <Button type="button" variant="ghost" size="sm" onClick={dismissRestricted}>
                        Don&apos;t trust
                    </Button>
                    <Button type="button" size="sm" onClick={trust}>
                        Trust folder
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
