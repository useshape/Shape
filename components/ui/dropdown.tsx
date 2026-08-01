"use client";

import * as React from "react";
import { Icon } from "./icon";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as MenubarPrimitive from "@radix-ui/react-menubar";


import { cn } from "@/lib/utils";

/**
 * Shared Styles & Helpers
 */

const itemClasses = "group relative flex cursor-default select-none items-center gap-3 rounded-xl px-1 py-1 text-sm outline-none focus:bg-panel-hover focus:text-text-primary data-disabled:pointer-events-none data-disabled:opacity-50 transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]";
const containerClasses = "shape-popover-content z-dropdown overflow-hidden rounded-xl bg-surface-3 text-text-primary shadow-md";
const shortcutClasses = "ml-auto shrink-0 pr-2 text-sm text-text-muted group-focus:text-text-primary";

/** Circular scroll affordance — shows when a menu has more content above/below. */
function DropdownScrollHint({
    side,
    visible,
    onClick,
}: {
    side: "up" | "down";
    visible: boolean;
    onClick: () => void;
}) {
    return (
        <div
            className={cn(
                "pointer-events-none absolute inset-x-0 z-20 flex justify-center transition-[opacity,transform] duration-200 ease-out",
                side === "up" ? "top-1" : "bottom-1",
                visible
                    ? "opacity-100 translate-y-0 scale-100"
                    : side === "up"
                      ? "opacity-0 -translate-y-1 scale-90"
                      : "opacity-0 translate-y-1 scale-90",
            )}
            aria-hidden={!visible}
        >
            <button
                type="button"
                tabIndex={-1}
                disabled={!visible}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClick();
                }}
                onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-3 text-text-secondary shadow-sm hover:bg-panel-hover hover:text-text-primary",
                    visible ? "pointer-events-auto" : "pointer-events-none",
                )}
            >
                <Icon
                    name={side === "up" ? "keyboard_arrow_up" : "keyboard_arrow_down"}
                    size={14}
                />
            </button>
        </div>
    );
}

function DropdownScrollArea({
    className,
    children,
}: {
    className?: string;
    children: React.ReactNode;
}) {
    const ref = React.useRef<HTMLDivElement>(null);
    const [canUp, setCanUp] = React.useState(false);
    const [canDown, setCanDown] = React.useState(false);

    const update = React.useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const { scrollTop, scrollHeight, clientHeight } = el;
        const overflow = scrollHeight > clientHeight + 1;
        setCanUp(overflow && scrollTop > 2);
        setCanDown(overflow && scrollTop + clientHeight < scrollHeight - 2);
    }, []);

    React.useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        update();
        const ro = new ResizeObserver(() => update());
        ro.observe(el);
        const mo = new MutationObserver(() => update());
        mo.observe(el, { childList: true, subtree: true });
        return () => {
            ro.disconnect();
            mo.disconnect();
        };
    }, [update, children]);

    return (
        <div className="relative min-h-0">
            <DropdownScrollHint
                side="up"
                visible={canUp}
                onClick={() => ref.current?.scrollBy({ top: -96, behavior: "smooth" })}
            />
            <div
                ref={ref}
                onScroll={update}
                className={cn("overflow-y-auto p-1 no-scrollbar", className)}
            >
                {children}
            </div>
            <DropdownScrollHint
                side="down"
                visible={canDown}
                onClick={() => ref.current?.scrollBy({ top: 96, behavior: "smooth" })}
            />
        </div>
    );
}

/**
 * Dropdown Menu Components
 */

const DropdownMenu = DropdownMenuPrimitive.Root;

const DropdownMenuTrigger = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger>
>(({ onPointerDown, ...props }, ref) => (
    <DropdownMenuPrimitive.Trigger
        ref={ref}
        onPointerDown={(e) => {
            e.stopPropagation();
            if (onPointerDown) onPointerDown(e);
        }}
        {...props}
    />
));
DropdownMenuTrigger.displayName = DropdownMenuPrimitive.Trigger.displayName;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuSubTrigger = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
        inset?: boolean;
    }
