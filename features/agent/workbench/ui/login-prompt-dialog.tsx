"use client";

import * as React from "react";
import { useShapeAuth } from "@/lib/cloud/store";
import { getSettings, updateSettingSection } from "@/lib/settings";

/**
 * Logged-out launch used to raise a separate login overlay.
 * The workbench already blocks on the sign-in screen, so this only records that the prompt ran.
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
