"use client";

function formatStatusLabel(label: string): string {
    return label.replace(/…+$/, "").trim() || "Working";
}

/** Live status — iOS-style bouncing dots plus the current activity label. */
export function GeneratingIndicator({
    label,
}: {
    label?: string;
    showTimer?: boolean;
    variantSeed?: string;
}) {
    const display = formatStatusLabel(label?.trim() || "Working");
    return (
        <div className="flex items-center gap-2 py-1 text-sm text-text-muted">
            <span className="imsg-typing imsg-typing-sm" aria-hidden>
                <span />
                <span />
                <span />
            </span>
            <span className="min-w-0 truncate">{display}</span>
        </div>
    );
}