>(({ className, inset, children, ...props }, ref) => (
    <DropdownMenuPrimitive.SubTrigger
        ref={ref}
        className={cn(
            itemClasses,
            "data-[state=open]:bg-panel-hover",
            inset && "pl-7",
            className
        )}
        {...props}
    >
        {children}
        <Icon name="chevron_right" className="ml-auto size-icon-sm"  />
    </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, sideOffset = 4, children, ...props }, ref) => (
    <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.SubContent
            ref={ref}
            sideOffset={sideOffset}
            className={cn(
                containerClasses,
                "min-w-32 max-h-[var(--radix-dropdown-menu-sub-content-available-height,_80vh)] p-0",
            )}
            {...props}
        >
            <DropdownScrollArea
                className={cn(
                    "max-h-[var(--radix-dropdown-menu-sub-content-available-height,_80vh)]",
                    className,
                )}
            >
                {children}
            </DropdownScrollArea>
        </DropdownMenuPrimitive.SubContent>
    </DropdownMenuPrimitive.Portal>
));
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;

const DropdownMenuContent = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, align = "start", children, ...props }, ref) => (
    <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            align={align}
            className={cn(
                containerClasses,
                "min-w-32 max-h-[var(--radix-dropdown-menu-content-available-height,_80vh)] p-0",
            )}
            {...props}
        >
            <DropdownScrollArea
                className={cn(
                    "max-h-[var(--radix-dropdown-menu-content-available-height,_80vh)]",
                    className,
                )}
            >
                {children}
            </DropdownScrollArea>
        </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
        inset?: boolean;
    }
>(({ className, inset, ...props }, ref) => (
    <DropdownMenuPrimitive.Item
        ref={ref}
        className={cn("group", itemClasses, inset && "pl-7", className)}
        {...props}
    />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuCheckboxItem = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, onSelect, ...props }, ref) => (
    <DropdownMenuPrimitive.CheckboxItem
        ref={ref}
        className={cn(itemClasses, "pr-1", className)}
        checked={checked}
        onSelect={(e) => {
            onSelect?.(e);
            e.preventDefault();
        }}
        {...props}
    >
        <span className="flex w-4 shrink-0 items-center justify-center">
            <DropdownMenuPrimitive.ItemIndicator>
                <Icon name="check" className="size-icon-sm"  />
            </DropdownMenuPrimitive.ItemIndicator>
        </span>
        {children}
    </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, onSelect, ...props }, ref) => (
    <DropdownMenuPrimitive.RadioItem
        ref={ref}
        className={cn(itemClasses, "pr-1", className)}
        onSelect={(e) => {
            onSelect?.(e);
            e.preventDefault();
        }}
        {...props}
    >
        <span className="flex w-4 shrink-0 items-center justify-center">
            <DropdownMenuPrimitive.ItemIndicator>
                <Icon name="circle"  className="size-[8px]"  />
            </DropdownMenuPrimitive.ItemIndicator>
        </span>
        {children}
    </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.Label>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
        inset?: boolean;
    }
>(({ className, inset, ...props }, ref) => (
    <DropdownMenuPrimitive.Label
        ref={ref}
        className={cn("mx-xs px-xs py-xs text-xs font-normal text-text-secondary", inset && "pl-7", className)}
        {...props}
    />
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.Separator
        ref={ref}
        className={cn("-mx-xs my-xs h-px bg-border-subtle", className)}
        {...props}
    />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span className={cn(shortcutClasses, className)} {...props} />
);
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

const DropdownMenuNested = ({ children, open, onOpenChange }: { children: React.ReactNode, open?: boolean, onOpenChange?: (open: boolean) => void }) => {
    const [internalOpen, setInternalOpen] = React.useState(false);
    const isOpened = open !== undefined ? open : internalOpen;
    const setIsOpened = onOpenChange !== undefined ? onOpenChange : setInternalOpen;

    return (
        <div className="flex flex-col">
            {React.Children.map(children, (child) => {
                if (React.isValidElement(child)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return React.cloneElement(child as any, { isOpened, setIsOpened });
                }
                return child;
            })}
        </div>
    );
};

const DropdownMenuNestedTrigger = React.forwardRef<
    React.ElementRef<typeof DropdownMenuItem>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuItem> & { isOpened?: boolean, setIsOpened?: (open: boolean) => void }
>(({ className, children, isOpened, setIsOpened, ...props }, ref) => (
    <DropdownMenuItem
        ref={ref}
        className={cn(className)}
        onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpened?.(!isOpened);
        }}
        {...props}
    >
        {children}
        <Icon name="chevron_right" className={cn("ml-auto size-icon-sm transition-transform duration-200", isOpened && "rotate-90")}  />
    </DropdownMenuItem>
));
DropdownMenuNestedTrigger.displayName = "DropdownMenuNestedTrigger";

