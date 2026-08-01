import { Suspense } from "react";
import { StatsView } from "@/features/stats/ui/stats-view";

export const metadata = {
    title: "Project Statistics",
    description: "Local per-project code and time statistics",
};

export default function StatsPage() {
    return (
        <Suspense
            fallback={
                <div className="flex h-full items-center justify-center text-sm text-text-muted">
                    Loading…
                </div>
            }
        >
            <StatsView />
        </Suspense>
    );
}
