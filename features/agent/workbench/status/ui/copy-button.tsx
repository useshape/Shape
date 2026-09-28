"use client";

import { Checkmark20Regular } from "@fluentui/react-icons/headless/svg/checkmark";
import { Clipboard20Regular } from "@fluentui/react-icons/headless/svg/clipboard";


import { useState } from "react";
import { Icon } from "@/components/ui/icon";

import { cn } from "@/lib/utils";

export function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            /* ignore */
        }
    };

    return (
        <button
            onClick={handleCopy}
            className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-sm font-medium transition-colors mt-1.5 cursor-pointer",
                copied
                    ? "bg-success/15 text-success"
                    : "bg-panel-hover text-text-muted hover:text-text-primary hover:bg-panel-active",
            )}
        >
            {copied ? <Icon icon={Checkmark20Regular} /> : <Icon icon={Clipboard20Regular} />}
            {copied ? "Copied" : "Copy"}
        </button>
    );
}
