"use client";

import { ShapeLogo } from "@/components/ui/shape-logo";

export function ChatEmptyState({
    onSelectMode: _onSelectMode,
}: {
    onSelectMode: (mode: string) => void;
}) {
    return (
        <div className="flex w-full items-center justify-center px-4">
            <ShapeLogo size={28} />
        </div>
    );
}
