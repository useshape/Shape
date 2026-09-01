"use client";

import React from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { MorphMenu } from "@/components/ui/morph-menu";
import { QuestionBlock } from "../blocks/question";

export type ComposerTaskItem = {
    id: string;
    label: string;
    status: "running" | "pending" | "done";
};

export type ComposerQuestionItem = {
    id: string;
    question: string;
    options: string[];
};

export type ComposerActivityItem =
    | ({ kind: "task" } & ComposerTaskItem)
    | ({ kind: "question" } & ComposerQuestionItem);

export function ComposerTasksStrip({ items }: { items: ComposerTaskItem[] }) {
    if (items.length === 0) return null;

    const running = items.filter((i) => i.status === "running").length;
    const label =
        running > 0
            ? "Continue Working"
            : `${items.length} task${items.length === 1 ? "" : "s"}`;
    const openH = Math.min(220, 48 + items.length * 36);

    return (
        <MorphMenu
            variant="morph"
            aria-label="Tasks"
            openWidth={280}
            openHeight={openH}
            closedHeight={32}
            trigger={
                <>
                    <span>{label}</span>
                    {running > 0 ? (
                        <span className="text-accent-text">{running}</span>
                    ) : null}
                </>
            }
        >
            <div className="flex flex-col py-1">
                {items.map((item) => (
                    <div
                        key={item.id}
                        className="flex min-h-8 items-center gap-2 px-3 py-1.5 text-sm"
                    >
                        {item.status === "running" ? (
                            <span className="t-spin-check shrink-0" data-state="spin">
                                <span className="t-spin-check__ring" />
                            </span>
                        ) : item.status === "done" ? (
                            <Icon name="check" size={14} className="text-success" />
                        ) : (
                            <Icon
                                name="check_box_outline_blank"
                                size={14}
                                className="text-text-disabled"
                            />
                        )}
                        <span
                            className={cn(
                                "min-w-0 flex-1 truncate",
                                item.status === "running"
                                    ? "text-text-primary"
                                    : "text-text-muted",
                            )}
                        >
                            {item.label}
                        </span>
                    </div>
                ))}
            </div>
        </MorphMenu>
    );
}

export function ComposerQuestionsStrip({
    items,
    onAnswer,
}: {
    items: ComposerQuestionItem[];
    onAnswer?: (answer: string) => void;
}) {
    if (items.length === 0) return null;

    return (
        <MorphMenu
            variant="morph"
            aria-label="Questions"
            openWidth={320}
            openHeight={Math.min(280, 80 + items.length * 100)}
            closedHeight={32}
            trigger={
                <span>
                    {items.length} question{items.length === 1 ? "" : "s"}
                </span>
            }
        >
            <div className="p-2.5">
                {items.map((item) => (
                    <QuestionBlock
                        key={item.id}
                        question={item.question}
                        options={item.options}
                        onAnswer={onAnswer}
                    />
                ))}
            </div>
        </MorphMenu>
    );
}

export function ComposerActivityStrip({
    items,
    onAnswerQuestion,
}: {
    items: ComposerActivityItem[];
    onAnswerQuestion?: (answer: string) => void;
}) {
    const tasks = items
        .filter((i): i is Extract<ComposerActivityItem, { kind: "task" }> => i.kind === "task")
        .map(({ id, label, status }) => ({ id, label, status }));
    const questions = items
        .filter((i): i is Extract<ComposerActivityItem, { kind: "question" }> => i.kind === "question")
        .map(({ id, question, options }) => ({ id, question, options }));

    if (tasks.length === 0 && questions.length === 0) return null;

    return (
        <>
            <ComposerTasksStrip items={tasks} />
            <ComposerQuestionsStrip items={questions} onAnswer={onAnswerQuestion} />
        </>
    );
}
