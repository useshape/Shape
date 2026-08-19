"use client";

import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, type ReactNode } from "react";

export interface TabChipProps {
    id: string;
    label: string;
    icon: ReactNode;
    isActive: boolean;
    onSelect: () => void;
    onClose: () => void;
    isPinned?: boolean;
    isDirty?: boolean;
    disableDrag?: boolean;
}

export function TabChip({
    id,
    label,
    icon,
    isActive,
    onSelect,
    onClose,
    isPinned = false,
    isDirty = false,
    disableDrag = false,
}: TabChipProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled: disableDrag || isPinned });

    const tabRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isActive && tabRef.current) {
            const container = tabRef.current.closest(".no-scrollbar") as HTMLElement;
            if (container) {
                const scrollLeft =
                    tabRef.current.offsetLeft -
                    container.offsetWidth / 2 +
                    tabRef.current.offsetWidth / 2;
                container.scrollTo({ left: scrollLeft, behavior: "smooth" });
            }
        }
    }, [isActive]);

    const style = {
        transform: transform
            ? CSS.Translate.toString({ x: transform.x, y: 0, scaleX: 1, scaleY: 1 })
            : undefined,
        transition,
        zIndex: isDragging ? 20 : 1,
    };

    const combinedRef = (node: HTMLDivElement | null) => {
        setNodeRef(node);
        tabRef.current = node;
    };

    return (
        <div
            ref={combinedRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={onSelect}
            className={cn(
                "group relative flex h-8 shrink-0 cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors",
                isActive
                    ? "bg-surface-3 text-text-primary"
                    : "text-text-muted hover:bg-panel-hover hover:text-text-secondary",
                isDragging && "ring-2 ring-accent/20",
            )}
        >
            <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">{icon}</div>

            <div className="flex h-full min-w-0 flex-1 items-center gap-1.5">
                <span className="max-w-[160px] truncate whitespace-nowrap text-sm font-sans">{label}</span>
            </div>

            <div className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center">
                {isPinned ? (
                    <>
                        <Icon name="push_pin" size={12} className="text-accent group-hover:hidden" />
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose();
                            }}
                            className="hidden rounded-md p-1 text-text-muted hover:bg-panel-active hover:text-text-primary group-hover:block"
                        >
                            <Icon name="close" size={12} />
                        </button>
                    </>
                ) : (
                    <>
                        {isDirty && <div className="size-2 rounded-full bg-accent group-hover:hidden" />}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose();
                            }}
                            className={cn(
                                "rounded-md p-1 text-text-muted hover:bg-panel-active hover:text-text-primary",
                                isDirty ? "hidden group-hover:block" : "invisible group-hover:visible",
                            )}
                        >
                            <Icon name="close" size={12} />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
