"use client";

import { useEffect } from "react";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Global Layout Error Caught:", error);
    }, [error]);

    return (
        <html lang="en" className="h-full bg-titlebar text-text-primary text-sm">
            <body className="h-full flex items-center justify-center p-8 bg-background">
                <div className="flex flex-col items-center gap-4 max-w-md text-center">
                    <div className="w-16 h-16 bg-red-500/10 rounded-lg flex items-center justify-center text-error mb-2 border border-red-500/20 shadow-lg shadow-red-500/5">
                        <span className="text-3xl font-bold">!</span>
                    </div>
                    <h3 className="text-text-primary font-semibold text-xl">IDE Crashed</h3>
                    <p className="text-sm border border-border-subtle p-4 rounded-xl bg-panel-secondary font-mono w-full break-all text-text-muted leading-relaxed shadow-inner">
                        {error.message || "A fatal application error occurred in the root layout."}
                    </p>
                    <div className="flex gap-3 mt-4">
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
            </body>
        </html>
    );
}
