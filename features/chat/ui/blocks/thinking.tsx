"use client";

import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";


import React from "react";
import { Icon } from "@/components/ui/icon";

import { cn } from "@/lib/utils";
import { GeneratingIndicator } from "./generating";

export function ThinkingBlock({ content, isActive }: { content: string; isActive?: boolean }) {
    const [isOpen, setIsOpen] = React.useState(true);

    const lines = content.split("\n").filter(Boolean);

    return (
        <div className="flex flex-col my-2 w-full">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors group w-full text-left"
            >
                <Icon
                    icon={ChevronDown20Regular}
                    className={cn(
                        "text-text-muted transition-transform duration-[var(--transition-fast)]",
                        !isOpen && "-rotate-90"
                    )}
                />
                {isActive ? (
                    <GeneratingIndicator label="Thinking" showTimer={false} />
                ) : (
                    <span className="font-medium text-sm">Thought for a moment</span>
                )}
            </button>

            {isOpen && lines.length > 0 ? (
                <div className="relative mt-1 max-h-28">
                    <div className="max-h-28 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <div className="flex flex-col gap-1 py-3 text-sm leading-relaxed text-text-muted">
                            {lines.map((line, i) => (
                                <span key={i} className={cn(isActive && i === lines.length - 1 && "text-text-secondary")}>
                                    {line}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-background to-transparent" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-background to-transparent" />
                </div>
            ) : null}
        </div>
    );
}
