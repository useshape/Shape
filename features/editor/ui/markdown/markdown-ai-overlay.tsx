"use client";

import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { LoadingState } from "@/features/chat/ui/blocks/loading-state";

export type MarkdownAiPhase = "thinking" | "swapping";

export type MarkdownAiOverlayState = {
    rect: { top: number; left: number; width: number; height: number };
    oldText: string;
    newText?: string;
    phase: MarkdownAiPhase;
};

export function MarkdownAiOverlay({ state }: { state: MarkdownAiOverlayState }) {
    const pad = 6;
    const style: CSSProperties = {
        position: "fixed",
        top: state.rect.top - pad,
        left: state.rect.left - pad,
        width: Math.max(state.rect.width + pad * 2, 180),
        minHeight: state.rect.height + pad * 2,
    };

    const overlay = (
        <div
            className="pointer-events-none z-overlay-content rounded-md bg-surface-3/55 p-2 backdrop-blur-[2px]"
            style={style}
        >
            {state.phase === "thinking" ? (
                <div className="flex min-h-full flex-col gap-2">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary opacity-70 blur-[3px]">
                        {state.oldText}
                    </div>
                    <div className="pointer-events-none">
                        <LoadingState label="Rewriting" variant="Drive" />
                    </div>
                </div>
            ) : (
                <div className="relative min-h-full">
                    <div className="absolute inset-0 whitespace-pre-wrap text-sm leading-relaxed text-text-primary opacity-0 blur-[10px] transition-all duration-300 ease-out">
                        {state.oldText}
                    </div>
                    <div className="relative animate-in fade-in duration-300 whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
                        {state.newText}
                    </div>
                </div>
            )}
        </div>
    );

    return createPortal(overlay, document.body);
}
