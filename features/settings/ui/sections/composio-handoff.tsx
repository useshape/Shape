"use client";

import { useState } from "react";
import { SHAPE_API_BASE } from "@/lib/cloud/api";
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

export function ComposioHandoff({
    open,
    pluginName,
    userId,
    name,
    email,
    offline,
    busy,
    onContinue,
    onCancel,
}: {
    open: boolean;
    pluginName: string;
    userId: string | null;
    name: string | null;
    email: string | null;
    offline?: boolean;
    busy?: boolean;
    onContinue: () => void;
    onCancel: () => void;
}) {
    const letter = (name || email || "S").trim().charAt(0).toUpperCase() || "S";
    const [avatarFailed, setAvatarFailed] = useState(false);
    const avatarSrc = userId && !offline && !avatarFailed ? `${SHAPE_API_BASE}/api/avatar/${userId}` : null;
    return (
        <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
            <AlertDialogContent sizeClassName="max-w-[420px]">
                <AlertDialogHeader>
                    <AlertDialogTitle>Connect {pluginName}</AlertDialogTitle>
                    <AlertDialogDescription>
                        Shape uses Composio to sign you into {pluginName}. You&apos;ll finish in the browser, then come back to Shape.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogBody>
                    <div className="flex items-center justify-center gap-4 py-2">
                        <div className="relative flex size-14 items-center justify-center overflow-hidden rounded-full bg-surface-3 text-lg font-medium text-text-primary">
                            {letter}
                            {avatarSrc ? (
                                <img
                                    src={avatarSrc}
                                    alt=""
                                    className="absolute inset-0 size-full object-cover"
                                    onError={() => setAvatarFailed(true)}
                                />
                            ) : null}
                        </div>
                        <div className="h-px w-10 bg-border" />
                        <div className="flex size-14 items-center justify-center rounded-2xl bg-[#111] text-lg font-medium text-white">
                            C
                        </div>
                    </div>
                </AlertDialogBody>
                <AlertDialogFooter>
                    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button type="button" size="sm" disabled={busy} onClick={onContinue}>
                        {busy ? "Opening Composio…" : "Continue to Composio"}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
