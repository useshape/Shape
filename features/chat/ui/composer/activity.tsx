"use client";

import React, { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
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

/** @deprecated Prefer ComposerTaskItem / ComposerQuestionItem */
export type ComposerActivityItem =
    | ({ kind: "task" } & ComposerTaskItem)
    | ({ kind: "question" } & ComposerQuestionItem);

/** Expandable strip for running / pending tasks above the input. */
export function ComposerTasksStrip({ items }: { items: ComposerTaskItem[] }) {
  const [open, setOpen] = useState(true);

  if (items.length === 0) return null;

  const running = items.filter((i) => i.status === "running").length;
  const summary =
    running > 0
      ? `${running} running`
      : `${items.length} task${items.length === 1 ? "" : "s"}`;

  return (
    <div className="bg-editor">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 border-b border-border-subtle px-3 py-2 text-xs text-text-muted hover:text-text-primary"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon
            name={open ? "expand_more" : "chevron_right"}
            size={14}
            className="shrink-0"
          />
          {running > 0 ? (
            <span className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
          ) : (
            <Icon name="checklist" size={12} className="shrink-0" />
          )}
          <span className="truncate font-medium">{summary}</span>
        </span>
      </button>

      {open ? (
        <div className="flex flex-col px-2 py-1.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="group flex min-h-7 items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-panel-hover"
            >
              {item.status === "running" ? (
                <div className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              ) : item.status === "done" ? (
                <span className="flex size-3.5 shrink-0 items-center justify-center rounded border border-success bg-success/15">
                  <Icon name="check" size={10} className="text-success" />
                </span>
              ) : (
                <Icon
                  name="check_box_outline_blank"
                  size={14}
                  className="shrink-0 text-text-disabled"
                />
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate leading-snug",
                  item.status === "running"
                    ? "text-text-primary"
                    : "text-text-muted",
                )}
              >
                {item.label}
              </span>
              {item.status === "running" ? (
                <span className="shrink-0 rounded-full bg-accent-text-bg px-1.5 py-0.5 text-[10px] text-accent-text">
                  Running
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Expandable strip for pending clarifying questions above the input. */
export function ComposerQuestionsStrip({
    items,
    onAnswer,
}: {
    items: ComposerQuestionItem[];
    onAnswer?: (answer: string) => void;
}) {
    const [open, setOpen] = useState(true);

    if (items.length === 0) return null;

    const summary = `${items.length} question${items.length === 1 ? "" : "s"}`;

    return (
        <div className="border-b border-border-subtle/60">
            <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-xs text-text-muted hover:text-text-primary"
                onClick={() => setOpen((v) => !v)}
            >
                <span className="flex min-w-0 items-center gap-1.5">
                    <Icon
                        name={open ? "expand_more" : "chevron_right"}
                        size={14}
                        className="shrink-0"
                    />
                    <Icon name="help" size={12} className="shrink-0" />
                    <span className="truncate font-medium">{summary}</span>
                </span>
            </button>

            {open ? (
                <div className="flex flex-col gap-2 px-2.5 pb-2">
                    {items.map((item) => (
                        <QuestionBlock
                            key={item.id}
                            question={item.question}
                            options={item.options}
                            onAnswer={onAnswer}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

/** @deprecated Use ComposerTasksStrip + ComposerQuestionsStrip */
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
