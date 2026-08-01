"use client";

import React from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { commands } from "@/lib/backend";
import { useChatStreamOptional } from "@/features/chat/lib/chat-stream-store";
import { humanizePlanTitle } from "@/lib/plan-preview";
import { planSlugFromPath } from "@/lib/plan-file";
import { Button } from "@/components/ui/button";

function modKeyLabel(): string {
    if (typeof navigator === "undefined") return "Ctrl";
    return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
}

export function PlanEditorHeader({ path }: { path: string }) {
    const { isLoading } = useChatStreamOptional();
    const [checking, setChecking] = React.useState(false);
    const fileName = path.split(/[\\/]/).pop() || "plan.md";
    const title = humanizePlanTitle(planSlugFromPath(path));
    const mod = modKeyLabel();

    const handleBuild = React.useCallback(async () => {
        if (isLoading || checking) return;
        setChecking(true);
        try {
            await commands.readFile(path);
            window.dispatchEvent(new CustomEvent("shape-build-plan", {
                detail: { path, title },
            }));
        } catch {
            const { notify } = await import("@/features/notifications");
            notify.error("Plan", "Plan file not found or could not be read.");
        } finally {
            setChecking(false);
        }
    }, [checking, isLoading, path, title]);

    React.useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || e.key !== "Enter") return;
            e.preventDefault();
            void handleBuild();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [handleBuild]);

    return (
        <div className="flex w-full shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-editor px-3 min-h-[36px]">
            <div className="flex min-w-0 items-center gap-1.5 text-sm">
                <span className="shrink-0 text-text-muted">Plans</span>
                <Icon name="chevron_right" size={14} className="shrink-0 text-text-disabled" />
                <Icon name="description" size={14} className="shrink-0 text-text-muted" />
                <span className="truncate font-mono text-text-secondary">{fileName}</span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
                <Button
                    type="button"
                    disabled={isLoading || checking}
                    onClick={() => { void handleBuild(); }}
                    variant="default"
                    size="sm"
                >
                    {isLoading || checking ? "Building…" : "Build"}
                    <span className="inline-flex items-center gap-0.5 opacity-80">
                        <kbd className="text-[10px]">{mod}</kbd>
                        <kbd className="text-[10px]">↵</kbd>
                    </span>
                </Button>
            </div>
        </div>
    );
}
