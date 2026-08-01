"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
    SHAPE_MODAL_PANEL_CLASS,
    SHAPE_OVERLAY_CLASS,
    SHAPE_OVERLAY_CONTENT_CLASS,
} from "@/lib/ui/modal-overlay";

export type QuickPickItem = {
    id: string;
    label: string;
    description?: string;
    icon?: string;
    /** Right-side muted hint */
    hint?: string;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title?: string;
    placeholder?: string;
    /** When set, shows a filterable text field (command-palette style). */
    query?: string;
    onQueryChange?: (value: string) => void;
    items: QuickPickItem[];
    onSelect: (item: QuickPickItem) => void;
    /** Optional: submit query on Enter when no item selected / empty list */
    onSubmitQuery?: (query: string) => void;
    emptyText?: string;
};

/**
 * Floating command-palette / quick-pick dialog (Cursor/VS Code style).
 */
export function QuickPick({
    open,
    onOpenChange,
    title,
    placeholder = "Type to filter…",
    query,
    onQueryChange,
    items,
    onSelect,
    onSubmitQuery,
    emptyText = "No results",
}: Props) {
    const [selected, setSelected] = React.useState(0);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const showInput = query !== undefined && onQueryChange !== undefined;

    React.useEffect(() => {
        if (open) {
            setSelected(0);
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [open, items.length]);

    React.useEffect(() => {
        setSelected(0);
    }, [query]);

    const move = (delta: number) => {
        if (items.length === 0) return;
        setSelected((i) => (i + delta + items.length) % items.length);
    };

    const confirm = (index = selected) => {
        const item = items[index];
        if (item) {
            onSelect(item);
            return;
        }
        if (onSubmitQuery && query?.trim()) {
            onSubmitQuery(query.trim());
        }
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className={cn(SHAPE_OVERLAY_CLASS, "z-[200]")} />
                <Dialog.Content
                    className={cn(
                        SHAPE_OVERLAY_CONTENT_CLASS,
                        "fixed left-1/2 top-[14%] z-[201] w-[min(520px,92vw)] -translate-x-1/2 outline-none",
                    )}
                    aria-describedby={undefined}
                    onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                            e.preventDefault();
                            move(1);
                        } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            move(-1);
                        } else if (e.key === "Enter") {
                            e.preventDefault();
                            if (onSubmitQuery && query?.trim()) {
                                onSubmitQuery(query.trim());
                            } else {
                                confirm();
                            }
                        }
                    }}
                >
                    <Dialog.Title className="sr-only">{title || placeholder || "Quick pick"}</Dialog.Title>
                    <Dialog.Description className="sr-only">
                        {placeholder || "Select an option"}
                    </Dialog.Description>
                    <div className={cn(SHAPE_MODAL_PANEL_CLASS, "overflow-hidden p-1.5")}>
                        {title ? (
                            <div className="px-2.5 py-1.5 text-center text-sm text-text-primary">
                                {title}
                            </div>
                        ) : null}
                        {showInput ? (
                            <div className="px-2 pb-1.5 pt-1">
                                <input
                                    ref={inputRef}
                                    value={query}
                                    onChange={(e) => onQueryChange(e.target.value)}
                                    placeholder={placeholder}
                                    className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                                    aria-label={placeholder}
                                />
                            </div>
                        ) : placeholder && !title ? (
                            <div className="px-2.5 py-2 text-sm text-text-muted">{placeholder}</div>
                        ) : title && placeholder ? (
                            <div className="px-2.5 pb-2 text-sm text-text-muted">{placeholder}</div>
                        ) : null}

                        <div className="max-h-[min(320px,50vh)] overflow-y-auto custom-scrollbar">
                            {items.length === 0 ? (
                                <div className="px-2.5 py-3 text-sm text-text-muted">{emptyText}</div>
                            ) : (
                                items.map((item, index) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onMouseEnter={() => setSelected(index)}
                                        onClick={() => confirm(index)}
                                        className={cn(
                                            "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
                                            index === selected
                                                ? "bg-panel-hover text-text-primary"
                                                : "text-text-secondary hover:bg-panel-hover/60",
                                        )}
                                    >
                                        {item.icon ? (
                                            <Icon
                                                name={item.icon}
                                                size={16}
                                                className="shrink-0 text-text-muted"
                                            />
                                        ) : null}
                                        <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                                            {item.label}
                                            {item.description ? (
                                                <span className="ml-2 font-normal text-text-muted">
                                                    {item.description}
                                                </span>
                                            ) : null}
                                        </span>
                                        {item.hint ? (
                                            <span className="shrink-0 text-xs text-text-muted">
                                                {item.hint}
                                            </span>
                                        ) : null}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
