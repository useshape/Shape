"use client";

import { ShapeLogo } from "@/components/ui/shape-logo";

export function ChatEmptyState({
    onSelectMode: _onSelectMode,
}: {
    onSelectMode: (mode: string) => void;
}) {
    return (
        <div className="flex min-h-full w-full flex-col items-center justify-center px-4 py-8">
            <ShapeLogo size={48} className="opacity-90" />
        </div>
    );
}
