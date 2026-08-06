"use client";

import React from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

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
                    name="expand_more"
                    size={14}
                    className={cn(
                        "text-text-muted transition-transform duration-[var(--transition-fast)]",
                        !isOpen && "-rotate-90"
                    )}
                />
                {isActive ? (
                    <span className="font-medium text-sm animate-pulse text-text-secondary">Analyzing...</span>
                ) : (
                    <span className="font-medium text-sm">Thought for a moment</span>
                )}
                {isActive && (
                    <div className="w-2.5 h-2.5 border-[1.5px] border-accent border-t-transparent rounded-full animate-spin ml-1" />
                )}
            </button>

            {isOpen && (
                <div className="ml-5 mt-1 flex flex-col gap-1 text-sm text-text-muted leading-relaxed">
                    {lines.map((line, i) => (
                        <span key={i} className={cn(
                            "block",
                            isActive && i === lines.length - 1 && "animate-pulse text-text-secondary"
                        )}>
                            {line}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
