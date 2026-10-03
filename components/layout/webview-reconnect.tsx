"use client";

import React, { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { isTauriRuntime } from "@/lib/window/tauri-window";

/** In-app reconnect when the Next origin / webview document fails. */
export function WebviewReconnect() {
    const [down, setDown] = useState(false);

    useEffect(() => {
        const onFailed = () => setDown(true);
        window.addEventListener("shape-webview-load-failed", onFailed);
        let unlisten: (() => void) | undefined;
        if (isTauriRuntime()) {
            void listen("webview-load-failed", () => setDown(true)).then((fn) => {
                unlisten = fn;
            });
        }
        return () => {
            window.removeEventListener("shape-webview-load-failed", onFailed);
            unlisten?.();
        };
    }, []);

    if (!down) return null;

    return (
        <div className="absolute inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
            <p className="text-base font-medium text-text-primary">Can’t reach the Shape UI</p>
            <p className="max-w-sm text-sm text-text-secondary">
                {isTauriRuntime()
                    ? "The local Next.js server stopped. Retry — Shape is still running."
                    : "The app server stopped responding."}
            </p>
            <Button type="button" onClick={() => window.location.reload()}>
                Reconnect
            </Button>
        </div>
    );
}
