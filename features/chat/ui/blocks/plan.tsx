"use client";

import { CheckmarkCircle20Filled } from "@fluentui/react-icons/headless/svg/checkmark-circle";
import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";
import { Dismiss20Regular } from "@fluentui/react-icons/headless/svg/dismiss";
import { TaskListSquareLtr20Regular } from "@fluentui/react-icons/headless/svg/task-list-square-ltr";



import React from "react";
import { Icon } from "@/components/ui/icon";


import { cn } from "@/lib/utils";
import { commands, useProjectState } from "@/lib/backend";
import { useChatStream } from "@/features/chat/lib/chat-stream-store";
import { displayPlanName, parsePlanMarkdown, type PlanPreview } from "@/lib/plan/preview";
import { Button } from "@/components/ui/button";
import { Collapse } from "./collapse";
import { ShimmerText } from "@/components/ui/shimmer-text";

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
    const active = displaySteps.find((s) => s.status === "active");
    const visibleSteps = isOpen
        ? displaySteps
        : active
          ? [active]
          : displaySteps.filter((s) => s.status === "done").slice(-2);

    return (
        <div className="my-1 w-full overflow-hidden squircle-2xl bg-surface-4">
            <button
                type="button"
                onClick={() => totalCount > 1 && setIsOpen((open) => !open)}
                className={cn(
                    "flex w-full items-center gap-2 p-2 text-left",
                    totalCount > 1 && "hover:bg-panel-hover/40 transition-colors cursor-pointer",
                )}
            >
                <span className="flex size-4 shrink-0 items-center justify-center text-text-muted">
                    <Icon icon={TaskListSquareLtr20Regular} />
                </span>
                <span className="truncate text-sm font-medium text-text-primary">
                    {completedCount} of {totalCount} done
                </span>
                {active ? (
                    <span className="ml-auto min-w-0 truncate text-sm text-text-muted">
                        {isGenerating ? <ShimmerText>{active.label}</ShimmerText> : active.label}
                    </span>
                ) : null}
            </button>

            <Collapse open={visibleSteps.length > 0}>
                <div className="flex flex-col gap-1.5 px-3 py-2.5">
                    {visibleSteps.map((step, i) => (
                        <div key={`${step.label}-${i}`} className="flex items-center gap-2">
                            <span className="flex size-4 shrink-0 items-center justify-center">
                            {step.status === "done" ? (
                                <Icon icon={CheckmarkCircle20Filled} className="text-success" />
                            ) : step.status === "active" ? (
                                <span className="size-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                            ) : step.status === "cancelled" ? (
                                <Icon icon={Dismiss20Regular} className="text-text-disabled" />
                            ) : (
                                <span className="size-3.5 rounded-full border-2 border-text-muted/45" />
                            )}
                            </span>
                            <span className={cn(
                                "text-sm leading-snug",
                                step.status === "done" && "text-text-muted",
                                step.status === "active" && "text-text-primary",
                                step.status === "pending" && "text-text-muted",
                                step.status === "cancelled" && "text-text-disabled",
                            )}>
                                {step.label}
                            </span>
                        </div>
                    ))}
                </div>
            </Collapse>
        </div>
    );
}

function modKeyLabel(): string {
    if (typeof navigator === "undefined") return "Ctrl";
    return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
}

