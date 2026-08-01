import { Suspense } from "react";
import { GitManager } from "@/features/git/ui";

export const metadata = {
    title: "Git",
    description: "Git and GitHub manager",
};

export default function GitPage() {
    return (
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-text-muted">Loading…</div>}>
            <GitManager />
        </Suspense>
    );
}
