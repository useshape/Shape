"use client";

import type { ReactNode } from "react";
import { RiCommandLine } from "@remixicon/react";
import { Icon } from "@/components/ui/icon";
import { FileIcon } from "@/components/ui/file-icon";
import { Favicon } from "@/components/ui/favicon";
import { PluginLogo } from "@/components/ui/plugin-logo";
import { designTokenById } from "@/lib/chat/design-mentions";
import { mentionDisplayLabel, type ChatMention } from "@/lib/chat/mentions";
import type { AgentWorkflow } from "@/lib/chat/workflows";
import { cn } from "@/lib/utils";

/** Shared @ / slash chip — same size in the composer and in sent messages. */
export function ContextChip({
    icon,
    children,
    className,
    onClick,
}: {
    icon?: ReactNode;
    children: ReactNode;
    className?: string;
    onClick?: () => void;
}) {
    return (
        <span
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            className={cn(
                "mx-0.5 inline-flex items-center gap-1 rounded-lg bg-accent-text-bg px-1.5 py-0.5 align-middle font-medium text-accent-text",
                onClick && "cursor-pointer hover:bg-accent-text/20 transition-colors",
                className,
            )}
        >
            {icon ? <span className="chat-link-favicon">{icon}</span> : null}
            <span className="max-w-[14rem] truncate">{children}</span>
        </span>
    );
}

export function MentionChipIcon({ mention }: { mention: ChatMention }) {
    const label = mentionDisplayLabel(mention);
    if (mention.kind === "file" || mention.kind === "folder" || mention.kind === "docs") {
        return <FileIcon name={label} isDir={mention.kind === "folder"} className="h-3 w-3 shrink-0" />;
    }
    if (mention.kind === "plugin") {
        return (
            <PluginLogo
                toolkit={mention.id || mention.path || label}
                name={label}
                size={12}
                className="rounded-sm"
            />
        );
    }
    if (mention.kind === "browser") {
        return <Favicon url={mention.path || label} size={12} />;
    }
    const token = mention.kind === "design" ? designTokenById(mention.id || mention.path) : undefined;
    if (token) {
        return <Icon icon={token.icon} className="text-accent-text" size={12} />;
    }
    return null;
}

export function WorkflowChipIcon({ workflow }: { workflow?: AgentWorkflow }) {
    if (workflow?.pluginToolkit) {
        return (
            <PluginLogo
                toolkit={workflow.pluginToolkit}
                name={workflow.name}
                size={12}
                className="rounded-sm"
            />
        );
    }
    return <Icon icon={RiCommandLine} className="text-accent-text" size={12} />;
}