const DropdownMenuNestedContent = ({ children, isOpened }: { children: React.ReactNode, isOpened?: boolean }) => {
    return (
        <div
            className={cn(
                "grid transition-[grid-template-rows,opacity] duration-200 ease-in-out",
                isOpened ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            )}
        >
            <div className="overflow-hidden flex flex-col pl-1">
                {children}
            </div>
        </div>
    );
};

/**
 * Menubar Components (for Navigation/Titlebar)
 */

const MenubarMenu = ({
    onOpenChange,
    children,
    value,
}: {
    value?: string;
    children?: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
}) => {
    // Radix Menubar.Menu does not type or safely accept onOpenChange (spreading it
    // onto Menu.Root would overwrite the internal close handler). We accept the
    // prop for API compatibility and notify via a trigger data-state observer.
    const triggerRef = React.useRef<HTMLElement | null>(null);
    const onOpenChangeRef = React.useRef(onOpenChange);
    onOpenChangeRef.current = onOpenChange;
    const prevOpenRef = React.useRef(false);

    React.useEffect(() => {
        if (!onOpenChange) return;
        const el = triggerRef.current;
        if (!el) return;

        const sync = () => {
            const open = el.getAttribute("data-state") === "open";
            if (open !== prevOpenRef.current) {
                prevOpenRef.current = open;
                onOpenChangeRef.current?.(open);
            }
        };

        sync();
        const observer = new MutationObserver(sync);
        observer.observe(el, { attributes: true, attributeFilter: ["data-state"] });
        return () => observer.disconnect();
    }, [onOpenChange]);

    return (
        <MenubarPrimitive.Menu value={value}>
            {React.Children.map(children, (child) => {
                if (!React.isValidElement(child)) return child;
                // Attach ref to MenubarTrigger so we can observe data-state
                if (
                    child.type === MenubarTrigger ||
                    (typeof child.type === "object" &&
                        child.type !== null &&
                        "displayName" in child.type &&
                        (child.type as { displayName?: string }).displayName === MenubarTrigger.displayName)
                ) {
                    return React.cloneElement(child as React.ReactElement<{ ref?: React.Ref<HTMLElement> }>, {
                        ref: (node: HTMLElement | null) => {
                            triggerRef.current = node;
                            const existingRef = (child as React.ReactElement & { ref?: React.Ref<HTMLElement> }).ref;
                            if (typeof existingRef === "function") existingRef(node);
                            else if (existingRef && typeof existingRef === "object") {
                                (existingRef as React.MutableRefObject<HTMLElement | null>).current = node;
                            }
                        },
                    });
                }
                return child;
            })}
        </MenubarPrimitive.Menu>
    );
};
const MenubarGroup = MenubarPrimitive.Group;
const MenubarPortal = MenubarPrimitive.Portal;
const MenubarSub = MenubarPrimitive.Sub;
const MenubarRadioGroup = MenubarPrimitive.RadioGroup;

const Menubar = React.forwardRef<
    React.ElementRef<typeof MenubarPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Root>
>(({ className, ...props }, ref) => (
    <MenubarPrimitive.Root
        ref={ref}
        className={cn("flex h-[28px] items-center space-x-0.5 rounded-md bg-transparent p-xs", className)}
        {...props}
    />
));
Menubar.displayName = MenubarPrimitive.Root.displayName;

const MenubarTrigger = React.forwardRef<
    React.ElementRef<typeof MenubarPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Trigger>
