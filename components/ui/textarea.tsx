"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, ...props }, ref) => {
        const localRef = React.useRef<HTMLTextAreaElement>(null);

        const handleInput = (e: React.InputEvent<HTMLTextAreaElement>) => {
            if (localRef.current) {
                localRef.current.style.height = "auto";
                localRef.current.style.height = `${localRef.current.scrollHeight}px`;
            }
            if (props.onInput) {
                props.onInput(e);
            }
        };

        React.useEffect(() => {
            if (localRef.current) {
                localRef.current.style.height = "auto";
                localRef.current.style.height = `${localRef.current.scrollHeight}px`;
            }
        }, [props.value]);

        return (
            <textarea
                ref={(node) => {
                    localRef.current = node;
                    if (typeof ref === "function") {
                        ref(node);
                    } else if (ref) {
                        (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
                    }
                }}
                onInput={handleInput}
                className={cn(
                    "w-full rounded-md border border-border-subtle bg-input-bg px-sm py-xs text-sm text-text-primary",
                    "placeholder:text-input-placeholder outline-none ring-0 focus:ring-0 focus:border-border-focus",
                    "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                    "resize-none overflow-hidden block custom-scrollbar",
                    className
                )}
                {...props}
            />
        );
    }
);

Textarea.displayName = "Textarea";
