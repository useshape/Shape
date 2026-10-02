"use client";

import { PeopleChat24Filled } from "@fluentui/react-icons";
import { useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
    isMultiworkMode,
    subscribeMultiwork,
} from "@/features/multiwork";

export function ChatEmptyState({
    onSelectMode: _onSelectMode,
    multiwork: multiworkProp,
}: {
    onSelectMode: (mode: string) => void;
    multiwork?: boolean;
}) {
    const storeMode = useSyncExternalStore(
        subscribeMultiwork,
        isMultiworkMode,
        () => false,
    );
    const multiwork = multiworkProp ?? storeMode;

    return (
        <div className="relative flex h-16 w-full items-center justify-center">
            <div
                className={cn(
                    "absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    multiwork ? "pointer-events-none scale-75 opacity-0" : "scale-100 opacity-100",
                )}
            >
                <img src="/logos/logo_animated.svg" alt="" className="h-16 w-16 opacity-15" />
            </div>
            <div
                className={cn(
                    "absolute inset-0 flex items-center justify-center gap-3 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    multiwork ? "scale-100 opacity-100" : "pointer-events-none scale-105 opacity-0",
                )}
            >
                <Icon
                    icon={PeopleChat24Filled}
                    className="shrink-0 text-text-primary opacity-20"
                    style={{ ["--icon-size" as string]: "40px" }}
                />
                <span className="text-4xl font-normal text-text-primary opacity-20">Multiwork</span>
            </div>
        </div>
    );
}
