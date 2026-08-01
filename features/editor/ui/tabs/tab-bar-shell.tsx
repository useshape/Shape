"use client";

import { useCallback, useRef, type ReactNode } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToHorizontalAxis, restrictToFirstScrollableAncestor } from "@dnd-kit/modifiers";
import {
    WORKBENCH_TAB_ACTIONS_CLASS,
    WORKBENCH_TAB_BAR_CLASS,
    WORKBENCH_TAB_LIST_CLASS,
    WORKBENCH_TAB_ROW_CLASS,
    WORKBENCH_TAB_SCROLL_CLASS,
    WORKBENCH_TAB_TRAIL_CLASS,
} from "./workbench-tab-styles";

interface TabBarShellProps {
    itemIds: string[];
    onDragEnd: (event: DragEndEvent) => void;
    children: ReactNode;
    actions?: ReactNode;
    dndId?: string;
    hideTabs?: boolean;
}

export function TabBarShell({ itemIds, onDragEnd, children, actions, dndId, hideTabs }: TabBarShellProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft += e.deltaY;
        }
    }, []);

    return (
        <div className={WORKBENCH_TAB_BAR_CLASS}>
            {!hideTabs ? (
                <div
                    ref={scrollContainerRef}
                    onWheel={handleWheel}
                    className={WORKBENCH_TAB_SCROLL_CLASS}
                >
                    <DndContext
                        id={dndId}
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={onDragEnd}
                        modifiers={[restrictToHorizontalAxis, restrictToFirstScrollableAncestor]}
                    >
                        <div className={WORKBENCH_TAB_ROW_CLASS}>
                            <div className={WORKBENCH_TAB_LIST_CLASS}>
                                <SortableContext items={itemIds} strategy={horizontalListSortingStrategy}>
                                    {children}
                                </SortableContext>
                            </div>
                            <div className={WORKBENCH_TAB_TRAIL_CLASS} aria-hidden />
                        </div>
                    </DndContext>
                </div>
            ) : (
                <div className="min-w-0 flex-1 self-stretch bg-editor" />
            )}
            {actions ? <div className={WORKBENCH_TAB_ACTIONS_CLASS}>{actions}</div> : null}
        </div>
    );
}