>(({ className, onPointerDown, ...props }, ref) => (
    <MenubarPrimitive.Trigger
        ref={ref}
        onPointerDown={(e) => {
            e.stopPropagation();
            if (onPointerDown) onPointerDown(e);
        }}
        className={cn(
            "flex cursor-default select-none items-center rounded-md px-sm py-xs text-sm font-normal outline-none focus:bg-panel-hover focus:text-text-primary data-[state=open]:bg-panel-hover data-[state=open]:text-text-primary transition-colors",
            className
        )}
        {...props}
    />
));
MenubarTrigger.displayName = MenubarPrimitive.Trigger.displayName;

const MenubarSubTrigger = React.forwardRef<
    React.ElementRef<typeof MenubarPrimitive.SubTrigger>,
    React.ComponentPropsWithoutRef<typeof MenubarPrimitive.SubTrigger> & {
        inset?: boolean;
    }
>(({ className, inset, children, ...props }, ref) => (
    <MenubarPrimitive.SubTrigger
        ref={ref}
        className={cn(
            itemClasses,
            "focus:bg-panel-hover focus:text-text-primary data-[state=open]:bg-panel-hover data-[state=open]:text-text-primary",
            inset && "pl-7",
            className
        )}
        {...props}
    >
        {children}
        <Icon name="chevron_right" className="ml-auto size-icon-sm"  />
    </MenubarPrimitive.SubTrigger>
));
MenubarSubTrigger.displayName = MenubarPrimitive.SubTrigger.displayName;

const MenubarSubContent = React.forwardRef<
    React.ElementRef<typeof MenubarPrimitive.SubContent>,
    React.ComponentPropsWithoutRef<typeof MenubarPrimitive.SubContent>
>(({ className, sideOffset = 4, ...props }, ref) => (
    <MenubarPrimitive.Portal>
        <MenubarPrimitive.SubContent
            ref={ref}
            sideOffset={sideOffset}
            className={cn(
                containerClasses,
                "min-w-32",
                className
            )}
            {...props}
        />
    </MenubarPrimitive.Portal>
));
MenubarSubContent.displayName = MenubarPrimitive.SubContent.displayName;

const MenubarContent = React.forwardRef<
    React.ElementRef<typeof MenubarPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Content>
>(({ className, alignOffset = -4, sideOffset = 4, ...props }, ref) => (
    <MenubarPrimitive.Portal>
        <MenubarPrimitive.Content
            ref={ref}
            align="start"
            alignOffset={alignOffset}
            sideOffset={sideOffset}
            className={cn(
                containerClasses,
                "min-w-32",
                className
            )}
            {...props}
        />
    </MenubarPrimitive.Portal>
));
MenubarContent.displayName = MenubarPrimitive.Content.displayName;

const MenubarItem = React.forwardRef<
    React.ElementRef<typeof MenubarPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Item> & {
        inset?: boolean;
    }
>(({ className, inset, ...props }, ref) => (
    <MenubarPrimitive.Item
        ref={ref}
        className={cn("group", itemClasses, inset && "pl-7", className)}
        {...props}
    />
));
MenubarItem.displayName = MenubarPrimitive.Item.displayName;

const MenubarCheckboxItem = React.forwardRef<
    React.ElementRef<typeof MenubarPrimitive.CheckboxItem>,
    React.ComponentPropsWithoutRef<typeof MenubarPrimitive.CheckboxItem>
>(({ className, children, checked, onSelect, ...props }, ref) => (
    <MenubarPrimitive.CheckboxItem
        ref={ref}
        className={cn(itemClasses, "pr-1", className)}
        checked={checked}
        onSelect={(e) => {
            onSelect?.(e);
            e.preventDefault();
        }}
        {...props}
    >
        <span className="flex w-4 shrink-0 items-center justify-center">
            <MenubarPrimitive.ItemIndicator>
                <Icon name="check" className="size-icon-sm"  />
            </MenubarPrimitive.ItemIndicator>
        </span>
        {children}
    </MenubarPrimitive.CheckboxItem>
));
MenubarCheckboxItem.displayName = MenubarPrimitive.CheckboxItem.displayName;

const MenubarRadioItem = React.forwardRef<
    React.ElementRef<typeof MenubarPrimitive.RadioItem>,
    React.ComponentPropsWithoutRef<typeof MenubarPrimitive.RadioItem>
