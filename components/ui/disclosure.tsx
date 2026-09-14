"use client";

import type { RemixiconComponentType } from "@remixicon/react";
import { Button, type ButtonCategory, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";

export type DisclosureItem = {
    text: string;
    href?: string;
    action?: (item: DisclosureItem) => void;
    variant?: "danger";
    icon?: RemixiconComponentType;
};

export type DisclosureGroup = {
    name?: string;
    items: DisclosureItem[];
};

function isGroup(item: DisclosureItem | DisclosureGroup): item is DisclosureGroup {
    return Array.isArray((item as DisclosureGroup).items);
}

export function DisclosureDropdown({
    items,
    toggleText,
    icon,
    category = "primary",
    variant = "outline",
    size = "sm",
    disabled,
    loading,
    textSrOnly,
    toggleAriaLabel,
    align = "start",
}: {
    items: Array<DisclosureItem | DisclosureGroup>;
    toggleText?: string;
    icon?: RemixiconComponentType;
    category?: ButtonCategory;
    variant?: ButtonVariant;
    size?: ButtonSize;
    disabled?: boolean;
    loading?: boolean;
    textSrOnly?: boolean;
    toggleAriaLabel?: string;
    align?: "start" | "center" | "end";
}) {
    const grouped = items.length > 0 && items.every(isGroup);
    const groups: DisclosureGroup[] = grouped
        ? (items as DisclosureGroup[])
        : [{ items: items as DisclosureItem[] }];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant={variant}
                    category={category}
                    size={icon && (textSrOnly || !toggleText) ? "icon" : size}
                    icon={icon}
                    disabled={disabled}
                    loading={loading}
                    aria-label={toggleAriaLabel ?? toggleText}
                >
                    {textSrOnly ? <span className="sr-only">{toggleText}</span> : toggleText}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={align} className="min-w-40">
                {groups.map((group, gi) => (
                    <div key={group.name ?? gi}>
                        {gi > 0 ? <DropdownMenuSeparator /> : null}
                        {group.name ? <DropdownMenuLabel>{group.name}</DropdownMenuLabel> : null}
                        {group.items.map((item) => (
                            <DropdownMenuItem
                                key={item.text}
                                variant={item.variant === "danger" ? "destructive" : undefined}
                                onSelect={() => {
                                    if (item.href) {
                                        window.open(item.href, "_blank", "noopener,noreferrer");
                                    }
                                    item.action?.(item);
                                }}
                            >
                                {item.icon ? <Icon icon={item.icon} size={ICON_SIZE_SM} /> : null}
                                {item.text}
                            </DropdownMenuItem>
                        ))}
                    </div>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
