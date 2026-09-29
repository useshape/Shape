"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    closeWorker,
    getBoardView,
    setBoardView,
    subscribeMultiwork,
} from "./session-store";

export function MultiworkViewToggle({ className }: { className?: string }) {
    const view = useSyncExternalStore(subscribeMultiwork, getBoardView, getBoardView);

    return (
        <div
            className={cn(
                "inline-flex items-center gap-0.5 rounded-lg border border-border-subtle bg-surface-2 p-0.5",
                className,
            )}
        >
            {(["board", "chat"] as const).map((id) => (
                <Button
                    key={id}
                    type="button"
                    variant="ghost"
                    size="xs"
                    className={cn(
                        "h-7 px-2.5 font-normal capitalize",
                        view === id
                            ? "bg-surface-3 text-text-primary"
                            : "text-text-muted hover:text-text-primary",
                    )}
                    onClick={() => {
                        if (id === "board") closeWorker();
                        setBoardView(id);
                    }}
                >
                    {id === "board" ? "Board" : "Chat"}
                </Button>
            ))}
        </div>
    );
}
