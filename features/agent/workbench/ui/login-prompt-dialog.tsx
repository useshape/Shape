"use client";

import * as React from "react";
import { useShapeAuth } from "@/lib/cloud/store";
import { getSettings, updateSettingSection } from "@/lib/settings";

/**
 * When logged out on launch, open the onboarding login UI (not a modal).
 * Dispatches `shape-show-login` for Content to overlay Onboarding loginOnly.
 */
export function LoginPromptDialog() {
    const auth = useShapeAuth();
    const [fired, setFired] = React.useState(false);

    React.useEffect(() => {
        if (auth.isLoading || auth.loggedIn || fired) return;
        if (!getSettings().privacy.showLoginPromptOnLaunch) return;
        const timer = window.setTimeout(() => {
            setFired(true);
            updateSettingSection("privacy", { showLoginPromptOnLaunch: false });
            window.dispatchEvent(new CustomEvent("shape-show-login"));
        }, 400);
        return () => window.clearTimeout(timer);
    }, [auth.isLoading, auth.loggedIn, fired]);

    return null;
}

/** Open the login onboarding overlay from account menus / chat gates. */
export function requestShapeLogin() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("shape-show-login"));
}
