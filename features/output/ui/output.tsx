"use client";

import React, { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    clearOutput,
    getOutputChannels,
    setActiveOutputChannel,
    useOutputStore,
} from "../store";

export default function OutputPanel() {
    const { activeChannel, buffers } = useOutputStore();
    const scrollRef = useRef<HTMLDivElement>(null);
    const lines = buffers[activeChannel];

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [lines, activeChannel]);

    return (
        <div className="flex h-full flex-col overflow-hidden bg-panel font-mono text-xs">
            <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border-subtle px-2 py-1.5 no-scrollbar">
                {getOutputChannels().map((ch) => (
                    <Button
                        key={ch}
                        variant="ghost"
                        size="sm"
                        className={cn(
                            "h-6 shrink-0 rounded-md px-2 text-xs font-sans",
                            activeChannel === ch
                                ? "bg-surface-2 text-text-primary"
                                : "text-text-muted hover:text-text-secondary"
                        )}
                        onClick={() => setActiveOutputChannel(ch)}
                    >
                        {ch}
                        {buffers[ch].length > 0 && (
                            <span className="ml-1 text-text-muted">({buffers[ch].length})</span>
                        )}
                    </Button>
                ))}
                <div className="flex-1" />
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 rounded-md px-2 text-xs font-sans text-text-muted"
                    onClick={() => clearOutput(activeChannel)}
                >
                    Clear
                </Button>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-auto custom-scrollbar p-2">
                {lines.length === 0 ? (
                    <div className="font-sans text-sm text-text-muted">No output in {activeChannel}.</div>
                ) : (
                    lines.map((line, idx) => (
                        <div
                            key={`${line.timestamp}-${idx}`}
                            className={cn(
                                "whitespace-pre-wrap break-all leading-relaxed",
                                line.level === "error" && "text-error",
                                line.level === "warn" && "text-warning",
                                line.level === "info" && "text-text-secondary"
                            )}
                        >
                            {line.text}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
