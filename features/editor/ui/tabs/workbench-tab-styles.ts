import { cn } from "@/lib/utils";

export const WORKBENCH_TAB_HEIGHT = 36;

export const WORKBENCH_TAB_BAR_CLASS =
    "workbench-tab-bar box-border flex h-[36px] shrink-0 w-full items-center gap-1 bg-editor px-2";

export const WORKBENCH_TAB_SCROLL_CLASS =
    "workbench-tab-scroll flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar";

/** Fills unused width in the tab row */
export const WORKBENCH_TAB_TRAIL_CLASS =
    "min-w-[8px] flex-1 self-stretch";

export const WORKBENCH_TAB_ROW_CLASS =
    "flex h-full min-w-full w-max items-center gap-1";

export const WORKBENCH_TAB_LIST_CLASS = "flex h-full w-max shrink-0 items-center gap-1";

export const WORKBENCH_TAB_ACTIONS_CLASS =
    "box-border flex h-full shrink-0 items-center gap-0.5 px-1";

export function workbenchTabItemClass(active: boolean, dragging?: boolean) {
    return cn(
        "workbench-tab-item group relative box-border bg-surface-3/50 flex h-8 shrink-0 cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors",
        active
            ? "is-active min-w-[72px] bg-surface-3 text-text-primary"
            : "text-text-muted hover:bg-panel-hover hover:text-text-secondary",
        dragging && "opacity-40",
    );
}

export const WORKBENCH_TAB_CLOSE_BUTTON_CLASS =
    "invisible flex h-4 w-4 shrink-0 items-center justify-center text-text-muted group-hover:visible hover:text-text-primary";

export const WORKBENCH_TAB_CONTENT_CLASS =
    "workbench-tab-content relative z-[1] flex h-full min-w-0 items-center gap-1.5";

export const WORKBENCH_TAB_CONTENT_ACTIVE_CLASS = "workbench-tab-content is-active";

export const WORKBENCH_TAB_ACTION_BUTTON_CLASS =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-panel-hover hover:text-text-primary";
