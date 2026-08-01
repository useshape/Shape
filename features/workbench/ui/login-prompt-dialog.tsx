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
import { loginShape, useShapeAuth } from "@/lib/shape-auth/store";
import { getSettings, updateSettingSection } from "@/lib/settings";

export function LoginPromptDialog() {
    const auth = useShapeAuth();
    const [open, setOpen] = React.useState(false);
    const [neverShowAgain, setNeverShowAgain] = React.useState(false);
    const [dismissed, setDismissed] = React.useState(false);

    React.useEffect(() => {
        if (auth.isLoading || auth.loggedIn || dismissed) return;
        if (!getSettings().privacy.showLoginPromptOnLaunch) return;
        const timer = window.setTimeout(() => setOpen(true), 400);
        return () => window.clearTimeout(timer);
    }, [auth.isLoading, auth.loggedIn, dismissed]);

    const handleSkip = React.useCallback(() => {
        if (neverShowAgain) {
            updateSettingSection("privacy", { showLoginPromptOnLaunch: false });
        }
        setDismissed(true);
        setOpen(false);
    }, [neverShowAgain]);

    const handleSignIn = React.useCallback(() => {
        setDismissed(true);
        setOpen(false);
        void loginShape();
    }, []);

    if (auth.loggedIn) return null;

    return (
        <AlertDialog open={open} onOpenChange={(next) => !next && handleSkip()}>
            <AlertDialogContent sizeClassName="max-w-[420px]">
                <AlertDialogHeader>
                    <AlertDialogTitle>Sign in to Shape</AlertDialogTitle>
                </AlertDialogHeader>
                <AlertDialogBody>
                    <AlertDialogDescription>
                        Sign in to use AI chat, sync your plan, and track usage across devices.
                    </AlertDialogDescription>
                    <div
                        className="group flex cursor-pointer select-none items-center gap-2"
                        onClick={() => setNeverShowAgain((v) => !v)}
                    >
                        <Checkmark
                            checked={neverShowAgain}
                            onCheckedChange={(val) => setNeverShowAgain(!!val)}
                        />
                        <span className="text-sm text-text-muted transition-colors group-hover:text-text-secondary">
                            Don&apos;t show again
                        </span>
                    </div>
                </AlertDialogBody>
                <AlertDialogFooter>
                    <AlertDialogCancel asChild>
                        <Button variant="ghost" size="sm" onClick={handleSkip}>
                            Skip
                        </Button>
                    </AlertDialogCancel>
                    <AlertDialogAction asChild>
                        <Button variant="default" size="sm" onClick={handleSignIn}>
                            Sign in
                        </Button>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
