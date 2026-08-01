"use client";

import { useLoading } from "@/features/loading/context";
import { cn } from "@/lib/utils";

export function LoadingBar({ className }: { className?: string }) {
    const { isLoading } = useLoading();

    return (
        <div className={cn("h-[4px] w-full bg-transparent overflow-hidden relative", className)}>
            <div
                className={cn(
                    "absolute top-0 left-0 h-full bg-accent transition-transform duration-500 ease-in-out",
                    isLoading ? "w-full animate-progress" : "w-0"
                )}
            />
            <style jsx>{`
                @keyframes progress {
                    0% { transform: translateX(-100%); }
                    50% { transform: translateX(0); }
                    100% { transform: translateX(100%); }
                }
                .animate-progress {
                    animation: progress 1.5s infinite linear;
                    width: 30% !important;
                }
            `}</style>
        </div>
    );
}
