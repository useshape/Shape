"use client";

import React from "react";
import { FileIcon } from "@/components/ui/file-icon";
import { Favicon } from "@/components/ui/favicon";
import { commands } from "@/lib/backend";
import { openProjectFile } from "@/lib/open-project-file";
import { cn } from "@/lib/utils";

export function ChatLinkChip({
    href,
    children,
    className,
}: {
    href?: string;
    children?: React.ReactNode;
    className?: string;
}) {
    if (!href) {
        return <span className={cn("text-accent-text", className)}>{children}</span>;
    }

    const isLocalFile =
        !href.startsWith("http") && !href.startsWith("mailto:") && !href.startsWith("#");

    if (isLocalFile) {
        const name = href.split(/[\\/]/).pop() || href;
        return (
            <span
                className={cn("chat-link-chip cursor-pointer", className)}
                title={`${href} — click or Ctrl+click to open`}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void openProjectFile(href, name);
                }}
            >
                <span className="chat-link-favicon">
                    <FileIcon name={name} className="h-3 w-3" />
                </span>
                <span className="truncate">{children || name}</span>
            </span>
        );
    }

    const isHttp = /^https?:\/\//i.test(href);
    return (
        <a
            href={href}
            className={cn("chat-link-chip cursor-pointer", className)}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void commands.openUrlExternal(href);
            }}
        >
            {isHttp ? (
                <span className="chat-link-favicon">
                    <Favicon url={href} size={12} />
                </span>
            ) : null}
            <span className="truncate">{children}</span>
        </a>
    );
}
