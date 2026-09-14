"use client";

import { RiCloseLine, RiLoader4Line, RiMenuSearchLine} from "@remixicon/react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Icon, ICON_SIZE_SM, ICON_SIZE_MD } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type SearchInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
    /** Spinner on the right while results load (search-by-type). */
    isLoading?: boolean;
    /** Icon + field only — no chrome. Command palette / menu filters. */
    borderless?: boolean;
    clearable?: boolean;
    onClear?: () => void;
};

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
    (
        {
            className,
            value,
            defaultValue,
            onChange,
            disabled,
            isLoading = false,
            borderless = false,
            clearable = true,
            onClear,
            placeholder = "Search",
            "aria-label": ariaLabel,
            ...props
        },
        ref,
    ) => {
        const innerRef = React.useRef<HTMLInputElement>(null);
        const isControlled = value !== undefined;
        const [uncontrolled, setUncontrolled] = React.useState(
            defaultValue != null ? String(defaultValue) : "",
        );
        const current = isControlled ? String(value ?? "") : uncontrolled;
        const showClear = clearable && current.length > 0 && !disabled && !isLoading;

        const setRefs = React.useCallback(
            (node: HTMLInputElement | null) => {
                innerRef.current = node;
                if (typeof ref === "function") ref(node);
                else if (ref) ref.current = node;
            },
            [ref],
        );

        const changeTo = (next: string) => {
            if (!isControlled) setUncontrolled(next);
            const el = innerRef.current;
            if (el) {
                const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
                desc?.set?.call(el, next);
            }
            onChange?.({
                target: { value: next },
                currentTarget: el ?? { value: next },
            } as React.ChangeEvent<HTMLInputElement>);
        };

        return (
            <div
                className={cn(
                    "relative flex min-w-0 items-center",
                    !borderless && "h-chrome",
                    className,
                )}
            >
                <Icon
                    icon={RiMenuSearchLine}
                    size={ICON_SIZE_MD}
                    className="pointer-events-none absolute left-2.5 z-10 pr-0.5 text-input-placeholder!"
                />
                <input
                    {...props}
                    ref={setRefs}
                    type="search"
                    disabled={disabled}
                    placeholder={placeholder}
                    aria-label={ariaLabel ?? placeholder}
                    value={isControlled ? current : undefined}
                    defaultValue={isControlled ? undefined : defaultValue}
                    onChange={(e) => {
                        if (!isControlled) setUncontrolled(e.target.value);
                        onChange?.(e);
                    }}
                    className={cn(
                        "h-full w-full min-w-0 text-sm font-medium text-text-primary outline-none",
                        "placeholder:text-input-placeholder",
                        "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        "[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
                        borderless
                            ? "rounded-none border-0 bg-transparent py-2 pl-9 pr-8 shadow-none focus-visible:ring-0"
                            : cn(
                                  "rounded-lg border border-input-border bg-input-bg py-0 pl-9 pr-8",
                                  "focus-visible:border-border-focus focus-visible:ring-1 focus-visible:ring-border-focus",
                              ),
                    )}
                />
                <div className="absolute right-1 z-10 flex h-full items-center">
                    {isLoading ? (
                        <Icon
                            icon={RiLoader4Line}
                            size={ICON_SIZE_SM}
                            className="mr-1.5 animate-spin text-input-placeholder"
                        />
                    ) : showClear ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="hover:bg-transparent"
                            aria-label="Clear"
                            tabIndex={-1}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                changeTo("");
                                onClear?.();
                                innerRef.current?.focus();
                            }}
                        >
                            <Icon icon={RiCloseLine} size={ICON_SIZE_MD} />
                        </Button>
                    ) : null}
                </div>
            </div>
        );
    },
);

SearchInput.displayName = "SearchInput";
