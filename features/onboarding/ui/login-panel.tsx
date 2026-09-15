"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button, type ButtonStatus } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commands } from "@/lib/backend/commands";
import {
    loginShape,
    useShapeAuth,
} from "@/lib/cloud/store";
import { websiteForgotPasswordUrl } from "@/lib/cloud/api";

function GitHubIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="shrink-0" aria-hidden>
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
    );
}

function GitLabIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0" aria-hidden>
            <path fill="#E24329" d="M12 21.2 8.3 12H15.7z" />
            <path fill="#FC6D26" d="M12 21.2 15.7 12h4.8z" />
            <path fill="#FCA326" d="M20.5 12 18.4 5.6c-.1-.4-.7-.4-.8 0L15.7 12z" />
            <path fill="#FC6D26" d="M12 21.2 8.3 12H3.5z" />
            <path fill="#E24329" d="M3.5 12 5.6 5.6c.1-.4.7-.4.8 0L8.3 12z" />
        </svg>
    );
}

function PasskeyIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
            <circle cx="8" cy="10" r="3.25" stroke="currentColor" strokeWidth="1.6" />
            <path
                d="M11 10h8.5v3.5M16 10v3.5M18.5 10v2.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
            />
        </svg>
    );
}

const oauthBtn =
    "h-10 min-w-0 flex-1 rounded-lg border border-border-secondary text-text-primary bg-panel-hover hover:bg-surface-4";

export function LoginPanel({
    finishing,
    onSignedIn,
}: {
    finishing: boolean;
    onSignedIn: () => void;
}) {
    const shapeAuth = useShapeAuth();
    const [email, setEmail] = useState("");
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

    const start = async (open?: Parameters<typeof loginShape>[0]) => {
        setWaiting(true);
        try {
            if (await loginShape(open)) onSignedIn();
        } finally {
            setWaiting(false);
        }
    };

    return (
        <div className="w-full max-w-sm">
            <Image
                src="/logos/logo.svg"
                alt="Shape"
                width={40}
                height={48}
                priority
                style={{ width: 28, height: "auto" }}
                className="logo-invert"
            />

            <h1 className="mt-8 text-lg font-medium text-text-primary">
                Let&apos;s start building
            </h1>

            <form
                className="mt-8 flex flex-col gap-3"
                onSubmit={(e) => {
                    e.preventDefault();
                    void start({ email });
                }}
            >
                <div>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                        <label htmlFor="onboarding-email" className="text-sm font-medium text-text-primary">
                            Email
                        </label>
                    </div>
                    <Input
                        id="onboarding-email"
                        type="email"
                        autoComplete="username webauthn"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                <Button
                    type="submit"
                    size="md"
                    disabled={shapeAuth.loggedIn}
                    status={continueStatus}
                >
                    Continue with Shape
                </Button>

                <div className="flex gap-2">
                    <Button
                        type="button"
                        className={oauthBtn}
                        disabled={busy || shapeAuth.loggedIn}
                        aria-label="Continue with GitHub"
                        onClick={() => void start({ kind: "provider", provider: "github" })}
                    >
                        <GitHubIcon />
                    </Button>
                    <Button
                        type="button"
                        className={oauthBtn}
                        disabled={busy || shapeAuth.loggedIn}
                        aria-label="Continue with GitLab"
                        onClick={() => void start({ kind: "provider", provider: "gitlab" })}
                    >
                        <GitLabIcon />
                    </Button>
                    <Button
                        type="button"
                        className={oauthBtn}
                        disabled={busy || shapeAuth.loggedIn}
                        aria-label="Continue with passkey"
                        onClick={() => void start({ email })}
                    >
                        <PasskeyIcon />
                    </Button>
                </div>
            </form>

            {authError && !cancelled && !busy ? (
                <p className="mt-2 text-sm text-error">{authError}</p>
            ) : null}
        </div>
    );
}
