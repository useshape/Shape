"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Button, type ButtonStatus } from "@/components/ui/button";
import { loginShape, useShapeAuth } from "@/lib/cloud/store";

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
            <Image
                src="/logos/logo.svg"
                alt="Shape"
                width={20}
                height={20}
                priority
                style={{ width: 20, height: "auto" }}
                className="logo-invert"
            />
            <Button
                type="button"
                size="lg"
                className="mt-8 w-full"
                disabled={busy || shapeAuth.loggedIn}
                status={continueStatus}
                onClick={() => void start()}
            >
                Continue with Shape
            </Button>
            {authError && !cancelled && !busy ? (
                <p className="mt-3 text-sm text-error">{authError}</p>
            ) : null}
        </div>
    );
}
