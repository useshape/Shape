"use client";

import { PeopleChat24Filled } from "@fluentui/react-icons";
import { useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";
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
            <div className="flex w-full items-center justify-center gap-3">
                <Icon
                    icon={PeopleChat24Filled}
                    className="shrink-0 text-text-primary opacity-20"
                    style={{ ["--icon-size" as string]: "40px" }}
                />
                <span className="text-4xl font-normal text-text-primary opacity-20">Multiwork</span>
            </div>
        );
    }

    return (
        <div className="flex w-full items-center justify-center">
            <img src="/logos/logo_animated.svg" alt="Shape" className="w-20 h-20 opacity-10" />
        </div>
    );
}