export function PlanSavedBlock({
    title,
    path,
    markdown,
}: {
    title: string;
    path: string;
    markdown?: string;
}) {
    const { project_path } = useProjectState();
    const { isLoading } = useChatStream();
    const [missing, setMissing] = React.useState(false);
    const [checking, setChecking] = React.useState(false);
    const [preview, setPreview] = React.useState<PlanPreview | null>(() =>
        markdown ? parsePlanMarkdown(markdown) : null,
    );
    const [open, setOpen] = React.useState(true);

    const resolvePath = (filePath: string) => {
        if (/^[a-zA-Z]:[\\\/]/.test(filePath) || filePath.startsWith("/")) return filePath;
        if (!project_path) return filePath;
        return `${project_path.replace(/\\/g, "/")}/${filePath.replace(/\\/g, "/")}`.replace(/\/+/g, "/");
    };

    const displayTitle = displayPlanName(title, preview?.title);
    const absPath = resolvePath(path);

    React.useEffect(() => {
        let cancelled = false;
        void commands.readFile(absPath).then((content) => {
            if (!cancelled) {
                setPreview(parsePlanMarkdown(content));
                setMissing(false);
            }
        }).catch(() => {
            if (!cancelled) {
                setPreview(markdown ? parsePlanMarkdown(markdown) : null);
            }
        });
        return () => { cancelled = true; };
    }, [absPath, markdown]);

    const ensurePlanFile = async (): Promise<boolean> => {
        try {
            await commands.readFile(absPath);
            setMissing(false);
            return true;
        } catch {
            if (!markdown?.trim()) {
                setMissing(true);
                return false;
            }
            try {
                await commands.createFile(absPath);
            } catch {
                /* may already exist */
            }
            await commands.saveFile(absPath, markdown);
            setPreview(parsePlanMarkdown(markdown));
            setMissing(false);
            return true;
        }
    };

    const openPlanPreview = async () => {
        window.dispatchEvent(
            new CustomEvent("shape-layout-toggle", {
                detail: { id: "agent-workspace", value: true },
            }),
        );
        window.dispatchEvent(
            new CustomEvent("shape-open-workspace-plan", {
                detail: {
                    path: absPath,
                    title: displayTitle,
                    markdown,
                },
            }),
        );
        void ensurePlanFile().catch(() => {
            /* panel still opens from in-chat markdown */
        });
    };

    const handleOpen = async () => {
        try {
            await openPlanPreview();
        } catch (e) {
            console.error("Failed to open plan:", e);
            setMissing(!markdown?.trim());
        }
    };

    const handleBuild = async () => {
        if (isLoading || checking) return;
        setChecking(true);
        try {
            if (!(await ensurePlanFile())) return;
            window.dispatchEvent(new CustomEvent("shape-build-plan", {
                detail: { path, title },
            }));
        } finally {
            setChecking(false);
        }
    };

    const mod = modKeyLabel();
    const todos = preview?.todos ?? [];
    const buildLabel = missing
        ? "Plan missing"
        : isLoading || checking
          ? "Building…"
          : "Build";

    const todoCount = todos.length;

    return (
        <div className="my-1 w-full overflow-hidden rounded-xl border border-border-subtle bg-surface-3">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover/40"
            >
                <Icon icon={TaskListSquareLtr20Regular} className="shrink-0 text-text-muted" />
                <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
                    {displayTitle}
                </span>
                <Icon
                    icon={ChevronDown20Regular}
                    className={cn(
                        "shrink-0 text-text-muted transition-transform duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                        open && "rotate-180",
                    )}
                />
            </button>

            <Collapse open={open}>
                <div className="flex flex-col gap-3 px-3 pb-3">
                    {preview?.goal ? (
                        <p className="text-sm text-text-primary leading-relaxed">{preview.goal}</p>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => { void handleOpen(); }}
                        className="w-fit text-left text-sm text-accent-text hover:underline"
                    >
                        Read detailed plan
                    </button>

                    {todoCount > 0 ? (
                        <div className="rounded-xl bg-surface-1 px-3 py-2.5">
                            <p className="text-sm text-text-muted">
                                {todoCount} {todoCount === 1 ? "todo" : "todos"}
                            </p>
                            <ul className="mt-2 flex flex-col gap-2">
                                {todos.map((todo) => (
                                    <li key={todo} className="flex items-start gap-2">
                                        <span className="mt-0.5 size-4 shrink-0 rounded-full border border-text-muted/45" />
                                        <span className="text-sm text-text-primary leading-snug">{todo}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    <div className="flex justify-end">
                        <Button
                            disabled={isLoading || checking || missing}
                            onClick={() => { void handleBuild(); }}
                            variant={missing ? "outline" : "default"}
                            size="sm"
                            className={cn("gap-1", missing && "text-error border-error/40")}
                        >
                            {buildLabel}
                            {!missing ? (
                                <span className="ml-1 inline-flex items-center gap-0.5 opacity-80">
                                    <kbd className="text-[10px]">{mod}</kbd>
                                    <kbd className="text-[10px]">↵</kbd>
                                </span>
                            ) : null}
                        </Button>
                    </div>
                </div>
            </Collapse>
        </div>
    );
}
