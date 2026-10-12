"use client";

import { ShapeLogo } from "@/components/ui/shape-logo";
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
                    <ShapeLogo size={44} />
                    <h1 className="mt-6 text-3xl font-normal tracking-tight text-text-primary">
                        Continue to use shape
                    </h1>
                    <div className="w-full">
                        <LoginPanel finishing={false} onSignedIn={() => {}} />
                    </div>
                </div>
            </div>
        </div>
    );
}
