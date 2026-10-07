"use client";

import { LoginPanel } from "./login-panel";
import { OnboardingWindowChrome } from "./window-chrome";

/** Sign-in gate. Shape needs an account; there is no offline or skip path. */
export default function Onboarding() {
    return (
        <div
            id="shape-onboarding"
            className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-text-primary select-none"
        >
            <OnboardingWindowChrome />
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-8 py-10">
                <div className="flex w-full max-w-sm flex-col items-center text-center">
                    <h1 className="font-brand text-3xl font-medium tracking-tight text-text-primary">
                        Sign in to Shape
                    </h1>
                    <p className="mt-2 text-sm text-text-muted">
                        An account is required. Models, usage, and billing run through Shape.
                    </p>
                    <div className="mt-8 w-full">
                        <LoginPanel finishing={false} onSignedIn={() => {}} />
                    </div>
                </div>
            </div>
        </div>
    );
}
