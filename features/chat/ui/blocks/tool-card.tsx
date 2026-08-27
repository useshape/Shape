"use client";

import React from "react";
import { ServiceChip } from "./service-chip";

/** Compact left-aligned tool chip — same shell as MCP. */
export function ToolCard({
    leading,
    title,
    trailing,
    expandable,
    defaultOpen = false,
    onClick,
    children,
}: {
    leading?: React.ReactNode;
    title: React.ReactNode;
    trailing?: React.ReactNode;
    expandable?: boolean;
    defaultOpen?: boolean;
    onClick?: () => void;
    children?: React.ReactNode;
}) {
    return (
        <ServiceChip
            leading={leading}
            title={title}
            trailing={trailing}
            expandable={expandable}
            defaultOpen={defaultOpen}
            onClick={onClick}
        >
            {children}
        </ServiceChip>
    );
}
