"use client";

import React from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

type AnalysisItem = {
    type: "file" | "folder" | "search";
    label: string;
};

export function CodebaseAnalysis({ items, isActive }: { items: AnalysisItem[]; isActive?: boolean }) {
    const [isOpen, setIsOpen] = React.useState(false);

    const fileCount = items.filter(i => i.type === "file").length;
    const folderCount = items.filter(i => i.type === "folder").length;
    const searchCount = items.filter(i => i.type === "search").length;

    const summary = [
        fileCount > 0 ? `${fileCount} files` : "",
        folderCount > 0 ? `${folderCount} folders` : "",
        searchCount > 0 ? `${searchCount} searches` : "",
    ].filter(Boolean).join(", ");

    return (
        <div className="flex flex-col gap-1 my-2">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors group w-full text-left"
            >
                <Icon
                    name="expand_more"
                    size={14}
                    className={cn(
                        "text-text-muted transition-transform duration-[var(--transition-fast)]",
                        !isOpen && "-rotate-90"
                    )}
                />
                {isActive ? (
                    <span className="font-medium text-sm animate-pulse text-text-secondary">Analyzing codebase...</span>
                ) : (
                    <span className="font-medium text-sm">Analyzed {summary}</span>
                )}
                {isActive && (
                    <div className="w-2.5 h-2.5 border border-accent border-t-transparent rounded-full animate-spin ml-1" />
                )}
            </button>

            {isOpen && (
                <div className="flex flex-col gap-1.5 ml-2 pb-2">
                    {items.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-text-muted font-medium px-2 py-0.5">
                            <span className="opacity-50">
                                {item.type === "file" ? "Read" : item.type === "folder" ? "Listed" : "Searched"}
                            </span>
                            <span className="text-text-secondary truncate max-w-[240px]">
                                {item.label}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
