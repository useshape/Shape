"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Button, type ButtonStatus } from "@/components/ui/button";
import { cancelLoginShape, loginShape, useShapeAuth } from "@/lib/cloud/store";
import { commands } from "@/lib/backend";
import { SHAPE_API_BASE } from "@/lib/cloud/api";

export function LoginPanel({
    finishing,
    onSignedIn,
}: {
    finishing: boolean;
    onSignedIn: () => void;
}) {
    const shapeAuth = useShapeAuth();
    const [waiting, setWaiting] = useState(false);
    const busy = waiting || shapeAuth.isLoggingIn || finishing;
    const authError = shapeAuth.error;
    const cancelled = Boolean(authError && /cancel/i.test(authError));
    const continueStatus: ButtonStatus = finishing
        ? "loading"
        : waiting || shapeAuth.isLoggingIn
          ? "waiting"
          : authError && !cancelled
            ? "error"
            : "idle";

    useEffect(() => {
        if (!shapeAuth.isLoggingIn) setWaiting(false);
    }, [shapeAuth.isLoggingIn]);

    const start = async () => {
        setWaiting(true);
        try {
            if (await loginShape()) onSignedIn();
        } finally {
            setWaiting(false);
        }
    };

    return (
        <div className="flex w-full flex-col items-center text-center">
            <Button
                status={continueStatus}
                aria-label={busy ? "Cancel sign-in" : "Authorize your account"}
                className="mt-8 h-13! min-h-13! w-90! text-lg! font-normal squircle-full!"
                disabled={shapeAuth.loggedIn}
                variant="default"
                onPointerDown={() => {
                    if (busy) cancelLoginShape();
                }}
                onClick={() => void start()}
            >
                Authorize your account
            </Button>
            <button
                type="button"
                className="mt-5 text-lg font-regular text-text-muted hover:text-text-primary hover:underline"
                onClick={() => void commands.openUrlExternal(`${SHAPE_API_BASE}/signup`)}
            >
                Sign up
            </button>
            {authError && !cancelled && !busy ? (
                <p className="mt-3 text-sm text-error">{authError}</p>
            ) : null}
        </div>
    );
}
