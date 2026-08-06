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
    const [isOpen, setIsOpen] = React.useState(totalCount <= 4);
    const displaySteps = React.useMemo(
        () =>
            steps.map((step) =>
                !isGenerating && step.status === "active"
                    ? { ...step, status: "pending" as const }
                    : step,
            ),
        [steps, isGenerating],
    );
    const active = displaySteps.find((s) => s.status === "active");
    const visibleSteps = isOpen
        ? displaySteps
        : active
          ? [active]
          : displaySteps.filter((s) => s.status === "done").slice(-2);

    return (
        <div className={cn(
            "w-full flex flex-col rounded-xl border overflow-hidden my-2",
            "border-border bg-panel",
        )}>
            <div className="flex items-center justify-between px-2.5 py-2 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Icon name="checklist" size={14} className="text-text-muted shrink-0" />
                    <span className="text-xs font-medium text-text-primary tabular-nums whitespace-nowrap">
                        {completedCount} of {totalCount} Done
                    </span>
                </div>
                {totalCount > 1 ? (
                    <button
                        type="button"
                        onClick={() => setIsOpen((open) => !open)}
                        className="text-xs text-text-muted hover:text-text-primary transition-colors shrink-0"
                    >
                        {isOpen ? "Hide" : "View all"}
                    </button>
                ) : null}
            </div>

            {visibleSteps.length > 0 ? (
                <div className="px-2.5 pb-2 flex flex-col gap-1 border-t border-border-subtle/60">
                    {visibleSteps.map((step, i) => (
                        <div key={`${step.label}-${i}`} className="flex items-start gap-2 py-0.5">
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
                                "text-xs leading-snug",
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
            ) : null}
        </div>
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
        <div className={cn(
            "w-full flex flex-col rounded-lg border my-2 overflow-hidden",
            "border-border-subtle",
        )}>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Icon name="account_tree" size={14} className="text-text-muted shrink-0" />
                    <span className="text-xs text-text-muted truncate">{fileName}</span>
                </div>
                <Tooltip content="Open plan" side="top">
                    <button
                        type="button"
                        onClick={() => { void handleOpen(); }}
                        className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-panel-hover transition-colors"
                    >
                        <Icon name="open_in_new" size={14} />
                    </button>
                </Tooltip>
            </div>

            <div className="px-4 pt-1 pb-2 flex flex-col gap-2">
                <h3 className="text-base font-medium text-text-primary leading-snug">
                    {displayTitle}
                </h3>
                {preview?.goal ? (
                    <p className="text-sm text-text-muted leading-relaxed">{preview.goal}</p>
                ) : null}
                <button
                    type="button"
                    onClick={() => { void handleOpen(); }}
                    className="text-sm text-accent hover:underline text-left w-fit"
                >
                    Read detailed plan
                </button>

                {todos.length > 0 ? (
                    <div className="mt-2 rounded-lg border border-border-subtle bg-panel/50 px-3 py-2.5">
                        <p className="text-xs text-text-muted mb-2">{todos.length} todos</p>
                        <ul className="flex flex-col gap-2">
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

            <div className="flex justify-end px-4 pb-4 pt-1">
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
            </div>
        </div>
    );
}
