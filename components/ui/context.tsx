"use client";

import * as React from "react";
import { Icon } from "./icon";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";

import { cn } from "@/lib/utils";

const itemClasses =
    "group relative flex cursor-default select-none items-center gap-2 rounded-xl px-1 py-1.5 text-sm outline-none focus:bg-panel-hover focus:text-text-primary data-disabled:pointer-events-none data-disabled:opacity-50 transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]";
const containerClasses =
    "shape-popover-content z-dropdown overflow-hidden rounded-xl border border-border-subtle bg-surface-3 p-1 text-text-primary shadow-md";
const shortcutClasses = "ml-auto shrink-0 pr-1 text-sm text-text-muted group-focus:text-text-primary";

const ContextMenu = ContextMenuPrimitive.Root;

const ContextMenuTrigger = React.forwardRef<
    React.ElementRef<typeof ContextMenuPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Trigger>
>(({ onContextMenu, ...props }, ref) => (
    <ContextMenuPrimitive.Trigger
        ref={ref}
        onContextMenu={(e) => {
            // Stop bubble to parent GlobalContextMenu, but do NOT preventDefault —
            // Radix composes handlers and skips open when defaultPrevented is already set.
            e.stopPropagation();
            onContextMenu?.(e);
        }}
        {...props}
    />
));
ContextMenuTrigger.displayName = ContextMenuPrimitive.Trigger.displayName;

const ContextMenuGroup = ContextMenuPrimitive.Group;
const ContextMenuPortal = ContextMenuPrimitive.Portal;
const ContextMenuSub = ContextMenuPrimitive.Sub;
const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

const ContextMenuSubTrigger = React.forwardRef<
    React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
    React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
        inset?: boolean;
    }
>(({ className, inset, children, ...props }, ref) => (
    <ContextMenuPrimitive.SubTrigger
        ref={ref}
        className={cn(itemClasses, "data-[state=open]:bg-panel-hover", inset && "pl-7 ",className)}
        {...props}
    >
        {children}
        <Icon name="chevron_right" className="ml-auto size-icon-sm" />
    </ContextMenuPrimitive.SubTrigger>
));
ContextMenuSubTrigger.displayName = ContextMenuPrimitive.SubTrigger.displayName;

const ContextMenuSubContent = React.forwardRef<
    React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
    React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(({ className, sideOffset = 4, ...props }, ref) => (
    <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.SubContent
            ref={ref}
            sideOffset={sideOffset}
            className={cn(
                containerClasses,
                "min-w-32 max-h-[var(--radix-context-menu-content-available-height,_80vh)] overflow-y-auto custom-scrollbar",
                className
            )}
            {...props}
        />
    </ContextMenuPrimitive.Portal>
));
ContextMenuSubContent.displayName = ContextMenuPrimitive.SubContent.displayName;

const ContextMenuContent = React.forwardRef<
    React.ElementRef<typeof ContextMenuPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
    <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content
            ref={ref}
            className={cn(
                containerClasses,
                "min-w-32 max-h-[var(--radix-context-menu-content-available-height,_80vh)] overflow-y-auto custom-scrollbar",
                className
            )}
            {...props}
        />
    </ContextMenuPrimitive.Portal>
));
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName;

const ContextMenuItem = React.forwardRef<
    React.ElementRef<typeof ContextMenuPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
        inset?: boolean;
    }
>(({ className, inset, ...props }, ref) => (
    <ContextMenuPrimitive.Item ref={ref} className={cn("group", itemClasses, inset && "pl-7", className)} {...props} />
));
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName;

const ContextMenuCheckboxItem = React.forwardRef<
    React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
    React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
    <ContextMenuPrimitive.CheckboxItem
        ref={ref}
        className={cn(itemClasses, "pr-1", className)}
        checked={checked}
        {...props}
    >
        <span className="flex w-4 shrink-0 items-center justify-center">
            <ContextMenuPrimitive.ItemIndicator>
                <Icon name="check" className="size-icon-sm" />
            </ContextMenuPrimitive.ItemIndicator>
        </span>
        {children}
    </ContextMenuPrimitive.CheckboxItem>
));
ContextMenuCheckboxItem.displayName = ContextMenuPrimitive.CheckboxItem.displayName;

const ContextMenuRadioItem = React.forwardRef<
    React.ElementRef<typeof ContextMenuPrimitive.RadioItem>,
    React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
    <ContextMenuPrimitive.RadioItem ref={ref} className={cn(itemClasses, "pr-1", className)} {...props}>
        <span className="flex w-4 shrink-0 items-center justify-center">
            <ContextMenuPrimitive.ItemIndicator>
                <Icon name="circle" className="size-[8px]" />
            </ContextMenuPrimitive.ItemIndicator>
        </span>
        {children}
    </ContextMenuPrimitive.RadioItem>
));
ContextMenuRadioItem.displayName = ContextMenuPrimitive.RadioItem.displayName;

const ContextMenuLabel = React.forwardRef<
    React.ElementRef<typeof ContextMenuPrimitive.Label>,
    React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & {
        inset?: boolean;
    }
>(({ className, inset, ...props }, ref) => (
    <ContextMenuPrimitive.Label
        ref={ref}
        className={cn("mx-xs px-xs py-xs text-xs font-normal text-text-secondary", inset && "pl-7", className)}
        {...props}
    />
));
ContextMenuLabel.displayName = ContextMenuPrimitive.Label.displayName;

const ContextMenuSeparator = React.forwardRef<
    React.ElementRef<typeof ContextMenuPrimitive.Separator>,
    React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
    <ContextMenuPrimitive.Separator ref={ref} className={cn("-mx-xs my-xs h-px bg-border-subtle", className)} {...props} />
));
ContextMenuSeparator.displayName = ContextMenuPrimitive.Separator.displayName;

const ContextMenuShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span className={cn(shortcutClasses, className)} {...props} />
);
ContextMenuShortcut.displayName = "ContextMenuShortcut";

export {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuCheckboxItem,
    ContextMenuRadioItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuGroup,
    ContextMenuPortal,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuRadioGroup,
};
