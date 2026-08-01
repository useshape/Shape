"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkmark } from "@/components/ui/checkmark";
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

interface WarningProps {
    isOpen: boolean;
    onCancel: () => void;
    onContinue: (neverShowAgain: boolean) => void;
    projectPath: string;
}

export function Warning({ isOpen, onCancel, onContinue, projectPath }: WarningProps) {
    const projectName = projectPath.split(/[/\\]/).pop() || "this project";
    const [neverShowAgain, setNeverShowAgain] = React.useState(false);

    return (
        <AlertDialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
            <AlertDialogContent sizeClassName="max-w-[420px]">
                <AlertDialogHeader className="px-3 py-1.5">
                    <AlertDialogTitle>Non-Web Project Detected</AlertDialogTitle>
                </AlertDialogHeader>
                <AlertDialogBody className="space-y-4 px-3 py-2">
                    <AlertDialogDescription asChild>
                        <div className="space-y-1 text-sm text-text-secondary">
                            <p>
                                It looks like{" "}
                                <strong className="text-text-primary">{projectName}</strong> might not
                                be a standard web project.
                            </p>
                            <p className="text-text-primary">
                                Are you sure you want to proceed with opening?
                            </p>
                        </div>
                    </AlertDialogDescription>
                    <div
                        className="group flex cursor-pointer select-none items-center gap-2"
                        onClick={() => setNeverShowAgain(!neverShowAgain)}
                    >
                        <Checkmark
                            checked={neverShowAgain}
                            onCheckedChange={(val) => setNeverShowAgain(!!val)}
                        />
                        <span className="text-sm font-medium text-text-muted transition-colors group-hover:text-text-secondary">
                            Never show warnings for this project
                        </span>
                    </div>
                </AlertDialogBody>
                <AlertDialogFooter>
                    <AlertDialogCancel asChild>
                        <Button variant="ghost" size="sm" onClick={onCancel}>
                            Cancel
                        </Button>
                    </AlertDialogCancel>
                    <AlertDialogAction asChild>
                        <Button variant="default" size="sm" onClick={() => onContinue(neverShowAgain)}>
                            Continue
                        </Button>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