>(({ className, children, onSelect, ...props }, ref) => (
    <MenubarPrimitive.RadioItem
        ref={ref}
        className={cn(itemClasses, "pr-1", className)}
        onSelect={(e) => {
            onSelect?.(e);
            e.preventDefault();
        }}
        {...props}
    >
        <span className="flex w-4 shrink-0 items-center justify-center">
            <MenubarPrimitive.ItemIndicator>
                <Icon name="circle"  className="size-[8px]"  />
            </MenubarPrimitive.ItemIndicator>
        </span>
        {children}
    </MenubarPrimitive.RadioItem>
));
MenubarRadioItem.displayName = MenubarPrimitive.RadioItem.displayName;

const MenubarLabel = React.forwardRef<
    React.ElementRef<typeof MenubarPrimitive.Label>,
    React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Label> & {
        inset?: boolean;
    }
>(({ className, inset, ...props }, ref) => (
    <MenubarPrimitive.Label
        ref={ref}
        className={cn("mx-xs px-xs py-xs text-xs font-normal text-text-secondary", inset && "pl-7", className)}
        {...props}
    />
));
MenubarLabel.displayName = MenubarPrimitive.Label.displayName;

const MenubarSeparator = React.forwardRef<
    React.ElementRef<typeof MenubarPrimitive.Separator>,
    React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Separator>
>(({ className, ...props }, ref) => (
    <MenubarPrimitive.Separator
        ref={ref}
        className={cn("-mx-xs my-xs h-px bg-border-subtle", className)}
        {...props}
    />
));
MenubarSeparator.displayName = MenubarPrimitive.Separator.displayName;

const MenubarShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span className={cn(shortcutClasses, className)} {...props} />
);
MenubarShortcut.displayName = "MenubarShortcut";

const MenubarNested = ({ children, open, onOpenChange }: { children: React.ReactNode, open?: boolean, onOpenChange?: (open: boolean) => void }) => {
    const [internalOpen, setInternalOpen] = React.useState(false);
    const isOpened = open !== undefined ? open : internalOpen;
    const setIsOpened = onOpenChange !== undefined ? onOpenChange : setInternalOpen;

    return (
        <div className="flex flex-col">
            {React.Children.map(children, (child) => {
                if (React.isValidElement(child)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return React.cloneElement(child as any, { isOpened, setIsOpened });
                }
                return child;
            })}
        </div>
    );
};

const MenubarNestedTrigger = React.forwardRef<
    React.ElementRef<typeof MenubarItem>,
    React.ComponentPropsWithoutRef<typeof MenubarItem> & { isOpened?: boolean, setIsOpened?: (open: boolean) => void }
>(({ className, children, isOpened, setIsOpened, ...props }, ref) => (
    <MenubarItem
        ref={ref}
        className={cn(className)}
        onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpened?.(!isOpened);
        }}
        {...props}
    >
        {children}
        <Icon name="chevron_right" className={cn("ml-auto size-icon-sm transition-transform duration-200", isOpened && "rotate-90")}  />
    </MenubarItem>
));
MenubarNestedTrigger.displayName = "MenubarNestedTrigger";

const MenubarNestedContent = ({ children, isOpened }: { children: React.ReactNode, isOpened?: boolean }) => {
    return (
        <div
            className={cn(
                "grid transition-[grid-template-rows,opacity] duration-200 ease-in-out",
                isOpened ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            )}
        >
            <div className="overflow-hidden flex flex-col pl-1">
                {children}
            </div>
        </div>
    );
};

export {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuCheckboxItem,
    DropdownMenuRadioItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuGroup,
    DropdownMenuPortal,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuRadioGroup,
    DropdownMenuNested,
    DropdownMenuNestedTrigger,
    DropdownMenuNestedContent,
    // Menubar Exports
    Menubar,
    MenubarMenu,
    MenubarTrigger,
    MenubarContent,
    MenubarItem,
    MenubarSeparator,
    MenubarLabel,
    MenubarCheckboxItem,
    MenubarRadioItem,
    MenubarPortal,
    MenubarShortcut,
    MenubarGroup,
    MenubarSub,
    MenubarSubContent,
    MenubarSubTrigger,
    MenubarRadioGroup,
    MenubarNested,
    MenubarNestedTrigger,
    MenubarNestedContent,
};

