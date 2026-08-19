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
        <div className="sticky bottom-0 z-10 my-2 w-full overflow-hidden rounded-2xl border border-border bg-editor shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="px-3 py-3">
                <div className="text-sm font-medium text-text-primary leading-relaxed">
                    {question}
                </div>

                <div className="mt-2 flex flex-col">
                    {options.map((option, i) => {
                        const isSelected = answered === option;
                        return (
                            <Button
                                key={i}
                                variant="ghost"
                                size="sm"
                                disabled={isAnswered}
                                className={cn(
                                    "group h-auto min-h-8 justify-start gap-2 rounded-lg border-0 px-2 py-1.5 text-left whitespace-normal",
                                    isSelected
                                        ? "bg-accent-text-bg text-text-primary"
                                        : "text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                                    !isSelected && isAnswered && "opacity-40",
                                )}
                                onClick={() => handleAnswer(option)}
                            >
                                <Icon name="arrow_forward" size={14} className="shrink-0 text-text-muted group-hover:text-text-primary" />
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
                                        className="h-auto justify-start rounded-lg bg-accent-text-bg px-2.5 py-2 text-left text-text-primary"
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
                            className="h-auto justify-start gap-2 rounded-lg px-2 py-1.5 text-text-muted hover:bg-panel-hover hover:text-text-primary"
                            onClick={() => setIsOtherSelected(true)}
                        >
                            <Icon name="arrow_forward" size={14} />
                            Other
                        </Button>
                    ) : null}
                </div>
            </div>

            <div className="flex items-center justify-end gap-1.5 border-t border-border-subtle px-2 py-2">
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
