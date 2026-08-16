"use client";

import * as React from "react";
import { Icon } from "./icon";

import { cn } from "@/lib/utils";
import { Input, InputProps } from "@/components/ui/input";

export function SearchInput({
    className,
    icon = "search",
    ...props
}: InputProps & { icon?: string }) {
    return (
        <div className={cn("flex h-chrome min-w-0 flex-1 items-center rounded-lg bg-input-bg px-sm", className)}>
            <Icon name={icon} size={16} className="mr-sm text-text-muted shrink-0" />
            <Input
                className="h-chrome border-none bg-transparent px-0 text-sm focus:border-none"
                {...props}
            />
        </div>
    );
}
