"use client";

import { RiSearchLine } from "@remixicon/react";
import * as React from "react";
import { Icon, ICON_SIZE_SM } from "./icon";

import { cn } from "@/lib/utils";
import { Input, InputProps } from "@/components/ui/input";

export function SearchInput({ className, ...props }: InputProps) {
    return (
        <div className={cn("flex h-chrome min-w-0 items-center gap-2", className)}>
            <Icon
                icon={RiSearchLine}
                size={ICON_SIZE_SM}
                className="pointer-events-none text-input-placeholder"
            />
            <Input
                className="h-full min-w-0 flex-1 border-none bg-transparent px-0 text-sm text-text-primary placeholder:text-input-placeholder focus:border-none"
                {...props}
            />
        </div>
    );
}
