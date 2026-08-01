"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
        <div className="w-full flex flex-col gap-2 my-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="text-sm font-medium text-text-muted"> Question </div>
            <div className="text-md font-medium text-text-primary leading-relaxed"> {question} </div>

            <div className="flex flex-col gap-1.5 mt-1">
                {options.map((option, i) => {
                    const isSelected = answered === option;
                    return (
                        <Button
                            key={i}
                            variant="secondary"
                            size="sm"
                            disabled={isAnswered}
                            className={cn(
                                "border border-border-subtle transition-all justify-start",
                                isSelected ? "bg-accent/20 text-text-primary border-0 opacity-100" : "bg-panel hover:bg-panel-hover opacity-70",
                                !isSelected && isAnswered && "opacity-40 grayscale-[0.5]"
                            )}
                            onClick={() => handleAnswer(option)}
                        >
                            {option}
                        </Button>
                    );
                })}

                {/* Other/Custom logic */}
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
                                    size="sm"
                                    onClick={() => customValue.trim() && handleAnswer(customValue)}
                                >
                                    Send
                                </Button>
                            </div>
                        ) : (
                            !options.includes(answered) && answered !== "Skip" && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled
                                    className="border-0 bg-accent text-text-primary rounded-md justify-start"
                                >
                                    {answered}
                                </Button>
                            )
                        )}
                    </div>
                ) : !isAnswered && (
                    <Button
                        variant="secondary"
                        size="sm"
                        className="bg-panel hover:bg-panel-hover border border-border-subtle rounded-md transition-all justify-start"
                        onClick={() => setIsOtherSelected(true)}
                    >
                        Other
                    </Button>
                )}

                <Button
                    variant="ghost"
                    size="sm"
                    disabled={isAnswered}
                    className={cn(
                        "justify-start transition-all",
                        answered === "Skip" ? "bg-accent text-text-primary border-0 opacity-100" : "text-text-muted hover:text-text-primary hover:bg-panel-hover opacity-70",
                        isAnswered && answered !== "Skip" && "opacity-30"
                    )}
                    onClick={() => handleAnswer("Skip")}
                >
                    Skip
                </Button>
            </div>
        </div>
    );
}
