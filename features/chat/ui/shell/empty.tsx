"use client";

import { useSyncExternalStore } from "react";
import {
    isMultiworkMode,
    subscribeMultiwork,
} from "@/features/multiwork";

export function ChatEmptyState({
    onSelectMode: _onSelectMode,
}: {
    onSelectMode: (mode: string) => void;
}) {
    const multiwork = useSyncExternalStore(
        subscribeMultiwork,
        isMultiworkMode,
        () => false,
    );

    if (multiwork) {
        return (
            <div className="flex w-full items-center justify-center gap-3 pb-4">
                <img
                    src="/logos/logo_animated.svg"
                    alt=""
                    className="size-12 shrink-0"
                />
                <span className="text-lg font-normal text-text-primary">Multiwork</span>
            </div>
        );
    }

    return (
        <div className="flex w-full items-center justify-center pb-15">
            <img src="/logos/logo_animated.svg" alt="Shape" className="w-20 h-20 opacity-10" />
        </div>
    );
}
