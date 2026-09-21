"use client";

import {
    RiArrowLeftSLine,
    RiArrowRightSLine,
    RiAttachment2,
    RiCloseLine,
} from "@remixicon/react";
import React, { useEffect, useMemo, useState } from "react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { commands } from "@/lib/backend/commands";

export type QuestionOption = {
    id: string;
    label: string;
    recommended?: boolean;
};

export type AgentQuestion = {
    id: string;
    prompt: string;
    options: QuestionOption[];
    allowMultiple?: boolean;
};

export type QuestionAnswers = Record<string, string | string[]>;

export function parseQuestionsPayload(raw: string): {
    questions: AgentQuestion[];
    answers?: QuestionAnswers | null;
} {
    try {
        const parsed = JSON.parse(raw) as {
            questions?: AgentQuestion[];
            answers?: QuestionAnswers | null;
        };
        const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
        return { questions, answers: parsed.answers ?? null };
    } catch {
        return { questions: [], answers: null };
    }
}

function formatAnswer(q: AgentQuestion, value: string | string[] | undefined): string {
    if (value == null) return "—";
    const ids = Array.isArray(value) ? value : [value];
    return ids
        .map((id) => {
            const opt = q.options.find((o) => o.id === id);
            return opt?.label || id;
        })
        .join(", ");
}

export function QuestionsCard({
    askId,
    status,
    questions,
    answers: initialAnswers,
}: {
    askId?: string;
    status?: string;
    questions: AgentQuestion[];
    answers?: QuestionAnswers | null;
}) {
    const pending = status === "pending" && Boolean(askId);
    const [index, setIndex] = useState(0);
    const [picked, setPicked] = useState<QuestionAnswers>(initialAnswers || {});
    const [customOpen, setCustomOpen] = useState(false);
    const [customText, setCustomText] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const total = Math.max(questions.length, 1);
    const current = questions[index];
    const answered = status === "answered" || (!pending && Boolean(initialAnswers));

    useEffect(() => {
        if (initialAnswers) setPicked(initialAnswers);
    }, [initialAnswers]);

    const recap = useMemo(() => {
        if (!answered && pending) return null;
        return questions.map((q) => ({
            prompt: q.prompt,
            answer: formatAnswer(q, (initialAnswers || picked)[q.id]),
        }));
    }, [answered, pending, questions, initialAnswers, picked]);

    async function submit(next: QuestionAnswers, skipped = false) {
        if (!askId || submitting) return;
        setSubmitting(true);
        try {
            await commands.answerAskUser(askId, JSON.stringify(next), skipped);
        } catch {
            setSubmitting(false);
        }
    }

    function selectOption(option: QuestionOption) {
        if (!current || !pending) return;
        const next = { ...picked, [current.id]: option.label.startsWith("http") ? option.id : option.label };
        // Store both label (user-facing in recap) via option id resolution
        next[current.id] = option.id;
        setPicked(next);
        setCustomOpen(false);
        if (index < questions.length - 1) {
            setIndex(index + 1);
            return;
        }
        void submit(next);
    }

    function submitCustom() {
        if (!current || !pending) return;
        const text = customText.trim();
        if (!text) return;
        const next = { ...picked, [current.id]: text };
        setPicked(next);
        setCustomOpen(false);
        setCustomText("");
        if (index < questions.length - 1) {
            setIndex(index + 1);
            return;
        }
        void submit(next);
    }

    if (!questions.length) return null;

    if (answered && recap) {
        return (
            <div className="my-2 overflow-hidden rounded-xl bg-surface-3 px-3 py-2.5">
                <div className="flex flex-col gap-3">
                    {recap.map((row) => (
                        <div key={row.prompt} className="min-w-0">
                            <p className="text-[13px] leading-snug text-text-secondary">{row.prompt}</p>
                            <p className="mt-0.5 text-[13px] font-medium leading-snug text-text-primary">
                                {row.answer}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (!current) return null;

    return (
        <div className="my-2 overflow-hidden rounded-xl bg-surface-3">
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-text-muted">
                <div className="flex items-center gap-0.5">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-text-muted hover:text-text-primary"
                        disabled={index <= 0}
                        aria-label="Previous question"
                        onClick={() => {
                            setCustomOpen(false);
                            setIndex((i) => Math.max(0, i - 1));
                        }}
                    >
                        <Icon icon={RiArrowLeftSLine} size={ICON_SIZE_SM} />
                    </Button>
                    <span className="min-w-[2.5rem] text-center text-xs tabular-nums">
                        {index + 1}/{total}
                    </span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-text-muted hover:text-text-primary"
                        disabled={index >= questions.length - 1}
                        aria-label="Next question"
                        onClick={() => {
                            setCustomOpen(false);
                            setIndex((i) => Math.min(questions.length - 1, i + 1));
                        }}
                    >
                        <Icon icon={RiArrowRightSLine} size={ICON_SIZE_SM} />
                    </Button>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-text-muted hover:text-text-primary"
                    aria-label="Skip questions"
                    disabled={!pending || submitting}
                    onClick={() => void submit(picked, true)}
                >
                    <Icon icon={RiCloseLine} size={ICON_SIZE_SM} />
                </Button>
            </div>

            <div className="px-3 pb-2">
                <p className="text-[13px] font-medium leading-snug text-text-primary">{current.prompt}</p>
                <div className="mt-2 flex flex-col">
                    {current.options.map((opt, i) => {
                        const selected = picked[current.id] === opt.id;
                        return (
                            <button
                                key={opt.id}
                                type="button"
                                disabled={!pending || submitting}
                                onClick={() => selectOption(opt)}
                                className={cn(
                                    "flex items-start gap-2 rounded-md px-1 py-1.5 text-left text-[13px] leading-snug",
                                    "text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                                    selected && "text-text-primary",
                                    (!pending || submitting) && "cursor-default",
                                )}
                            >
                                <span className="mt-px w-4 shrink-0 tabular-nums text-text-muted">{i + 1}</span>
                                <span>
                                    {opt.label}
                                    {opt.recommended ? (
                                        <span className="text-text-muted"> (Recommended)</span>
                                    ) : null}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="border-t border-border-subtle px-3 py-2">
                {customOpen ? (
                    <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            submitCustom();
                        }}
                    >
                        <input
                            autoFocus
                            value={customText}
                            onChange={(e) => setCustomText(e.target.value)}
                            placeholder="Type your answer"
                            className="h-7 min-w-0 flex-1 rounded-md border border-border-subtle bg-surface-1 px-2 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-border-strong"
                        />
                        <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={!customText.trim()}>
                            Send
                        </Button>
                    </form>
                ) : (
                    <button
                        type="button"
                        disabled={!pending || submitting}
                        onClick={() => setCustomOpen(true)}
                        className="flex items-center gap-2 text-[13px] text-text-secondary hover:text-text-primary"
                    >
                        <Icon icon={RiAttachment2} size={ICON_SIZE_SM} className="text-text-muted" />
                        Something else
                    </button>
                )}
            </div>
        </div>
    );
}
