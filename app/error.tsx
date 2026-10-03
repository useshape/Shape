"use client";

import { Button } from "@/components/ui/button";

export default function Error({
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center">
            <p className="text-base font-medium text-text-primary">Can’t reach this page</p>
            <p className="max-w-sm text-sm text-text-secondary">
                The Shape UI failed to load. Retry without leaving the app.
            </p>
            <Button type="button" onClick={() => reset()}>
                Reconnect
            </Button>
        </div>
    );
}
