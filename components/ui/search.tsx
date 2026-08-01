"use client";

import * as React from "react";
import { Icon } from "./icon";

import { cn } from "@/lib/utils";
import { Input, InputProps } from "@/components/ui/input";

export function SearchInput({ className, ...props }: InputProps) {
    return (
        <div className={cn("flex items-center", className)}>
            <Icon name="search" size={16} className="mr-sm text-text-muted shrink-0" />
            <Input
                className="h-chrome border-none bg-transparent px-0 text-sm focus:border-none"
                {...props}
            />
        </div>
    );
}
