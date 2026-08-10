"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";

export function QuestionBlock({ question, options, onAnswer }: {
    question: string;
    options: string[];
    onAnswer?: (answer: string) => void;
}) {
    const [answered, setAnswered] = React.useState<string | null>(null);
    const [isOtherSelected, setIsOtherSelected] = React.useState(false);
    const [customValue, setCustomValue] = React.useState("");

    const handleAnswer = (option: string) => {
        setAnswered(option);
        onAnswer?.(option);
    };

    const isAnswered = answered !== null;

    return (
        <div className="my-1 w-full overflow-hidden rounded-xl border border-border bg-transparent animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-2 px-3 py-2">
                <Icon name="help" size={13} className="shrink-0 text-text-muted" />
                <span className="truncate text-xs text-text-muted">Question</span>
            </div>

            <div className="border-t border-border px-3 py-2.5">
                <div className="text-sm font-medium text-text-primary leading-relaxed">
                    {question}
                </div>

                <div className="mt-2.5 flex flex-col gap-1.5">
                    {options.map((option, i) => {
                        const isSelected = answered === option;
                        return (
                            <Button
                                key={i}
                                variant="ghost"
                                size="sm"
                                disabled={isAnswered}
                                className={cn(
                                    "h-auto justify-start rounded-lg border border-border px-2.5 py-2 text-left whitespace-normal",
                                    isSelected
                                        ? "border-accent/40 bg-accent/10 text-text-primary"
                                        : "text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                                    !isSelected && isAnswered && "opacity-40",
                                )}
                                onClick={() => handleAnswer(option)}
                            >
                                {option}
                            </Button>
                        );
                    })}

                    {isOtherSelected || (isAnswered && answered !== "Skip" && !options.includes(answered)) ? (
                        <div className="flex flex-col gap-1.5">
                            {!isAnswered ? (
                                <div className="flex items-center gap-2">
                                    <Input
                                        autoFocus
                                        placeholder="Type your answer..."
                                        value={customValue}
                                        onChange={(e) => setCustomValue(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && customValue.trim()) {
                                                handleAnswer(customValue);
                                            }
                                        }}
                                        className="flex-1"
                                    />
                                    <Button
                                        variant="default"
                                        size="xs"
                                        onClick={() => customValue.trim() && handleAnswer(customValue)}
                                    >
                                        Send
                                    </Button>
                                </div>
                            ) : (
                                !options.includes(answered) && answered !== "Skip" && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled
                                        className="h-auto justify-start rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-2 text-left text-text-primary"
                                    >
                                        {answered}
                                    </Button>
                                )
                            )}
                        </div>
                    ) : !isAnswered ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto justify-start rounded-lg border border-border px-2.5 py-2 text-text-muted hover:bg-panel-hover hover:text-text-primary"
                            onClick={() => setIsOtherSelected(true)}
                        >
                            Other
                        </Button>
                    ) : null}
                </div>
            </div>

            <div className="flex items-center justify-end gap-1.5 px-2 py-2">
                <Button
                    variant="ghost"
                    size="xs"
                    disabled={isAnswered}
                    className={cn(answered === "Skip" && "text-text-primary")}
                    onClick={() => handleAnswer("Skip")}
                >
                    Skip
                </Button>
            </div>
        </div>
    );
}
