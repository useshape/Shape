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
                "group relative flex h-7 shrink-0 cursor-pointer select-none items-center gap-2 rounded-lg px-2 transition-colors duration-200 whitespace-nowrap",
                isActive
                    ? "bg-surface-2 text-text-primary"
                    : "text-text-muted hover:text-text-secondary",
                isDragging ? "opacity-30 z-50 ring-2 ring-accent/20" : "opacity-100",
            )}
        >
            <div className="relative w-4 h-4 shrink-0 flex items-center justify-center">{icon}</div>

            <div className="flex-1 min-w-0 flex items-center gap-1.5 h-full">
                <span className="text-md font-sans whitespace-nowrap truncate max-w-[160px]">{label}</span>
            </div>

            <div className="flex items-center justify-center w-5 h-5 ml-1 shrink-0">
                {isPinned ? (
                    <>
                        <Icon name="push_pin" size={12} className="text-accent group-hover:hidden" />
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose();
                            }}
                            className="hidden group-hover:block p-1 rounded-md hover:bg-panel-active text-text-muted hover:text-text-primary transition-opacity shrink-0"
                        >
                            <Icon name="close" size={12} />
                        </button>
                    </>
                ) : (
                    <>
                        {isDirty && <div className="w-2 h-2 rounded-full bg-accent group-hover:hidden" />}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose();
                            }}
                            className={cn(
                                "p-1 rounded-md hover:bg-panel-active text-text-muted hover:text-text-primary transition-opacity shrink-0",
                                isDirty ? "hidden group-hover:block" : "opacity-0 group-hover:opacity-100",
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
