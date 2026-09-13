import { Suspense } from "react";
import { FilterProvider } from "@/features/git/ui/manager/filter-context";
import { GitManager } from "@/features/git/ui";

export const metadata = {
    title: "Git",
    description: "Source control and commit graph",
};

export default function GitPage() {
    return (
        <Suspense
            fallback={
                <div className="flex h-full items-center justify-center text-sm text-text-muted">
                    Loading…
                </div>
            }
        >
            <FilterProvider>
                <GitManager />
            </FilterProvider>
        </Suspense>
    );
}
