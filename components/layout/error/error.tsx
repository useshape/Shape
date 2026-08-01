"use client";

import { useEffect } from "react";
import { notify } from "@/features/notifications";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Global Error Caught:", error);
        notify.error("Application Error", error.message);
    }, [error]);

    return (
        <div className="flex-1 flex items-center justify-center bg-background text-text-muted select-none p-8 h-full">
            <div className="flex flex-col items-center gap-4 max-w-md text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-lg flex items-center justify-center text-error mb-2 border border-red-500/20 shadow-lg shadow-red-500/5">
                    <span className="text-3xl font-bold">!</span>
                </div>
                <h3 className="text-text-primary font-semibold text-xl">Something went wrong</h3>
                <p className="text-sm border border-border-subtle p-4 rounded-xl bg-panel-secondary font-mono w-full break-all text-text-muted leading-relaxed shadow-inner">
                    {error.message || "An unexpected application error occurred."}
                </p>
                <div className="flex gap-3 mt-2">
                    <button
                        onClick={() => reset()}
                        className="px-6 py-2.5 bg-accent text-accent-fg rounded-lg text-sm font-medium hover:bg-accent-hover transition-all shadow-md active:scale-95"
                    >
                        Try Again
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-2.5 bg-panel border border-border-subtle text-text-secondary rounded-lg text-sm font-medium hover:bg-panel-hover transition-all active:scale-95"
                    >
                        Reload IDE
                    </button>
                </div>
            </div>
        </div>
    );
}
