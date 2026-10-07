"use client";

export function ChatEmptyState({
    onSelectMode: _onSelectMode,
}: {
    onSelectMode: (mode: string) => void;
}) {
    return (
        <div className="relative flex h-16 w-full items-center justify-center">
            <img src="/logos/logo_animated.svg" alt="" className="h-16 w-16 opacity-15" />
        </div>
    );
}
