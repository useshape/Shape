import React from "react";
import { Button } from "@/components/ui/button";

interface ErrorViewProps {
    error: string;
}

export function ErrorView({ error }: ErrorViewProps) {
    return (
        <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center bg-background p-8 text-text-muted select-none">
            <div className="flex w-full max-w-md min-w-0 flex-col items-center gap-4 text-center">
                <h3 className="text-lg font-medium text-text-primary">Failed to load file</h3>
                <p className="w-full min-w-0 rounded-lg border border-border-subtle bg-panel px-3 py-2 text-left text-sm leading-relaxed break-words text-text-muted whitespace-pre-wrap">
                    {error}
                </p>
                <Button
                    variant="default"
                    size="xs"
                    className="gap-3 px-2"
                    onClick={() => window.location.reload()}
                >
                    Retry Load
                </Button>
            </div>
        </div>
    );
}
