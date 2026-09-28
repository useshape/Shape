"use client";

import { MoreHorizontal20Regular } from "@fluentui/react-icons/headless/svg/more-horizontal";
import { TaskListSquareLtr20Regular } from "@fluentui/react-icons/headless/svg/task-list-square-ltr";


import React from "react";
import { Icon } from "@/components/ui/icon";

import { commands } from "@/lib/backend";
import { useChatStreamOptional } from "@/features/chat/lib/chat-stream-store";
import { displayPlanName } from "@/lib/plan/preview";
import { planSlugFromPath } from "@/lib/plan/file";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";

function modKeyLabel(): string {
    if (typeof navigator === "undefined") return "Ctrl";
    return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
}

export function MarkdownViewSwitch({
    raw,
    onRawChange,
}: {
    raw: boolean;
    onRawChange: (raw: boolean) => void;
}) {
    return (
        <div className="flex items-center rounded-md bg-surface-1 p-0.5">
            <Button
                type="button"
                variant={raw ? "ghost" : "secondary"}
                size="xs"
                className="h-6 px-2 font-normal"
                onClick={() => onRawChange(false)}
            >
                Preview
            </Button>
            <Button
                type="button"
                variant={raw ? "secondary" : "ghost"}
                size="xs"
                className="h-6 px-2 font-normal"
                onClick={() => onRawChange(true)}
            >
                Raw
            </Button>
        </div>
    );
}

export function PlanEditorHeader({
    path,
    title: titleProp,
    raw = false,
    onRawChange,
    onSaveToWorkspace,
}: {
    path: string;
    title?: string;
    raw?: boolean;
    onRawChange?: (raw: boolean) => void;
    onSaveToWorkspace?: () => void;
}) {
    const { isLoading } = useChatStreamOptional();
    const [checking, setChecking] = React.useState(false);
    const title = displayPlanName(titleProp || planSlugFromPath(path));
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
            <div className="flex min-w-0 items-center gap-2 text-sm">
                <Icon icon={TaskListSquareLtr20Regular} className="shrink-0 text-text-muted" />
                <span className="truncate text-text-primary">{title}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
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
                {onRawChange || onSaveToWorkspace ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 text-text-muted"
                                aria-label="Plan options"
                            >
                                <Icon icon={MoreHorizontal20Regular} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[160px]">
                            {onRawChange ? (
                                <>
                                    <DropdownMenuCheckboxItem
                                        checked={!raw}
                                        onCheckedChange={() => onRawChange(false)}
                                    >
                                        Markdown
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem
                                        checked={raw}
                                        onCheckedChange={() => onRawChange(true)}
                                    >
                                        Raw
                                    </DropdownMenuCheckboxItem>
                                </>
                            ) : null}
                            {onRawChange && onSaveToWorkspace ? <DropdownMenuSeparator /> : null}
                            {onSaveToWorkspace ? (
                                <DropdownMenuItem onClick={onSaveToWorkspace}>
                                    Save to workspace
                                </DropdownMenuItem>
                            ) : null}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : null}
            </div>
        </div>
    );
}
