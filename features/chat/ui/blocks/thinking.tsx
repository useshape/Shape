"use client";

import React from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { Collapse } from "./collapse";
import { LoadingState } from "./loading-state";

export function ThinkingBlock({ content, isActive }: { content: string; isActive?: boolean }) {
    const [isOpen, setIsOpen] = React.useState(false);

    return (
        <div className="flex w-full flex-col py-0.5">
            {isActive ? (
                <LoadingState label="Thinking" />
            ) : (
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex w-fit items-center gap-1 text-left text-text-muted hover:text-text-primary"
                >
                    <span>Thought</span>
                    {content.trim() ? (
                        <Icon
                            name="expand_more"
                            size={14}
                            className={cn(
                                "text-text-muted transition-transform duration-[var(--chat-motion-duration,180ms)]",
                                isOpen && "rotate-180",
                            )}
                        />
                    ) : null}
                </button>
            )}
            <Collapse open={!isActive && isOpen}>
                <div className="mt-1 max-w-full text-xs leading-relaxed text-text-muted whitespace-pre-wrap">
                    {content}
                </div>
            </Collapse>
        </div>
    );
}
