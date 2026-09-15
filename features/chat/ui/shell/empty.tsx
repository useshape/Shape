"use client";

export function ChatEmptyState({
    onSelectMode: _onSelectMode,
}: {
    onSelectMode: (mode: string) => void;
}) {
    return (
        <div className="flex w-full flex-col items-start gap-4 px-4">
            <h1 className="max-w-lg text-balance text-start text-xl font-medium leading-snug text-text-primary">
                What should we work on?
            </h1>
        </div>
    );
}
