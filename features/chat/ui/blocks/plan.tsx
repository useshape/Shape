"use client";

import React from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { commands, useProjectState, getProjectSnapshot } from "@/lib/backend";
import { useChatStream } from "@/features/chat/lib/chat-stream-store";
import { useEditorView } from "@/core/providers/editor";
import { humanizePlanTitle, parsePlanMarkdown } from "@/lib/plan-preview";
import { Tooltip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ChatCard, ChatCardBody, ChatCardFooter, ChatCardHeader } from "./chat-card";

type PlanStep = {
    label: string;
    status: "done" | "active" | "pending" | "cancelled";
};

export function PlanningBlock({ steps, completedCount, totalCount, isGenerating }: {
    title?: string;
    steps: PlanStep[];
    completedCount: number;
    totalCount: number;
    /** When false, freeze "active" steps so they don't spin after the turn ends. */
    isGenerating?: boolean;
}) {
    const [isOpen, setIsOpen] = React.useState(totalCount <= 5);
    const displaySteps = React.useMemo(
        () =>
            steps.map((step) =>
                !isGenerating && step.status === "active"
                    ? { ...step, status: "pending" as const }
                    : step,
            ),
        [steps, isGenerating],
    );
    return (
        <ChatCard>
            <ChatCardHeader onClick={totalCount > 1 ? () => setIsOpen((open) => !open) : undefined}>
                <Icon name="checklist" size={14} className="text-text-muted shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">Plan</span>
                <span className="shrink-0 text-xs text-text-muted tabular-nums">
                    {completedCount} of {totalCount}
                </span>
                {totalCount > 1 ? (
                    <Icon
                        name="expand_more"
                        size={14}
                        className={cn(
                            "shrink-0 text-text-muted transition-transform duration-[var(--chat-motion-duration,180ms)]",
                            isOpen && "rotate-180",
                        )}
                    />
                ) : null}
            </ChatCardHeader>
            <ChatCardBody open={isOpen || totalCount <= 1}>
                <div className="flex flex-col gap-1.5">
                    {displaySteps.map((step, i) => (
                        <div key={`${step.label}-${i}`} className="flex items-start gap-2">
                            {step.status === "done" ? (
                                <Icon name="check_circle" size={14} className="text-success shrink-0 mt-0.5" />
                            ) : step.status === "active" ? (
                                <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0 mt-0.5">
                                    <div className="w-2.5 h-2.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : step.status === "cancelled" ? (
                                <Icon name="cancel" size={14} className="text-text-disabled shrink-0 mt-0.5" />
                            ) : (
                                <Icon name="radio_button_unchecked" size={14} className="text-text-disabled shrink-0 mt-0.5" />
                            )}
                            <span className={cn(
                                "text-sm leading-snug",
                                step.status === "done" && "text-text-muted line-through",
                                step.status === "active" && "text-text-primary",
                                step.status === "pending" && "text-text-muted",
                                step.status === "cancelled" && "text-text-disabled line-through",
                            )}>
                                {step.label}
                            </span>
                        </div>
                    ))}
                </div>
            </ChatCardBody>
        </ChatCard>
    );
}

function modKeyLabel(): string {
    if (typeof navigator === "undefined") return "Ctrl";
    return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
}

export function PlanSavedBlock({ title, path }: { title: string; path: string }) {
    const { project_path } = useProjectState();
    const { isLoading } = useChatStream();
    const { setViewMode } = useEditorView();
    const [missing, setMissing] = React.useState(false);
    const [checking, setChecking] = React.useState(false);
    const [preview, setPreview] = React.useState<{ goal: string; todos: string[] } | null>(null);

    const resolvePath = (filePath: string) => {
        if (/^[a-zA-Z]:[\\\/]/.test(filePath) || filePath.startsWith("/")) return filePath;
        if (!project_path) return filePath;
        return `${project_path.replace(/\\/g, "/")}/${filePath.replace(/\\/g, "/")}`.replace(/\/+/g, "/");
    };

    const fileName = path.split(/[\\/]/).pop() || "plan.md";
    const displayTitle = humanizePlanTitle(title);

    React.useEffect(() => {
        const abs = resolvePath(path);
        let cancelled = false;
        void commands.readFile(abs).then((content) => {
            if (!cancelled) setPreview(parsePlanMarkdown(content));
        }).catch(() => {
            if (!cancelled) setPreview(null);
        });
        return () => { cancelled = true; };
    }, [path, project_path]);

    const openPlanPreview = async () => {
        const abs = resolvePath(path);
        const name = fileName;
        await commands.openFile(abs, name);
        const openedPath = getProjectSnapshot().active_file ?? abs;
        setViewMode(openedPath, "preview");
        setMissing(false);
    };

    const handleOpen = async () => {
        try {
            await openPlanPreview();
        } catch (e) {
            console.error("Failed to open plan:", e);
            setMissing(true);
        }
    };

    const handleBuild = async () => {
        if (isLoading || checking) return;
        setChecking(true);
        setMissing(false);
        try {
            const abs = resolvePath(path);
            await commands.readFile(abs);
            window.dispatchEvent(new CustomEvent("shape-build-plan", {
                detail: { path, title },
            }));
        } catch {
            setMissing(true);
        } finally {
            setChecking(false);
        }
    };

    const mod = modKeyLabel();
    const todos = preview?.todos ?? [];

    return (
        <ChatCard>
            <ChatCardHeader>
                <Icon name="account_tree" size={14} className="text-text-muted shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{displayTitle}</span>
                <span className="shrink-0 text-xs text-text-muted truncate max-w-[40%]">{fileName}</span>
                <Tooltip content="Open plan" side="top">
                    <button
                        type="button"
                        onClick={() => { void handleOpen(); }}
                        className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-panel-hover transition-colors"
                    >
                        <Icon name="open_in_new" size={14} />
                    </button>
                </Tooltip>
            </ChatCardHeader>
            <div className="flex flex-col gap-2 px-3 pb-1">
                {preview?.goal ? (
                    <p className="text-sm text-text-muted leading-relaxed">{preview.goal}</p>
                ) : null}
                <button
                    type="button"
                    onClick={() => { void handleOpen(); }}
                    className="text-sm text-accent-text hover:text-accent-text-hover hover:underline text-left w-fit"
                >
                    Read detailed plan
                </button>
                {todos.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                        <p className="text-xs text-text-muted">{todos.length} todos</p>
                        <ul className="flex flex-col gap-1.5">
                            {todos.map((todo) => (
                                <li key={todo} className="flex items-start gap-2">
                                    <Icon
                                        name="radio_button_unchecked"
                                        size={14}
                                        className="text-text-disabled shrink-0 mt-0.5"
                                    />
                                    <span className="text-sm text-text-primary leading-snug">{todo}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}
                {missing ? (
                    <p className="text-sm text-error">
                        Plan file not found. It may have been deleted or moved.
                    </p>
                ) : null}
            </div>
            <ChatCardFooter>
                <Button
                    disabled={isLoading || checking}
                    onClick={() => { void handleBuild(); }}
                    variant="default"
                    size="sm"
                    className="gap-1"
                >
                    {isLoading || checking ? "Building…" : "Build"}
                    <span className="inline-flex items-center gap-0.5 ml-1 opacity-80">
                        <kbd className="text-[10px]">{mod}</kbd>
                        <kbd className="text-[10px]">↵</kbd>
                    </span>
                </Button>
            </ChatCardFooter>
        </ChatCard>
    );
}
