"use client";

import { RiArrowDownSLine, RiArrowUpSLine, RiCheckboxBlankCircleLine, RiCheckboxCircleLine, RiCloseLine, RiExternalLinkLine, RiGitBranchLine, RiListCheck3 } from "@remixicon/react";
import React from "react";
import { Icon, ICON_SIZE_MD } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { commands, useProjectState } from "@/lib/backend";
import { useChatStream } from "@/features/chat/lib/chat-stream-store";
import { humanizePlanTitle, parsePlanMarkdown } from "@/lib/plan-preview";
import { Tooltip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Collapse } from "./collapse";

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
        <div className="my-1 w-full overflow-hidden rounded-xl border border-border-subtle bg-surface-3">
            <button
                type="button"
                onClick={() => totalCount > 1 && setIsOpen((open) => !open)}
                className={cn(
                    "flex w-full items-center gap-2 p-2 text-left",
                    totalCount > 1 && "hover:bg-panel-hover/40 transition-colors cursor-pointer",
                )}
            >
                <Icon icon={RiListCheck3} className="shrink-0 text-text-muted" size={ICON_SIZE_MD} />
                <span className="truncate text-sm font-medium text-text-muted">
                    {completedCount} of {totalCount} done
                </span>
                {totalCount > 1 ? (
                    <Icon
                        icon={isOpen ? RiArrowUpSLine : RiArrowDownSLine}
                        className="ml-auto shrink-0 text-text-muted"
                        size={ICON_SIZE_MD}
                    />
                ) : null}
            </button>

            <Collapse open={visibleSteps.length > 0}>
                <div className="flex flex-col gap-1.5 px-3 py-2.5">
                    {visibleSteps.map((step, i) => (
                        <div key={`${step.label}-${i}`} className="flex items-start gap-2">
                            {step.status === "done" ? (
                                <Icon icon={RiCheckboxCircleLine} className="text-success shrink-0 mt-0.5" size={ICON_SIZE_MD} />
                            ) : step.status === "active" ? (
                                <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0 mt-0.5">
                                    <div className="w-2.5 h-2.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : step.status === "cancelled" ? (
                                <Icon icon={RiCloseLine} className="text-text-disabled shrink-0 mt-0.5" size={ICON_SIZE_MD} />
                            ) : (
                                <span className="mt-0.5 size-3.5 shrink-0 rounded-full border-2 border-text-muted/45" />
                            )}
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
    const [preview, setPreview] = React.useState<{ goal: string; todos: string[] } | null>(null);
    const [open, setOpen] = React.useState(true);

    const resolvePath = (filePath: string) => {
        if (/^[a-zA-Z]:[\\\/]/.test(filePath) || filePath.startsWith("/")) return filePath;
        if (!project_path) return filePath;
        return `${project_path.replace(/\\/g, "/")}/${filePath.replace(/\\/g, "/")}`.replace(/\/+/g, "/");
    };

    const fileName = path.split(/[\\/]/).pop() || "plan.md";
    const displayTitle = humanizePlanTitle(title);
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
        if (!(await ensurePlanFile())) return;
        window.dispatchEvent(
            new CustomEvent("shape-layout-toggle", {
                detail: { id: "agent-workspace", value: true },
            }),
        );
        window.dispatchEvent(
            new CustomEvent("shape-open-workspace-plan", {
                detail: { path: absPath, title: displayTitle || fileName },
            }),
        );
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

    return (
        <div className="my-1 w-full overflow-hidden rounded-xl border border-border-subtle bg-surface-3">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-2 p-2 text-left hover:bg-panel-hover/40 transition-colors"
            >
                <Icon icon={RiGitBranchLine} className="shrink-0 text-text-muted" size={ICON_SIZE_MD} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-muted">
                    Plan ready
                </span>
                <span className="max-w-[45%] truncate text-sm text-text-secondary">
                    {displayTitle}
                </span>
                <Icon
                    icon={open ? RiArrowUpSLine : RiArrowDownSLine}
                    className="shrink-0 text-text-muted"
                    size={ICON_SIZE_MD}
                />
            </button>

            <Collapse open={open}>
                <div className="px-3 py-2.5 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <h3 className="text-sm font-medium text-text-primary leading-snug">
                                {displayTitle}
                            </h3>
                            {preview?.goal ? (
                                <p className="mt-1 text-sm text-text-muted leading-relaxed">{preview.goal}</p>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => { void handleOpen(); }}
                                className="mt-1 text-sm text-accent-text hover:underline text-left w-fit"
                            >
                                {fileName}
                            </button>
                        </div>
                        <Tooltip content="Open plan" side="top">
                            <button
                                type="button"
                                onClick={() => { void handleOpen(); }}
                                className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-panel-hover transition-colors shrink-0"
                            >
                                <Icon icon={RiExternalLinkLine} size={ICON_SIZE_MD} />
                            </button>
                        </Tooltip>
                    </div>

                    {todos.length > 0 ? (
                        <ul className="flex flex-col gap-1.5 pt-1">
                            {todos.slice(0, 6).map((todo) => (
                                <li key={todo} className="flex items-start gap-2">
                                    <Icon
                                        icon={RiCheckboxBlankCircleLine}
                                        className="text-text-disabled shrink-0 mt-0.5"
                                        size={ICON_SIZE_MD}
                                    />
                                    <span className="text-sm text-text-primary leading-snug">{todo}</span>
                                </li>
                            ))}
                        </ul>
                    ) : null}

                    <div className="flex justify-end pt-1">
                        <Button
                            disabled={isLoading || checking || missing}
                            onClick={() => { void handleBuild(); }}
                            variant={missing ? "outline" : "default"}
                            size="sm"
                            className={cn("gap-1", missing && "text-error border-error/40")}
                        >
                            {buildLabel}
                            {!missing ? (
                                <span className="inline-flex items-center gap-0.5 ml-1 opacity-80">
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
